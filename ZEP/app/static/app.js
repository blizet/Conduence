/* ─── refs ───────────────────────────────────────────────────────────────── */
const log           = document.getElementById("log");
const logEmpty      = document.getElementById("log-empty");
const form          = document.getElementById("composer");
const input         = document.getElementById("input");
const sendBtn       = document.getElementById("send");
const voiceBtn      = document.getElementById("voice-btn");
const graphToggle   = document.getElementById("graph-toggle");
const graphPanel    = document.getElementById("graph-panel");
const graphClose    = document.getElementById("graph-close");
const voiceOrbWrap  = document.getElementById("voice-orb-wrap");
const voiceOrbLabel = document.getElementById("voice-orb-label");
const micModal      = document.getElementById("mic-modal");
const micModalClose = document.getElementById("mic-modal-close");
const voiceEnded    = document.getElementById("voice-ended");
const voiceEndedDur = document.getElementById("voice-ended-duration");
const voiceEndedClose = document.getElementById("voice-ended-close");
const voiceBotAudio = document.getElementById("voice-bot-audio");

const configReady = document.body.dataset.configReady === "true";
const Voice = window.ConduenceVoice;

let voiceState         = "disconnected"; // disconnected | connecting | connected
let graphOpen          = false;
let graphInited        = false;
let voiceSessionStart  = null;
let voiceHadSession    = false;
let partialUserEl      = null;
let botMsgEl           = null;
let connectTimeout     = null;
let pendingUserText    = "";
let pendingBotText     = "";
let userCommitTimer    = null;
let botCommitTimer     = null;
let lastUserTextEl     = null;
let lastUserCommitAt   = 0;
let lastBotTextEl      = null;
let lastBotCommitAt    = 0;

const USER_TRANSCRIPT_DEBOUNCE_MS = 900;
const BOT_TRANSCRIPT_DEBOUNCE_MS  = 400;
const TRANSCRIPT_MERGE_WINDOW_MS  = 8000;
const USER_IDLE_FLUSH_MS          = 2200;
const DEDUPE_WINDOW_MS            = 12000;
const BOT_CHUNK_DEDUPE_MS         = 2500;
let lastCommittedUserText         = "";
let lastCommittedBotText          = "";
let lastBotChunkText              = "";
let lastBotChunkAt                = 0;

/* ─── mic permission modal ───────────────────────────────────────────────── */
function showMicModal() {
  if (!micModal) return;
  micModal.removeAttribute("hidden");
  micModalClose?.focus();
}

function hideMicModal() {
  if (!micModal) return;
  micModal.setAttribute("hidden", "");
}

micModalClose?.addEventListener("click", hideMicModal);
micModal?.addEventListener("click", e => {
  if (e.target === micModal) hideMicModal();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && micModal && !micModal.hasAttribute("hidden")) hideMicModal();
});

/* ─── voice ended banner ─────────────────────────────────────────────────── */
function formatDuration(ms) {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

function showVoiceEndedBanner() {
  if (!voiceEnded || !voiceSessionStart) return;
  if (voiceEndedDur) {
    voiceEndedDur.textContent = formatDuration(Date.now() - voiceSessionStart);
  }
  voiceEnded.removeAttribute("hidden");
}

function hideVoiceEndedBanner() {
  voiceEnded?.setAttribute("hidden", "");
}

voiceEndedClose?.addEventListener("click", hideVoiceEndedBanner);

/* ─── helpers ────────────────────────────────────────────────────────────── */
async function readJson(res) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  const text = await res.text();
  if (text.trimStart().startsWith("<"))
    throw new Error(`Server returned HTML (HTTP ${res.status}). Restart the server.`);
  throw new Error(text.slice(0, 200) || `HTTP ${res.status}`);
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ─── messages ───────────────────────────────────────────────────────────── */
function addMessage(role, text, { pending = false, error = false } = {}) {
  if (logEmpty) logEmpty.style.display = "none";

  const row = document.createElement("div");
  row.className =
    `msg msg--${role}` +
    (pending ? " msg--pending" : "") +
    (error   ? " msg--error"   : "");

  const roleEl = document.createElement("div");
  roleEl.className = "msg__role";
  roleEl.textContent = role === "user" ? "You" : "Conduence";

  const body = document.createElement("div");
  body.className = "msg__content";
  body.textContent = text;

  row.appendChild(roleEl);
  row.appendChild(body);
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
  return body;
}

/* ─── textarea auto-grow ─────────────────────────────────────────────────── */
function autoGrow() {
  if (!input) return;
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
}
input?.addEventListener("input", autoGrow);

/* ─── thinking state ─────────────────────────────────────────────────────── */
function setThinking(on) {
  if (sendBtn) sendBtn.disabled = on;
  if (input)   input.disabled   = on;
}

/* ─── graph panel ────────────────────────────────────────────────────────── */
function openGraph() {
  if (!graphPanel) return;
  graphOpen = true;
  graphPanel.removeAttribute("hidden");
  graphPanel.classList.add("open");
  graphToggle?.classList.add("btn-graph--active");

  if (!graphInited && window.GraphView) {
    window.GraphView.init();
    graphInited = true;
  }
  // Double RAF ensures the panel has its final width before sizing canvas.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.GraphView?.resize();
    window.GraphView?.refresh();
  }));
}

