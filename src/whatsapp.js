const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const QRCode = require('qrcode');
const path = require('path');

const AUTH_DIR = path.join(__dirname, '..', 'auth');

async function connectWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: true, // also prints QR in terminal as a fallback
    browser: ['Zapulse', 'Chrome', '1.0.0'],
    syncFullHistory: false,
  });

  global.setSock(sock);

  // ─── Credentials ────────────────────────────────────────────────────────────
  sock.ev.on('creds.update', saveCreds);

  // ─── Connection events ───────────────────────────────────────────────────────
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📱 QR code generated — scan it from the dashboard or terminal\n');
      // Generate high-quality PNG (600x600) for reliable scanning
      const dataUrl = await QRCode.toDataURL(qr, {
        width: 600,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'H',
      });
      global.io.emit('qr', dataUrl);
      global.setStatus('qr');
    }

    if (connection === 'open') {
      const phone = sock.user?.id?.split(':')[0] ?? 'unknown';
      console.log(`\n✅ WhatsApp connected! Number: ${phone}\n`);
      global.setStatus('connected');
      global.io.emit('status', {
        state: 'connected',
        message: `Connected as ${phone}`,
      });
    }

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = reason !== DisconnectReason.loggedOut;

      console.log(`\n⚠️  Connection closed. Reason: ${reason}. Reconnecting: ${shouldReconnect}\n`);
      global.setStatus('disconnected');
      global.io.emit('status', { state: 'disconnected', message: 'Reconnecting...' });

      if (shouldReconnect) {
        // Wait 3s before reconnecting to avoid flooding
        setTimeout(() => connectWhatsApp(), 3000);
      } else {
        // Logged out — clear session and show a new QR
        const fs = require('fs');
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        fs.mkdirSync(AUTH_DIR, { recursive: true });
        global.io.emit('status', { state: 'disconnected', message: 'Session ended. Reload the page.' });
        setTimeout(() => connectWhatsApp(), 2000);
      }
    }
  });

  return sock;
}

module.exports = { connectWhatsApp };