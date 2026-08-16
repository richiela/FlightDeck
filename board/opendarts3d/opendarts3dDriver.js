const http = require('http');
const WebSocket = require('ws');
const { mapOpenDarts3DThrow } = require('./mapThrow');

/** Default target: the Mac Mini running dart3d's camera capture (`ssh mini` / 10.0.0.181), not the
 *  Synology box other providers default to — this is a different physical machine. */
const DEFAULT_HOST = '10.0.0.181';
const DEFAULT_PORT = 8788;
const RECONNECT_MS = 3000;
/** Only poll HTTP state when WS is down — dart3d pushes TRIGGER_STATE/THROW_DETECTED on the socket. */
const STATE_POLL_MS = 5000;
const HTTP_TIMEOUT_MS = 5000;
/** Start opens 3 cameras — can take a few seconds. */
const HTTP_LONG_TIMEOUT_MS = 20000;

function httpRequest(host, port, method, urlPath, body, timeoutMs) {
    return new Promise((resolve, reject) => {
        const payload = body != null ? JSON.stringify(body) : null;
        const req = http.request(
            {
                host,
                port,
                path: urlPath,
                method,
                headers: payload
                    ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
                    : undefined,
                timeout: timeoutMs != null ? timeoutMs : HTTP_TIMEOUT_MS
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

/**
 * dart3d's /api/state shape → FlightDeck's Scolia-compatible boardStatus/boardPhase.
 * `trigger.state` is a dart3d.capture.throw_trigger.ThrowState name:
 * IDLE, MOTION_DETECTED, SETTLING, READY_TO_CAPTURE, TAKEOUT_WAITING.
 * (docs/LIVE_API.md — "Two process shapes": trigger.available:false / visit.available:false
 * means this is the standalone dashboard with no capture loop — treat as not ready to score.)
 */
function normalizeState(snap) {
    const trigger = (snap && snap.trigger) || {};
    const captureLoop = snap && snap.capture_loop; // null in standalone mode
    const running = !!(captureLoop && captureLoop.running);
    const starting = !!(captureLoop && captureLoop.starting);
    const triggerAvailable = trigger.available !== false && trigger.state !== undefined;

    let boardStatus = 'Stopped';
    let boardPhase = 'Throw';

    if (!triggerAvailable) {
        boardStatus = 'Stopped';
    } else if (starting) {
        boardStatus = 'Initializing';
    } else if (running) {
        boardStatus = 'Ready';
        boardPhase = trigger.state === 'TAKEOUT_WAITING' ? 'Takeout' : 'Throw';
    } else {
        boardStatus = 'Stopped';
    }

    return {
        boardStatus,
        boardPhase,
        triggerState: trigger.state != null ? String(trigger.state) : null,
        running,
        starting,
        visitId: (snap && snap.visit && snap.visit.visit_id) || trigger.visit_id || null,
        dartCount: trigger.dart_count != null ? Number(trigger.dart_count) : null
    };
}

function createOpenDarts3DDriver({ host, port, onUpdate, onEvent }) {
    const boardHost = String(host || DEFAULT_HOST).trim() || DEFAULT_HOST;
    const boardPort = Number(port) || DEFAULT_PORT;

    let ws = null;
    let intentionalClose = false;
    let reconnectTimer = null;
    let pollTimer = null;
    let lastThrowKey = '';
    let lastVisitId = null;
    let lastTriggerState = null;

    const state = {
        connection: 'connecting',
        closeCode: null,
        closeReason: null,
        lastError: null,
        serialMasked: `${boardHost}:${boardPort}`,
        credentialSource: 'board.json',
        boardStatus: null,
        boardPhase: null,
        errorType: null,
        enableMessageForwardToScolia: false,
        lastHelloAt: null,
        lastEventAt: null,
        lastThrow: null,
        lastTakeout: null,
        log: [],
        logPaused: false,
        mode: 'opendarts3d',
        provider: 'opendarts3d',
        opendarts3d: {
            host: boardHost,
            port: boardPort,
            triggerState: null,
            visitId: null,
            dartCount: null,
            running: false,
            starting: false,
            websocketClients: null,
            calibration: null
        }
    };

    function emit() {
        if (typeof onUpdate === 'function') onUpdate(getPublicState());
    }

    function pushEvent(type, payload) {
        if (typeof onEvent === 'function') onEvent(type, payload);
    }

    function pushLog(entry) {
        if (state.logPaused) return;
        state.log.unshift({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            at: Date.now(),
            direction: entry.direction || 'in',
            type: entry.type || 'UNKNOWN',
            summary: entry.summary != null ? entry.summary : null,
            raw: entry.raw != null ? entry.raw : null
        });
        if (state.log.length > 200) state.log.length = 200;
    }

    function getPublicState() {
        return {
            connection: state.connection,
            closeCode: state.closeCode,
            closeReason: state.closeReason,
            lastError: state.lastError,
            serialMasked: state.serialMasked,
            credentialSource: state.credentialSource,
            boardStatus: state.boardStatus,
            boardPhase: state.boardPhase,
            errorType: state.errorType,
            enableMessageForwardToScolia: false,
            lastHelloAt: state.lastHelloAt,
            lastEventAt: state.lastEventAt,
            lastThrow: state.lastThrow,
            lastTakeout: state.lastTakeout,
            logPaused: state.logPaused,
            mode: 'opendarts3d',
            provider: 'opendarts3d',
            readyToScore: state.connection === 'open'
                && state.boardStatus === 'Ready'
                && state.boardPhase === 'Throw',
            log: state.log.slice(),
            opendarts3d: { ...state.opendarts3d }
        };
    }

    /** Mirror Autodarts/OpenDarts: Stopped ↔ active edges drive dart-lights automation. */
    function emitDetectionStatusEdges(prevBoardStatus, source) {
        const next = state.boardStatus;
        if (prevBoardStatus !== 'Stopped' && next === 'Stopped') {
            pushEvent('BOARD_DETECTION_STOPPED', { status: next, source: source || 'opendarts3d' });
        }
        const becameActive = prevBoardStatus === 'Stopped' && next != null && next !== 'Stopped';
        const firstSeenActive = prevBoardStatus == null && next != null && next !== 'Stopped';
        if (becameActive || firstSeenActive) {
            pushEvent('BOARD_DETECTION_STARTED', { status: next, source: source || 'opendarts3d' });
        }
    }

    function applySnapshot(snap, source) {
        if (!snap || typeof snap !== 'object') return;
        const norm = normalizeState(snap);
        const prevBoardStatus = state.boardStatus;

        state.boardStatus = norm.boardStatus;
        state.boardPhase = norm.boardPhase;
        state.opendarts3d.triggerState = norm.triggerState;
        state.opendarts3d.visitId = norm.visitId;
        state.opendarts3d.dartCount = norm.dartCount;
        state.opendarts3d.running = norm.running;
        state.opendarts3d.starting = norm.starting;
        if (snap.websocket_clients != null) state.opendarts3d.websocketClients = Number(snap.websocket_clients);
        if (snap.calibration) state.opendarts3d.calibration = snap.calibration;
        state.lastEventAt = Date.now();

        emitDetectionStatusEdges(prevBoardStatus, source);

        // Takeout-wait entered/left — TAKEOUT_WAITING is dart3d's equivalent of other
        // providers' explicit TAKEOUT_STARTED event (see docs/LIVE_API.md's trigger.state enum).
        if (lastTriggerState !== 'TAKEOUT_WAITING' && norm.triggerState === 'TAKEOUT_WAITING') {
            state.lastTakeout = { kind: 'started', at: Date.now(), source };
            pushEvent('TAKEOUT_STARTED', { source: 'opendarts3d' });
        }
        lastTriggerState = norm.triggerState;

        emit();
    }

    function commitThrow(payload, source) {
        if (!payload || typeof payload !== 'object') return;
        const key = [payload.throw_id, payload.visit_id, payload.visit_index]
            .map((v) => (v == null ? '' : String(v))).join('|');
        if (key && key === lastThrowKey) return;
        lastThrowKey = key || lastThrowKey;

        const mapped = mapOpenDarts3DThrow(payload);
        state.lastThrow = {
            at: Date.now(),
            sector: payload.sector,
            ring: payload.ring,
            mapped,
            raw: payload,
            source: 'opendarts3d'
        };
        pushLog({
            direction: 'in',
            type: 'THROW_DETECTED',
            summary: {
                sector: payload.sector,
                ring: payload.ring,
                ok: payload.ok,
                visitIndex: payload.visit_index,
                primaryEngine: payload.primary_engine,
                source
            },
            raw: payload
        });
        pushEvent('THROW', mapped);
        emit();
    }

    function handleEnvelope(msg, source) {
        if (!msg || typeof msg !== 'object') return;
        const type = String(msg.type || '');
        state.lastEventAt = Date.now();

        if (type === 'HELLO') {
            state.lastHelloAt = Date.now();
            applySnapshot(msg.state, source);
            pushLog({
                direction: 'in',
                type: 'HELLO',
                summary: { status: state.boardStatus, phase: state.boardPhase, source },
                raw: undefined
            });
            return;
        }

        if (type === 'TRIGGER_STATE') {
            const prevBoardStatus = state.boardStatus;
            const running = state.opendarts3d.running; // capture_loop status only arrives via CAPTURE_LOOP_STATUS/HELLO/poll
            state.boardStatus = running ? 'Ready' : state.boardStatus;
            state.boardPhase = msg.state === 'TAKEOUT_WAITING' ? 'Takeout' : 'Throw';
            state.opendarts3d.triggerState = msg.state != null ? String(msg.state) : null;
            state.opendarts3d.visitId = msg.visit_id != null ? msg.visit_id : state.opendarts3d.visitId;
            state.opendarts3d.dartCount = msg.dart_count != null ? Number(msg.dart_count) : state.opendarts3d.dartCount;
            state.opendarts3d.starting = !!msg.capture_starting;

            if (lastTriggerState !== 'TAKEOUT_WAITING' && msg.state === 'TAKEOUT_WAITING') {
                state.lastTakeout = { kind: 'started', at: Date.now(), source };
                pushEvent('TAKEOUT_STARTED', { source: 'opendarts3d' });
            }
            lastTriggerState = msg.state;
            emitDetectionStatusEdges(prevBoardStatus, source);
            pushLog({
                direction: 'in',
                type,
                summary: { state: msg.state, dartCount: msg.dart_count, visitId: msg.visit_id, source }
            });
            emit();
            return;
        }

        if (type === 'THROW_DETECTED') {
            commitThrow(msg, source);
            return;
        }

        if (type === 'VISIT_CLEARED') {
            // dart3d's turn-rotation signal — the closest analog to other providers'
            // TAKEOUT_FINISHED (reason:"takeout") or a manual reset (reason:"reset").
            // No false-takeout concept here yet (see mapThrow.js's isExplicitBounceout
            // comment for the sibling "coming soon" note on bounce-out).
            lastThrowKey = '';
            lastVisitId = msg.visit_id != null ? msg.visit_id : lastVisitId;
            state.opendarts3d.visitId = lastVisitId;
            state.opendarts3d.dartCount = 0;
            if (state.boardStatus === 'Ready') state.boardPhase = 'Throw';
            state.lastTakeout = { kind: 'finished', at: Date.now(), falseTakeout: false, source };
            pushLog({
                direction: 'in',
                type,
                summary: { reason: msg.reason, nDarts: msg.n_darts, visitId: msg.visit_id, source }
            });
            pushEvent('TAKEOUT_FINISHED', { falseTakeout: false, source: 'opendarts3d', reason: msg.reason });
            emit();
            return;
        }

        if (type === 'CAPTURE_LOOP_STATUS') {
            const prevBoardStatus = state.boardStatus;
            state.opendarts3d.running = !!msg.running;
            state.opendarts3d.starting = !!msg.starting;
            state.boardStatus = msg.running ? 'Ready' : (msg.starting ? 'Initializing' : 'Stopped');
            emitDetectionStatusEdges(prevBoardStatus, source);
            pushLog({
                direction: 'in',
                type,
                summary: { ok: msg.ok, running: msg.running, starting: msg.starting, reason: msg.reason, source }
            });
            emit();
            return;
        }

        if (type === 'IDLE_TIMEOUT') {
            const prevBoardStatus = state.boardStatus;
            state.boardStatus = 'Stopped';
            state.opendarts3d.running = false;
            emitDetectionStatusEdges(prevBoardStatus, source || 'idle_timeout');
            pushLog({ direction: 'in', type, summary: { idleTimeoutSec: msg.idle_timeout_sec, source } });
            emit();
            return;
        }

        if (type === 'CALIBRATION_STATUS') {
            state.opendarts3d.calibration = { cameras: msg.cameras, odReachable: msg.od_reachable, source: msg.source };
            pushLog({ direction: 'in', type, summary: { odReachable: msg.od_reachable, calibrationSource: msg.source } });
            emit();
            return;
        }

        if (type === 'THROW_CORRECTED') {
            pushLog({
                direction: 'in',
                type,
                summary: {
                    visitId: msg.visit_id,
                    visitIndex: msg.visit_index,
                    live: `${msg.live_ring || ''}${msg.live_sector != null ? ' ' + msg.live_sector : ''}`,
                    corrected: `${msg.corrected_ring || ''}${msg.corrected_sector != null ? ' ' + msg.corrected_sector : ''}`,
                    correctedSource: msg.source
                },
                raw: msg
            });
            emit();
            return;
        }

        if (type === 'PACKAGES_UPDATED') {
            // Debug-only rebroadcast (per-engine comparison data) — not scoring-relevant.
            // Logged lightly so Board Debug shows *something* is flowing without spamming raw.
            pushLog({ direction: 'in', type, summary: { count: msg.count, newCount: msg.new_count } });
            emit();
            return;
        }

        // Unknown — still log lightly so nothing silently vanishes.
        if (type) {
            pushLog({ direction: 'in', type, summary: { source } });
            emit();
        }
    }

    async function fetchState() {
        const res = await httpRequest(boardHost, boardPort, 'GET', '/api/state');
        if (res.status >= 200 && res.status < 300 && res.data) {
            applySnapshot(res.data, 'http');
        }
        return res;
    }

    function scheduleReconnect() {
        if (intentionalClose) return;
        if (reconnectTimer) return;
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connectWs();
        }, RECONNECT_MS);
    }

    function connectWs() {
        if (intentionalClose) return;
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

        state.connection = 'connecting';
        emit();

        const url = `ws://${boardHost}:${boardPort}/api/events`;
        console.log(`\x1b[36m[OPENDARTS3D]\x1b[0m Connecting ${url}`);
        ws = new WebSocket(url);

        ws.on('open', () => {
            state.connection = 'open';
            state.lastError = null;
            console.log(`\x1b[36m[OPENDARTS3D]\x1b[0m Connected ${boardHost}:${boardPort}`);
            stopStatePoll();
            emit();
            // HELLO arrives immediately on connect (docs/LIVE_API.md) — no GET_STATUS needed.
        });

        ws.on('message', (buf) => {
            let msg;
            try {
                msg = JSON.parse(buf.toString());
            } catch (_) {
                return;
            }
            handleEnvelope(msg, 'ws');
        });

        ws.on('close', (code, reasonBuf) => {
            const reason = reasonBuf ? reasonBuf.toString() : '';
            state.connection = 'closed';
            state.closeCode = code;
            state.closeReason = reason || null;
            state.boardStatus = null;
            state.boardPhase = null;
            console.log(`\x1b[36m[OPENDARTS3D]\x1b[0m Closed (${code}${reason ? ` ${reason}` : ''})`);
            emit();
            startStatePoll();
            scheduleReconnect();
        });

        ws.on('error', (err) => {
            state.lastError = err.message;
            console.error(`\x1b[36m[OPENDARTS3D]\x1b[0m Error:`, err.message);
            emit();
        });
    }

    async function post(path, body, timeoutMs) {
        return httpRequest(boardHost, boardPort, 'POST', path, body, timeoutMs);
    }

    function interpretCommandResult(res) {
        const httpOk = !!(res && res.status >= 200 && res.status < 300);
        if (!httpOk) {
            return { ok: false, status: res ? res.status : 0, error: (res && res.error) || `HTTP ${res && res.status}` };
        }
        const data = res.data;
        // dart3d reports honest no-ops as HTTP 200 + { ok: false, reason } (docs/LIVE_API.md).
        if (data && typeof data === 'object' && data.ok === false) {
            return { ok: false, status: res.status, error: data.reason || data.error || 'dart3d rejected command', data };
        }
        return { ok: true, status: res.status, data };
    }

    function stopStatePoll() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    function startStatePoll() {
        if (pollTimer || intentionalClose) return;
        if (ws && ws.readyState === WebSocket.OPEN) return;
        pollTimer = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                stopStatePoll();
                return;
            }
            fetchState().catch(() => {});
        }, STATE_POLL_MS);
    }

    function start() {
        intentionalClose = false;
        connectWs();
        startStatePoll();
    }

    function stop() {
        intentionalClose = true;
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        stopStatePoll();
        if (ws) {
            try { ws.close(); } catch (_) {}
            ws = null;
        }
        state.connection = 'closed';
        emit();
    }

    function reconnect() {
        intentionalClose = false;
        if (ws) {
            try {
                intentionalClose = true;
                ws.close();
            } catch (_) {}
            intentionalClose = false;
        }
        connectWs();
        return { ok: true };
    }

    function clearLog() {
        state.log = [];
        emit();
        return { ok: true };
    }

    function setLogPaused(paused) {
        state.logPaused = !!paused;
        emit();
        return { ok: true };
    }

    /**
     * `correct` payload: { visitId, index, sector, ring, source, note } — pushes FlightDeck's
     * operator correction back to dart3d via POST /api/visits/{visitId}/throws/{index}/correct
     * (docs/LIVE_API.md). `ring` is required by that endpoint; `sector` is omitted for
     * bull/outer_bull/outside. This is the first half of what Richie asked for (2026-08-16) —
     * pushing the correction back. The other half — dart3d returning a *ranked* list of likely
     * corrections (from its per-engine disagreement) so Control's Correct Score UI can
     * prepopulate the most likely one — isn't in the API yet; do not invent a ranking here from
     * the raw engines{} package data without that contract landing first.
     */
    async function pushCorrection(payload) {
        if (!payload || payload.visitId == null || payload.index == null || !payload.ring) {
            return { ok: false, error: 'correct requires visitId, index, and ring' };
        }
        const path = `/api/visits/${encodeURIComponent(payload.visitId)}/throws/${encodeURIComponent(payload.index)}/correct`;
        const body = { ring: payload.ring, source: payload.source || 'manual' };
        if (payload.sector != null) body.sector = String(payload.sector);
        if (payload.note != null) body.note = payload.note;
        const res = await post(path, body, HTTP_TIMEOUT_MS);
        return interpretCommandResult(res);
    }

    async function sendCommand(command, payload) {
        const cmd = String(command || '');
        let path = null;
        let body;
        let timeoutMs = HTTP_TIMEOUT_MS;

        if (cmd === 'RESET_PHASE' || cmd === 'reset') {
            path = '/api/reset';
        } else if (cmd === 'start') {
            path = '/api/start';
            timeoutMs = HTTP_LONG_TIMEOUT_MS;
        } else if (cmd === 'stop') {
            path = '/api/stop';
            timeoutMs = HTTP_LONG_TIMEOUT_MS;
        } else if (cmd === 'RECALIBRATE' || cmd === 'calibrate') {
            path = '/api/calibration/refresh';
            timeoutMs = HTTP_LONG_TIMEOUT_MS;
        } else if (cmd === 'correct') {
            const result = await pushCorrection(payload);
            pushLog({
                direction: 'out',
                type: cmd,
                summary: { ok: result.ok, error: result.ok ? null : result.error, payload }
            });
            emit();
            return result;
        } else {
            return { ok: false, error: `Unsupported OpenDarts-3D command: ${cmd}` };
        }

        pushLog({ direction: 'out', type: cmd, summary: { sending: true, path, timeoutMs } });
        emit();

        try {
            const res = await post(path, body, timeoutMs);
            const interpreted = interpretCommandResult(res);
            if ((cmd === 'RESET_PHASE' || cmd === 'reset') && interpreted.ok) {
                lastThrowKey = '';
                state.boardPhase = 'Throw';
            }
            pushLog({
                direction: 'out',
                type: cmd,
                summary: {
                    ok: interpreted.ok,
                    status: interpreted.status,
                    path,
                    error: interpreted.ok ? null : interpreted.error
                },
                raw: res
            });
            try { await fetchState(); } catch (_) {}
            emit();
            console.log(
                `\x1b[36m[OPENDARTS3D]\x1b[0m Command ${cmd} →`,
                interpreted.ok ? `ok ${path} (${interpreted.status})` : `fail ${path} (${interpreted.error || interpreted.status})`
            );
            return {
                ok: interpreted.ok,
                status: interpreted.status,
                path,
                error: interpreted.ok ? undefined : interpreted.error
            };
        } catch (err) {
            pushLog({ direction: 'out', type: cmd, summary: { ok: false, error: err.message } });
            emit();
            return { ok: false, error: err.message };
        }
    }

    function reloadAndConnect() {
        return reconnect();
    }

    return {
        start,
        stop,
        reconnect,
        clearLog,
        setLogPaused,
        sendCommand,
        getPublicState,
        reloadAndConnect,
        provider: 'opendarts3d'
    };
}

module.exports = { createOpenDarts3DDriver };
