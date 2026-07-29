const fs = require('fs');
const path = require('path');

const ALL_GAMES = [
    'demolition',
    'limbo',
    'derby',
    'killer',
    'quackshot',
    'shanghai',
    'harperwins',
    'warmup',
    'quick10',
    'x01',
    'cricket'
];

const DEFAULT_VENUE = {
    arenaName: "Richie's Flight Deck",
    dartCalloutMs: 1200,
    /** Registration: release avatar camera after this much quiet (ms). */
    registrationIdleMs: 5 * 60 * 1000,
    /** IN_GAME: release screen wake lock after this much quiet (ms). */
    inGameIdleMs: 5 * 60 * 1000,
    /**
     * Autodarts Board Manager camera standby (minutes).
     * Must match BM UI options: 5 | 10 | 15 | 30 | 60. Applied via PATCH /api/config.
     */
    autodartsStandbyMinutes: 5,
    /** TVMRecorder on ADMac (tvm-recorder.js) — face clips for TV Moments. */
    tvmRecorderEnabled: false,
    tvmRecorderHost: '10.0.0.181',
    tvmRecorderPort: 3190,
    splitGameCategories: true,
    games: Object.fromEntries(ALL_GAMES.map((k) => [k, true]))
};

/** Defaults above are the schema for data/venue.json (edit that file; missing keys fall back here). */

/** BM Config → Camera standby time options. */
const AUTODARTS_STANDBY_MINUTES = [5, 10, 15, 30, 60];

function clampCalloutMs(raw) {
    let ms = Number(raw);
    if (!Number.isFinite(ms)) ms = DEFAULT_VENUE.dartCalloutMs;
    return Math.max(0, Math.min(8000, Math.round(ms)));
}

/** Idle timers: 30s … 2h. */
function clampIdleMs(raw, fallback) {
    let ms = Number(raw);
    if (!Number.isFinite(ms)) ms = fallback;
    return Math.max(30 * 1000, Math.min(2 * 60 * 60 * 1000, Math.round(ms)));
}

function clampAutodartsStandbyMinutes(raw) {
    const n = Math.round(Number(raw));
    if (AUTODARTS_STANDBY_MINUTES.includes(n)) return n;
    return DEFAULT_VENUE.autodartsStandbyMinutes;
}

function normalizeGames(raw) {
    const out = { ...DEFAULT_VENUE.games };
    if (!raw || typeof raw !== 'object') return out;
    for (const key of ALL_GAMES) {
        if (Object.prototype.hasOwnProperty.call(raw, key)) {
            out[key] = !!raw[key];
        }
    }
    return out;
}

function normalizeVenueConfig(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const arenaName = String(src.arenaName != null ? src.arenaName : DEFAULT_VENUE.arenaName).trim()
        || DEFAULT_VENUE.arenaName;
    return {
        arenaName,
        dartCalloutMs: clampCalloutMs(
            src.dartCalloutMs != null ? src.dartCalloutMs : DEFAULT_VENUE.dartCalloutMs
        ),
        registrationIdleMs: clampIdleMs(
            src.registrationIdleMs != null ? src.registrationIdleMs : DEFAULT_VENUE.registrationIdleMs,
            DEFAULT_VENUE.registrationIdleMs
        ),
        inGameIdleMs: clampIdleMs(
            src.inGameIdleMs != null ? src.inGameIdleMs : DEFAULT_VENUE.inGameIdleMs,
            DEFAULT_VENUE.inGameIdleMs
        ),
        autodartsStandbyMinutes: clampAutodartsStandbyMinutes(
            src.autodartsStandbyMinutes != null
                ? src.autodartsStandbyMinutes
                : DEFAULT_VENUE.autodartsStandbyMinutes
        ),
        tvmRecorderEnabled: src.tvmRecorderEnabled === true,
        tvmRecorderHost: String(src.tvmRecorderHost != null ? src.tvmRecorderHost : DEFAULT_VENUE.tvmRecorderHost).trim()
            || DEFAULT_VENUE.tvmRecorderHost,
        tvmRecorderPort: (() => {
            const n = Number(src.tvmRecorderPort != null ? src.tvmRecorderPort : DEFAULT_VENUE.tvmRecorderPort);
            return Number.isFinite(n) && n > 0 ? Math.round(n) : DEFAULT_VENUE.tvmRecorderPort;
        })(),
        splitGameCategories: src.splitGameCategories !== false,
        games: normalizeGames(src.games)
    };
}

function loadVenueConfig(dataDir) {
    const configPath = path.join(dataDir, 'venue.json');
    let file = {};
    try {
        if (fs.existsSync(configPath)) {
            file = JSON.parse(fs.readFileSync(configPath, 'utf8')) || {};
        }
    } catch (err) {
        console.error('Failed to read data/venue.json:', err.message);
    }
    return normalizeVenueConfig(file);
}

function isGameEnabled(venue, gameKey) {
    if (!gameKey) return false;
    const games = (venue && venue.games) || DEFAULT_VENUE.games;
    if (!Object.prototype.hasOwnProperty.call(games, gameKey)) return true;
    return !!games[gameKey];
}

function firstEnabledGame(venue) {
    for (const key of ALL_GAMES) {
        if (isGameEnabled(venue, key)) return key;
    }
    return 'demolition';
}

module.exports = {
    ALL_GAMES,
    DEFAULT_VENUE,
    AUTODARTS_STANDBY_MINUTES,
    loadVenueConfig,
    normalizeVenueConfig,
    isGameEnabled,
    firstEnabledGame,
    clampCalloutMs,
    clampIdleMs,
    clampAutodartsStandbyMinutes
};
