// client.js
// Connects to the signaling server, negotiates a WebRTC connection with
// every other peer in the room, and wires up push-to-talk.

const SIGNALING_URL = `wss://${location.hostname}:${location.port}`;

const statusEl = document.getElementById("status");
const pttButton = document.getElementById("ptt");

let myId = null;
let localStream = null;
const peerConnections = new Map(); // peerId -> RTCPeerConnection

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

const ws = new WebSocket(SIGNALING_URL);

ws.onopen = () => setStatus("Connected to server, requesting mic…");

ws.onmessage = async (event) => {
  const msg = JSON.parse(event.data);

  switch (msg.type) {
    case "welcome":
      myId = msg.yourId;
      await initMic();
      ws.send(JSON.stringify({ type: "who-is-here" }));
      break;

    case "peer-list":
      for (const peerId of msg.peers) {
        await connectToPeer(peerId, true); // we initiate the offer
      }
      break;

    case "offer":
      await handleOffer(msg.fromId, msg.payload);
      break;

    case "answer":
      await handleAnswer(msg.fromId, msg.payload);
      break;

    case "ice-candidate":
      await handleIceCandidate(msg.fromId, msg.payload);
      break;
  }
};

ws.onclose = () => setStatus("Disconnected from server");

async function initMic() {
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  // Start muted — PTT button will enable this track while held
  localStream.getAudioTracks()[0].enabled = false;
  setStatus(`Ready (id: ${myId.slice(0, 8)})`);
}

async function connectToPeer(peerId, isInitiator) {
  if (peerConnections.has(peerId)) return;

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  peerConnections.set(peerId, pc);

  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      send({ type: "ice-candidate", targetId: peerId, payload: e.candidate });
    }
  };

  pc.ontrack = (e) => {
    let audioEl = document.getElementById(`audio-${peerId}`);
    if (!audioEl) {
      audioEl = document.createElement("audio");
      audioEl.id = `audio-${peerId}`;
      audioEl.autoplay = true;
      document.body.appendChild(audioEl);
    }
    audioEl.srcObject = e.streams[0];
  };

  if (isInitiator) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    send({ type: "offer", targetId: peerId, payload: offer });
  }

  return pc;
}

async function handleOffer(fromId, offer) {
  const pc = await connectToPeer(fromId, false);
  await pc.setRemoteDescription(offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  send({ type: "answer", targetId: fromId, payload: answer });
}

async function handleAnswer(fromId, answer) {
  const pc = peerConnections.get(fromId);
  if (pc) await pc.setRemoteDescription(answer);
}

async function handleIceCandidate(fromId, candidate) {
  const pc = peerConnections.get(fromId);
  if (pc) await pc.addIceCandidate(candidate);
}

function send(msg) {
  ws.send(JSON.stringify(msg));
}

function setStatus(text) {
  statusEl.textContent = text;
}

// --- Push to talk ---
// Mouse/touch hold = talk. Works for both desktop testing and phones.
function setTalking(isTalking) {
  if (!localStream) return;
  localStream.getAudioTracks()[0].enabled = isTalking;
  pttButton.textContent = isTalking ? "🔴 Talking…" : "🎙️ Hold to talk";
}

pttButton.addEventListener("mousedown", () => setTalking(true));
pttButton.addEventListener("mouseup", () => setTalking(false));
pttButton.addEventListener("mouseleave", () => setTalking(false));
pttButton.addEventListener("touchstart", (e) => {
  e.preventDefault();
  setTalking(true);
});
pttButton.addEventListener("touchend", (e) => {
  e.preventDefault();
  setTalking(false);
});
