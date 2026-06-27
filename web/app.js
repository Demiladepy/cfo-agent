const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let activeScenario = "mom";
let killActive = false;
let activePendingId = null;

const SCENARIOS = {
  mom: {
    endpoint: "/api/demo/send",
    body: {
      amountNgn: 50_000,
      recipientId: "mom",
      recipientCategory: "family",
    },
  },
  airtime: {
    endpoint: "/api/demo/airtime",
    body: { phone: "08012345678", amountNgn: 2_000 },
  },
};

const TAG = {
  real: "tag-real",
  simulated: "tag-simulated",
  configured: "tag-configured",
  stub: "tag-stub",
  missing: "tag-missing",
};

const STATUS_LABEL = {
  real: "Live",
  simulated: "Simulated",
  configured: "Configured",
  stub: "Stub",
  missing: "Missing",
};

const SOURCE_LABEL = {
  live: "Live",
  mock: "Simulated",
  unavailable: "Unavailable",
  missing: "Not configured",
};

function applySourceDot(el, field) {
  if (!el) return;
  el.className = `source-dot ${field.source === "missing" ? "unavailable" : field.source}`;
  const reason = field.reason ? ` — ${field.reason}` : "";
  el.title = `${SOURCE_LABEL[field.status ?? field.source] ?? field.source}${reason}`;
}

function renderBalanceField(valueEl, noteEl, dotEl, field, formatter) {
  applySourceDot(dotEl, field);
  if (field.value === null || field.value === undefined) {
    valueEl.textContent = "—";
    valueEl.classList.add("unavailable");
    noteEl.textContent = "";
    return;
  }
  valueEl.classList.remove("unavailable");
  valueEl.textContent = formatter(field.value);
  if (field.source === "mock") {
    noteEl.textContent = "Simulated";
  } else if (field.source === "unavailable") {
    noteEl.textContent = "";
  } else {
    noteEl.textContent = "";
  }
}

function renderIntegrationDots(layers) {
  const el = $("#integration-dots");
  if (!el) return;
  if (!layers?.length) {
    el.innerHTML = "";
    return;
  }
  const dotClass = (status) => {
    if (status === "live") return "live";
    if (status === "mock") return "mock";
    return "unavailable";
  };
  el.innerHTML = layers
    .map(
      (layer) => `
    <span class="integration-pill">
      <span class="source-dot ${dotClass(layer.status)}" title="${escapeHtml(
        layer.reason
          ? `${SOURCE_LABEL[layer.status] ?? layer.status} — ${layer.reason}`
          : (SOURCE_LABEL[layer.status] ?? layer.status),
      )}"></span>
      <span>${escapeHtml(layer.label)}</span>
    </span>`,
    )
    .join("");
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  return res.json();
}

