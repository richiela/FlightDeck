#!/usr/bin/env node
/**
 * Capture Viewer playing-layout baselines only ({game}__playing.png).
 * Usage: node qa/capture-playing-layouts.js [--port 4000] [--out qa/visual-baselines/_pending]
 * Requires: Chrome, running FlightDeck on --port, roster that can start each game
 *   (Cricket uses doubles so 6 players → 3 teams stays under the 4-unit cap).
 */
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9224;

const args = process.argv.slice(2);
function argVal(flag, fallback) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const APP_PORT = argVal('--port', '4000');
const OUTDIR = path.resolve(ROOT, argVal('--out', 'qa/visual-baselines/_pending'));
const BASELINE = argVal('--baseline', null); // optional folder to diff against after capture

const GAMES = [
  { key: 'demolition' },
  { key: 'limbo' },
  { key: 'derby' },
  { key: 'killer' },
  { key: 'quackshot' },
  { key: 'shanghai' },
  { key: 'cricket', preferDoubles: true },
  { key: 'x01' },
  { key: 'warmup' },
  { key: 'quick10' },
  { key: 'harperwins' },
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function httpJson(method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: CDP_PORT, path: urlPath, method }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function cdpSend(ws, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const onMsg = (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (msg.id === id) {
        ws.off('message', onMsg);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    };
    ws.on('message', onMsg);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function findLatestBaselineDir() {
  const root = path.join(ROOT, 'qa/visual-baselines');
  if (!fs.existsSync(root)) return null;
  const dirs = fs.readdirSync(root)
    .filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d))
    .sort();
  return dirs.length ? path.join(root, dirs[dirs.length - 1]) : null;
}

async function main() {
  fs.mkdirSync(OUTDIR, { recursive: true });
  for (const f of fs.readdirSync(OUTDIR)) {
    if (f.endsWith('.png') || f === 'manifest.json') fs.unlinkSync(path.join(OUTDIR, f));
  }

  try { spawn('pkill', ['-f', `remote-debugging-port=${CDP_PORT}`]); } catch {}
  await wait(400);

  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--ignore-certificate-errors', '--allow-insecure-localhost',
    `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*',
    '--window-size=1920,1080', 'about:blank',
  ], { stdio: 'ignore' });

  for (let i = 0; i < 40; i++) {
    try { await httpJson('GET', '/json/version'); break; }
    catch { await wait(250); if (i === 39) throw new Error('CDP not up'); }
  }

  const stateWs = new WebSocket(`wss://localhost:${APP_PORT}`, { rejectUnauthorized: false });
  let last = null;
  stateWs.on('message', (d) => {
    try {
      const m = JSON.parse(d);
      if (m.type === 'STATE_UPDATE') last = m.data;
    } catch {}
  });
  await new Promise((res, rej) => { stateWs.on('open', res); stateWs.on('error', rej); });
  await wait(400);
  const send = (p) => stateWs.send(JSON.stringify(p));
  const screenOf = () => last?.currentScreen;
  const gameOf = () => last?.selectedGame;
  const phaseOf = () => last?.gameData?.phase?.type;

  send({ action: 'SET_VIEWER_VIDEO', enabled: true });
  await wait(200);

  const list = JSON.parse((await httpJson('GET', '/json/list')).data);
  const target = list.find((t) => t.type === 'page') || list[0];
  const cdp = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { cdp.on('open', res); cdp.on('error', rej); });
  let nextId = 1;
  await cdpSend(cdp, nextId++, 'Page.enable');
  await cdpSend(cdp, nextId++, 'Page.navigate', { url: `https://localhost:${APP_PORT}/viewer.html` });
  await wait(2000);

  const shots = [];

  async function capture(fileBase) {
    await wait(1400);
    const result = await cdpSend(cdp, nextId++, 'Page.captureScreenshot', { format: 'png', fromSurface: true });
    const buf = Buffer.from(result.data, 'base64');
    const file = `${fileBase}.png`;
    fs.writeFileSync(path.join(OUTDIR, file), buf);
    const row = { file, game: gameOf(), phase: phaseOf(), bytes: buf.length, sha256: sha256(buf) };
    shots.push(row);
    console.log(JSON.stringify(row));
  }

  async function ensureSeatedSingles(maxSeated) {
    send({ action: 'NAVIGATE', screen: 'REGISTRATION' }); await wait(300);
    if (last?.lineupMode !== 'singles') {
      send({ action: 'SET_LINEUP_MODE', mode: 'singles' }); await wait(350);
    }
    send({ action: 'CLEAR_LINEUP' }); await wait(250);
    const players = last?.players || [];
    const n = Math.min(maxSeated, players.length);
    for (let i = 0; i < n; i++) {
      const id = players[i] && players[i].id;
      if (!id) continue;
      send({ action: 'MOVE_SINGLES_PLAYER', fromSlot: -1, toSlot: i, playerId: id });
      await wait(60);
    }
    await wait(200);
  }

  async function ensureGame(g) {
    if (g.preferDoubles) {
      // Cricket doubles: ≤4 teams → seat 8 then switch to doubles
      await ensureSeatedSingles(8);
      send({ action: 'SET_LINEUP_MODE', mode: 'doubles' }); await wait(350);
    } else if (g.key === 'x01') {
      await ensureSeatedSingles(4);
    } else if (g.key === 'harperwins') {
      send({ action: 'NAVIGATE', screen: 'REGISTRATION' }); await wait(300);
      if (last?.lineupMode !== 'singles') {
        send({ action: 'SET_LINEUP_MODE', mode: 'singles' }); await wait(350);
      }
      let players = last?.players || [];
      let harper = players.find((p) => String(p.name || '').trim().toLowerCase() === 'harper');
      if (!harper) {
        send({ action: 'ADD_PLAYER', name: 'Harper', avatar: null });
        await wait(350);
        players = last?.players || [];
        harper = players.find((p) => String(p.name || '').trim().toLowerCase() === 'harper');
      }
      send({ action: 'CLEAR_LINEUP' }); await wait(250);
      const seat = [];
      if (harper) seat.push(harper);
      players.forEach((p) => {
        if (!p || !p.id) return;
        if (harper && p.id === harper.id) return;
        if (seat.length < 6) seat.push(p);
      });
      for (let i = 0; i < seat.length; i++) {
        send({ action: 'MOVE_SINGLES_PLAYER', fromSlot: -1, toSlot: i, playerId: seat[i].id });
        await wait(60);
      }
      await wait(200);
    } else {
      await ensureSeatedSingles(6);
    }
    send({ action: 'NAVIGATE', screen: 'GAME_SELECTION' }); await wait(450);
    send({ action: 'SELECT_GAME', gameType: g.key });
    await wait(800);
    if (!(screenOf() === 'IN_GAME' && gameOf() === g.key)) return false;

    // X01 / Quick 10 start in setup or pick_player — advance to playing for layout shots.
    if (g.key === 'x01' && phaseOf() === 'setup') {
      send({
        action: 'FORWARD_GAME_ACTION',
        payload: { type: 'CONFIRM_X01_SETUP', startScore: 301, dartIn: 'none', dartOut: 'none' },
      });
      await wait(500);
    }
    if (g.key === 'quick10' && phaseOf() === 'pick_player') {
      const candidates = last?.gameData?.candidates || last?.gameData?.phase?.candidates || [];
      const playerId = (candidates[0] && candidates[0].id) || (last?.players && last.players[0] && last.players[0].id);
      if (playerId) {
        send({ action: 'FORWARD_GAME_ACTION', payload: { type: 'SELECT_QUICK10_PLAYER', playerId } });
        await wait(500);
      }
    }
    return screenOf() === 'IN_GAME' && gameOf() === g.key;
  }

  for (const g of GAMES) {
    const ok = await ensureGame(g);
    if (!ok) {
      console.log(JSON.stringify({ skipped: g.key, reason: last?.selectionError || screenOf() }));
      shots.push({ skipped: g.key, reason: last?.selectionError || screenOf() });
      continue;
    }
    await cdpSend(cdp, nextId++, 'Page.reload', { ignoreCache: true });
    await wait(2000);
    send({ action: 'DEBUG_SHOW_SCREEN', screen: 'clear' });
    await wait(450);
    await capture(`${g.key}__playing`);
  }

  send({ action: 'NAVIGATE', screen: 'REGISTRATION' }); await wait(250);
  send({ action: 'SET_LINEUP_MODE', mode: 'singles' }); await wait(200);

  const baselineDir = BASELINE ? path.resolve(BASELINE) : findLatestBaselineDir();
  const diff = [];
  if (baselineDir && fs.existsSync(baselineDir)) {
    for (const s of shots) {
      if (!s.file) continue;
      const refPath = path.join(baselineDir, s.file);
      if (!fs.existsSync(refPath)) {
        diff.push({ file: s.file, status: 'missing_in_baseline' });
        continue;
      }
      const refHash = sha256(fs.readFileSync(refPath));
      diff.push({
        file: s.file,
        status: refHash === s.sha256 ? 'unchanged' : 'changed',
        baseline: path.basename(baselineDir),
      });
    }
  }

  const manifest = {
    capturedAt: new Date().toISOString(),
    port: Number(APP_PORT),
    resolution: '1920x1080',
    videoEnabled: true,
    outDir: OUTDIR,
    baselineCompared: baselineDir || null,
    shots,
    diff,
  };
  fs.writeFileSync(path.join(OUTDIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log('---DIFF---');
  console.log(JSON.stringify({
    baseline: baselineDir,
    unchanged: diff.filter((d) => d.status === 'unchanged').map((d) => d.file),
    changed: diff.filter((d) => d.status === 'changed').map((d) => d.file),
    missing_in_baseline: diff.filter((d) => d.status === 'missing_in_baseline').map((d) => d.file),
  }, null, 2));

  cdp.close();
  stateWs.close();
  chrome.kill('SIGTERM');
  await wait(400);
}

main().catch((e) => { console.error(e); process.exit(1); });
