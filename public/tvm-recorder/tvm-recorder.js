#!/usr/bin/env node
/**
 * TVMRecorder — face-clip agent for FlightDeck TV Moments.
 * Ring buffer while FD match is IN_GAME.
 *
 * Config: optional ./tvm-recorder.json (missing → built-in defaults)
 * Run:    node tvm-recorder.js
 *         or: ./tvm-recorder.js
 *
 * API:
 *   GET  /status
 *   POST /buffer/start
 *   POST /buffer/stop
 *   POST /buffer/dump   → wait clipAfterSec, remux last (before+after), upload to FD
 */
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = __dirname;
const CONFIG_PATH = path.join(ROOT, 'tvm-recorder.json');
/** Wait this long after SIGTERM before SIGKILL / giving up on cam release. */
const FFMPEG_STOP_TIMEOUT_MS = 2500;
/** Extra settle after process exit so AVFoundation releases the device. */
const CAM_RELEASE_SETTLE_MS = 400;

function ts() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    // Local wall clock (not UTC) — matches venue machine timezone
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function log(...args) {
    console.log(`[${ts()}] [tvm-recorder]`, ...args);
}

function logWarn(...args) {
    console.warn(`[${ts()}] [tvm-recorder]`, ...args);
}

function logErr(...args) {
    console.error(`[${ts()}] [tvm-recorder]`, ...args);
}

/**
 * Config transpose → ffmpeg filter or null (no rotate).
 * 0 / false / "none" / "off" / -1 = landscape as-captured (Brio etc.).
 * 1–3 = ffmpeg transpose=N. Missing → caller passes default (1).
 */
function parseTranspose(raw) {
    if (raw === false || raw === null || raw === 'none' || raw === 'off') return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.min(3, Math.round(n));
}

function loadConfig() {
    const defaults = {
        port: 3190,
        /** Prefer camName (substring match); camIndex is fallback if name missing/unmatched. */
        camName: 'Full HD webcam',
        camIndex: 0,
        /**
         * ffmpeg transpose (1–3), or 0 / false / "none" / -1 = no rotation.
         * Note: 0 means off here (not ffmpeg's transpose=0). Old upright webcams often need 1.
         */
        transpose: 1,
        fps: '30.000030',
        size: '1280x720',
        pixelFormat: 'uyvy422',
        ringDir: '/tmp/tvm-recorder',
        ringSec: 15,
        clipBeforeSec: 5,
        clipAfterSec: 3,
        fdUrl: 'https://10.0.0.111:4000',
        ffmpeg: 'ffmpeg'
    };
    let file = {};
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            file = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) || {};
        } else {
            logWarn(`No ${CONFIG_PATH} — using built-in defaults (optional: create tvm-recorder.json).`);
        }
    } catch (err) {
        logErr('Failed to read tvm-recorder.json:', err.message);
    }
    const cfg = { ...defaults, ...file };
    cfg.port = Number(cfg.port) || defaults.port;
    cfg.camName = String(cfg.camName != null ? cfg.camName : defaults.camName).trim();
    cfg.camIndex = Number(cfg.camIndex);
    if (Number.isNaN(cfg.camIndex)) cfg.camIndex = defaults.camIndex;
    cfg.transpose = parseTranspose(
        Object.prototype.hasOwnProperty.call(file, 'transpose') ? file.transpose : defaults.transpose
    );
    cfg.ringSec = Math.max(8, Number(cfg.ringSec) || 15);
    cfg.clipBeforeSec = Math.max(1, Number(cfg.clipBeforeSec) || 5);
    cfg.clipAfterSec = Math.max(0, Number(cfg.clipAfterSec) || 3);
    const need = cfg.clipBeforeSec + cfg.clipAfterSec;
    if (cfg.ringSec < need) cfg.ringSec = need;
    cfg.fdUrl = String(cfg.fdUrl || defaults.fdUrl).replace(/\/$/, '');
    return cfg;
}

let cfg = loadConfig();
let ffmpegProc = null;
let trimTimer = null;
let dumpInFlight = null;
let startedAt = null;
/** Serialize start / stop / dump so they cannot overlap. */
let opChain = Promise.resolve();

function runExclusive(label, fn) {
    const next = opChain.then(() => fn()).catch((err) => {
        logErr(`${label} failed:`, err && err.message ? err.message : err);
        throw err;
    });
    // Keep the chain alive even if this op failed
    opChain = next.catch(() => {});
    return next;
}