function formatNgn(n) {
  return `₦${Number(n).toLocaleString()}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderConfirmBanner(pending) {
  const banner = $("#confirm-banner");
  if (!pending) {
    banner.classList.add("hidden");
    activePendingId = null;
    return;
  }

  activePendingId = pending.id;
  banner.classList.remove("hidden");
  $("#confirm-reason").textContent = pending.reason;

  const action = pending.action;
  const caps = pending.caps;
  const details = $("#confirm-details");
  details.innerHTML = `
    <div><dt>Transfer</dt><dd>${formatNgn(action.intent.amountNgn)} → ${escapeHtml(action.intent.recipientId)}</dd></div>
    <div><dt>Category</dt><dd>${escapeHtml(action.intent.recipientCategory)}</dd></div>
    <div><dt>Daily cap use</dt><dd>${formatNgn(caps.dailySpentNgn)} + ${formatNgn(caps.wouldConsumeNgn)} of ${formatNgn(caps.dailyCapNgn)}</dd></div>
    <div><dt>Confirm threshold</dt><dd>${formatNgn(caps.confirmThresholdNgn)}</dd></div>
    <div><dt>Expires</dt><dd>${escapeHtml(pending.expiresAt)} UTC</dd></div>`;
}

async function loadPendingConfirmations() {
  const data = await api("/api/confirm/pending");
  const pending = data.pending?.[0] ?? null;
  renderConfirmBanner(pending);
  return pending;
}

async function submitConfirmation(decision) {
  if (!activePendingId) return;
  const data = await api(`/api/confirm/${activePendingId}`, {
    method: "POST",
    body: JSON.stringify({ decision }),
  });
  if (data.ok && data.steps) {
    renderSteps(data.steps);
    showToast("Transfer approved and completed");
  } else if (data.expired) {
    showToast("Confirmation expired — request a new transfer");
  } else if (decision === "n" || data.error?.includes("denied")) {
    showToast("Transfer denied");
  } else {
    showToast(data.error ?? "Confirmation failed");
  }
  await loadPendingConfirmations();
  await loadAudit();
  return data;
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function renderSteps(steps, animate = true) {
  const list = $("#steps");
  if (!steps?.length) return;

  list.innerHTML = steps
    .map(
      (s) => `
    <li class="tl-step ${animate ? "" : s.status}">
      <span class="tl-dot"></span>
      <div class="tl-body">
        <strong>${escapeHtml(s.label)}</strong>
        <p>${escapeHtml(s.detail)}</p>
      </div>
    </li>`,
    )
    .join("");

  if (!animate) return;

  $$(".tl-step").forEach((el, i) => {
    setTimeout(() => {
      el.classList.add("active");
      setTimeout(() => {
        el.classList.remove("active");
        el.classList.add(steps[i].status);
      }, 550);
    }, i * 650);
  });

  document.getElementById("steps")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderAudit(entries) {
  const body = $("#audit-body");
  if (!entries?.length) {
    body.innerHTML = '<tr><td colspan="3" class="empty">No entries yet</td></tr>';
    return;
  }
  body.innerHTML = entries
    .map(
      (e) => `
    <tr>
      <td><span class="decision-${e.decision ?? "unknown"}">${escapeHtml(e.decision ?? "—")}</span></td>
      <td>${escapeHtml(e.action)}</td>
      <td>${escapeHtml(e.reason ?? "—")}</td>
    </tr>`,
    )
    .join("");
}

function renderStack(stack) {
  const list = $("#stack-list");
  if (!stack?.length) return;
  list.innerHTML = stack
    .map(
      (item) => `
    <li>
      <strong>${escapeHtml(item.label)}</strong>
      <span class="tag ${TAG[item.status] ?? "tag-stub"}">${STATUS_LABEL[item.status] ?? item.status}</span>
    </li>`,
    )
    .join("");
}

function appendChatBubble(text, role = "assistant") {
  const thread = $("#chat-reply");
  const bubble = document.createElement("div");
  bubble.className = `chat-msg ${role}`;
  bubble.innerHTML = `<p>${escapeHtml(text)}</p>`;
  thread.appendChild(bubble);
  thread.scrollTop = thread.scrollHeight;
}

function clearThinking() {
  $("#chat-reply").querySelector(".chat-msg.thinking")?.remove();
}

async function loadStatus() {
  const data = await api("/api/status");

  renderBalanceField($("#bal-ngn"), $("#note-ngn"), $("#dot-ngn"), data.balances.ngn, formatNgn);
  renderBalanceField(
    $("#bal-usdc"),
    $("#note-usdc"),
    $("#dot-usdc"),
    data.balances.usdc,
    (n) => `${n} USDC`,
  );
  renderBalanceField($("#bal-eth"), $("#note-eth"), $("#dot-eth"), data.balances.eth, (n) => `${n} ETH`);

  if (data.policy) {
    $("#cap-per-tx").textContent = formatNgn(data.policy.perTxCapNgn);
    $("#cap-daily").textContent = formatNgn(data.policy.dailyCapNgn);
    $("#cap-confirm").textContent = formatNgn(data.policy.confirmThresholdNgn);
  }

  killActive = data.killSwitchActive;
  $("#kill-dot").classList.toggle("active", killActive);
  $("#kill-btn").setAttribute("aria-pressed", String(killActive));
  $("#kill-state").textContent = killActive ? "On" : "Off";

  const badge = $("#mode-badge");
  if (data.sandbox) {
    badge.textContent = "Sandbox";
    badge.className = "nav-badge";
  } else {
    badge.textContent = "Live";
    badge.className = "nav-badge live";
  }

  renderIntegrationDots(data.layers);
  renderStack(data.stack);
}

async function loadAudit() {
  const data = await api("/api/audit?limit=8");
  renderAudit(data.entries);
}

async function toggleKillSwitch() {
  const wasActive = killActive;
  await api(killActive ? "/api/resume" : "/api/kill", { method: "POST" });
  await loadStatus();
  showToast(
    wasActive ? "Kill switch deactivated — transfers allowed" : "Kill switch active — transfers blocked",
  );
}

function setRunLoading(loading) {
  const btn = $("#run-btn");
  btn.disabled = loading;
  btn.classList.toggle("is-loading", loading);
}

async function runScenario() {
  setRunLoading(true);

  const scenario = SCENARIOS[activeScenario];
  try {
    if (activeScenario === "mom") {
      const data = await api(scenario.endpoint, {
        method: "POST",
        body: JSON.stringify(scenario.body),
      });
      renderSteps(data.steps ?? [], !data.confirmRequired);
      if (data.confirmRequired) {
        await loadPendingConfirmations();
        showToast("Policy confirmation required — approve or deny above");
      } else {
        showToast(data.ok ? "Scenario completed successfully" : "Scenario finished with errors");
      }
    } else {
      const data = await api(scenario.endpoint, {
        method: "POST",
        body: JSON.stringify(scenario.body),
      });
      renderSteps(
        [
          { label: "Policy gate", detail: "Category cap + velocity check", status: "done" },
          {
            label: "Paystack Index",
            detail: data.ok
              ? `Airtime purchased · ref ${data.result.reference}`
              : data.result?.message ?? "Purchase failed",
            status: data.ok ? "done" : "error",
          },
        ],
        !data.ok,
      );
      showToast(data.ok ? "Airtime purchase complete" : "Airtime purchase failed");
    }
    await loadAudit();
  } catch (e) {
    renderSteps(
      [{ label: "Error", detail: e.message ?? "Request failed", status: "error" }],
      false,
    );
    showToast("Something went wrong — check the timeline");
  } finally {
    setRunLoading(false);
  }
}

$$(".choice").forEach((el) => {
  el.addEventListener("click", () => {
    $$(".choice").forEach((c) => c.classList.remove("active"));
    el.classList.add("active");
    activeScenario = el.dataset.scenario;
  });
});

$("#run-btn").addEventListener("click", runScenario);
$("#kill-btn").addEventListener("click", toggleKillSwitch);
$("#refresh-audit").addEventListener("click", loadAudit);
$("#confirm-approve").addEventListener("click", () => submitConfirmation("y"));
$("#confirm-deny").addEventListener("click", () => submitConfirmation("n"));

$("#announce-close")?.addEventListener("click", () => {
  $("#announce").classList.add("hidden");
});

$("#chat-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    $("#chat-btn").click();
  }
});

$("#chat-btn").addEventListener("click", async () => {
  const input = $("#chat-input");
  const message = input.value.trim();
  if (!message) return;

  appendChatBubble(message, "user");
  input.value = "";
  appendChatBubble("Thinking…", "thinking");
  $("#chat-btn").disabled = true;

  try {
    const data = await api("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message }),
    });
    clearThinking();
    appendChatBubble(data.reply ?? data.error ?? "No response");
    if (data.actions?.length) await loadAudit();
  } catch (e) {
    clearThinking();
    appendChatBubble(e.message ?? "Chat failed");
  } finally {
    $("#chat-btn").disabled = false;
  }
});

loadStatus();
loadAudit();
loadPendingConfirmations();
