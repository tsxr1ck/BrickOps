import { getSocket } from './session';

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

/**
 * Send a plain text message.
 */
export async function sendText(jid: string, text: string): Promise<boolean> {
  const sock = getSocket();
  if (!sock) {
    console.error('[whatsapp:sender] No active socket — message dropped');
    return false;
  }

  try {
    await waitForRateLimit();
    await sock.sendMessage(jid, { text });
    console.log(`[whatsapp:sender] → ${jid.split('@')[0]}: ${text.slice(0, 80)}...`);
    return true;
  } catch (err) {
    console.error('[whatsapp:sender] Failed to send:', err);
    return false;
  }
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
  if (!sock) {
    console.error('[whatsapp:sender] No active socket — reply dropped');
    return false;
  }

  try {
    await waitForRateLimit();
    await sock.sendMessage(jid, {
      text,
      quoted: {
        key: {
          remoteJid: jid,
          id: quotedMessageId,
        },
        message: {},
      } as any,
    });
    return true;
  } catch (err) {
    console.error('[whatsapp:sender] Failed to send reply:', err);
    return false;
  }
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
  if (!sock) {
    console.error('[whatsapp:sender] No active socket — document dropped');
    return false;
  }

  try {
    await waitForRateLimit();
    await sock.sendMessage(jid, {
      document: buffer,
      mimetype: 'application/pdf',
      fileName: filename,
      caption,
    });
    console.log(`[whatsapp:sender] → ${jid.split('@')[0]}: [document: ${filename}]`);
    return true;
  } catch (err) {
    console.error('[whatsapp:sender] Failed to send document:', err);
    return false;
  }
}
