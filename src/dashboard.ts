// Dashboard page served at "/". Panels are empty until tasks and activity exist.
export const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>mip · Dashboard</title>
  <style>
    :root { color-scheme: light dark; --fg: #1d1d1f; --muted: #6e6e73; --bg: #fafafa; --card: #fff; --line: #e5e5ea; --accent: #c15f3c; --ok: #34c759; --off: #ff3b30; }
    @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --fg: #f5f5f7; --muted: #a1a1a6; --bg: #1c1c1e; --card: #2c2c2e; --line: #3a3a3c; } }
    :root[data-theme="dark"] { --fg: #f5f5f7; --muted: #a1a1a6; --bg: #1c1c1e; --card: #2c2c2e; --line: #3a3a3c; }
    body { margin: 0; font: 15px/1.5 system-ui, sans-serif; background: var(--bg); color: var(--fg); }
    header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px; max-width: 1100px; margin: 0 auto; }
    h1 { font-size: 20px; margin: 0; }
    main { max-width: 1100px; margin: 0 auto; padding: 0 16px 32px; display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
    .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 20px; min-width: 0; }
    .card.wide { grid-column: 1 / -1; }
    h2 { font-size: 15px; margin: 0 0 12px; }
    h3 { font-size: 15px; margin: 0; }
    .muted { color: var(--muted); margin: 0; font-size: 14px; }
    .empty { border: 1px dashed var(--line); border-radius: 8px; padding: 24px; text-align: center; color: var(--muted); }
    .error { color: var(--off); font-size: 14px; margin: 8px 0 0; }
    button { font: inherit; padding: 8px 14px; border: 0; border-radius: 8px; background: var(--accent); color: #fff; cursor: pointer; }
    button:disabled { opacity: 0.5; cursor: default; }
    button.secondary { background: var(--line); color: var(--fg); }
    button.icon { display: inline-flex; align-items: center; justify-content: center; padding: 8px; background: none; color: var(--fg); }
    button.icon svg { width: 20px; height: 20px; }
    input { font: inherit; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: var(--fg); min-width: 0; flex: 1; }

    .modal { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4); display: none; align-items: center; justify-content: center; padding: 16px; }
    .modal.open { display: flex; }
    .modal-card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 20px; width: 100%; max-width: 640px; max-height: 90vh; overflow: auto; }
    .modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .modal-head h2 { margin: 0; font-size: 17px; }

    .provider + .provider { margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--line); }
    .provider-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
    .chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .chip { font-size: 12px; color: var(--muted); border: 1px solid var(--line); border-radius: 999px; padding: 2px 8px; }
    .targets { max-height: 360px; overflow: auto; border: 1px solid var(--line); border-radius: 10px; }
    .target { padding: 12px; border-top: 1px solid var(--line); }
    .target:first-child { border-top: 0; }
    .target-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .target-row .name { font-weight: 600; }
    .target-row .method { color: var(--muted); font-size: 13px; margin-left: auto; }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--muted); flex: none; }
    .dot.ok { background: var(--ok); }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
    .progress { margin-top: 10px; }
    .progress pre { background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 10px; white-space: pre-wrap; word-break: break-word; font-size: 13px; margin: 0 0 8px; max-height: 160px; overflow: auto; }
    .progress pre:empty { display: none; }
    .answer { display: flex; gap: 8px; margin: 0; }
    .prompt { font-size: 14px; margin: 0 0 6px; }
  </style>
</head>
<body>
<header>
  <h1>mip</h1>
  <button id="open-settings" class="icon" aria-label="Settings" title="Settings">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  </button>
</header>
<main>
  <section class="card wide">
    <h2>Tasks</h2>
    <div class="empty">No tasks yet.</div>
  </section>

  <section class="card wide">
    <h2>Activity</h2>
    <div class="empty">No activity yet.</div>
  </section>
</main>

<div id="settings" class="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
  <div class="modal-card">
    <div class="modal-head">
      <h2 id="settings-title">Settings · Providers</h2>
      <button id="close-settings" class="secondary">Close</button>
    </div>
    <div id="providers"><p class="muted">Loading providers…</p></div>
  </div>
</div>

