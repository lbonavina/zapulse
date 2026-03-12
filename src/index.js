const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { connectWhatsApp } = require('./whatsapp');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static('public'));

let sock = null;
let status = 'disconnected'; // disconnected | qr | connected

// Expose io and helpers to the whatsapp module
global.io = io;
global.setStatus = (s) => { status = s; };
global.setSock = (s) => { sock = s; };

// ─── Dashboard (QR code panel) ────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zapulse</title>
  <script src="/socket.io/socket.io.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0d1117; color: #e6edf3; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 40px; text-align: center; max-width: 420px; width: 100%; }
    h1 { font-size: 20px; margin-bottom: 8px; }
    p  { color: #8b949e; font-size: 14px; margin-bottom: 24px; }
    #qr-box { display: flex; justify-content: center; align-items: center; min-height: 300px; }
    #qr-box img { border-radius: 8px; background: #fff; padding: 12px; width: 300px; height: 300px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-top: 20px; }
    .badge.connected    { background: #1a4731; color: #3fb950; }
    .badge.qr           { background: #2d2a00; color: #d29922; }
    .badge.disconnected { background: #3d1a1a; color: #f85149; }
    #message { margin-top: 12px; font-size: 13px; color: #8b949e; min-height: 20px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>⚡ Zapulse</h1>
    <p>Scan the QR code with your WhatsApp to connect</p>
    <div id="qr-box"><span style="color:#8b949e">Waiting for QR code...</span></div>
    <div id="status-badge" class="badge disconnected">disconnected</div>
    <div id="message"></div>
    <button id="btn-disconnect" onclick="disconnect()" style="display:none;margin-top:20px;padding:8px 20px;background:#3d1a1a;color:#f85149;border:1px solid #f8514940;border-radius:8px;font-size:13px;cursor:pointer;">
      Disconnect
    </button>
  </div>
  <script>
    const socket = io();
    const qrBox = document.getElementById('qr-box');
    const badge = document.getElementById('status-badge');
    const msg   = document.getElementById('message');
    const btn   = document.getElementById('btn-disconnect');

    socket.on('status', ({ state, message }) => {
      badge.textContent = state;
      badge.className = 'badge ' + state;
      msg.textContent = message || '';
      btn.style.display = state === 'connected' ? 'inline-block' : 'none';
      if (state === 'connected') {
        qrBox.innerHTML = '<div style="font-size:48px">✅</div>';
      }
    });

    socket.on('qr', (dataUrl) => {
      qrBox.innerHTML = '<img src="' + dataUrl + '" alt="QR Code" />';
      badge.textContent = 'waiting for scan';
      badge.className = 'badge qr';
      btn.style.display = 'none';
      msg.textContent = 'Open WhatsApp → Linked Devices → Link a Device';
    });

    async function disconnect() {
      if (!confirm('Disconnect WhatsApp?')) return;
      btn.disabled = true;
      btn.textContent = 'Disconnecting...';
      await fetch('/disconnect', { method: 'POST' });
    }
  </script>
</body>
</html>`);
});

// ─── Status ───────────────────────────────────────────────────────────────────
app.get('/status', (req, res) => {
  res.json({ status });
});

// ─── Disconnect ───────────────────────────────────────────────────────────────
app.post('/disconnect', async (req, res) => {
  if (!sock) return res.json({ ok: true });
  try {
    await sock.logout();
  } catch (_) {
    // logout may throw if already disconnected — ignore
  }
  res.json({ ok: true });
});

// ─── Send message ─────────────────────────────────────────────────────────────
// Body: { to: "5511999999999", message: "Hello!" }        (individual contact)
//       { to: "120363XXXX@g.us", message: "Hello!" }      (group — see /groups)
app.post('/send', async (req, res) => {
  const { to, message } = req.body;

  if (!to || !message)
    return res.status(400).json({ error: 'Required fields: to, message' });

  if (status !== 'connected' || !sock)
    return res.status(503).json({ error: 'WhatsApp is not connected' });

  try {
    // Ensure correct JID format (e.g. 5511999999999@s.whatsapp.net)
    const jid = to.includes('@') ? to : `\${to.replace(/\D/g, '')}@s.whatsapp.net`;
    await sock.sendMessage(jid, { text: message });
    res.json({ ok: true, to: jid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─── List groups ──────────────────────────────────────────────────────────────
app.get('/groups', async (req, res) => {
  if (status !== 'connected' || !sock)
    return res.status(503).json({ error: 'WhatsApp is not connected' });

  try {
    const groups = await sock.groupFetchAllParticipating();
    const list = Object.values(groups).map(g => ({
      id: g.id,
      name: g.subject,
      participants: g.participants.length,
    }));
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Socket.io ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  socket.emit('status', { state: status });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`\n⚡ Zapulse running at http://localhost:\${PORT}`);
  console.log(`   Open the dashboard to scan the QR code\n`);
  connectWhatsApp();
});