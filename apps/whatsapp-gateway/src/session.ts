import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import fs from 'fs';
import path from 'path';

/**
 * Baileys session manager.
 *
 * Handles:
 * - Multi-file auth state persistence in ~/.brickops/whatsapp-auth/
 * - QR code generation for pairing
 * - Automatic reconnection with backoff
 * - Connection state tracking
 */

export type ConnectionState = 'disconnected' | 'connecting' | 'open';

export interface SessionEvents {
  onMessage: (msg: {
    sender: string;
    senderName?: string;
    text: string;
    messageId: string;
    timestamp: number;
  }) => void;
  onConnectionUpdate: (state: ConnectionState) => void;
  onQR: (qr: string) => void;
}

const AUTH_DIR =
  process.env.BRICKOPS_WA_AUTH_DIR ||
  path.join(process.env.HOME || '~', '.brickops', 'whatsapp-auth');

let socket: ReturnType<typeof makeWASocket> | null = null;
let currentState: ConnectionState = 'disconnected';
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Initialize and connect the WhatsApp session.
 */
export async function createSession(events: SessionEvents): Promise<void> {
  // Close existing socket before creating a new one
  if (socket) {
    socket.ev.removeAllListeners('connection.update');
    socket.ev.removeAllListeners('creds.update');
    socket.ev.removeAllListeners('messages.upsert');
    try {
      socket.end(undefined);
    } catch {
      // ignore errors on close
    }
    socket = null;
  }

  // Ensure auth directory exists
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  socket = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    browser: ['BrickOps', 'Server', '1.0.0'],
    defaultQueryTimeoutMs: 300_000,
    // Quiet Baileys logs
    logger: {
      level: 'silent',
      trace: () => {},
      debug: () => {},
      info: () => {},
      warn: console.warn,
      error: console.error,
      fatal: console.error,
      child: () => ({ level: 'silent', trace: () => {}, debug: () => {}, info: () => {}, warn: console.warn, error: console.error, fatal: console.error, child: () => ({} as any) }) as any,
    } as any,
  });

  // --- Connection updates ---
  socket.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('[whatsapp] QR code generated — scan with WhatsApp');
      events.onQR(qr);
    }

    if (connection === 'close') {
      currentState = 'disconnected';
      events.onConnectionUpdate('disconnected');

      // Log the actual error details from lastDisconnect
      const boom = lastDisconnect?.error as Boom | undefined;
      const reasonCode = boom?.output?.statusCode;
      const isLoggedOut = reasonCode === DisconnectReason.loggedOut;
      const errorPayload = boom?.data ? JSON.stringify(boom.data).slice(0, 500) : null;
      console.log(
        `[whatsapp] Disconnected: statusCode=${reasonCode}, isLoggedOut=${isLoggedOut}` +
        (errorPayload ? `, error=${errorPayload}` : '') +
        (boom?.message ? `, message=${boom.message}` : '')
      );

      // Detect session conflict (another active session with same creds)
      const isConflict = errorPayload?.includes('"conflict"') || reasonCode === 440;
      if (isConflict) {
        console.warn('[whatsapp] Session conflict detected — another session is using the same credentials');
        console.warn('[whatsapp] Clearing auth to force fresh QR pairing...');
        try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch {}
        setTimeout(() => {
          reconnectAttempts = 0;
          createSession(events);
        }, 5000);
        return;
      }

      if (isLoggedOut) {
        console.log('[whatsapp] Logged out — clearing auth and stopping');
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        return;
      }

      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        const delay = Math.min(3000 * Math.pow(2, reconnectAttempts - 1), 60000);
        console.log(
          `[whatsapp] Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`
        );
        setTimeout(() => createSession(events), delay);
      } else {
        console.error('[whatsapp] Max reconnect attempts reached — consider deleting auth and re-pairing');
        console.error('[whatsapp] Run: rm -rf ~/.brickops/whatsapp-auth && restart');
      }
    }

    if (connection === 'connecting') {
      currentState = 'connecting';
      events.onConnectionUpdate('connecting');
      console.log('[whatsapp] Connecting...');
    }

    if (connection === 'open') {
      currentState = 'open';
      reconnectAttempts = 0;
      events.onConnectionUpdate('open');
      console.log('[whatsapp] Connected ✓');
    }
  });

  // --- Save auth credentials on update ---
  socket.ev.on('creds.update', saveCreds);

  // --- Inbound messages ---
  socket.ev.on('messages.upsert', ({ messages }) => {
    for (const msg of messages) {
      // Skip non-text, status broadcasts, and own messages
      if (!msg.message) continue;
      if (msg.key.fromMe) continue;
      if (msg.key.remoteJid === 'status@broadcast') continue;

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        '';

      if (!text.trim()) continue;

      events.onMessage({
        sender: msg.key.remoteJid || '',
        senderName: msg.pushName || undefined,
        text: text.trim(),
        messageId: msg.key.id || '',
        timestamp: msg.messageTimestamp
          ? typeof msg.messageTimestamp === 'number'
            ? msg.messageTimestamp
            : Number(msg.messageTimestamp)
          : Date.now(),
      });
    }
  });
}

/**
 * Get the current socket instance for sending messages.
 */
export function getSocket() {
  return socket;
}

/**
 * Get the current connection state.
 */
export function getConnectionState(): ConnectionState {
  return currentState;
}