<script>
  const settings = document.getElementById("settings");
  const list = document.getElementById("providers");
  let poll;

  const CAPABILITY_LABEL = { streaming: "Streaming", tools: "Tools", mcp: "MCP", sessions: "Sessions", signIn: "Sign-in" };
  const METHOD_LABEL = { subscription: "Sign in with subscription", api_key: "Use API key", cli: "Sign in" };

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function renderTarget(provider, target) {
    const progress = target.progress;
    const attrs = 'data-provider="' + esc(provider.id) + '" data-target="' + esc(target.id) + '"';
    const actions = target.auth.loggedIn
      ? '<button class="secondary" data-action="sign-out" data-name="' + esc(target.name) + '" ' + attrs + (progress.running ? " disabled" : "") + ">Sign out</button>"
      : target.methods.map((method) =>
          '<button data-action="sign-in" data-method="' + method + '" ' + attrs + (progress.running ? " disabled" : "") + ">" + esc(METHOD_LABEL[method] ?? method) + "</button>"
        ).join("");

    let progressHtml = "";
    if (progress.running || progress.output.length || progress.error) {
      const key = provider.id + "/" + target.id;
      const prompt = progress.prompt;
      progressHtml =
        '<div class="progress"><pre>' + esc(progress.output.join("\\n")) + "</pre>" +
        (progress.error ? '<p class="error">' + esc(progress.error) + "</p>" : "") +
        (progress.running
          ? (prompt ? '<p class="prompt">' + esc(prompt.message) + "</p>" : "") +
            '<form class="answer" ' + attrs + ">" +
            '<input data-answer="' + esc(key) + '" type="' + (prompt && prompt.type === "secret" ? "password" : "text") + '" placeholder="' + esc(prompt?.placeholder ?? "Paste code or answer") + '" aria-label="Answer">' +
            '<button type="submit">Send</button></form>'
          : "") +
        "</div>";
    }

    return (
      '<div class="target">' +
      '<div class="target-row"><span class="dot' + (target.auth.loggedIn ? " ok" : "") + '"></span>' +
      '<span class="name">' + esc(target.name) + "</span>" +
      '<span class="method">' + esc(target.auth.method ?? "Not signed in") + "</span></div>" +
      '<div class="actions">' + actions + "</div>" +
      progressHtml +
      "</div>"
    );
  }

  function renderProvider(provider) {
    const chips = Object.entries(provider.capabilities)
      .filter(([, enabled]) => enabled)
      .map(([key]) => '<span class="chip">' + esc(CAPABILITY_LABEL[key] ?? key) + "</span>")
      .join("");
    const body = provider.error
      ? '<p class="error">' + esc(provider.error) + "</p>"
      : '<div class="targets">' + provider.targets.map((target) => renderTarget(provider, target)).join("") + "</div>";
    return (
      '<section class="provider"><div class="provider-head"><h3>' + esc(provider.name) + '</h3><div class="chips">' + chips + "</div></div>" +
      body +
      "</section>"
    );
  }

  async function load() {
    // Keep what the user has typed so the list can re-render every poll.
    const drafts = new Map();
    list.querySelectorAll("[data-answer]").forEach((el) => drafts.set(el.dataset.answer, el.value));

    const res = await fetch("/api/providers");
    const data = await res.json();
    list.innerHTML = data.providers.map(renderProvider).join("") || '<p class="muted">No providers configured.</p>';
    list.querySelectorAll("[data-answer]").forEach((el) => {
      if (drafts.has(el.dataset.answer)) el.value = drafts.get(el.dataset.answer);
    });
  }

  function endpoint(el, action) {
    return "/api/providers/" + encodeURIComponent(el.dataset.provider) + "/targets/" + encodeURIComponent(el.dataset.target) + "/" + action;
  }

  function post(url, body) {
    return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }

  list.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "sign-out" && !confirm("Sign out of " + button.dataset.name + "?")) return;

    button.disabled = true;
    const body = button.dataset.action === "sign-in" ? { method: button.dataset.method } : {};
    await post(endpoint(button, button.dataset.action), body);
    load();
  });

  list.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const input = form.querySelector("input");
    await post(endpoint(form, "answer"), { answer: input.value });
    input.value = "";
    load();
  });

  function openSettings() {
    settings.classList.add("open");
    load();
    poll = setInterval(load, 2000);
  }

  function closeSettings() {
    settings.classList.remove("open");
    clearInterval(poll);
  }

  document.getElementById("open-settings").addEventListener("click", openSettings);
  document.getElementById("close-settings").addEventListener("click", closeSettings);
  settings.addEventListener("click", (event) => {
    if (event.target === settings) closeSettings();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSettings();
  });
</script>
</body>
</html>`;