function closeGraph() {
  if (!graphPanel) return;
  graphOpen = false;
  graphPanel.classList.remove("open");
  graphToggle?.classList.remove("btn-graph--active");
  // Set hidden after transition ends.
  graphPanel.addEventListener("transitionend", () => {
    if (!graphOpen) graphPanel.setAttribute("hidden", "");
  }, { once: true });
}

graphToggle?.addEventListener("click", () => {
  if (graphOpen) closeGraph(); else openGraph();
});
graphClose?.addEventListener("click", closeGraph);

// Resize graph canvas if window resizes while graph is open.
window.addEventListener("resize", () => {
  if (graphOpen) window.GraphView?.resize();
});

/* ─── voice state ────────────────────────────────────────────────────────── */
function clearConnectTimeout() {
  if (connectTimeout) { clearTimeout(connectTimeout); connectTimeout = null; }
}

async function ensureMicReady() {
  // Mic access is handled by Pipecat initDevices(); a separate getUserMedia
  // probe can block or race with Daily's startCamera on Windows.
  return;
}

function setVoiceState(state) {
  const prev = voiceState;
  voiceState = state;

  if (voiceBtn) {
    voiceBtn.classList.remove("orb-btn--connecting", "orb-btn--connected");
    voiceBtn.disabled = state === "connecting" || state === "disconnecting";
    if (state === "connecting" || state === "disconnecting") {
      voiceBtn.classList.add("orb-btn--connecting");
    }
    if (state === "connected" || state === "listening" || state === "speaking" || state === "processing") {
      voiceBtn.classList.add("orb-btn--connected");
    }
  }

  const active = ["connected", "connecting", "listening", "speaking", "processing", "disconnecting"].includes(state);
  if (voiceOrbWrap) {
    voiceOrbWrap.style.display = active ? "flex" : "none";
  }
  if (voiceOrbLabel) {
    const labels = {
      connecting:   "Connecting…",
      connected:    "Listening…",
      listening:    "Listening…",
      speaking:     "Speaking…",
      processing:   "Processing…",
      disconnecting:"Disconnecting…",
    };
    voiceOrbLabel.textContent = labels[state] || "";
  }

  if (state === "connected" || state === "listening" || state === "speaking" || state === "processing") {
    if (logEmpty) logEmpty.style.display = "none";
    hideVoiceEndedBanner();
    if (voiceBtn) voiceBtn.setAttribute("aria-label", "Disconnect voice agent");
  } else if (state === "disconnected") {
    clearConnectTimeout();
    if (voiceBtn) {
      voiceBtn.disabled = false;
      voiceBtn.setAttribute("aria-label", "Connect voice agent");
    }
    if (voiceHadSession && prev !== "connecting") {
      showVoiceEndedBanner();
      voiceHadSession = false;
    }
  }
}

/* ─── voice transcripts (debounced) ──────────────────────────────────────── */
function clearUserCommitTimer() {
  if (userCommitTimer) { clearTimeout(userCommitTimer); userCommitTimer = null; }
}

