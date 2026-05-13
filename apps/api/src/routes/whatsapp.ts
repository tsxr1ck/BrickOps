import { Hono } from "hono";
import { getConnectionState, setConnectionState, getCurrentQR, setCurrentQR } from "./whatsapp-state";

/**
 * WhatsApp status and control routes.
 *
 * The gateway calls PATCH /whatsapp/state and PATCH /whatsapp/qr
 * to sync connection state and QR codes to the API.
 */

const GATEWAY_URL = process.env.BRICKOPS_GATEWAY_URL || 'http://localhost:3002';

export const whatsappRoutes = new Hono();

// --- Connection status (consumed by web UI) ---
whatsappRoutes.get("/status", (c) => {
  const state = getConnectionState();
  const operatorJid = process.env.BRICKOPS_OPERATOR_JID || "";

  return c.json({
    connectionState: state,
    operatorJid: operatorJid ? operatorJid.split("@")[0] : null,
    gatewayRunning: state !== "unknown",
    qr: getCurrentQR(),
  });
});

// --- Gateway pushes state updates here ---
whatsappRoutes.patch("/state", async (c) => {
  const body = await c.req.json<{ state: string }>();
  const valid = ['disconnected', 'connecting', 'open'];
  if (valid.includes(body.state)) {
    setConnectionState(body.state as any);
    return c.json({ ok: true });
  }
  return c.json({ ok: false, error: "Invalid state" }, 400);
});

// --- Gateway pushes QR codes here ---
whatsappRoutes.patch("/qr", async (c) => {
  const body = await c.req.json<{ qr: string | null }>();
  setCurrentQR(body.qr);
  return c.json({ ok: true });
});

// --- Trigger reconnect (forwards to gateway) ---
whatsappRoutes.post("/reconnect", async (c) => {
  try {
    const res = await fetch(`${GATEWAY_URL}/reconnect`, { method: 'POST' });
    const data = await res.json();
    return c.json(data);
  } catch {
    return c.json({ ok: false, message: "Could not reach WhatsApp gateway. Is it running?" }, 502);
  }
});