function ensureRingDir() {
    fs.mkdirSync(cfg.ringDir, { recursive: true });
}

function wipeRingFiles() {
    try {
        if (!fs.existsSync(cfg.ringDir)) return;
        for (const name of fs.readdirSync(cfg.ringDir)) {
            if (name.startsWith('seg_') || name === 'concat.txt' || name === 'dump.mp4') {
                try {
                    fs.unlinkSync(path.join(cfg.ringDir, name));
                } catch (_) { /* ignore */ }
            }
        }
    } catch (_) { /* ignore */ }
}

function listClosedSegs() {
    ensureRingDir();
    const all = fs.readdirSync(cfg.ringDir)
        .filter((n) => /^seg_\d+\.mp4$/.test(n))
        .sort();
    if (all.length <= 1) return [];
    return all.slice(0, -1); // drop newest (may still be writing)
}

function trimRing() {
    const closed = listClosedSegs();
    const keep = cfg.ringSec;
    if (closed.length <= keep) return;
    const drop = closed.slice(0, closed.length - keep);
    for (const name of drop) {
        try {
            fs.unlinkSync(path.join(cfg.ringDir, name));
        } catch (_) { /* ignore */ }
    }
}

function isBuffering() {
    return !!(ffmpegProc && !ffmpegProc.killed && ffmpegProc.exitCode == null);
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

/** Parse `ffmpeg -f avfoundation -list_devices` video lines → [{ index, name }]. */
function listAvfoundationVideoDevices() {
    return new Promise((resolve) => {
        const p = spawn(
            cfg.ffmpeg,
            ['-hide_banner', '-f', 'avfoundation', '-list_devices', 'true', '-i', ''],
            { stdio: ['ignore', 'ignore', 'pipe'] }
        );
        let err = '';
        p.stderr.on('data', (d) => { err += d.toString(); });
        p.on('exit', () => {
            const devices = [];
            let inVideo = false;
            for (const line of err.split('\n')) {
                if (/AVFoundation video devices:/i.test(line)) {
                    inVideo = true;
                    continue;
                }
                if (/AVFoundation audio devices:/i.test(line)) break;
                if (!inVideo) continue;
                const m = line.match(/\[(\d+)\]\s+(.+?)\s*$/);
                if (m) devices.push({ index: Number(m[1]), name: m[2].trim() });
            }
            resolve(devices);
        });
        p.on('error', () => resolve([]));
    });
}

/**
 * Resolve cam index each start: prefer camName substring (stable across USB reorder),
 * else configured camIndex.
 */
async function resolveCamIndex() {
    const devices = await listAvfoundationVideoDevices();
    const named = devices.map((d) => `[${d.index}] ${d.name}`).join(', ') || '(none)';
    log(`cams: ${named}`);

    const needle = (cfg.camName || '').toLowerCase();
    if (needle) {
        const hit = devices.find((d) => d.name.toLowerCase().includes(needle));
        if (hit) {
            log(`camName "${cfg.camName}" → index ${hit.index} (${hit.name})`);
            return hit.index;
        }
        logWarn(`camName "${cfg.camName}" not found — falling back to camIndex ${cfg.camIndex}`);
    }
    log(`cam using index ${cfg.camIndex}`);
    return cfg.camIndex;
}

/**
 * Kill ffmpeg and wait until it actually exits (or timeout), then settle so
 * AVFoundation releases the camera before the next open.
 */
async function stopFfmpeg(reason) {
    if (trimTimer) {
        clearInterval(trimTimer);
        trimTimer = null;
    }
    const proc = ffmpegProc;
    ffmpegProc = null;
    startedAt = null;
    if (!proc) {
        wipeRingFiles();
        log(`buffer stop (${reason || 'ok'}) — no process`);
        return { ok: true, buffering: false };
    }

    await new Promise((resolve) => {
        let settled = false;
        const done = () => {
            if (settled) return;
            settled = true;
            resolve();
        };
        proc.once('exit', done);
        try {
            proc.kill('SIGTERM');
        } catch (_) {
            done();
            return;
        }
        setTimeout(() => {
            try {
                if (proc.exitCode == null && !proc.killed) proc.kill('SIGKILL');
            } catch (_) { /* ignore */ }
            setTimeout(done, 200);
        }, FFMPEG_STOP_TIMEOUT_MS);
    });

    await sleep(CAM_RELEASE_SETTLE_MS);
    wipeRingFiles();
    log(`buffer stop (${reason || 'ok'})`);
    return { ok: true, buffering: false };
}

async function startBuffer() {
    cfg = loadConfig();
    if (isBuffering()) {
        log('buffer start — already buffering');
        return { ok: true, buffering: true, already: true };
    }
    ensureRingDir();
    await stopFfmpeg('restart-clean');

    let camIndex;
    try {
        camIndex = await resolveCamIndex();
    } catch (err) {
        logErr('cam resolve failed:', err.message || err);
        return { ok: false, buffering: false, error: 'failed to list cameras' };
    }

    const args = [
        '-hide_banner', '-loglevel', 'warning', '-stats',
        '-f', 'avfoundation',
        '-pixel_format', String(cfg.pixelFormat || 'uyvy422'),
        '-framerate', String(cfg.fps),
        '-video_size', String(cfg.size),
        '-i', `${camIndex}:none`,
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-an',
        '-g', '30', '-keyint_min', '30', '-sc_threshold', '0',
        '-force_key_frames', 'expr:gte(t,n_forced*1)',
        '-f', 'segment', '-segment_time', '1', '-reset_timestamps', '1',
        '-break_non_keyframes', '0',
        path.join(cfg.ringDir, 'seg_%03d.mp4')
    ];
    if (cfg.transpose != null) {
        // Insert -vf before -c:v
        const i = args.indexOf('-c:v');
        args.splice(i, 0, '-vf', `transpose=${cfg.transpose}`);
    }

    log(`buffer start cam=${camIndex} ${cfg.size}@${cfg.fps} transpose=${cfg.transpose == null ? 'off' : cfg.transpose}`);
    const proc = spawn(cfg.ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    ffmpegProc = proc;
    startedAt = Date.now();
    proc.stderr.on('data', (buf) => {
        const line = buf.toString().trim();
        if (!line) return;
        if (/Error|error opening|Input\/output/i.test(line)) {
            logErr('ffmpeg:', line);
        }
    });
    proc.on('exit', (code, signal) => {
        log(`ffmpeg exited code=${code} signal=${signal}`);
        if (ffmpegProc === proc) {
            ffmpegProc = null;
            startedAt = null;
        }
    });

    // Brief wait: if cam open fails, exit lands quickly
    await sleep(600);
    if (!isBuffering()) {
        logErr('buffer start failed — ffmpeg died (camera busy, wrong index, or wrong size/fps?)');
        wipeRingFiles();
        return { ok: false, buffering: false, error: 'ffmpeg failed to open camera', camIndex };
    }

    trimTimer = setInterval(trimRing, 2000);
    log(`buffer start ok — cam ${camIndex}, ring ${cfg.ringDir}`);
    return { ok: true, buffering: true, camIndex };
}

function uploadToFd(filePath) {
    return new Promise((resolve, reject) => {
        const url = new URL(`${cfg.fdUrl}/api/debug/winner-clip`);
        const body = fs.readFileSync(filePath);
        const lib = url.protocol === 'https:' ? https : http;
        const req = lib.request(
            {
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'video/mp4',
                    'Content-Length': body.length
                },
                rejectUnauthorized: false
            },
            (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    const raw = Buffer.concat(chunks).toString('utf8');
                    let data = null;
                    try {
                        data = JSON.parse(raw);
                    } catch (_) {
                        data = { raw };
                    }
                    if (res.statusCode >= 200 && res.statusCode < 300 && data && data.ok) {
                        resolve(data);
                    } else {
                        reject(new Error((data && data.error) || `upload HTTP ${res.statusCode}`));
                    }
                });
            }
        );
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function dumpClip() {
    cfg = loadConfig();
    const keep = cfg.clipBeforeSec + cfg.clipAfterSec;
    const closedBefore = listClosedSegs();
    const buffering = isBuffering();

    if (!buffering && closedBefore.length < Math.min(2, keep)) {
        logErr(`dump abort — buffer not running and only ${closedBefore.length} closed seg(s)`);
        return {
            ok: false,
            error: `not enough segments (${closedBefore.length}); is buffer running?`
        };
    }

    if (cfg.clipAfterSec > 0 && buffering) {
        log(`dump waiting ${cfg.clipAfterSec}s after trigger…`);
        await sleep(cfg.clipAfterSec * 1000);
    } else if (cfg.clipAfterSec > 0 && !buffering) {
        logWarn('dump — buffer dead; skipping after-wait, remuxing what we have');
    }

    trimRing();
    const closed = listClosedSegs();
    if (closed.length < Math.min(2, keep)) {
        logErr(`dump fail — not enough segments (${closed.length})`);
        return { ok: false, error: `not enough segments (${closed.length}); is buffer running?` };
    }
    const take = closed.slice(-keep);
    const concatPath = path.join(cfg.ringDir, 'concat.txt');
    const outPath = path.join(cfg.ringDir, 'dump.mp4');
    fs.writeFileSync(
        concatPath,
        take.map((n) => `file '${n}'`).join('\n') + '\n',
        'utf8'
    );

    log(`dump remux ${take.length} seg(s) → dump.mp4`);
    await new Promise((resolve, reject) => {
        const p = spawn(
            cfg.ffmpeg,
            ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', concatPath, '-c', 'copy', outPath],
            { cwd: cfg.ringDir, stdio: ['ignore', 'ignore', 'pipe'] }
        );
        let err = '';
        p.stderr.on('data', (b) => { err += b.toString(); });
        p.on('exit', (code) => {
            if (code === 0) resolve();
            else reject(new Error(err || `ffmpeg concat exit ${code}`));
        });
    });

    const t0 = Date.now();
    const uploaded = await uploadToFd(outPath);
    const uploadMs = Date.now() - t0;
    log(`dump ok ${keep}s → ${uploaded.url} (upload ${uploadMs}ms)`);
    return {
        ok: true,
        url: uploaded.url,
        absoluteUrl: uploaded.absoluteUrl || `${cfg.fdUrl}${uploaded.url}`,
        beforeSec: cfg.clipBeforeSec,
        afterSec: cfg.clipAfterSec,
        segments: take.length,
        uploadMs,
        bytes: uploaded.bytes
    };
}

function getStatus() {
    return {
        ok: true,
        buffering: isBuffering(),
        startedAt,
        camName: cfg.camName || '',
        camIndex: cfg.camIndex,
        clipBeforeSec: cfg.clipBeforeSec,
        clipAfterSec: cfg.clipAfterSec,
        ringSec: cfg.ringSec,
        closedSegments: listClosedSegs().length,
        fdUrl: cfg.fdUrl,
        dumpInFlight: !!dumpInFlight
    };
}

function readJsonBody(req) {
    return new Promise((resolve) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            if (!raw) return resolve({});
            try {
                resolve(JSON.parse(raw));
            } catch (_) {
                resolve({});
            }
        });
    });
}

