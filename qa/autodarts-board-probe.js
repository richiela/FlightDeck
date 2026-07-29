#!/usr/bin/env node
/**
 * Autodarts local Board Manager probe — records WS events + /api/state snapshots.
 *
 * Usage:
 *   node qa/autodarts-board-probe.js
 *   node qa/autodarts-board-probe.js --host 10.0.0.90 --port 3180
 *   node qa/autodarts-board-probe.js --no-start   # don't PUT /api/start on launch
 *
 * Writes:
 *   qa/autodarts-captures/<timestamp>/events.jsonl
 *   qa/autodarts-captures/<timestamp>/summary.json
 *
 * Ctrl+C to finish and print a capability summary.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
function argVal(flag, fallback) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const HOST = argVal('--host', '10.0.0.90');
const PORT = Number(argVal('--port', '3180'));
const NO_START = args.includes('--no-start');
const QUIET_CAM = !args.includes('--verbose-cam'); // cam_stats are noisy; still logged

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const OUTDIR = path.join(ROOT, 'qa', 'autodarts-captures', stamp);
fs.mkdirSync(OUTDIR, { recursive: true });
const EVENTS_PATH = path.join(OUTDIR, 'events.jsonl');
const SUMMARY_PATH = path.join(OUTDIR, 'summary.json');

const seenTypes = new Map(); // type -> count
const stateTransitions = [];
const throwLike = [];
let lastState = null;
let eventCount = 0;
let startedAt = Date.now();

function httpJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body != null ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: HOST,
        port: PORT,
        path: urlPath,
        method,
        headers: payload
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          : undefined,
        timeout: 5000
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let data = raw;
          try {
            data = raw ? JSON.parse(raw) : null;
          } catch (_) {}
          resolve({ status: res.statusCode, data, raw });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function appendEvent(row) {
  fs.appendFileSync(EVENTS_PATH, `${JSON.stringify(row)}\n`);
  eventCount += 1;
  const t = row.type || row.kind || 'unknown';
  seenTypes.set(t, (seenTypes.get(t) || 0) + 1);
}

function logConsole(msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${msg}`);
}

function noteState(state, source) {
  const compact = {
    connected: state && state.connected,
    running: state && state.running,
    status: state && state.status,
    event: state && state.event,
    numThrows: state && state.numThrows
  };
  const key = JSON.stringify(compact);
  const prevKey = lastState ? JSON.stringify({
    connected: lastState.connected,
    running: lastState.running,
    status: lastState.status,
    event: lastState.event,
    numThrows: lastState.numThrows
  }) : null;
  if (key !== prevKey) {
    stateTransitions.push({ at: Date.now(), source, ...compact });
    logConsole(`STATE (${source}) ${compact.status || '?'} | event=${compact.event || '—'} | throws=${compact.numThrows} | running=${compact.running}`);
  }
  lastState = state;
}

function looksThrowRelated(type, data) {
  const t = String(type || '').toLowerCase();
  if (/throw|dart|takeout|miss|detect|segment|score|reset|calibrat|start|stop/.test(t)) return true;
  if (data && typeof data === 'object') {
    const blob = JSON.stringify(data).toLowerCase();
    if (/throw|dart|takeout|segment|bull|t20|s20|d20|miss/.test(blob)) return true;
  }
  return false;
}

async function ensureStarted() {
  const st = await httpJson('GET', '/api/state');
  noteState(st.data, 'boot');
  appendEvent({ at: Date.now(), kind: 'http_state', type: 'state_snapshot', source: 'boot', data: st.data });
  if (NO_START) return;
  if (st.data && st.data.running) {
    logConsole('Board already running');
    return;
  }
  logConsole('Board not running — PUT /api/start');
  const res = await httpJson('PUT', '/api/start');
  appendEvent({ at: Date.now(), kind: 'http_command', type: 'start', status: res.status, data: res.data, raw: res.raw });
  await new Promise((r) => setTimeout(r, 400));
  const st2 = await httpJson('GET', '/api/state');
  noteState(st2.data, 'after_start');
}

function buildSummary() {
  const types = [...seenTypes.entries()].sort((a, b) => b[1] - a[1]);
  const checklist = {
    perDartHit: throwLike.some((e) => /throw|dart|segment|score/i.test(String(e.type))),
    missOrOutside: throwLike.some((e) => /miss|outside|bounce/i.test(JSON.stringify(e))),
    takeout: throwLike.some((e) => /takeout/i.test(String(e.type) + JSON.stringify(e.data || ''))),
    readyOrThrowStatus: stateTransitions.some((s) => /throw/i.test(String(s.status || ''))),
    resetSeen: [...seenTypes.keys()].some((t) => /reset/i.test(t))
      || throwLike.some((e) => /reset/i.test(JSON.stringify(e))),
    calibrateSeen: [...seenTypes.keys()].some((t) => /calibrat/i.test(t))
      || throwLike.some((e) => /calibrat/i.test(JSON.stringify(e)))
  };
  return {
    host: `${HOST}:${PORT}`,
    outDir: OUTDIR,
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date().toISOString(),
    durationSec: Math.round((Date.now() - startedAt) / 1000),
    eventCount,
    typeCounts: Object.fromEntries(types),
    stateTransitions,
    throwLikeSample: throwLike.slice(0, 40),
    checklistGuess: checklist,
    note: 'checklistGuess is heuristic from event names/payloads — review events.jsonl for truth'
  };
}

function finish(code) {
  const summary = buildSummary();
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
  console.log('\n=== PROBE SUMMARY ===');
  console.log(`Wrote ${eventCount} events → ${EVENTS_PATH}`);
  console.log(`Summary → ${SUMMARY_PATH}`);
  console.log('Event types:', summary.typeCounts);
  console.log('Heuristic checklist:', summary.checklistGuess);
  process.exit(code);
}

async function main() {
  console.log(`Autodarts Board Manager probe → http://${HOST}:${PORT}`);
  console.log(`Recording to ${OUTDIR}`);
  console.log('Do your downstairs checklist now. Ctrl+C when finished.\n');

  await ensureStarted();

  // Poll /api/state as a safety net (WS may not include every field)
  const poll = setInterval(async () => {
    try {
      const st = await httpJson('GET', '/api/state');
      noteState(st.data, 'poll');
      appendEvent({ at: Date.now(), kind: 'http_state', type: 'state_poll', data: st.data });
    } catch (err) {
      logConsole(`poll error: ${err.message}`);
      appendEvent({ at: Date.now(), kind: 'error', type: 'poll_error', message: err.message });
    }
  }, 1000);

  const wsUrl = `ws://${HOST}:${PORT}/api/events`;
  logConsole(`Connecting ${wsUrl}`);
  const ws = new WebSocket(wsUrl);

  ws.on('open', () => logConsole('WS open'));
  ws.on('error', (err) => {
    logConsole(`WS error: ${err.message}`);
    appendEvent({ at: Date.now(), kind: 'error', type: 'ws_error', message: err.message });
  });
  ws.on('close', (code, reason) => {
    logConsole(`WS close ${code} ${reason}`);
    appendEvent({ at: Date.now(), kind: 'sys', type: 'ws_close', code, reason: String(reason) });
  });
  ws.on('message', (buf) => {
    let msg;
    try {
      msg = JSON.parse(buf.toString());
    } catch (_) {
      msg = { type: 'raw', data: buf.toString() };
    }
    const type = msg.type || msg.event || 'unknown';
    const row = { at: Date.now(), kind: 'ws', type, data: msg.data !== undefined ? msg.data : msg };
    appendEvent(row);

    if (looksThrowRelated(type, row.data)) {
      throwLike.push(row);
      logConsole(`★ ${type} ${JSON.stringify(row.data).slice(0, 180)}`);
    } else if (!(QUIET_CAM && type === 'cam_stats')) {
      logConsole(`${type}`);
    }

    // Some boards embed status in WS payloads
    if (row.data && typeof row.data === 'object' && ('status' in row.data || 'numThrows' in row.data)) {
      noteState(row.data, 'ws');
    }
  });

  const shutdown = () => {
    clearInterval(poll);
    try { ws.close(); } catch (_) {}
    finish(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  finish(1);
});
