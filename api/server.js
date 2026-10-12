// Condo Entry backend
//  - receives events from Asterisk (unlock / deny / call ended)
//  - tracks door state and writes an access log
//  - serves the dashboard and a diagnostics endpoint (reads Asterisk over ARI)
// No dependencies — plain Node.js 20.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const LOG_FILE = path.join(DATA_DIR, 'access-log.jsonl');
const RELOCK_MS = 5000; // door re-locks itself after 5 seconds, like a real electric strike

const ARI_URL = process.env.ARI_URL || 'http://asterisk:8088';
const ARI_USER = process.env.ARI_USER || 'dashboard';
const ARI_PASS = process.env.ARI_PASS || 'DashRead2026';

const RESIDENTS = JSON.parse(fs.readFileSync(path.join(__dirname, 'residents.json'), 'utf8'));
const DASHBOARD_HTML = path.join(__dirname, 'public', 'index.html');

fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------------- door + access log ----------------
let door = { state: 'locked', since: new Date().toISOString() };
let relockTimer = null;

function setDoor(state) {
  door = { state, since: new Date().toISOString() };
  console.log(`[door] ${state.toUpperCase()}`);
}

function unlockDoor() {
  setDoor('unlocked');
  clearTimeout(relockTimer);
  relockTimer = setTimeout(() => setDoor('locked'), RELOCK_MS);
}

function logEvent(event) {
  const entry = { time: new Date().toISOString(), ...event };
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  console.log('[event]', JSON.stringify(entry));
  return entry;
}

function readEvents(limit = 50) {
  if (!fs.existsSync(LOG_FILE)) return [];
  return fs.readFileSync(LOG_FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean)
    .slice(-limit)
    .reverse(); // newest first
}

// ---------------- diagnostics (Asterisk ARI) ----------------
async function ari(p) {
  const auth = Buffer.from(`${ARI_USER}:${ARI_PASS}`).toString('base64');
  const res = await fetch(`${ARI_URL}/ari${p}`, {
    headers: { Authorization: `Basic ${auth}` },
    signal: AbortSignal.timeout(2000),
  });
  if (res.status === 401) throw new Error('ARI login rejected (check ARI_USER / ARI_PASS vs ari.conf)');
  if (!res.ok) throw new Error(`ARI ${p} returned HTTP ${res.status}`);
  return res.json();
}

function uptime(since) {
  const ms = Date.now() - new Date(since).getTime();
  if (!since || Number.isNaN(ms)) return 'time unknown';
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d) return `${d}d ${h % 24}h`;
  if (h) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

async function diagnostics() {
  const checks = [];
  const add = (name, status, detail, hint) => checks.push({ name, status, detail, hint });

  add('Backend API', 'pass', 'Responding', null);

  let info = null;
  let endpoints = [];
  try {
    [info, endpoints] = await Promise.all([ari('/asterisk/info'), ari('/endpoints/PJSIP')]);
    const version = String(info.system?.version ?? '?').split('~')[0];
    add('Asterisk PBX', 'pass', `Up ${uptime(info.status?.startup_time)} · v${version}`, null);
  } catch (err) {
    const reason = err.name === 'TimeoutError' ? 'No response from Asterisk within 2s' : err.message;
    add('Asterisk PBX', 'fail', reason,
      'Run "docker ps" and check the asterisk container is up. Then check http.conf and ari.conf are mounted.');
  }

  const byId = Object.fromEntries(endpoints.map((e) => [e.resource, e]));
  const devices = Object.entries(RESIDENTS).map(([ext, r]) => {
    const ep = byId[ext];
    const state = !info ? 'unknown' : !ep ? 'missing' : ep.state; // online | offline | unknown
    const inCall = Boolean(ep && ep.channel_ids && ep.channel_ids.length);
    return { ext, ...r, state, inCall };
  });

  for (const d of devices) {
    if (!info) continue;
    const name = `${d.label} (${d.ext}) registered`;
    if (d.state === 'online') {
      add(name, 'pass', d.inCall ? 'Online · in a call' : 'Online', null);
    } else if (d.state === 'missing') {
      add(name, 'fail', 'Not defined in Asterisk', `Add extension ${d.ext} to pjsip.conf, then run "pjsip reload".`);
    } else {
      add(name, d.role === 'lobby' ? 'fail' : 'warn', 'No phone registered',
        `Check the phone is on the same network, the Domain is the PC's Wi-Fi IP with :5061, and the username is just "${d.ext}".`);
    }
  }

  const lastCall = readEvents(200).find((e) => e.type === 'call');
  if (!lastCall) {
    add('Last call', 'warn', 'No calls logged yet', 'Place a test call from the lobby to a suite.');
  } else if (lastCall.status === 'ANSWER') {
    add('Last call', 'pass', `Suite ${lastCall.suite} answered`, null);
  } else {
    add('Last call', 'warn', `Suite ${lastCall.suite}: ${lastCall.status}`,
      lastCall.status === 'CHANUNAVAIL'
        ? 'The suite phone was not registered when called.'
        : 'Not answered. Normal if nobody was home; repeated misses may mean the phone is muted or offline.');
  }

  return { checkedAt: new Date().toISOString(), checks, devices };
}

// ---------------- http ----------------
function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body, null, 2));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const q = Object.fromEntries(url.searchParams);

  try {
    // Asterisk -> resident pressed 9 (unlock) or 0 (deny)
    if (url.pathname === '/api/door') {
      if (!['unlock', 'deny'].includes(q.action)) {
        return send(res, 400, { error: 'action must be unlock or deny' });
      }
      const entry = logEvent({ type: q.action, suite: q.suite, from: q.from });
      if (q.action === 'unlock') unlockDoor();
      return send(res, 200, { ok: true, event: entry, door });
    }

    // Dashboard -> building manager unlocks remotely
    if (url.pathname === '/api/door/remote-unlock') {
      if (req.method !== 'POST') return send(res, 405, { error: 'use POST' });
      const entry = logEvent({ type: 'unlock', via: 'dashboard' });
      unlockDoor();
      return send(res, 200, { ok: true, event: entry, door });
    }

    // Asterisk -> a call ended (ANSWER, NOANSWER, BUSY, CANCEL, CHANUNAVAIL, ...)
    if (url.pathname === '/api/call') {
      const entry = logEvent({ type: 'call', suite: q.suite, from: q.from, status: q.status || 'UNKNOWN' });
      return send(res, 200, { ok: true, event: entry });
    }

    if (url.pathname === '/api/door/status') return send(res, 200, door);
    if (url.pathname === '/api/events') return send(res, 200, readEvents(Number(q.limit) || 50));
    if (url.pathname === '/api/residents') return send(res, 200, RESIDENTS);
    if (url.pathname === '/api/diagnostics') return send(res, 200, await diagnostics());
    if (url.pathname === '/health') return send(res, 200, { ok: true });

    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(DASHBOARD_HTML));
    }

    send(res, 404, { error: 'not found' });
  } catch (err) {
    console.error('[error]', err);
    send(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => console.log(`condo-entry api listening on :${PORT}`));
