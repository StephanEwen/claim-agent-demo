import express, { Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { ClaimDescription } from '../types';

const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// In-memory claim registry
// ---------------------------------------------------------------------------

interface PendingClaim {
  id: string;
  callbackId: string;
  claimDescription: {
    objectDescription: string;
    damageDescription: string;
    locationOfIncident: string;
    involvedParties: string;
  };
  timestamp: number;
}

const pending: PendingClaim[] = [];

// ---------------------------------------------------------------------------
// Receive review requests from claim_agent
// ---------------------------------------------------------------------------

const ReviewRequest = z.object({
  claimDescription: ClaimDescription,
  callbackId: z.string(),
});

app.post('/', (req: Request, res: Response) => {
  const result = ReviewRequest.safeParse(req.body);
  if (!result.success) {
    console.error('Invalid request schema:', result.error.format());
    res.status(400).json({ error: 'Invalid request' });
    return;
  }
  const { claimDescription, callbackId } = result.data;
  const id = randomUUID();
  pending.push({ id, callbackId, claimDescription, timestamp: Date.now() });
  console.log(`New claim queued for review: ${id}`);
  broadcastClaims();
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// REST API
// ---------------------------------------------------------------------------

app.get('/api/claims', (_req: Request, res: Response) => {
  res.json([...pending].reverse()); // newest first
});

// ---------------------------------------------------------------------------
// SSE — push claim list to all connected browsers instantly
// ---------------------------------------------------------------------------

const claimStreamClients = new Set<Response>();

function broadcastClaims(): void {
  const data = JSON.stringify([...pending].reverse());
  claimStreamClients.forEach(res => res.write(`data: ${data}\n\n`));
}

app.get('/api/claims/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  claimStreamClients.add(res);
  req.on('close', () => claimStreamClients.delete(res));
  // Send current state immediately on connect
  res.write(`data: ${JSON.stringify([...pending].reverse())}\n\n`);
});

app.post('/api/claims/:id/resolve', async (req: Request, res: Response) => {
  const claim = pending.find(c => c.id === req.params.id);
  if (!claim) {
    res.status(404).json({ error: 'Claim not found' });
    return;
  }

  const { status, comment } = req.body ?? {};
  if (!['approved', 'rejected', 'request_info'].includes(status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }

  const payload: Record<string, string> = { status };
  if (comment) payload.comment = comment;

  const r = await fetch(
    `http://localhost:8080/restate/awakeables/${claim.callbackId}/resolve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );

  if (!r.ok) {
    const text = await r.text();
    res.status(502).json({ error: `Restate error ${r.status}: ${text}` });
    return;
  }

  const idx = pending.findIndex(c => c.id === req.params.id);
  if (idx !== -1) pending.splice(idx, 1);
  broadcastClaims();
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Web UI
// ---------------------------------------------------------------------------

app.get('/', (_req: Request, res: Response) => {
  res.send(renderUI());
});

function renderUI(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claims — Human Review</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg:             #0F0F0F;
      --surface:        #161616;
      --surface-hover:  #1C1C1C;
      --border:         #1E1E1E;
      --border-mid:     #272727;
      --text:           #E2E2E2;
      --text-muted:     #888888;
      --text-subtle:    #4A4A4A;
      --accent:         #1570EF;
      --accent-light:   #4B9EFF;
      --accent-bg:      rgba(21, 112, 239, 0.08);
      --accent-border:  rgba(21, 112, 239, 0.30);
      --success:        #16A34A;
      --success-light:  #22C55E;
      --success-bg:     rgba(22, 163, 74, 0.10);
      --success-border: rgba(22, 163, 74, 0.30);
      --danger:         #DC2626;
      --danger-light:   #F87171;
      --danger-bg:      rgba(220, 38, 38, 0.10);
      --danger-border:  rgba(220, 38, 38, 0.30);
      --font: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;
      --mono: "JetBrains Mono", "Fira Code", "Cascadia Code", monospace;
      --radius: 6px;
      --t: 150ms ease;
    }

    html, body {
      min-height: 100%;
      font-family: var(--font);
      background: var(--bg);
      color: var(--text);
      font-size: 13px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    /* ── Top bar ─────────────────────────────────────────── */
    .topbar {
      position: sticky;
      top: 0;
      z-index: 10;
      background: rgba(15, 15, 15, 0.85);
      backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--border);
      padding: 0 24px;
      height: 48px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-right: 4px;
    }

    .brand-icon {
      width: 22px; height: 22px;
      background: linear-gradient(135deg, var(--accent) 0%, #38BDF8 100%);
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

    .topbar-divider {
      width: 1px;
      height: 16px;
      background: var(--border-mid);
    }

    .topbar-title {
      font-size: 13px;
      color: var(--text-muted);
    }

    .topbar-spacer { flex: 1; }

    .pending-badge {
      font-size: 11px;
      font-weight: 500;
      color: var(--accent-light);
      background: var(--accent-bg);
      border: 1px solid var(--accent-border);
      border-radius: 10px;
      padding: 2px 9px;
      font-variant-numeric: tabular-nums;
    }

    .pending-badge.empty {
      color: var(--text-subtle);
      background: var(--surface);
      border-color: var(--border-mid);
    }

    /* ── Main content ────────────────────────────────────── */
    .content {
      max-width: 680px;
      margin: 0 auto;
      padding: 28px 24px 48px;
    }

    /* ── Empty state ─────────────────────────────────────── */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 64px 24px;
      text-align: center;
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
      max-width: 240px;
      line-height: 1.55;
    }

    /* ── Claim card ──────────────────────────────────────── */
    .claims-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .claim-card {
      background: var(--surface);
      border: 1px solid var(--border-mid);
      border-radius: 8px;
      cursor: pointer;
      transition: border-color var(--t), background var(--t);
      overflow: hidden;
    }

    .claim-card:hover { background: var(--surface-hover); border-color: #333; }

    .claim-card.selected {
      border-color: var(--accent-border);
      background: var(--accent-bg);
    }

    .claim-card.selected:hover { background: var(--accent-bg); }

    .claim-card.resolving { opacity: 0.5; pointer-events: none; }

    .card-main {
      padding: 14px 16px;
    }

    /* ── Card header ─────────────────────────────────────── */
    .card-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }

    .card-indicator {
      width: 7px; height: 7px;
      border-radius: 50%;
      background: var(--accent-light);
      flex-shrink: 0;
    }

    .claim-card.selected .card-indicator {
      box-shadow: 0 0 0 2px var(--accent-bg), 0 0 0 3px var(--accent-border);
    }

    .card-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--text);
      letter-spacing: -0.01em;
    }

    .card-time {
      font-size: 11px;
      color: var(--text-subtle);
      margin-left: auto;
      font-variant-numeric: tabular-nums;
    }

    /* ── Claim fields ────────────────────────────────────── */
    .claim-fields {
      display: grid;
      grid-template-columns: 72px 1fr;
      gap: 5px 10px;
    }

    .field-key {
      font-size: 11px;
      font-weight: 500;
      color: var(--text-subtle);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding-top: 1px;
      white-space: nowrap;
    }

    .field-val {
      font-size: 12px;
      color: var(--text-muted);
      line-height: 1.5;
    }

    .claim-card.selected .field-val { color: var(--text); }

    /* ── Actions panel (animated expand) ─────────────────── */
    .actions-wrap {
      display: grid;
      grid-template-rows: 0fr;
      transition: grid-template-rows 200ms ease;
    }

    .claim-card.selected .actions-wrap {
      grid-template-rows: 1fr;
    }

    .actions-inner {
      min-height: 0;
      overflow: hidden;
    }

    .actions-panel {
      border-top: 1px solid var(--accent-border);
      padding: 14px 16px 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    /* Primary action row */
    .primary-actions {
      display: flex;
      gap: 8px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      border-radius: var(--radius);
      font-size: 12px;
      font-weight: 500;
      font-family: var(--font);
      border: 1px solid transparent;
      cursor: pointer;
      transition: background var(--t), border-color var(--t), transform var(--t);
      white-space: nowrap;
    }

    .btn:active { transform: scale(0.97); }

    .btn-approve {
      background: var(--success-bg);
      color: var(--success-light);
      border-color: var(--success-border);
    }
    .btn-approve:hover { background: rgba(22,163,74,0.18); }

    .btn-reject {
      background: var(--danger-bg);
      color: var(--danger-light);
      border-color: var(--danger-border);
    }
    .btn-reject:hover { background: rgba(220,38,38,0.18); }

    /* Request-info row */
    .info-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .info-label {
      font-size: 11px;
      font-weight: 500;
      color: var(--text-subtle);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .info-input-row {
      display: flex;
      gap: 7px;
    }

    .info-input {
      flex: 1;
      padding: 7px 10px;
      background: var(--bg);
      border: 1px solid var(--border-mid);
      border-radius: var(--radius);
      color: var(--text);
      font-size: 12px;
      font-family: var(--font);
      outline: none;
      transition: border-color var(--t);
      min-width: 0;
    }

    .info-input::placeholder { color: var(--text-subtle); }
    .info-input:focus { border-color: var(--accent); }

    .btn-info {
      background: var(--accent-bg);
      color: var(--accent-light);
      border-color: var(--accent-border);
      padding: 7px 13px;
      flex-shrink: 0;
    }

    .btn-info:hover { background: rgba(21,112,239,0.16); }
    .btn-info:disabled { opacity: 0.4; cursor: not-allowed; }

    /* ── Scrollbar ───────────────────────────────────────── */
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border-mid); border-radius: 2px; }
  </style>
</head>
<body>

<div class="topbar">
  <div class="brand">
    <div class="brand-icon">
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
        <path d="M7 1.5L8.5 5H13L9.5 7.5L11 11L7 8.5L3 11L4.5 7.5L1 5H5.5L7 1.5Z"
              fill="white" opacity="0.9"/>
      </svg>
    </div>
    <span class="brand-label">Claims</span>
  </div>
  <div class="topbar-divider"></div>
  <span class="topbar-title">Human Review</span>
  <div class="topbar-spacer"></div>
  <span class="pending-badge empty" id="pendingBadge">0 pending</span>
</div>

<div class="content">
  <div class="claims-list" id="claimsList"></div>
</div>

<script>
  let claims = [];
  let selectedId = null;
  let resolving = new Set();

  // ── Live updates via SSE ─────────────────────────────

  function initClaimStream() {
    const es = new EventSource('/api/claims/stream');
    es.onmessage = (e) => {
      const next = JSON.parse(e.data);
      // If the selected claim was resolved externally, clear selection
      if (selectedId && !next.find(c => c.id === selectedId)) {
        selectedId = null;
      }
      claims = next;
      render();
    };
  }

  // ── Render ────────────────────────────────────────────

  function render() {
    const list  = document.getElementById('claimsList');
    const badge = document.getElementById('pendingBadge');
    const n     = claims.length;

    if (n === 0) {
      badge.textContent = '0 pending';
      badge.className   = 'pending-badge empty';
      list.innerHTML = \`
        <div class="empty-state">
          <div class="empty-icon">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 2L12.5 8H18L13.5 11.5L15.5 17L10 13.5L4.5 17L6.5 11.5L2 8H7.5L10 2Z"
                    stroke="#4A4A4A" stroke-width="1.5" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="empty-title">No pending claims</div>
          <div class="empty-desc">New claims will appear here automatically when submitted for review.</div>
        </div>\`;
      return;
    }

    badge.textContent = \`\${n} pending\`;
    badge.className   = 'pending-badge';

    list.innerHTML = claims.map((claim, i) => {
      const selected = claim.id === selectedId;
      const busy     = resolving.has(claim.id);
      const d        = claim.claimDescription;
      const time     = new Date(claim.timestamp).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});

      return \`
        <div class="claim-card\${selected ? ' selected' : ''}\${busy ? ' resolving' : ''}"
             id="card-\${claim.id}"
             onclick="toggleCard('\${claim.id}')">
          <div class="card-main">
            <div class="card-header">
              <div class="card-indicator"></div>
              <span class="card-label">Claim #\${n - i}</span>
              <span class="card-time">\${time}</span>
            </div>
            <div class="claim-fields">
              <span class="field-key">Object</span>
              <span class="field-val">\${esc(d.objectDescription)}</span>
              <span class="field-key">Damage</span>
              <span class="field-val">\${esc(d.damageDescription)}</span>
              <span class="field-key">Location</span>
              <span class="field-val">\${esc(d.locationOfIncident)}</span>
              <span class="field-key">Parties</span>
              <span class="field-val">\${esc(d.involvedParties)}</span>
            </div>
          </div>

          <div class="actions-wrap">
            <div class="actions-inner">
              <div class="actions-panel" onclick="event.stopPropagation()">
                <div class="primary-actions">
                  <button class="btn btn-approve" onclick="resolve('\${claim.id}','approved')">
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.8"
                            stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    Approve
                  </button>
                  <button class="btn btn-reject" onclick="resolve('\${claim.id}','rejected')">
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                      <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.8"
                            stroke-linecap="round"/>
                    </svg>
                    Reject
                  </button>
                </div>
                <div class="info-row">
                  <span class="info-label">Request more information</span>
                  <div class="info-input-row">
                    <input class="info-input"
                           id="info-\${claim.id}"
                           placeholder="What additional information is needed?"
                           onkeydown="if(event.key==='Enter')sendInfo('\${claim.id}')"/>
                    <button class="btn btn-info"
                            id="send-\${claim.id}"
                            onclick="sendInfo('\${claim.id}')">
                      Send
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" stroke-width="1.8"
                              stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>\`;
    }).join('');
  }

  // ── Interactions ──────────────────────────────────────

  function toggleCard(id) {
    selectedId = selectedId === id ? null : id;
    render();
    if (selectedId) {
      // Focus the info input after the expand animation
      setTimeout(() => {
        const inp = document.getElementById('info-' + selectedId);
        if (inp) inp.focus();
      }, 210);
    }
  }

  async function resolve(id, status, comment) {
    if (resolving.has(id)) return;
    resolving.add(id);
    render();

    try {
      const body = { status };
      if (comment) body.comment = comment;
      const r = await fetch('/api/claims/' + id + '/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        claims = claims.filter(c => c.id !== id);
        if (selectedId === id) selectedId = null;
      }
    } catch (_) {}

    resolving.delete(id);
    render();
  }

  async function sendInfo(id) {
    const inp = document.getElementById('info-' + id);
    const comment = inp ? inp.value.trim() : '';
    if (!comment) {
      if (inp) inp.focus();
      return;
    }
    await resolve(id, 'request_info', comment);
  }

  function esc(t) {
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
  }

  // ── Boot ─────────────────────────────────────────────

  initClaimStream();
</script>
</body>
</html>`;
}

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 55443;
app.listen(PORT, () => {
  console.log(`Approver UI at http://localhost:${PORT}`);
});
