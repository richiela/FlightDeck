const http = require('http');
const WebSocket = require('ws');
const { mapOpenDartsThrow } = require('./mapThrow');

const DEFAULT_HOST = '10.0.0.180';
const DEFAULT_PORT = 8787;
const RECONNECT_MS = 3000;
/** Only poll HTTP state when WS is down — OpenDarts pushes STATUS/TELEMETRY on the socket. */
const STATE_POLL_MS = 5000;
/** OpenDarts start opens 3 cams (~7–12s); calibrate is usually a few seconds. */
const HTTP_TIMEOUT_MS = 5000;
const HTTP_LONG_TIMEOUT_MS = 60000;

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
 * OpenDarts already uses Scolia-like status/phase names.
 * Idle phase → not ready to score (exposed as boardPhase Idle).
 */
function applyStatusPhase(state, snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return;

    if (snapshot.status != null) state.boardStatus = String(snapshot.status);
    if (snapshot.phase != null) state.boardPhase = String(snapshot.phase);
    if (snapshot.errorType != null) state.errorType = snapshot.errorType;

    state.opendarts.running = !!snapshot.running;
    state.opendarts.calibrated = !!snapshot.calibrated;
    state.opendarts.numThrows = Number(snapshot.numThrows) || 0;
    state.opendarts.visitId = snapshot.visitId != null ? snapshot.visitId : null;
    state.opendarts.substate = snapshot.substate != null ? String(snapshot.substate) : null;
    state.opendarts.status = state.boardStatus;
    state.opendarts.phase = state.boardPhase;
    if (snapshot.anchor != null) state.opendarts.anchor = snapshot.anchor;
    if (snapshot.idleTimeoutSec != null) {
        state.opendarts.idleTimeoutSec = Number(snapshot.idleTimeoutSec);
    }
}