function sendJson(res, status, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
    });
    res.end(body);
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const method = req.method || 'GET';

    try {
        if (method === 'GET' && url.pathname === '/status') {
            sendJson(res, 200, getStatus());
            return;
        }
        if (method === 'POST' && url.pathname === '/buffer/start') {
            await readJsonBody(req);
            const result = await runExclusive('start', () => startBuffer());
            sendJson(res, result.ok ? 200 : 500, result);
            return;
        }
        if (method === 'POST' && url.pathname === '/buffer/stop') {
            await readJsonBody(req);
            const result = await runExclusive('stop', () => stopFfmpeg('api'));
            sendJson(res, 200, result);
            return;
        }
        if (method === 'POST' && url.pathname === '/buffer/dump') {
            await readJsonBody(req);
            if (dumpInFlight) {
                sendJson(res, 409, { ok: false, error: 'dump already in progress' });
                return;
            }
            dumpInFlight = runExclusive('dump', () => dumpClip())
                .then((result) => {
                    dumpInFlight = null;
                    return result;
                })
                .catch((err) => {
                    dumpInFlight = null;
                    return { ok: false, error: err.message || String(err) };
                });
            const result = await dumpInFlight;
            sendJson(res, result.ok ? 200 : 500, result);
            return;
        }
        sendJson(res, 404, { ok: false, error: 'not found' });
    } catch (err) {
        sendJson(res, 500, { ok: false, error: err.message || String(err) });
    }
});

cfg = loadConfig();
server.listen(cfg.port, '0.0.0.0', () => {
    log(`TVMRecorder on http://0.0.0.0:${cfg.port}`);
    log(`clip window ${cfg.clipBeforeSec}s before + ${cfg.clipAfterSec}s after → FD ${cfg.fdUrl}`);
});

process.on('SIGINT', async () => {
    await stopFfmpeg('sigint');
    process.exit(0);
});
process.on('SIGTERM', async () => {
    await stopFfmpeg('sigterm');
    process.exit(0);
});
