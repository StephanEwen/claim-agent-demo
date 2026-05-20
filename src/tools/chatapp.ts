import express, { Request, Response } from 'express';

const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// Session registry (replaces the usernotify service)
// ---------------------------------------------------------------------------

interface SessionEntry {
  sessionId: string;
  timestamp: number;
}

const sessions: SessionEntry[] = [];

app.post('/sessions/notify', (req: Request, res: Response) => {
  const { sessionId } = req.body ?? {};
  if (!sessionId || typeof sessionId !== 'string') {
    res.status(400).json({ error: 'Missing sessionId' });
    return;
  }
  if (!sessions.find(s => s.sessionId === sessionId)) {
    sessions.push({ sessionId, timestamp: Date.now() });
    console.log(`New interview session: ${sessionId}`);
    broadcastSessions();
  }
  res.json({ ok: true });
});

app.get('/api/sessions', (_req: Request, res: Response) => {
  // Newest first
  res.json([...sessions].reverse());
});

// ---------------------------------------------------------------------------
// SSE — push session list to all connected browsers instantly
// ---------------------------------------------------------------------------

const sessionStreamClients = new Set<Response>();

function broadcastSessions(): void {
  const data = JSON.stringify([...sessions].reverse());
  sessionStreamClients.forEach(res => res.write(`data: ${data}\n\n`));
}

app.get('/api/sessions/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  sessionStreamClients.add(res);
  req.on('close', () => sessionStreamClients.delete(res));
  // Send current state immediately on connect
  res.write(`data: ${JSON.stringify([...sessions].reverse())}\n\n`);
});

// ---------------------------------------------------------------------------
// Chat UI — served for / and /chat/:chatId
// ---------------------------------------------------------------------------