function clearBotCommitTimer() {
  if (botCommitTimer) { clearTimeout(botCommitTimer); botCommitTimer = null; }
}

function normalizeTranscriptText(text) {
  return (text || "").trim().replace(/\s+/g, " ");
}

function endsWithTerminalPunctuation(text) {
  return /[.!?]$/.test((text || "").trim());
}

function mergeTranscriptChunk(previous, incoming) {
  const prev = normalizeTranscriptText(previous);
  const next = normalizeTranscriptText(incoming);
  if (!next) return prev;
  if (!prev) return next;
  if (next === prev) return prev;
  if (next.startsWith(prev) || next.includes(prev)) return next;
  if (prev.startsWith(next) || prev.includes(next)) return prev;

  // Merge overlap when transcript engines stream revised chunks.
  const overlapMin = 8;
  const maxOverlap = Math.min(prev.length, next.length);
  for (let i = maxOverlap; i >= overlapMin; i -= 1) {
    if (prev.endsWith(next.slice(0, i))) {
      return `${prev}${next.slice(i)}`.replace(/\s+/g, " ").trim();
    }
  }

  // If no clear overlap, prefer the latest revision instead of appending.
  return next;
}

function isLikelyDuplicateTranscript(next, lastText, lastAt) {
  const a = normalizeTranscriptText(next).toLowerCase();
  const b = normalizeTranscriptText(lastText).toLowerCase();
  if (!a || !b) return false;
  if (Date.now() - lastAt > DEDUPE_WINDOW_MS) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  return false;
}

function updatePendingUserBubble(text) {
  const t = normalizeTranscriptText(text);
  if (!t) return;
  pendingUserText = mergeTranscriptChunk(pendingUserText, t);
  if (logEmpty) logEmpty.style.display = "none";
  if (!partialUserEl) {
    partialUserEl = addMessage("user", pendingUserText, { pending: true });
  } else {
    partialUserEl.textContent = pendingUserText;
  }
}

function commitPendingUserTranscript() {
  clearUserCommitTimer();
  const text = pendingUserText.trim();
  if (!text) {
    if (partialUserEl) {
      partialUserEl.parentElement?.remove();
      partialUserEl = null;
    }
    pendingUserText = "";
    return;
  }
  if (partialUserEl) {
    if (isLikelyDuplicateTranscript(text, lastCommittedUserText, lastUserCommitAt)) {
      partialUserEl.parentElement?.remove();
      partialUserEl = null;
      pendingUserText = "";
      return;
    }
    const recentUserCommit = Date.now() - lastUserCommitAt <= TRANSCRIPT_MERGE_WINDOW_MS;
    if (
      lastUserTextEl &&
      partialUserEl !== lastUserTextEl &&
      recentUserCommit &&
      (!endsWithTerminalPunctuation(lastUserTextEl.textContent || "") ||
        text.startsWith(normalizeTranscriptText(lastUserTextEl.textContent || "")))
    ) {
      lastUserTextEl.textContent = mergeTranscriptChunk(lastUserTextEl.textContent || "", text);
      partialUserEl.parentElement?.remove();
    } else {
      partialUserEl.textContent = text;
      partialUserEl.parentElement.classList.remove("msg--pending");
      lastUserTextEl = partialUserEl;
      lastUserCommitAt = Date.now();
      lastCommittedUserText = text;
    }
    partialUserEl = null;
  } else {
    if (isLikelyDuplicateTranscript(text, lastCommittedUserText, lastUserCommitAt)) {
      pendingUserText = "";
      return;
    }
    lastUserTextEl = addMessage("user", text);
    lastUserCommitAt = Date.now();
    lastCommittedUserText = text;
  }
  pendingUserText = "";
}

function scheduleUserTranscriptCommit(delay = USER_TRANSCRIPT_DEBOUNCE_MS) {
  clearUserCommitTimer();
  userCommitTimer = setTimeout(commitPendingUserTranscript, delay);
}

function handleUserTranscript(data) {
  if (!data?.text) return;
  updatePendingUserBubble(data.text);
  // Keep updating a single pending bubble while speaking; flush only after idle.
  scheduleUserTranscriptCommit(USER_IDLE_FLUSH_MS);
}

