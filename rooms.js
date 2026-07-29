// rooms.js
// Keeps track of which clients are in which room.
// A "room" just means a group of people who can signal each other
// (e.g. "whole-house", or per-floor if you want to split it up later).

const rooms = new Map(); // roomId -> Set of client objects

export function joinRoom(roomId, client) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  rooms.get(roomId).add(client);
  client.roomId = roomId;
}

export function leaveRoom(client) {
  const room = rooms.get(client.roomId);
  if (!room) return;

  room.delete(client);
  if (room.size === 0) {
    rooms.delete(client.roomId);
  }
}

// Everyone else currently in the same room as this client
export function peersInRoom(client) {
  const room = rooms.get(client.roomId);
  if (!room) return [];
  return [...room].filter((c) => c !== client);
}

export function getClientById(roomId, clientId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  return [...room].find((c) => c.id === clientId) || null;
}
