// messageHandler.js
// Routes signaling messages between clients. Never touches audio —
// just forwards JSON envelopes so peers can set up a direct WebRTC link.

import { peersInRoom, getClientById } from "./rooms.js";

// Expected message shape from clients:
// { type: "offer" | "answer" | "ice-candidate" | "who-is-here", targetId?, payload? }

export function handleMessage(client, raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return; // ignore malformed messages
  }

  switch (msg.type) {
    case "who-is-here": {
      // Client just joined — tell it who else is already in the room
      const peers = peersInRoom(client).map((c) => c.id);
      client.socket.send(JSON.stringify({ type: "peer-list", peers }));
      break;
    }

    case "offer":
    case "answer":
    case "ice-candidate": {
      // Relay directly to the intended peer, tagging it with who sent it
      const target = getClientById(client.roomId, msg.targetId);
      if (!target) return;

      target.socket.send(
        JSON.stringify({
          type: msg.type,
          fromId: client.id,
          payload: msg.payload,
        })
      );
      break;
    }

    default:
      break; // unknown message type, ignore
  }
}
