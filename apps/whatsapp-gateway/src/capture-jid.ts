import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';

const AUTH_DIR =
  process.env.BRICKOPS_WA_AUTH_DIR ||
  path.join(process.env.HOME || '~', '.brickops', 'whatsapp-auth');

console.log('=== WhatsApp JID Capture ===');
console.log('Scan the QR code with your personal WhatsApp, then send any message to this bot.');
console.log('');

if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
const { version } = await fetchLatestBaileysVersion();

const socket = makeWASocket({
  version,
  auth: state,
  printQRInTerminal: true,
  browser: ['BrickOps', 'Server', '1.0.0'],
});

socket.ev.on('creds.update', saveCreds);

socket.ev.on('connection.update', ({ connection, qr }) => {
  if (qr) {
    console.log('Scan the QR code above with WhatsApp.');
  }
  if (connection === 'open') {
    console.log('Connected. Now send any message to this bot from your personal phone.');
  }
});

socket.ev.on('messages.upsert', ({ messages }) => {
  for (const msg of messages) {
    if (!msg.message) continue;
    if (msg.key.fromMe) continue;
    if (msg.key.remoteJid === 'status@broadcast') continue;

    const jid = msg.key.remoteJid || '';
    const name = msg.pushName || 'Unknown';
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

    console.log('');
    console.log('========================================');
    console.log('  JID captured!');
    console.log('========================================');
    console.log(`  JID:      ${jid}`);
    console.log(`  Name:     ${name}`);
    console.log(`  Message:  ${text.slice(0, 50)}`);
    console.log('========================================');
    console.log('');
    console.log('Add this to your .env files:');
    console.log(`  BRICKOPS_OPERATOR_JID="${jid}"`);
    console.log('');
    console.log('Done. Exiting.');
    process.exit(0);
  }
});
