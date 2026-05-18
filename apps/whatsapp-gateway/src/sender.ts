import { getSocket, getConnectionState } from './session';

/**
 * Outbound message sender with rate limiting.
 *
 * WhatsApp bans accounts that spam too fast, so we enforce
 * a minimum delay between messages (1 msg/sec default).
 */

const MIN_DELAY_MS = Number(process.env.BRICKOPS_WA_RATE_LIMIT_MS) || 1000;
let lastSentAt = 0;

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastSentAt;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise((r) => setTimeout(r, MIN_DELAY_MS - elapsed));
  }
  lastSentAt = Date.now();
}

function isAuthenticated(): boolean {
  const sock = getSocket();
  if (!sock) return false;
  // Baileys creates the socket immediately but auth state isn't ready
  // until QR scan completes. Check for a valid creds.me ID.
  try {
    return !!((sock as any)?.authState?.creds?.me?.id);
  } catch {
    return false;
  }
}

async function guardedSend(jid: string, sendFn: () => Promise<void>): Promise<boolean> {
  const connectionState = getConnectionState();
  if (connectionState !== 'open') {
    console.warn(`[whatsapp:sender] Connection state is "${connectionState}" — message dropped`);
    return false;
  }
  if (!isAuthenticated()) {
    console.warn('[whatsapp:sender] Socket not authenticated — message dropped');
    return false;
  }
  try {
    await waitForRateLimit();
    await sendFn();
    return true;
  } catch (err) {
    console.error('[whatsapp:sender] Failed to send:', err);
    return false;
  }
}

/**
 * Send a plain text message.
 */
export async function sendText(jid: string, text: string): Promise<boolean> {
  const sock = getSocket();
  return guardedSend(jid, async () => {
    await sock!.sendMessage(jid, { text });
    console.log(`[whatsapp:sender] → ${jid.split('@')[0]}: ${text.slice(0, 80)}...`);
  });
}

/**
 * Send a message as a reply (quote).
 */
export async function sendReply(
  jid: string,
  text: string,
  quotedMessageId: string
): Promise<boolean> {
  const sock = getSocket();
  return guardedSend(jid, async () => {
    await sock!.sendMessage(jid, {
      text,
      quoted: {
        key: {
          remoteJid: jid,
          id: quotedMessageId,
        },
        message: {},
      } as any,
    });
  });
}

/**
 * Send a document (PDF, etc.) as an attachment.
 */
export async function sendDocument(
  jid: string,
  buffer: Buffer,
  filename: string,
  caption?: string
): Promise<boolean> {
  const sock = getSocket();
  return guardedSend(jid, async () => {
    await sock!.sendMessage(jid, {
      document: buffer,
      mimetype: 'application/pdf',
      fileName: filename,
      caption,
    });
    console.log(`[whatsapp:sender] → ${jid.split('@')[0]}: [document: ${filename}]`);
  });
}

/**
 * Send an image (PNG screenshot) via WhatsApp.
 */
export async function sendImage(
  jid: string,
  buffer: Buffer,
  caption?: string
): Promise<boolean> {
  const sock = getSocket();
  return guardedSend(jid, async () => {
    await sock!.sendMessage(jid, {
      image: buffer,
      caption: caption || '',
      mimetype: 'image/png',
    });
    console.log(`[whatsapp:sender] → ${jid.split('@')[0]}: [image] ${caption?.slice(0, 50) || ''}`);
  });
}
