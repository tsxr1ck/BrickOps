/**
 * Shared WhatsApp connection state.
 *
 * The API stores a local snapshot of the connection state and QR code
 * that get updated by the gateway via HTTP.
 */

let connectionState: 'disconnected' | 'connecting' | 'open' | 'unknown' = 'unknown';
let currentQR: string | null = null;

export function getConnectionState() {
  return connectionState;
}

export function setConnectionState(state: typeof connectionState) {
  connectionState = state;
  // Clear QR once connected
  if (state === 'open') {
    currentQR = null;
  }
}

export function getCurrentQR() {
  return currentQR;
}

export function setCurrentQR(qr: string | null) {
  currentQR = qr;
}
