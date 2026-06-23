const log = document.getElementById("log");
const form = document.getElementById("composer");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
const pulse = document.getElementById("pulse");

const configReady = document.body.dataset.configReady === "true";

async function readJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  if (text.trimStart().startsWith("<")) {
    throw new Error(
      `Server returned HTML instead of JSON (HTTP ${response.status}). Restart python server.py and check the terminal for errors.`
    );
  }
  throw new Error(text.slice(0, 200) || `Unexpected response (HTTP ${response.status}).`);
}

function scrollToBottom() {
  log.scrollTop = log.scrollHeight;
}

function addMessage(role, content, { pending = false, error = false } = {}) {
  const row = document.createElement("div");
  row.className = `msg msg--${role}${pending ? " msg--pending" : ""}${error ? " msg--error" : ""}`;

  const roleEl = document.createElement("div");
  roleEl.className = "msg__role";
  roleEl.textContent = role === "user" ? "you" : "agent";

  const contentEl = document.createElement("div");
  contentEl.className = "msg__content";
  contentEl.textContent = content;

  row.appendChild(roleEl);
  row.appendChild(contentEl);
  log.appendChild(row);
  scrollToBottom();

  return contentEl;
}

function refreshGraphAndUser() {
  if (window.GraphView) {
    window.GraphView.refresh();
    window.setTimeout(() => window.GraphView.refresh(), 3000);
    window.setTimeout(() => window.GraphView.refresh(), 8000);
  }
  refreshUserBadge();
  window.setTimeout(refreshUserBadge, 5000);
}

function renderMemoryActions(contentEl, pendingMemory) {
  if (!pendingMemory || !Array.isArray(pendingMemory.choices)) return;

  const actions = document.createElement("div");
  actions.className = "memory-actions";

  pendingMemory.choices.forEach((choice) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "memory-action";
    button.textContent = choice.label;
    button.addEventListener("click", () => submitMemoryDecision(choice.id, actions));
    actions.appendChild(button);
  });

  contentEl.appendChild(actions);
}

async function submitMemoryDecision(decision, actionsEl) {
  const buttons = actionsEl.querySelectorAll("button");
  buttons.forEach((button) => {
    button.disabled = true;
  });

  setThinking(true);
  const pendingEl = addMessage("assistant", "updating memory...", { pending: true });

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memory_decision: decision }),
    });
    const data = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(data.error || "Something went wrong.");
    }

    pendingEl.parentElement.classList.remove("msg--pending");
    pendingEl.textContent = data.reply;
    if (data.pending_memory) {
      renderMemoryActions(pendingEl, data.pending_memory);
    } else {
      refreshGraphAndUser();
    }
  } catch (err) {
    buttons.forEach((button) => {
      button.disabled = false;
    });
    pendingEl.parentElement.classList.remove("msg--pending");
    pendingEl.parentElement.classList.add("msg--error");
    pendingEl.textContent = `Couldn't update memory: ${err.message}`;
  } finally {
    setThinking(false);
    scrollToBottom();
    input.focus();
  }
}

function setThinking(isThinking) {
  pulse.classList.toggle("thinking", isThinking);
  sendBtn.disabled = isThinking;
  input.disabled = isThinking;
}

function autoGrow() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 160) + "px";
}

input.addEventListener("input", autoGrow);

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!configReady) return;

  const message = input.value.trim();
  if (!message) return;

  addMessage("user", message);
  input.value = "";
  autoGrow();
  setThinking(true);

  const pendingEl = addMessage("assistant", "thinking...", { pending: true });

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    const data = await readJsonResponse(response);

    if (!response.ok) {
      throw new Error(data.error || "Something went wrong.");
    }

    pendingEl.parentElement.classList.remove("msg--pending");
    pendingEl.textContent = data.reply;
    if (data.pending_memory) {
      renderMemoryActions(pendingEl, data.pending_memory);
    } else {
      refreshGraphAndUser();
    }
  } catch (err) {
    pendingEl.parentElement.classList.remove("msg--pending");
    pendingEl.parentElement.classList.add("msg--error");
    pendingEl.textContent = `Couldn't get a reply: ${err.message}`;
  } finally {
    setThinking(false);
    scrollToBottom();
    input.focus();
  }
});

async function refreshUserBadge() {
  try {
    const r = await fetch("/api/user");
    if (!r.ok) return;
    const u = await r.json();
    const nameEl  = document.getElementById("graph-user-name");
    const emailEl = document.getElementById("graph-user-email");
    const barUser = document.getElementById("graph-bar-user");
    if (!nameEl || !emailEl || !barUser) return;
    const name = [u.first_name, u.last_name].filter(Boolean).join(" ");
    if (name || u.email) {
      nameEl.textContent  = name  || "";
      emailEl.textContent = u.email || "";
      barUser.hidden = false;
    }
  } catch { /* ignore */ }
}

document.addEventListener("DOMContentLoaded", () => {
  if (document.body.dataset.configReady === "true") {
    refreshUserBadge();
    window.setInterval(refreshUserBadge, 30000);
  }
});