function createOpenDartsDriver({ host, port, onUpdate, onEvent }) {
    const boardHost = String(host || DEFAULT_HOST).trim() || DEFAULT_HOST;
    const boardPort = Number(port) || DEFAULT_PORT;

    let ws = null;
    let intentionalClose = false;
    let reconnectTimer = null;
    let pollTimer = null;
    let lastThrowKey = '';

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
        mode: 'opendarts',
        provider: 'opendarts',
        opendarts: {
            host: boardHost,
            port: boardPort,
            status: null,
            phase: null,
            substate: null,
            numThrows: 0,
            running: false,
            calibrated: false,
            visitId: null,
            anchor: null,
            idleTimeoutSec: null
        }
    };

    function emit() {
        if (typeof onUpdate === 'function') onUpdate(getPublicState());
    }

    function pushEvent(type, payload) {
        if (typeof onEvent === 'function') onEvent(type, payload);
    }

    /**
     * Mirror Autodarts: Stopped ↔ active edges drive dart-lights automation.
     * IDLE_TIMEOUT / stop / STATUS all funnel through boardStatus.
     */
    function emitDetectionStatusEdges(prevBoardStatus, source) {
        const next = state.boardStatus;
        if (prevBoardStatus !== 'Stopped' && next === 'Stopped') {
            pushEvent('BOARD_DETECTION_STOPPED', {
                status: next,
                source: source || 'opendarts'
            });
        }
        const becameActive = prevBoardStatus === 'Stopped' && next != null && next !== 'Stopped';
        const firstSeenActive = prevBoardStatus == null
            && next != null
            && next !== 'Stopped'
            && (state.opendarts.running
                || next === 'Ready'
                || next === 'Initializing'
                || next === 'Calibrating');
        if (becameActive || firstSeenActive) {
            pushEvent('BOARD_DETECTION_STARTED', {
                status: next,
                source: source || 'opendarts'
            });
        }
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
            mode: 'opendarts',
            provider: 'opendarts',
            readyToScore: state.connection === 'open'
                && state.boardStatus === 'Ready'
                && state.boardPhase === 'Throw',
            log: state.log.slice(),
            opendarts: { ...state.opendarts }
        };
    }

    function commitThrow(payload, source) {
        if (!payload || typeof payload !== 'object') return;
        const key = [
            payload.index,
            payload.sector,
            payload.detectionTime,
            payload.visitId
        ].map((v) => (v == null ? '' : String(v))).join('|');
        if (key && key === lastThrowKey) return;
        lastThrowKey = key || lastThrowKey;

        const mapped = mapOpenDartsThrow(payload);
        state.lastThrow = {
            at: Date.now(),
            sector: payload.sector,
            mapped,
            raw: payload,
            source: 'opendarts'
        };
        pushLog({
            direction: 'in',
            type: 'THROW_DETECTED',
            summary: {
                sector: payload.sector,
                index: payload.index,
                confidence: payload.confidence,
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
        const payload = msg.payload != null ? msg.payload : msg;

        state.lastEventAt = Date.now();

        if (type === 'HELLO') {
            state.lastHelloAt = Date.now();
            const snap = (payload && payload.state) || payload;
            const prevStatus = state.boardStatus;
            applyStatusPhase(state, snap);
            emitDetectionStatusEdges(prevStatus, source);
            pushLog({
                direction: 'in',
                type: 'HELLO',
                summary: {
                    status: state.boardStatus,
                    phase: state.boardPhase,
                    source
                },
                raw: msg
            });
            emit();
            return;
        }

        if (type === 'STATUS' || type === 'TELEMETRY') {
            const snap = (payload && payload.state) || payload;
            const prevStatus = state.boardStatus;
            const prevPhase = state.boardPhase;
            applyStatusPhase(state, snap);
            emitDetectionStatusEdges(prevStatus, source);
            if (type === 'STATUS' || prevStatus !== state.boardStatus || prevPhase !== state.boardPhase) {
                pushLog({
                    direction: 'in',
                    type,
                    summary: {
                        status: state.boardStatus,
                        phase: state.boardPhase,
                        substate: state.opendarts.substate,
                        numThrows: state.opendarts.numThrows,
                        source
                    },
                    raw: type === 'TELEMETRY' ? undefined : msg
                });
            }
            emit();
            return;
        }

        if (type === 'THROW_DETECTED') {
            applyStatusPhase(state, {
                status: state.boardStatus || 'Ready',
                phase: 'Throw',
                running: true,
                numThrows: (payload && payload.index != null)
                    ? Number(payload.index) + 1
                    : state.opendarts.numThrows
            });
            commitThrow(payload, source);
            return;
        }

        if (type === 'TAKEOUT_STARTED') {
            state.boardPhase = 'Takeout';
            state.opendarts.phase = 'Takeout';
            state.lastTakeout = { kind: 'started', at: Date.now(), source };
            pushLog({
                direction: 'in',
                type,
                summary: { numThrows: payload && payload.numThrows, source },
                raw: msg
            });
            pushEvent('TAKEOUT_STARTED', { source: 'opendarts', ...(payload || {}) });
            emit();
            return;
        }

        if (type === 'TAKEOUT_FINISHED') {
            const falseTakeout = !!(payload && payload.falseTakeout);
            state.lastTakeout = {
                kind: 'finished',
                at: Date.now(),
                falseTakeout,
                source
            };
            if (!falseTakeout) {
                state.boardPhase = 'Throw';
                state.opendarts.phase = 'Throw';
                state.opendarts.numThrows = 0;
                lastThrowKey = '';
            }
            pushLog({
                direction: 'in',
                type,
                summary: { falseTakeout, source },
                raw: msg
            });
            pushEvent('TAKEOUT_FINISHED', {
                falseTakeout,
                source: 'opendarts',
                ...(payload || {})
            });
            emit();
            return;
        }

        if (type === 'VISIT_CLEARED' || type === 'BOARD_EMPTY') {
            state.opendarts.numThrows = 0;
            lastThrowKey = '';
            if (state.boardStatus === 'Ready') {
                state.boardPhase = 'Throw';
                state.opendarts.phase = 'Throw';
            }
            pushLog({
                direction: 'in',
                type,
                summary: { source },
                raw: msg
            });
            pushEvent('TAKEOUT_FINISHED', {
                falseTakeout: false,
                source: 'opendarts',
                via: type
            });
            emit();
            return;
        }

        if (type === 'IDLE_TIMEOUT') {
            const prevStatus = state.boardStatus;
            state.boardStatus = 'Stopped';
            state.opendarts.status = 'Stopped';
            state.opendarts.running = false;
            emitDetectionStatusEdges(prevStatus, source || 'idle_timeout');
            pushLog({
                direction: 'in',
                type,
                summary: { source },
                raw: msg
            });
            emit();
            return;
        }

        if (
            type === 'CALIBRATION_STARTED'
            || type === 'CALIBRATION_FINISHED'
            || type === 'CALIBRATION_FAILED'
            || type === 'SESSION_STARTED'
            || type === 'SESSION_STOPPED'
            || type === 'THROW_CORRECTED'
            || type === 'THROW_DELETED'
            || type === 'CONFIGURATION'
            || type === 'ACKNOWLEDGED'
            || type === 'REFUSED'
        ) {
            const prevStatus = state.boardStatus;
            if (type === 'CALIBRATION_STARTED') {
                state.boardStatus = 'Calibrating';
                state.opendarts.status = 'Calibrating';
            }
            if (type === 'CALIBRATION_FINISHED' || type === 'CALIBRATION_FAILED') {
                if (state.opendarts.running) {
                    state.boardStatus = 'Ready';
                    state.opendarts.status = 'Ready';
                }
                state.opendarts.calibrated = type === 'CALIBRATION_FINISHED';
            }
            if (type === 'SESSION_STOPPED') {
                state.boardStatus = 'Stopped';
                state.opendarts.status = 'Stopped';
                state.opendarts.running = false;
            }
            if (type === 'SESSION_STARTED') {
                state.opendarts.running = true;
                if (state.boardStatus === 'Stopped' || state.boardStatus == null) {
                    state.boardStatus = 'Ready';
                    state.opendarts.status = 'Ready';
                }
            }
            emitDetectionStatusEdges(prevStatus, source);
            pushLog({
                direction: 'in',
                type,
                summary: payload && typeof payload === 'object' ? payload : { source },
                raw: msg
            });
            emit();
            return;
        }

        // Unknown — still log lightly
        if (type) {
            pushLog({
                direction: 'in',
                type,
                summary: { source },
                raw: msg
            });
            emit();
        }
    }

    function applyHttpState(raw) {
        if (!raw || typeof raw !== 'object') return;
        const prevStatus = state.boardStatus;
        applyStatusPhase(state, raw);
        emitDetectionStatusEdges(prevStatus, 'http');
        state.lastEventAt = Date.now();
        emit();
    }

    async function fetchState() {
        const res = await httpRequest(boardHost, boardPort, 'GET', '/api/state');
        if (res.status >= 200 && res.status < 300 && res.data) {
            applyHttpState(res.data);
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
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        state.connection = 'connecting';
        emit();

        const url = `ws://${boardHost}:${boardPort}/api/events`;
        console.log(`\x1b[36m[OPENDARTS]\x1b[0m Connecting ${url}`);
        ws = new WebSocket(url);

        ws.on('open', () => {
            state.connection = 'open';
            state.lastError = null;
            state.lastHelloAt = Date.now();
            console.log(`\x1b[36m[OPENDARTS]\x1b[0m Connected ${boardHost}:${boardPort}`);
            stopStatePoll();
            emit();
            fetchState().catch((err) => {
                state.lastError = err.message;
                emit();
            });
            try {
                ws.send(JSON.stringify({ type: 'GET_STATUS' }));
            } catch (_) {}
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
            console.log(`\x1b[36m[OPENDARTS]\x1b[0m Closed (${code}${reason ? ` ${reason}` : ''})`);
            emit();
            startStatePoll();
            scheduleReconnect();
        });

        ws.on('error', (err) => {
            state.lastError = err.message;
            console.error(`\x1b[36m[OPENDARTS]\x1b[0m Error:`, err.message);
            emit();
        });
    }

    async function post(path, body, timeoutMs) {
        return httpRequest(boardHost, boardPort, 'POST', path, body, timeoutMs);
    }

    /** OpenDarts often returns HTTP 200 with { ok: false, reason }. */
    function interpretCommandResult(res) {
        const httpOk = !!(res && res.status >= 200 && res.status < 300);
        if (!httpOk) {
            return {
                ok: false,
                status: res ? res.status : 0,
                error: (res && res.error) || `HTTP ${res && res.status}`
            };
        }
        const data = res.data;
        if (data && typeof data === 'object' && data.ok === false) {
            return {
                ok: false,
                status: res.status,
                error: data.reason || data.error || 'OpenDarts rejected command',
                data
            };
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
        // HTTP poll only as fallback while WS is down
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

    async function sendCommand(command, payload) {
        const cmd = String(command || '');
        let path = null;
        let body = payload;

        let timeoutMs = HTTP_TIMEOUT_MS;
        if (cmd === 'RESET_PHASE' || cmd === 'reset') {
            path = '/api/reset';
            body = undefined;
        } else if (cmd === 'start') {
            path = '/api/start';
            body = undefined;
            timeoutMs = HTTP_LONG_TIMEOUT_MS;
        } else if (cmd === 'stop') {
            path = '/api/stop';
            body = undefined;
            timeoutMs = HTTP_LONG_TIMEOUT_MS;
        } else if (cmd === 'RECALIBRATE' || cmd === 'calibrate') {
            path = '/api/calibrate';
            body = undefined;
            timeoutMs = HTTP_LONG_TIMEOUT_MS;
        } else if (cmd === 'THROW_CORRECTED' || cmd === 'throws/correct') {
            path = '/api/throws/correct';
            body = payload;
        } else if (cmd === 'DELETE_THROW' || cmd === 'throws/delete') {
            path = '/api/throws/delete';
            body = payload;
        } else if (cmd === 'throws/clear' || cmd === 'CLEAR_THROWS') {
            path = '/api/throws/clear';
            body = undefined;
        } else {
            return { ok: false, error: `Unsupported OpenDarts command: ${cmd}` };
        }

        pushLog({
            direction: 'out',
            type: cmd,
            summary: { sending: true, path, body: body || null, timeoutMs }
        });
        emit();

        try {
            // Calibrate needs live cams — if Start previously timed out / stopped, fail fast with a clear reason
            if (cmd === 'RECALIBRATE' || cmd === 'calibrate') {
                try {
                    const st = await httpRequest(boardHost, boardPort, 'GET', '/api/state', null, HTTP_TIMEOUT_MS);
                    if (st.data && st.data.running === false) {
                        const err = 'Cameras not running — hit Start before Calibrate';
                        pushLog({
                            direction: 'out',
                            type: cmd,
                            summary: { ok: false, path, error: err }
                        });
                        emit();
                        return { ok: false, path, error: err };
                    }
                } catch (_) { /* proceed; calibrate will report its own error */ }
            }

            const res = await post(path, body, timeoutMs);
            const interpreted = interpretCommandResult(res);
            if ((cmd === 'RESET_PHASE' || cmd === 'reset') && interpreted.ok) {
                lastThrowKey = '';
                state.opendarts.numThrows = 0;
                state.boardPhase = 'Throw';
                state.opendarts.phase = 'Throw';
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
            try {
                await fetchState();
            } catch (_) {}
            emit();
            console.log(
                `\x1b[36m[OPENDARTS]\x1b[0m Command ${cmd} →`,
                interpreted.ok
                    ? `ok ${path} (${interpreted.status})`
                    : `fail ${path} (${interpreted.error || interpreted.status})`
            );
            return {
                ok: interpreted.ok,
                status: interpreted.status,
                path,
                error: interpreted.ok ? undefined : interpreted.error
            };
        } catch (err) {
            pushLog({
                direction: 'out',
                type: cmd,
                summary: { ok: false, error: err.message }
            });
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
        provider: 'opendarts'
    };
}

module.exports = { createOpenDartsDriver };
