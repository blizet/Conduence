/**
 * Conduence voice session — direct Pipecat SmallWebRTC client (no iframe).
 * Bundled to voice.bundle.js; exposes window.ConduenceVoice for app.js.
 */
import { PipecatClient } from "@pipecat-ai/client-js";
import { SmallWebRTCTransport } from "@pipecat-ai/small-webrtc-transport";

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];
const WEBRTC_ENDPOINT = `${window.location.origin}/api/offer`;

let client = null;
let isReady = false;
let botAudioEl = null;
let partialUserEl = null;
let botMsgEl = null;

const listeners = {
  state: [],
  userTranscript: [],
  botTranscript: [],
  userStartedSpeaking: [],
  botStoppedSpeaking: [],
  error: [],
};

function emit(event, ...args) {
  for (const fn of listeners[event] || []) fn(...args);
}

function attachBotAudio(track) {
  if (!botAudioEl || !track) return;
  botAudioEl.muted = false;
  botAudioEl.volume = 1;
  botAudioEl.srcObject = new MediaStream([track]);
  const tryPlay = () => botAudioEl.play().catch(() => {});
  tryPlay();
  track.addEventListener?.("unmute", tryPlay, { once: true });
}

async function unlockBotAudio() {
  if (!botAudioEl) return;
  botAudioEl.muted = false;
  // Do not block connection on autoplay Promise resolution.
  botAudioEl.play().then(() => {
  }).catch(() => {
  });
}

async function ensureClient() {
  if (client) return client;

  client = new PipecatClient({
    transport: new SmallWebRTCTransport({
      iceServers: ICE_SERVERS,
      waitForICEGathering: true,
      webrtcRequestParams: { endpoint: WEBRTC_ENDPOINT },
    }),
    enableMic: true,
    enableCam: false,
    callbacks: {
      onTransportStateChanged(state) {
        isReady = state === "ready";
        if (state === "ready") {
          emit("state", "connected");
        } else if (state === "connecting" || state === "connected" || state === "initializing") {
          emit("state", "connecting");
        } else if (state === "disconnecting") {
          emit("state", "disconnecting");
        } else {
          isReady = false;
          emit("state", "disconnected");
        }
      },

      onUserTranscript(data) {
        if (!data?.text) return;
        emit("userTranscript", data);
      },

      onBotOutput(data) {
        const text = (
          data?.spoken_progress?.accumulated_text
          || data?.text
          || ""
        ).trim();
        if (!text) return;
        const willSpeak = data.will_be_spoken ?? data.spoken;
        if (willSpeak === false) return;
        emit("botTranscript", { ...data, text });
      },

      onBotStartedSpeaking() {
        emit("state", "speaking");
      },

      onBotStoppedSpeaking() {
        emit("botStoppedSpeaking");
        emit("state", "listening");
      },

      onUserStartedSpeaking() {
        emit("userStartedSpeaking");
        emit("state", "listening");
      },

      onUserStoppedSpeaking() {
        emit("state", "processing");
        emit("userStoppedSpeaking");
      },

      onTrackStarted(track, participant) {
        // SmallWebRTC often omits participant — any incoming audio track is the bot.
        if (track?.kind !== "audio") return;
        const isLocal = participant?.local === true;
        if (!isLocal) attachBotAudio(track);
      },

      onError(err) {
        const msg = err?.data?.message || err?.message || "Voice connection error";
        emit("error", msg);
        emit("state", "disconnected");
      },
    },
  });

  return client;
}

async function connect() {
  const pc = await ensureClient();
  emit("state", "connecting");
  await unlockBotAudio();
  try {
    await pc.connect({
      webrtcRequestParams: { endpoint: WEBRTC_ENDPOINT },
      iceConfig: { iceServers: ICE_SERVERS },
    });
  } catch (err) {
    throw err;
  }
}

async function disconnect() {
  if (!client) return;
  const c = client;
  // Reset immediately so ensureClient() creates a fresh instance next time.
  client = null;
  isReady = false;
  emit("state", "disconnecting");
  try {
    await c.disconnect();
  } catch {
    // Ignore errors from an already-dead connection.
  }
  if (botAudioEl) botAudioEl.srcObject = null;
  emit("state", "disconnected");
}

function on(event, fn) {
  if (listeners[event]) listeners[event].push(fn);
}

function setBotAudioElement(el) {
  botAudioEl = el;
}

function getIsReady() {
  return isReady;
}

window.ConduenceVoice = {
  connect,
  disconnect,
  on,
  setBotAudioElement,
  getIsReady,
};
