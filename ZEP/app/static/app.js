/* ─── DOM refs ────────────────────────────────────────────────────────────── */
const log       = document.getElementById("log");
const form      = document.getElementById("composer");
const input     = document.getElementById("input");
const sendBtn   = document.getElementById("send");
const landing   = document.getElementById("landing");
const workspace = document.getElementById("workspace");
const landingStart = document.getElementById("landing-start");
const landingText  = document.getElementById("landing-text");
const clientFrame  = document.getElementById("client-frame");
const graphPane    = document.getElementById("graph-pane");
const memoriesList = document.getElementById("memories-list");
const memorySearch = document.getElementById("memory-search");
const leftPanelLabel = document.getElementById("left-panel-label");

const configReady = document.body.dataset.configReady === "true";

let memoriesCache = [];
let clientLoaded = false;
let activeTab = "context";

/* ─── helpers ────────────────────────────────────────────────────────────── */
async function readJsonResponse(res) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  const text = await res.text();
  if (text.trimStart().startsWith("<"))
    throw new Error(`Server returned HTML (HTTP ${res.status}). Restart the server.`);
  throw new Error(text.slice(0, 200) || `Unexpected (HTTP ${res.status}).`);
}

function scrollToBottom() { log.scrollTop = log.scrollHeight; }

function addMessage(role, content, { pending = false, error = false } = {}) {
  const intro = log.querySelector(".log__intro");
  if (intro) intro.remove();

  const row = document.createElement("div");
  row.className = `msg msg--${role}${pending ? " msg--pending" : ""}${error ? " msg--error" : ""}`;

  const roleEl = document.createElement("div");
  roleEl.className = "msg__role";
  roleEl.textContent = role === "user" ? "You" : "Conduence";

  const contentEl = document.createElement("div");
  contentEl.className = "msg__content";
  contentEl.textContent = content;

  row.appendChild(roleEl);
  row.appendChild(contentEl);
  log.appendChild(row);
  scrollToBottom();
  return contentEl;
}

function setThinking(v) { sendBtn.disabled = v; input.disabled = v; }

function autoGrow() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 160) + "px";
}
input?.addEventListener("input", autoGrow);

/* ─── landing + tabs ─────────────────────────────────────────────────────── */
function loadIframe(frame) {
  const src = frame.dataset.src;
  if (!src || frame.src === src || frame.getAttribute("src") === src) return;
  frame.src = src;
}

function ensureClientFrame() {
  if (!clientLoaded) {
    loadIframe(clientFrame);
    clientLoaded = true;
  }
}

function showGraphPane() {
  if (!graphPane) return;
  graphPane.hidden = false;
  graphPane.classList.add("sm-frame--active");
  loadMemories();
  requestAnimationFrame(() => {
    if (window.GraphView) {
      window.GraphView.resize();
      window.GraphView.refresh();
    }
  });
}

function hideGraphPane() {
  if (!graphPane) return;
  graphPane.hidden = true;
  graphPane.classList.remove("sm-frame--active");
}

function setTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".sm-tab").forEach((btn) => {
    const on = btn.dataset.tab === tab;
    btn.classList.toggle("sm-tab--active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });

  if (tab === "context") {
    clientFrame?.classList.add("sm-frame--active");
    hideGraphPane();
    ensureClientFrame();
    if (leftPanelLabel) leftPanelLabel.textContent = "TEXT CHAT";
  } else {
    clientFrame?.classList.remove("sm-frame--active");
    showGraphPane();
    if (leftPanelLabel) leftPanelLabel.textContent = "TEXT CHAT";
  }
}

function openWorkspace() {
  landing?.classList.add("hidden");
  workspace?.classList.remove("hidden");
  ensureClientFrame();
  loadMemories();
  input?.focus();
}

landingStart?.addEventListener("click", () => {
  if (!configReady) return;
  sessionStorage.setItem("conduence-started", "1");
  openWorkspace();
});

landingText?.addEventListener("click", () => {
  if (!configReady) return;
  sessionStorage.setItem("conduence-started", "1");
  openWorkspace();
});
if (landingText && !configReady) landingText.disabled = true;

document.querySelectorAll(".sm-tab").forEach((btn) => {
  btn.addEventListener("click", () => setTab(btn.dataset.tab));
});

if (window.location.hash === "#chat" || sessionStorage.getItem("conduence-started") === "1") {
  openWorkspace();
}

/* ─── memories panel ───────────────────────────────────────────────────────── */
function renderMemories(items) {
  if (!memoriesList) return;
  memoriesList.innerHTML = "";
  if (!items.length) {
    memoriesList.innerHTML = '<p class="memories__empty">Graph memories appear here as you chat.</p>';
    return;
  }
  items.forEach((m) => {
    const card = document.createElement("article");
    card.className = "memory-card";
    card.innerHTML = `
      <p class="memory-card__text">${escapeHtml(m.summary)}</p>
      <p class="memory-card__meta">${escapeHtml(m.label)}${m.name && m.name !== m.summary ? " · " + escapeHtml(m.name) : ""}</p>
    `;
    memoriesList.appendChild(card);
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function loadMemories() {
  try {
    const res = await fetch("/api/memories");
    const data = await readJsonResponse(res);
    memoriesCache = data.memories || [];
    renderMemories(memoriesCache);
  } catch {
    /* non-fatal */
  }
}

memorySearch?.addEventListener("input", () => {
  const q = memorySearch.value.trim().toLowerCase();
  if (!q) {
    renderMemories(memoriesCache);
    return;
  }
  renderMemories(
    memoriesCache.filter(
      (m) =>
        (m.summary || "").toLowerCase().includes(q) ||
        (m.name || "").toLowerCase().includes(q) ||
        (m.label || "").toLowerCase().includes(q),
    ),
  );
});

/* ─── memory confirmation ────────────────────────────────────────────────── */
function renderMemoryActions(contentEl, pm) {
  if (!pm?.choices) return;
  const wrap = document.createElement("div");
  wrap.className = "memory-actions";
  pm.choices.forEach((c) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "memory-action";
    btn.textContent = c.label;
    btn.addEventListener("click", () => submitMemoryDecision(c.id, wrap));
    wrap.appendChild(btn);
  });
  contentEl.appendChild(wrap);
}

async function submitMemoryDecision(decision, actionsEl) {
  actionsEl.querySelectorAll("button").forEach((b) => (b.disabled = true));
  setThinking(true);
  const pendingEl = addMessage("assistant", "Updating memory…", { pending: true });
  try {
    const res  = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memory_decision: decision }) });
    const data = await readJsonResponse(res);
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    pendingEl.parentElement.classList.remove("msg--pending");
    pendingEl.textContent = data.reply;
    if (data.pending_memory) renderMemoryActions(pendingEl, data.pending_memory);
    loadMemories();
  } catch (err) {
    actionsEl.querySelectorAll("button").forEach((b) => (b.disabled = false));
    pendingEl.parentElement.classList.replace("msg--pending", "msg--error");
    pendingEl.textContent = `Couldn't update memory: ${err.message}`;
  } finally {
    setThinking(false);
    scrollToBottom();
    input.focus();
  }
}

/* ─── text chat ──────────────────────────────────────────────────────────── */
input?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
});

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!configReady) return;
  const message = input.value.trim();
  if (!message) return;
  addMessage("user", message);
  input.value = "";
  autoGrow();
  setThinking(true);
  const pendingEl = addMessage("assistant", "Thinking…", { pending: true });
  try {
    const res  = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
    const data = await readJsonResponse(res);
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    pendingEl.parentElement.classList.remove("msg--pending");
    pendingEl.textContent = data.reply;
    if (data.pending_memory) renderMemoryActions(pendingEl, data.pending_memory);
    loadMemories();
  } catch (err) {
    pendingEl.parentElement.classList.replace("msg--pending", "msg--error");
    pendingEl.textContent = `Couldn't get a reply: ${err.message}`;
  } finally {
    setThinking(false);
    scrollToBottom();
    input.focus();
  }
});
