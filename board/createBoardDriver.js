const fs = require('fs');
const path = require('path');
const { createScoliaClient, isMockMode } = require('./scolia/scoliaClient');
const { createAutodartsDriver } = require('./autodarts/autodartsDriver');
const { createOpenDartsDriver } = require('./opendarts/opendartsDriver');

/**
 * Load data/board.json — { provider, autodarts, opendarts }
 * Env wins: BOARD_PROVIDER, AUTODARTS_HOST/PORT, OPENDARTS_HOST/PORT
 * SCOLIA_MODE=mock forces mock (via Scolia mock client).
 */
function loadBoardConfig(dataDir) {
    let file = {};
    const configPath = path.join(dataDir, 'board.json');
    try {
        if (fs.existsSync(configPath)) {
            file = JSON.parse(fs.readFileSync(configPath, 'utf8')) || {};
        }
    } catch (err) {
        console.error('Failed to read data/board.json:', err.message);
    }

    const envProvider = String(process.env.BOARD_PROVIDER || '').trim().toLowerCase();
    let provider = (envProvider || file.provider || 'scolia').toLowerCase();

    if (isMockMode()) {
        provider = 'mock';
    }

    const ad = file.autodarts || {};
    const od = file.opendarts || {};

    return {
        provider,
        autodarts: {
            host: String(process.env.AUTODARTS_HOST || ad.host || '10.0.0.90').trim(),
            port: Number(process.env.AUTODARTS_PORT || ad.port || 3180)
        },
        opendarts: {
            host: String(process.env.OPENDARTS_HOST || od.host || '10.0.0.180').trim(),
            port: Number(process.env.OPENDARTS_PORT || od.port || 8787)
        },
        configPath
    };
}

function saveBoardConfig(dataDir, patch) {
    const configPath = path.join(dataDir, 'board.json');
    const current = loadBoardConfig(dataDir);
    const nextProvider = patch.provider != null
        ? String(patch.provider).toLowerCase()
        : current.provider;

    const next = {
        provider: nextProvider,
        autodarts: {
            host: current.autodarts.host,
            port: current.autodarts.port
        },
        opendarts: {
            host: current.opendarts.host,
            port: current.opendarts.port
        }
    };

    // Host/port from Control Apply target the active local provider
    if (patch.autodarts) {
        if (patch.autodarts.host != null) next.autodarts.host = String(patch.autodarts.host).trim();
        if (patch.autodarts.port != null) next.autodarts.port = Number(patch.autodarts.port);
    }
    if (patch.opendarts) {
        if (patch.opendarts.host != null) next.opendarts.host = String(patch.opendarts.host).trim();
        if (patch.opendarts.port != null) next.opendarts.port = Number(patch.opendarts.port);
    }

    // Convenience: when applying autodarts/opendarts, top-level host/port also accepted
    if (nextProvider === 'autodarts' && (patch.host != null || patch.port != null)) {
        if (patch.host != null) next.autodarts.host = String(patch.host).trim();
        if (patch.port != null) next.autodarts.port = Number(patch.port);
    }
    if (nextProvider === 'opendarts' && (patch.host != null || patch.port != null)) {
        if (patch.host != null) next.opendarts.host = String(patch.host).trim();
        if (patch.port != null) next.opendarts.port = Number(patch.port);
    }

    if (!['scolia', 'autodarts', 'opendarts', 'mock'].includes(next.provider)) {
        return { ok: false, error: `Unknown provider: ${next.provider}` };
    }
    if (!Number.isFinite(next.autodarts.port) || next.autodarts.port <= 0) {
        return { ok: false, error: 'Invalid Autodarts port' };
    }
    if (!Number.isFinite(next.opendarts.port) || next.opendarts.port <= 0) {
        return { ok: false, error: 'Invalid OpenDarts port' };
    }
    try {
        fs.writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
        return { ok: true, config: next, configPath };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

/**
 * BoardDriver factory. Returns a client with the same surface as createScoliaClient:
 * start, reconnect, clearLog, setLogPaused, sendCommand, getPublicState, reloadAndConnect
 */
function createBoardDriver({ dataDir, onUpdate, onEvent, configOverride }) {
    const config = configOverride || loadBoardConfig(dataDir);

    if (config.provider === 'autodarts') {
        console.log(
            `\x1b[36m[BOARD]\x1b[0m Provider: autodarts @ ${config.autodarts.host}:${config.autodarts.port}`
        );
        return createAutodartsDriver({
            host: config.autodarts.host,
            port: config.autodarts.port,
            onUpdate,
            onEvent
        });
    }

    if (config.provider === 'opendarts') {
        console.log(
            `\x1b[36m[BOARD]\x1b[0m Provider: opendarts @ ${config.opendarts.host}:${config.opendarts.port}`
        );
        return createOpenDartsDriver({
            host: config.opendarts.host,
            port: config.opendarts.port,
            onUpdate,
            onEvent
        });
    }

    // scolia | mock (mock via SCOLIA_MODE or provider:mock)
    if (config.provider === 'mock' && !isMockMode()) {
        process.env.SCOLIA_MODE = 'mock';
    }
    console.log(`\x1b[36m[BOARD]\x1b[0m Provider: ${isMockMode() || config.provider === 'mock' ? 'mock' : 'scolia'}`);
    const client = createScoliaClient({ dataDir, onUpdate, onEvent });
    client.provider = isMockMode() || config.provider === 'mock' ? 'mock' : 'scolia';
    return client;
}

module.exports = { createBoardDriver, loadBoardConfig, saveBoardConfig };