function updatePendingBotBubble(text) {
  const t = normalizeTranscriptText(text);
  if (!t) return;
  pendingBotText = mergeTranscriptChunk(pendingBotText, t);
  if (logEmpty) logEmpty.style.display = "none";
  if (!botMsgEl) {
    botMsgEl = addMessage("assistant", pendingBotText);
  } else {
    botMsgEl.textContent = pendingBotText;
  }
  if (log) log.scrollTop = log.scrollHeight;
}

function commitPendingBotTranscript() {
  clearBotCommitTimer();
  if (botMsgEl) {
    if (isLikelyDuplicateTranscript(pendingBotText, lastCommittedBotText, lastBotCommitAt)) {
      botMsgEl.parentElement?.remove();
      pendingBotText = "";
      botMsgEl = null;
      return;
    }
    const recentBotCommit = Date.now() - lastBotCommitAt <= TRANSCRIPT_MERGE_WINDOW_MS;
    if (
      lastBotTextEl &&
      botMsgEl !== lastBotTextEl &&
      recentBotCommit &&
      (!endsWithTerminalPunctuation(lastBotTextEl.textContent || "") ||
        (pendingBotText && pendingBotText.startsWith(normalizeTranscriptText(lastBotTextEl.textContent || ""))))
    ) {
      lastBotTextEl.textContent = mergeTranscriptChunk(lastBotTextEl.textContent || "", pendingBotText || "");
      botMsgEl.parentElement?.remove();
      lastBotCommitAt = Date.now();
      lastCommittedBotText = normalizeTranscriptText(lastBotTextEl.textContent || "");
    } else {
      lastBotTextEl = botMsgEl;
      lastBotCommitAt = Date.now();
      lastCommittedBotText = normalizeTranscriptText(lastBotTextEl.textContent || "");
    }
  }
  pendingBotText = "";
  botMsgEl = null;
}

function scheduleBotTranscriptCommit(delay = BOT_TRANSCRIPT_DEBOUNCE_MS) {
  clearBotCommitTimer();
  botCommitTimer = setTimeout(commitPendingBotTranscript, delay);
}

function handleBotTranscript(data) {
  if (!data?.text) return;
  const chunk = normalizeTranscriptText(data.text);
  if (!chunk) return;
  if (chunk === lastBotChunkText && Date.now() - lastBotChunkAt <= BOT_CHUNK_DEDUPE_MS) return;
  lastBotChunkText = chunk;
  lastBotChunkAt = Date.now();
  updatePendingBotBubble(data.text);
  scheduleBotTranscriptCommit();
}

function resetVoiceTranscriptState() {
  clearUserCommitTimer();
  clearBotCommitTimer();
  partialUserEl = null;
  botMsgEl = null;
  pendingUserText = "";
  pendingBotText = "";
  lastUserTextEl = null;
  lastUserCommitAt = 0;
  lastBotTextEl = null;
  lastBotCommitAt = 0;
  lastCommittedUserText = "";
  lastCommittedBotText = "";
  lastBotChunkText = "";
  lastBotChunkAt = 0;
}

async function disconnectVoice() {
  if (!Voice) return;
  commitPendingUserTranscript();
  commitPendingBotTranscript();
  try {
    await Voice.disconnect();
  } catch { /* already disconnected */ }
  resetVoiceTranscriptState();
}

async function connectVoice() {
  if (!configReady || !Voice) return;

  if (voiceState !== "disconnected") {
    await disconnectVoice();
    return;
  }

  hideVoiceEndedBanner();
  resetVoiceTranscriptState();
  voiceSessionStart = null;
  voiceHadSession = false;
  fetch("/api/voice/clear", { method: "POST" }).catch(() => {});

  setVoiceState("connecting");

  if (voiceBotAudio) {
    voiceBotAudio.muted = false;
    voiceBotAudio.play().catch(() => {});
  }

  clearConnectTimeout();
  connectTimeout = setTimeout(() => {
    if (voiceState === "connecting") {
      disconnectVoice();
      addMessage("assistant", "Voice connection timed out. Check your mic and network, then try again.", { error: true });
    }
  }, 30000);

  try {
    // Don't await BOT_READY — connection UI is driven by transport state events.
    Voice.connect().catch(err => {
      clearConnectTimeout();
      setVoiceState("disconnected");
      addMessage("assistant", err?.message || "Couldn't connect to voice. Try again.", { error: true });
    });
  } catch (err) {
    clearConnectTimeout();
    setVoiceState("disconnected");
    const errName = err?.name || "";
    const errMsg = err?.message || "";
    const denied = /NotAllowed|PermissionDenied/i.test(errName) || /permission/i.test(errMsg);
    if (denied) {
      showMicModal();
    } else {
      addMessage("assistant", errMsg || "Couldn't connect to voice. Try again.", { error: true });
    }
  }
}

