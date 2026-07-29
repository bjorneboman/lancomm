// server.js
// Entry point. Starts a WebSocket server that clients connect to for
// signaling only. Actual audio goes peer-to-peer once connected.

import { WebSocketServer } from "ws";
import { randomUUID } from "crypto";
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { joinRoom, leaveRoom } from "./rooms.js";
import { handleMessage } from "./messageHandler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");

const PORT = process.env.PORT || 8443;
const DEFAULT_ROOM = "house"; // single room for now — everyone hears everyone

const tlsOptions = {
  key: fs.readFileSync(path.join(__dirname, "certs", "key.pem")),
  cert: fs.readFileSync(path.join(__dirname, "certs", "cert.pem")),
};

// Tiny static file server so phones can just load the page from this
// same server — no separate web server needed.
const httpsServer = https.createServer(tlsOptions, (req, res) => {
  const filePath = path.join(
    PUBLIC_DIR,
    req.url === "/" ? "index.html" : req.url
  );
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    const type = ext === ".js" ? "text/javascript" : "text/html";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server: httpsServer });

wss.on("connection", (socket) => {
  const client = {
    id: randomUUID(),
    socket,
    roomId: null,
  };

  joinRoom(DEFAULT_ROOM, client);

  // Let the client know its own id (it'll need this to identify itself
  // when peers relay messages back)
  socket.send(JSON.stringify({ type: "welcome", yourId: client.id }));

  socket.on("message", (raw) => handleMessage(client, raw));

  socket.on("close", () => {
    leaveRoom(client);
  });
});

httpsServer.listen(PORT, () => {
  console.log(`PTT app running — open https://<this-machine-LAN-IP>:${PORT} on each device`);
});
