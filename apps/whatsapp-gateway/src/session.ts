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
let openedAt: number | null = null;
const MAX_RECONNECT_ATTEMPTS = 10;
const MIN_CONNECTED_MS = 15_000;

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
    defaultQueryTimeoutMs: 180_000,
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

      const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const isLoggedOut = reason === DisconnectReason.loggedOut;

      if (isLoggedOut) {
        console.log('[whatsapp] Logged out — clearing auth and stopping');
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        return;
      }

      // Reconnect: constant short delay for transient failures, exponential backoff for sustained
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        const wasTransient = openedAt !== null && (Date.now() - openedAt) < MIN_CONNECTED_MS;
        const delay = wasTransient ? 2000 : Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
        console.log(
          `[whatsapp] Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`
        );
        setTimeout(() => createSession(events), delay);
      } else {
        console.error('[whatsapp] Max reconnect attempts reached — consider deleting auth and re-pairing');
      }
    }

    if (connection === 'connecting') {
      currentState = 'connecting';
      events.onConnectionUpdate('connecting');
      console.log('[whatsapp] Connecting...');
    }

    if (connection === 'open') {
      currentState = 'open';
      openedAt = Date.now();
      // Only reset the counter if we stay connected for a minimum time
      // This prevents infinite reconnects when init queries time out immediately
      setTimeout(() => {
        if (currentState === 'open') {
          reconnectAttempts = 0;
        }
      }, MIN_CONNECTED_MS);
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
