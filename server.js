// server.js
// Entry point. Starts a WebSocket server that clients connect to for
// signaling only. Actual audio goes peer-to-peer once connected.

import { WebSocketServer } from "ws";
import { randomUUID } from "crypto";
import { joinRoom, leaveRoom } from "./rooms.js";
import { handleMessage } from "./messageHandler.js";

const PORT = process.env.PORT || 8080;
const DEFAULT_ROOM = "house"; // single room for now — everyone hears everyone

const wss = new WebSocketServer({ port: PORT });

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

console.log(`PTT signaling server running on ws://localhost:${PORT}`);