function renderApp(activeChatId: string | null): string {
  const safeId = activeChatId ? activeChatId.replace(/[^a-zA-Z0-9\-]/g, '') : null;
  const initJs = safeId ? `'${safeId}'` : 'null';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claims — Interview Sessions</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg:              #0F0F0F;
      --sidebar-bg:      #111111;
      --surface:         #161616;
      --surface-hover:   #1C1C1C;
      --border:          #1E1E1E;
      --border-mid:      #272727;
      --text:            #E2E2E2;
      --text-muted:      #888888;
      --text-subtle:     #4A4A4A;
      --accent:          #5B47ED;
      --accent-light:    #7B6EF6;
      --accent-bg:       rgba(91,71,237,0.10);
      --accent-border:   rgba(91,71,237,0.28);
      --font: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;
      --mono: "JetBrains Mono", "Fira Code", "Cascadia Code", monospace;
      --radius: 6px;
      --t: 140ms ease;
    }

    html, body {
      height: 100%;
      font-family: var(--font);
      background: var(--bg);
      color: var(--text);
      font-size: 13px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    /* ── Layout ─────────────────────────────────────────── */
    .layout { display: flex; height: 100vh; overflow: hidden; }

    /* ── Sidebar ─────────────────────────────────────────── */
    .sidebar {
      width: 228px;
      flex-shrink: 0;
      background: var(--sidebar-bg);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .sidebar-top {
      padding: 14px 12px 10px;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 5px 6px;
      border-radius: var(--radius);
    }

    .brand-icon {
      width: 22px; height: 22px;
      background: linear-gradient(135deg, var(--accent) 0%, #8B5CF6 100%);
      border-radius: 5px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }

    .brand-label {
      font-size: 13px;
      font-weight: 600;
      color: var(--text);
      letter-spacing: -0.01em;
    }

    .sidebar-section-header {
      display: flex;
      align-items: center;
      padding: 14px 18px 6px;
      gap: 6px;
    }

    .sidebar-section-label {
      font-size: 11px;
      font-weight: 500;
      color: var(--text-subtle);
      text-transform: uppercase;
      letter-spacing: 0.07em;
    }

    .session-count {
      font-size: 10px;
      color: var(--text-subtle);
      background: var(--surface);
      border: 1px solid var(--border-mid);
      border-radius: 8px;
      padding: 0 5px;
      min-width: 16px;
      text-align: center;
      line-height: 16px;
    }

    .session-list {
      flex: 1;
      overflow-y: auto;
      padding: 2px 8px 12px;
    }

    .session-list::-webkit-scrollbar { width: 3px; }
    .session-list::-webkit-scrollbar-track { background: transparent; }
    .session-list::-webkit-scrollbar-thumb {
      background: var(--border-mid);
      border-radius: 2px;
    }

    .session-item {
      display: block;
      padding: 8px 10px;
      border-radius: var(--radius);
      cursor: pointer;
      text-decoration: none;
      color: var(--text-muted);
      transition: background var(--t), color var(--t);
      margin-bottom: 1px;
    }

    .session-item:hover { background: var(--surface-hover); color: var(--text); }

    .session-item.active {
      background: var(--accent-bg);
      color: var(--text);
      outline: 1px solid var(--accent-border);
    }

    .session-item-row {
      display: flex;
      align-items: center;
      gap: 7px;
      margin-bottom: 3px;
    }

    .session-indicator {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: var(--accent-light);
      flex-shrink: 0;
      opacity: 0.7;
    }

    .session-item.active .session-indicator { opacity: 1; }

    .session-id {
      font-family: var(--mono);
      font-size: 11.5px;
      color: inherit;
      font-weight: 500;
      flex: 1;
      min-width: 0;
    }

    .session-time {
      font-size: 10px;
      color: var(--text-subtle);
      flex-shrink: 0;
    }

    .session-snippet {
      font-size: 11px;
      color: var(--text-subtle);
      padding-left: 13px;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      line-height: 1.45;
    }

    .session-item.active .session-snippet { color: var(--text-muted); }

    .no-sessions {
      padding: 20px 10px;
      text-align: center;
      color: var(--text-subtle);
      font-size: 12px;
      line-height: 1.6;
    }

    /* ── Main ────────────────────────────────────────────── */
    .main {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg);
      min-width: 0;
    }

    .chat-topbar {
      height: 46px;
      padding: 0 24px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }

    .chat-topbar-title {
      font-size: 13px;
      font-weight: 500;
      color: var(--text);
    }

    .chat-topbar-badge {
      font-family: var(--mono);
      font-size: 10.5px;
      color: var(--text-subtle);
      background: var(--surface);
      border: 1px solid var(--border-mid);
      padding: 1px 7px;
      border-radius: 4px;
    }

    /* ── Empty state ─────────────────────────────────────── */
    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 40px;
    }

    .empty-icon {
      width: 44px; height: 44px;
      background: var(--surface);
      border: 1px solid var(--border-mid);
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      margin-bottom: 6px;
    }

    .empty-title {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-muted);
    }

    .empty-desc {
      font-size: 12px;
      color: var(--text-subtle);
      text-align: center;
      max-width: 240px;
      line-height: 1.55;
    }

    /* ── Messages ────────────────────────────────────────── */
    .chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 20px 24px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .chat-messages::-webkit-scrollbar { width: 3px; }
    .chat-messages::-webkit-scrollbar-track { background: transparent; }
    .chat-messages::-webkit-scrollbar-thumb {
      background: var(--border-mid);
      border-radius: 2px;
    }

    .msg {
      display: flex;
      flex-direction: column;
      gap: 4px;
      max-width: 600px;
      animation: msgIn 0.18s ease;
    }

    @keyframes msgIn {
      from { opacity: 0; transform: translateY(5px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .msg.agent { align-self: flex-start; }
    .msg.user  { align-self: flex-end; }

    .msg-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 0 4px;
    }

    .msg.agent .msg-label { color: var(--accent-light); }
    .msg.user  .msg-label { color: var(--text-subtle); text-align: right; }

    .msg-bubble {
      padding: 9px 13px;
      border-radius: 8px;
      font-size: 13px;
      line-height: 1.6;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .msg.agent .msg-bubble {
      background: var(--surface);
      border: 1px solid var(--border-mid);
      color: var(--text);
      border-bottom-left-radius: 2px;
    }

    .msg.user .msg-bubble {
      background: var(--accent);
      color: #fff;
      border-bottom-right-radius: 2px;
    }

    /* ── Typing indicator ────────────────────────────────── */
    .typing {
      display: none;
      align-self: flex-start;
      gap: 4px;
      padding: 10px 14px;
      background: var(--surface);
      border: 1px solid var(--border-mid);
      border-radius: 8px;
      border-bottom-left-radius: 2px;
    }

    .typing.active { display: flex; align-items: center; }

    .typing-dot {
      width: 5px; height: 5px;
      background: var(--text-muted);
      border-radius: 50%;
      animation: tdot 1.2s infinite ease-in-out both;
    }
    .typing-dot:nth-child(2) { animation-delay: 0.15s; }
    .typing-dot:nth-child(3) { animation-delay: 0.30s; }

    @keyframes tdot {
      0%,80%,100% { transform: scale(0.55); opacity: 0.35; }
      40%          { transform: scale(1);    opacity: 1; }
    }

    /* ── Input area ──────────────────────────────────────── */
    .input-area {
      padding: 14px 24px 18px;
      border-top: 1px solid var(--border);
      flex-shrink: 0;
    }

    .input-row {
      display: flex;
      gap: 8px;
      align-items: flex-end;
    }

    .input-field {
      flex: 1;
      padding: 9px 12px;
      background: var(--surface);
      border: 1px solid var(--border-mid);
      border-radius: var(--radius);
      color: var(--text);
      font-size: 13px;
      font-family: var(--font);
      resize: none;
      outline: none;
      line-height: 1.5;
      min-height: 38px;
      max-height: 120px;
      transition: border-color var(--t);
    }

    .input-field::placeholder { color: var(--text-subtle); }
    .input-field:focus { border-color: var(--accent); }
    .input-field:disabled { opacity: 0.45; cursor: not-allowed; }

    .send-btn {
      padding: 9px 16px;
      height: 38px;
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: var(--radius);
      font-size: 13px;
      font-weight: 500;
      font-family: var(--font);
      cursor: pointer;
      white-space: nowrap;
      transition: background var(--t), transform var(--t);
      flex-shrink: 0;
    }

    .send-btn:hover:not(:disabled)  { background: var(--accent-light); }
    .send-btn:active:not(:disabled) { transform: scale(0.97); }
    .send-btn:disabled { opacity: 0.38; cursor: not-allowed; }

    .input-hint {
      font-size: 10.5px;
      color: var(--text-subtle);
      margin-top: 6px;
    }
  </style>
</head>
<body>
<div class="layout">

  <!-- Sidebar -->
  <aside class="sidebar">
    <div class="sidebar-top">
      <div class="brand">
        <div class="brand-icon">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M7 1L8.8 5.2H13.4L9.8 7.9L11.1 12.2L7 9.5L2.9 12.2L4.2 7.9L0.6 5.2H5.2L7 1Z"
                  fill="white" opacity="0.9"/>
          </svg>
        </div>
        <span class="brand-label">Claims</span>
      </div>
    </div>

    <div class="sidebar-section-header">
      <span class="sidebar-section-label">Interviews</span>
      <span class="session-count" id="sessionCount">0</span>
    </div>

    <div class="session-list" id="sessionList">
      <div class="no-sessions">No active sessions</div>
    </div>
  </aside>

  <!-- Main -->
  <main class="main" id="mainArea"></main>

</div>

<script>
  const RESTATE = 'http://localhost:8080';
  let currentId = ${initJs};
  let sessions   = [];
  let snippets   = {};   // sessionId -> string | null
  let chatHistory = [];
  let awaitingAgent = false;
  let chatTimer = null;

  // ── Sidebar ─────────────────────────────────────────────

  function initSessionStream() {
    const es = new EventSource('/api/sessions/stream');
    es.onmessage = async (e) => {
      const next = JSON.parse(e.data);
      sessions = next;
      await refreshSnippets();
      renderSidebar();
    };
  }

  async function refreshSnippets() {
    await Promise.all(sessions.map(async s => {
      if (snippets[s.sessionId] != null) return;
      try {
        const r = await fetch(\`\${RESTATE}/interview/\${s.sessionId}/getHistory\`);
        if (!r.ok) return;
        const history = await r.json();
        const first = history.find(m => m.agent);
        if (first) {
          const plain = first.agent.replace(/\\*\\*/g, '').replace(/\\n+/g, ' ').trim();
          snippets[s.sessionId] = plain.length > 90 ? plain.slice(0, 90) + '…' : plain;
        }
      } catch (_) {}
    }));
  }

  function renderSidebar() {
    const list  = document.getElementById('sessionList');
    const badge = document.getElementById('sessionCount');
    badge.textContent = sessions.length;

    if (sessions.length === 0) {
      list.innerHTML = '<div class="no-sessions">No active sessions</div>';
      return;
    }

    list.innerHTML = sessions.map(s => {
      const id      = s.sessionId;
      const short   = id.slice(0, 8);
      const active  = id === currentId ? 'active' : '';
      const snippet = snippets[id] ?? '';
      const time    = new Date(s.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
      return \`
        <a class="session-item \${active}"
           href="/chat/\${id}"
           onclick="navigate('\${id}');return false;">
          <div class="session-item-row">
            <div class="session-indicator"></div>
            <span class="session-id">\${short}</span>
            <span class="session-time">\${time}</span>
          </div>
          \${snippet ? \`<div class="session-snippet">\${esc(snippet)}</div>\` : ''}
        </a>\`;
    }).join('');
  }

  // ── Navigation ───────────────────────────────────────────

  function navigate(id) {
    if (id === currentId) return;
    currentId = id;
    history.pushState({}, '', '/chat/' + id);
    stopChatPoll();
    renderMain();
    renderSidebar();
    startChatPoll(id);
  }

  window.addEventListener('popstate', () => {
    const m = location.pathname.match(/^\\/chat\\/([^/]+)/);
    currentId = m ? m[1] : null;
    stopChatPoll();
    renderMain();
    renderSidebar();
    if (currentId) startChatPoll(currentId);
  });

  // ── Main area ────────────────────────────────────────────

  function renderMain() {
    const area = document.getElementById('mainArea');
    if (!currentId) {
      area.innerHTML = \`
        <div class="empty-state">
          <div class="empty-icon">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="4" y="2" width="12" height="16" rx="2"
                    stroke="#4A4A4A" stroke-width="1.5"/>
              <path d="M7 7h6M7 10h6M7 13h4"
                    stroke="#4A4A4A" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="empty-title">No session selected</div>
          <div class="empty-desc">Select an interview session from the sidebar to view the conversation.</div>
        </div>\`;
      return;
    }
    const short = currentId.slice(0, 8);
    area.innerHTML = \`
      <div class="chat-topbar">
        <span class="chat-topbar-title">Interview</span>
        <span class="chat-topbar-badge">\${short}</span>
      </div>
      <div class="chat-messages" id="chatMessages">
        <div class="typing" id="typingDots">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>
      <div class="input-area">
        <div class="input-row">
          <textarea class="input-field" id="msgInput" rows="1"
            placeholder="Type your reply…" autocomplete="off"></textarea>
          <button class="send-btn" id="sendBtn" onclick="sendMessage()">Send</button>
        </div>
        <div class="input-hint">Enter to send &nbsp;·&nbsp; Shift+Enter for new line</div>
      </div>\`;

    const inp = document.getElementById('msgInput');
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    inp.addEventListener('input', () => {
      inp.style.height = 'auto';
      inp.style.height = Math.min(inp.scrollHeight, 120) + 'px';
    });
    inp.focus();
  }

  // ── Chat polling ─────────────────────────────────────────

  function startChatPoll(id) {
    chatHistory = [];
    awaitingAgent = false;
    pollChat(id);
    chatTimer = setInterval(() => pollChat(id), 1000);
  }

  function stopChatPoll() {
    if (chatTimer) { clearInterval(chatTimer); chatTimer = null; }
  }

  async function pollChat(id) {
    if (id !== currentId) { stopChatPoll(); return; }
    try {
      const r = await fetch(\`\${RESTATE}/interview/\${id}/getHistory\`);
      if (!r.ok) return;
      const history = await r.json();
      if (history.length > chatHistory.length) {
        chatHistory = history;
        renderMessages();

        // Keep snippet fresh with latest agent message content
        const last = [...history].reverse().find(m => m.agent);
        if (last && !snippets[id]) {
          const plain = last.agent.replace(/\\*\\*/g, '').replace(/\\n+/g, ' ').trim();
          snippets[id] = plain.length > 90 ? plain.slice(0, 90) + '…' : plain;
          renderSidebar();
        }
      }
    } catch (_) {}
  }

  function renderMessages() {
    const box = document.getElementById('chatMessages');
    if (!box) return;
    const lastMsg = chatHistory[chatHistory.length - 1];
    // Clear awaiting state once the agent reply has arrived
    if (awaitingAgent && lastMsg && 'agent' in lastMsg) {
      awaitingAgent = false;
      updateInput();
    }
    const html = chatHistory.map(m => {
      if (m.agent) return \`
        <div class="msg agent">
          <div class="msg-label">Agent</div>
          <div class="msg-bubble">\${esc(m.agent)}</div>
        </div>\`;
      if (m.user) return \`
        <div class="msg user">
          <div class="msg-label">You</div>
          <div class="msg-bubble">\${esc(m.user)}</div>
        </div>\`;
      return '';
    }).join('');
    box.innerHTML = html + \`
      <div class="typing \${awaitingAgent ? 'active' : ''}" id="typingDots">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>\`;
    box.scrollTop = box.scrollHeight;
  }

  function updateInput() {
    const inp = document.getElementById('msgInput');
    const btn = document.getElementById('sendBtn');
    if (!inp || !btn) return;
    inp.disabled = awaitingAgent;
    btn.disabled = awaitingAgent;
    if (!awaitingAgent) inp.focus();
  }

  // ── Send message ─────────────────────────────────────────

  async function sendMessage() {
    const inp = document.getElementById('msgInput');
    if (!inp || awaitingAgent || !currentId) return;
    const message = inp.value.trim();
    if (!message) return;
    inp.disabled = true;
    document.getElementById('sendBtn').disabled = true;
    awaitingAgent = true;
    inp.value = '';
    inp.style.height = 'auto';
    // Show user's message and typing dots immediately without waiting for the poll
    chatHistory = [...chatHistory, { user: message }];
    renderMessages();
    try {
      const r = await fetch(
        \`\${RESTATE}/interview/\${currentId}/userMessage/send\`,
        { method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }) }
      );
      if (!r.ok) {
        awaitingAgent = false;
        chatHistory = chatHistory.slice(0, -1);
        renderMessages();
        updateInput();
      }
    } catch (_) {
      awaitingAgent = false;
      chatHistory = chatHistory.slice(0, -1);
      renderMessages();
      updateInput();
    }
  }

  // ── Util ─────────────────────────────────────────────────

  function esc(t) {
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
  }

  // ── Boot ─────────────────────────────────────────────────

  renderMain();
  initSessionStream();
  if (currentId) startChatPoll(currentId);
</script>
</body>
</html>`;
}

app.get('/chat/:chatId', (req: Request, res: Response) => {
  const { chatId } = req.params;
  res.send(renderApp(chatId));
});

app.get('/', (_req: Request, res: Response) => {
  res.send(renderApp(null));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Chat UI running on http://localhost:${PORT}`);
});

export default app;
