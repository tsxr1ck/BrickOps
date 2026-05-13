import { createSession, getConnectionState } from './session';
import { parseIntent } from './llm-parser';
import { handleIntent } from './handler';
import { sendText } from './sender';
import type { ConnectionState } from './session';

/**
 * BrickOps WhatsApp Gateway
 *
 * Entry point that wires everything together:
 * 1. Starts Baileys session
 * 2. Inbound messages → LLM parser → handler
 * 3. HTTP server for outbound delivery and control
 * 4. Syncs connection state to API via HTTP
 * 5. Graceful shutdown
 */

const API_BASE = process.env.BRICKOPS_API_URL || 'http://localhost:3001';
const GATEWAY_PORT = Number(process.env.BRICKOPS_GATEWAY_PORT) || 3002;

console.log('[whatsapp-gateway] Starting...');

async function handleInboundMessage(msg: { sender: string; text: string; messageId: string }) {
  console.log(`[whatsapp] ← ${msg.sender.split('@')[0]}: ${msg.text}`);
  const intent = await parseIntent(msg.text);
  console.log(`[whatsapp] Intent: ${intent.type}`);
  return handleIntent(intent, msg.sender, msg.messageId);
}

function syncStateToAPI(state: ConnectionState) {
  fetch(`${API_BASE}/whatsapp/state`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
  }).catch((err) => {
    console.warn('[whatsapp] Failed to sync state to API:', err.message);
  });
}

function syncQRToAPI(qr: string | null) {
  fetch(`${API_BASE}/whatsapp/qr`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qr }),
  }).catch((err) => {
    console.warn('[whatsapp] Failed to sync QR to API:', err.message);
  });
}

function handleConnectionUpdate(state: ConnectionState) {
  console.log(`[whatsapp] Connection: ${state}`);
  syncStateToAPI(state);
}

function handleQR(qr: string) {
  console.log('[whatsapp] QR code generated — scan in web UI or terminal');
  syncQRToAPI(qr);
}

// --- Wire up inbound message pipeline ---
createSession({
  onMessage: handleInboundMessage,
  onConnectionUpdate: handleConnectionUpdate,
  onQR: handleQR,
});

// --- HTTP server for outbound delivery and control ---
Bun.serve({
  port: GATEWAY_PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === '/outbound' && req.method === 'POST') {
      const body = await req.json<{ recipientJid: string; message: string }>();
      if (!body.recipientJid || !body.message) {
        return new Response(JSON.stringify({ ok: false, error: 'Missing recipientJid or message' }), { status: 400 });
      }
      const sent = await sendText(body.recipientJid, body.message);
      return new Response(JSON.stringify({ ok: sent }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (url.pathname === '/outbound-document' && req.method === 'POST') {
      const { sendDocument } = await import('./sender');
      const body = await req.json<{ recipientJid: string; buffer: number[]; filename: string; caption?: string }>();
      if (!body.recipientJid || !body.buffer || !body.filename) {
        return new Response(JSON.stringify({ ok: false, error: 'Missing required fields' }), { status: 400 });
      }
      const sent = await sendDocument(
        body.recipientJid,
        Buffer.from(body.buffer),
        body.filename,
        body.caption
      );
      return new Response(JSON.stringify({ ok: sent }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (url.pathname === '/clarification/start' && req.method === 'POST') {
      const { startClarification } = await import('./conversation-state');
      const body = await req.json<{
        operatorJid: string;
        projectId: string;
        projectSlug: string;
        projectName: string;
        questions: string[];
      }>();
      startClarification(
        body.operatorJid,
        body.projectId,
        body.projectSlug,
        body.projectName,
        body.questions
      );
      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (url.pathname === '/reconnect' && req.method === 'POST') {
      console.log('[whatsapp-gateway] Reconnect requested via HTTP');
      const state = getConnectionState();
      if (state === 'open') {
        return new Response(JSON.stringify({ ok: true, message: 'Already connected' }), { headers: { 'Content-Type': 'application/json' } });
      }
      createSession({
        onMessage: handleInboundMessage,
        onConnectionUpdate: handleConnectionUpdate,
        onQR: handleQR,
      });
      return new Response(JSON.stringify({ ok: true, message: 'Reconnecting...' }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', connectionState: getConnectionState() }), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response('Not found', { status: 404 });
  },
});

console.log(`[whatsapp-gateway] HTTP server on http://localhost:${GATEWAY_PORT}`);

// --- Graceful shutdown ---
const shutdown = () => {
  console.log('[whatsapp-gateway] Shutting down...');
  syncStateToAPI('disconnected');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
