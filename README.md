# ⚡ Zapulse

A lightweight REST API to send WhatsApp messages via QR code — no Business account or official API required.  
Built with [Baileys](https://github.com/WhiskeySockets/Baileys), Node.js, and Docker.

---

## 🚀 Getting started

```bash
# 1. Place all files in the same folder
# 2. Start the container
docker-compose up -d

# Follow the logs (important on first run)
docker-compose logs -f
```

---

## 🔗 Linking your WhatsApp (first time only)

1. Open **http://localhost:3000** in your browser
2. A QR code will appear on screen
3. On your phone: **WhatsApp → ⋮ → Linked Devices → Link a Device**
4. Scan the QR code
5. Done! The session is saved in the `./auth` folder — no need to repeat this.

> **Tip:** the QR code also appears in the terminal (`docker-compose logs -f`)

---

## 📡 Endpoints

### `GET /status`
Returns the current connection state.

```json
{ "status": "connected" }
// Possible values: "connected" | "qr" | "disconnected"
```

---

### `POST /send` — Send a message

**To an individual contact:**
```bash
curl -X POST http://localhost:3000/send \
  -H "Content-Type: application/json" \
  -d '{ "to": "5511999999999", "message": "Hey, how are you?" }'
```

**To a group** (use the group ID from `/groups`):
```bash
curl -X POST http://localhost:3000/send \
  -H "Content-Type: application/json" \
  -d '{ "to": "120363XXXXXXXXXX@g.us", "message": "Hello everyone!" }'
```

**Success response:**
```json
{ "ok": true, "to": "5511999999999@s.whatsapp.net" }
```

---

### `GET /groups` — List groups

Returns all groups the linked number is participating in.

```bash
curl http://localhost:3000/groups
```

```json
[
  { "id": "120363XXXXXXXXXX@g.us", "name": "Sales Team", "participants": 12 },
  { "id": "120363YYYYYYYYYY@g.us", "name": "Internal Support", "participants": 5 }
]
```

Use the `id` field in the `/send` endpoint to message a group.

---

### `POST /disconnect`
Logs out and clears the session. A new QR code will be shown automatically.

```bash
curl -X POST http://localhost:3000/disconnect
```

---

## 🔧 Configuration

Environment variables in `docker-compose.yml`:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `3000`  | API port    |

---

## 🔒 Security

By default the API has no authentication — recommended for internal networks only.  
To expose it externally, add an API key middleware in `src/index.js`:

```js
app.use((req, res, next) => {
  if (req.headers['x-api-key'] !== process.env.API_KEY)
    return res.status(401).json({ error: 'Unauthorized' });
  next();
});
```

---

## 🗂 Project structure

```
zapulse/
├── src/
│   ├── index.js      # Express server + web dashboard
│   └── whatsapp.js   # WhatsApp connection (Baileys)
├── auth/             # Session stored here (do not commit!)
├── Dockerfile
├── docker-compose.yml
└── package.json
```

---

## ⚠️ Disclaimer

Zapulse uses the unofficial WhatsApp Web API via Baileys.  
Use responsibly and only for legitimate purposes.  
Accounts sending very high message volumes may be banned by WhatsApp.