voiceBtn?.addEventListener("click", () => { connectVoice(); });

/* ─── init Pipecat voice client ──────────────────────────────────────────── */
if (Voice) {
  Voice.setBotAudioElement(voiceBotAudio);

  Voice.on("state", state => {
    if (state === "connected") {
      clearConnectTimeout();
      voiceSessionStart = Date.now();
      voiceHadSession = true;
    }
    if (state === "speaking") {
      clearBotCommitTimer();
      pendingBotText = "";
      botMsgEl = null;
    }
    if (state === "processing") {
      // Keep idle-based flush as primary commit trigger to avoid split turns.
    }
    if (state === "listening") {
      commitPendingBotTranscript();
    }
    setVoiceState(state);
  });

  Voice.on("userTranscript", handleUserTranscript);
  Voice.on("botTranscript", handleBotTranscript);
  Voice.on("userStoppedSpeaking", () => scheduleUserTranscriptCommit(250));

  Voice.on("error", msg => {
    clearConnectTimeout();
    setVoiceState("disconnected");
    addMessage("assistant", msg || "Voice connection error.", { error: true });
  });
}

/* ─── legacy iframe helpers removed — voice uses direct WebRTC client ───── */

/* ─── memory actions ─────────────────────────────────────────────────────── */
function renderMemoryActions(contentEl, pm) {
  if (!pm?.choices) return;
  const wrap = document.createElement("div");
  wrap.className = "memory-actions";
  pm.choices.forEach(choice => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "memory-action";
    btn.textContent = choice.label;
    btn.addEventListener("click", () => handleMemoryDecision(choice.id, wrap));
    wrap.appendChild(btn);
  });
  contentEl.appendChild(wrap);
}

async function handleMemoryDecision(decision, actionsEl) {
  actionsEl.querySelectorAll("button").forEach(b => b.disabled = true);
  setThinking(true);
  const pending = addMessage("assistant", "Updating memory…", { pending: true });
  try {
    const res  = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memory_decision: decision }),
    });
    const data = await readJson(res);
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    pending.parentElement.classList.remove("msg--pending");
    pending.textContent = data.reply;
    if (data.pending_memory) renderMemoryActions(pending, data.pending_memory);
  } catch (err) {
    actionsEl.querySelectorAll("button").forEach(b => b.disabled = false);
    pending.parentElement.classList.replace("msg--pending", "msg--error");
    pending.textContent = `Couldn't update memory: ${err.message}`;
  } finally {
    setThinking(false);
    input?.focus();
  }
}

/* ─── chat submit ────────────────────────────────────────────────────────── */
input?.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form?.requestSubmit(); }
});

form?.addEventListener("submit", async e => {
  e.preventDefault();
  if (!configReady || !input) return;
  const message = input.value.trim();
  if (!message) return;

  addMessage("user", message);
  input.value = "";
  autoGrow();
  setThinking(true);

  const pending = addMessage("assistant", "Thinking…", { pending: true });
  try {
    const res  = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const data = await readJson(res);
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    pending.parentElement.classList.remove("msg--pending");
    pending.textContent = data.reply;
    if (data.pending_memory) renderMemoryActions(pending, data.pending_memory);
  } catch (err) {
    pending.parentElement.classList.replace("msg--pending", "msg--error");
    pending.textContent = `Couldn't get a reply: ${err.message}`;
  } finally {
    setThinking(false);
    input.focus();
  }
});

/* ─── graph auto-init on DOMContentLoaded ────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  if (configReady && window.GraphView) {
    window.GraphView.init();
    graphInited = true;
  }
});
