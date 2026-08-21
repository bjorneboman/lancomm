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

    case "ping":
      playPingSound();
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
      audioEl.playsInline = true; // required on iOS to avoid fullscreen takeover
      document.body.appendChild(audioEl);
    }
    audioEl.srcObject = e.streams[0];
    // iOS Safari blocks autoplay unless tied to a user gesture — try now,
    // and we also retry on the next PTT tap (see unlockAudioPlayback below)
    audioEl.play().catch(() => {
      /* will retry on next user tap via unlockAudioPlayback() */
    });
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

// --- Ping ---
// A lightweight "hey, got a sec?" signal — no audio stream involved,
// just a short tone generated on the receiving end.
function playPingSound() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.frequency.value = 880;
  osc.connect(gain);
  gain.connect(ctx.destination);

  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

  osc.start();
  osc.stop(ctx.currentTime + 0.3);
}

function sendPing() {
  for (const peerId of peerConnections.keys()) {
    send({ type: "ping", targetId: peerId });
  }
  playPingSound()
}

// On iOS, audio elements created automatically (not from a direct tap)
// may be blocked from playing. Any tap on the PTT button "unlocks"
// playback for all current audio elements for the rest of the session.
function unlockAudioPlayback() {
  document.querySelectorAll("audio").forEach((el) => {
    el.play().catch(() => {});
  });
}

// --- Push to talk ---
// Mouse/touch hold = talk. Works for both desktop testing and phones.
function setTalking(isTalking) {
  if (!localStream) return;
  localStream.getAudioTracks()[0].enabled = isTalking;
  pttButton.textContent = isTalking ? "🔴 Talking…" : "🎙️ Hold to talk";
}

pttButton.addEventListener("mousedown", () => {
  unlockAudioPlayback();
  setTalking(true);
});
pttButton.addEventListener("mouseup", () => setTalking(false));
pttButton.addEventListener("mouseleave", () => setTalking(false));
pttButton.addEventListener("touchstart", (e) => {
  e.preventDefault();
  unlockAudioPlayback();
  setTalking(true);
});
pttButton.addEventListener("touchend", (e) => {
  e.preventDefault();
  setTalking(false);
});

const pingButton = document.getElementById("ping");
pingButton.addEventListener("click", sendPing);
