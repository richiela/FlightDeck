const DARTBOARD_WHEEL = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const DEMOLITION_START = 180;
const DEMOLITION_PLAYOFF_START = 60;
const DEMOLITION_MAX_LANES = 6;
const DEMOLITION_STAGGER = 0.015;
const DERBY_MAX_TICKS = 9;
const KILLER_MARKS_TO_QUALIFY = 3;
const KILLER_STARTING_LIVES = 3;
const SEGMENTS_PER_NUMBER = 3; // Added for Killer game logic
const CRICKET_TARGETS = [20, 19, 18, 17, 16, 15, 'bull'];
const CRICKET_MAX_PLAYERS = 4;
const X01_START_SCORE = 301;
const X01_MAX_PLAYERS = 4;
const X01_SCORES = [301, 501, 701, 901];
const X01_IN_OUT = ['none', 'double', 'triple'];
const OVERLAY_NEXT_PLAYER_MS = 2500;
const OVERLAY_EVENT_MS = 3000;
const OVERLAY_ROUND_ANNOUNCE_MS = 3000;
const QUACKSHOT_MAX_ROUNDS = 6;
const SHANGHAI_MAX_ROUNDS = 8;
const BANGKOK_MAX_BEDS = 20;
const BANGKOK_DARTS_PER_BED = 6;
const DERBY_MAX_ROUNDS = 8;
const KILLER_MAX_ROUNDS = 12;
const WARMUP_HISTORY_MAX = 50;
const QUICK10_ROUNDS = 10;
const QUICK10_DARTS_PER_ROUND = 3;
const HARPER_WINS_START_POINTS = 5;
const HARPER_WINS_MAX_PLAYERS = 6;
const HARPER_WINS_DARTS = 3;
/** miss.mp4 ~2.0s + buffer when Viewer Video is on */
const HARPER_MISS_VIDEO_MS = 2300;
/** Longest push-*.mp4 ~3.0s + buffer when Viewer Video is on */
const HARPER_PUSH_VIDEO_MS = 3400;
/** harper-minus1.mp4 ~2.5s + buffer when Viewer Video is on */
const HARPER_MINUS1_VIDEO_MS = 2800;
/** harper-minus2.mp4 ~4.5s + buffer when Viewer Video is on */
const HARPER_MINUS2_VIDEO_MS = 4800;
/** harper-triple.mp4 ~3.0s + buffer when Viewer Video is on */
const HARPER_TRIPLE_VIDEO_MS = 3300;
/** harper-double.mp4 ~3.0s + buffer when Viewer Video is on */
const HARPER_DOUBLE_VIDEO_MS = 3300;
/** harper-bullseye.mp4 ~3.0s + buffer when Viewer Video is on */
const HARPER_BULLSEYE_VIDEO_MS = 3300;
/** Longest elim-*.mp4 ~3.5s + buffer when Viewer Video is on */
const HARPER_ELIM_VIDEO_MS = 3800;

/** Debug / bot throw skill profiles (locked). */
const THROW_PROFILES = {
    dummy: {
        id: 'dummy',
        label: 'Dummy',
        // Intentionally awful — a kid should beat this
        hitNumber: 0.12,
        mult: { single: 0.95, double: 0.04, triple: 0.01 },
        miss: { adjacent: 0.25, twoAway: 0.15, elsewhere: 0.40, bounce: 0.20 },
        quackshot: {
            doubleBull: 0.01,
            outerBull: 0.02,
            innerSingle: 0.15,
            triple: 0.08,
            splash: 0.74
        }
    },
    casual: {
        id: 'casual',
        label: 'Casual',
        hitNumber: 0.28,
        mult: { single: 0.88, double: 0.09, triple: 0.03 },
        miss: { adjacent: 0.40, twoAway: 0.15, elsewhere: 0.30, bounce: 0.15 },
        quackshot: {
            doubleBull: 0.02,
            outerBull: 0.04,
            innerSingle: 0.28,
            triple: 0.14,
            splash: 0.52
        }
    },
    intermediate: {
        id: 'intermediate',
        label: 'Intermediate',
        hitNumber: 0.45,
        mult: { single: 0.78, double: 0.15, triple: 0.07 },
        miss: { adjacent: 0.50, twoAway: 0.20, elsewhere: 0.20, bounce: 0.10 },
        quackshot: {
            doubleBull: 0.04,
            outerBull: 0.07,
            innerSingle: 0.42,
            triple: 0.12,
            splash: 0.35
        }
    },
    advanced: {
        id: 'advanced',
        label: 'Advanced',
        hitNumber: 0.62,
        mult: { single: 0.65, double: 0.22, triple: 0.13 },
        miss: { adjacent: 0.58, twoAway: 0.22, elsewhere: 0.12, bounce: 0.08 },
        quackshot: {
            doubleBull: 0.07,
            outerBull: 0.11,
            innerSingle: 0.55,
            triple: 0.10,
            splash: 0.17
        }
    }
};
const THROW_PROFILE_IDS = Object.keys(THROW_PROFILES);
const DEFAULT_THROW_PROFILE = 'intermediate';
const LIMBO_AIM_NUMBERS = [2, 3, 5];

function normalizeThrowProfileId(value) {
    const key = String(value || '').trim().toLowerCase();
    return THROW_PROFILES[key] ? key : DEFAULT_THROW_PROFILE;
}

function getThrowProfile(profileId) {
    return THROW_PROFILES[normalizeThrowProfileId(profileId)];
}

function pickWeighted(entries) {
    const total = entries.reduce((sum, e) => sum + Math.max(0, Number(e.weight) || 0), 0);
    if (total <= 0) return entries[0] && entries[0].value;
    let r = Math.random() * total;
    for (let i = 0; i < entries.length; i++) {
        r -= Math.max(0, Number(entries[i].weight) || 0);
        if (r <= 0) return entries[i].value;
    }
    return entries[entries.length - 1].value;
}

function wheelIndexForNumber(number) {
    return DARTBOARD_WHEEL.indexOf(Number(number));
}

function wheelNeighbor(number, steps) {
    const idx = wheelIndexForNumber(number);
    if (idx < 0) return null;
    const n = DARTBOARD_WHEEL.length;
    return DARTBOARD_WHEEL[(idx + steps + n * 10) % n];
}

function rollMultiplierFromProfile(profile, { allowTriple = true, allowDouble = true } = {}) {
    const single = Math.max(0, profile.mult.single);
    const double = allowDouble ? Math.max(0, profile.mult.double) : 0;
    const triple = allowTriple ? Math.max(0, profile.mult.triple) : 0;
    const pick = pickWeighted([
        { value: 1, weight: single },
        { value: 2, weight: double },
        { value: 3, weight: triple }
    ]);
    return pick === 3 && !allowTriple ? (allowDouble ? 2 : 1) : pick;
}

function randomBoardNumber(exclude) {
    const excludeSet = new Set((exclude || []).map(Number));
    const pool = DARTBOARD_WHEEL.filter((n) => !excludeSet.has(n));
    const list = pool.length ? pool : DARTBOARD_WHEEL;
    return list[Math.floor(Math.random() * list.length)];
}

function makeThrowSpec(number, multiplier, miss = false, sector = null) {
    if (miss) return { miss: true, number: null, multiplier: 1, sector: null };
    let mult = normalizeMultiplier(multiplier);
    if (number === 'bull' && mult > 2) mult = 2;
    return {
        miss: false,
        number,
        multiplier: mult,
        sector: sector != null ? String(sector) : null
    };
}

/** Roll a dart aimed at a wheel number (1–20) using a skill profile. */
function rollWheelAimThrow(aimNumber, profileId) {
    const profile = getThrowProfile(profileId);
    const aim = Number(aimNumber);
    if (!Number.isFinite(aim) || aim < 1 || aim > 20) {
        return makeThrowSpec(20, 1);
    }

    if (Math.random() < profile.hitNumber) {
        return makeThrowSpec(aim, rollMultiplierFromProfile(profile));
    }

    const missKind = pickWeighted([
        { value: 'adjacent', weight: profile.miss.adjacent },
        { value: 'twoAway', weight: profile.miss.twoAway },
        { value: 'elsewhere', weight: profile.miss.elsewhere },
        { value: 'bounce', weight: profile.miss.bounce }
    ]);

    if (missKind === 'bounce') return makeThrowSpec(null, 1, true);

    let landed = aim;
    if (missKind === 'adjacent') {
        landed = Math.random() < 0.5 ? wheelNeighbor(aim, -1) : wheelNeighbor(aim, 1);
    } else if (missKind === 'twoAway') {
        landed = Math.random() < 0.5 ? wheelNeighbor(aim, -2) : wheelNeighbor(aim, 2);
    } else {
        landed = randomBoardNumber([aim,
            wheelNeighbor(aim, -1), wheelNeighbor(aim, 1),
            wheelNeighbor(aim, -2), wheelNeighbor(aim, 2)]);
    }
    // Wrong number still uses profile mult mix (often singles)
    return makeThrowSpec(landed, rollMultiplierFromProfile(profile));
}

/** Aiming at bull (e.g. Cricket): hit bull or spray elsewhere / bounce. */
function rollBullAimThrow(profileId) {
    const profile = getThrowProfile(profileId);
    if (Math.random() < profile.hitNumber) {
        const mult = rollMultiplierFromProfile(profile, { allowTriple: false, allowDouble: true });
        return makeThrowSpec('bull', mult <= 1 ? 1 : 2, false, mult >= 2 ? 'Bull' : '25');
    }
    const missKind = pickWeighted([
        { value: 'elsewhere', weight: profile.miss.elsewhere + profile.miss.adjacent + profile.miss.twoAway },
        { value: 'bounce', weight: profile.miss.bounce }
    ]);
    if (missKind === 'bounce') return makeThrowSpec(null, 1, true);
    return makeThrowSpec(randomBoardNumber([]), rollMultiplierFromProfile(profile));
}

function rollQuackshotAimThrow(profileId) {
    const profile = getThrowProfile(profileId);
    const q = profile.quackshot;
    const zone = pickWeighted([
        { value: 'doubleBull', weight: q.doubleBull },
        { value: 'outerBull', weight: q.outerBull },
        { value: 'innerSingle', weight: q.innerSingle },
        { value: 'triple', weight: q.triple },
        { value: 'splash', weight: q.splash }
    ]);
    const n = Math.floor(Math.random() * 20) + 1;
    if (zone === 'doubleBull') return makeThrowSpec('bull', 2, false, 'Bull');
    if (zone === 'outerBull') return makeThrowSpec('bull', 1, false, '25');
    if (zone === 'innerSingle') return makeThrowSpec(n, 1, false, `s${n}`);
    if (zone === 'triple') return makeThrowSpec(n, 3, false, `T${n}`);
    // Splash: outer single / miss
    if (Math.random() < 0.35) return makeThrowSpec(null, 1, true);
    return makeThrowSpec(n, 1, false, `S${n}`);
}

/** Derby bot aim: knock near-winners / big leaders first, else self-boost. */
const DERBY_AIM_THREAT_WITHIN = 3; // ticks from finish (MAX 9 → threaten at 6+)
const DERBY_AIM_LEAD_GAP = 3; // opponent this many ticks ahead of us → hunt them

function resolveDerbyAimNumber(gameData) {
    const me = gameData && gameData.players && gameData.players[gameData.activeIdx];
    const myScore = me ? (Number(me.score) || 0) : 0;
    const myTarget = (me && me.targetNumber) || 20;
    const opponents = (gameData.players || []).filter((p, idx) =>
        p && idx !== gameData.activeIdx && !derbyPlayerFinished(p));

    // 1) About to win — highest score among those within N of the finish line
    const threatFloor = DERBY_MAX_TICKS - DERBY_AIM_THREAT_WITHIN;
    const threats = opponents
        .filter((p) => (Number(p.score) || 0) >= threatFloor && (Number(p.score) || 0) > 0)
        .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
    if (threats.length && threats[0].targetNumber) {
        return threats[0].targetNumber;
    }

    // 2) Too far ahead of us — biggest lead (≥ gap)
    const leaders = opponents
        .filter((p) => {
            const s = Number(p.score) || 0;
            return s > 0 && (s - myScore) >= DERBY_AIM_LEAD_GAP;
        })
        .sort((a, b) => {
            const leadA = (Number(a.score) || 0) - myScore;
            const leadB = (Number(b.score) || 0) - myScore;
            return leadB - leadA;
        });
    if (leaders.length && leaders[0].targetNumber) {
        return leaders[0].targetNumber;
    }

    // 3) Self-boost
    return myTarget;
}

function resolveDebugAimNumber(gameData, gameType) {
    if (!gameData) return 20;

    if (gameType === 'limbo') {
        return LIMBO_AIM_NUMBERS[Math.floor(Math.random() * LIMBO_AIM_NUMBERS.length)];
    }

    if (gameType === 'shanghai') {
        return shanghaiTargetNumber(gameData);
    }

    if (gameType === 'bangkok') {
        return bangkokTargetNumber(gameData);
    }

    if (gameType === 'derby') {
        return resolveDerbyAimNumber(gameData);
    }

    if (gameType === 'killer') {
        const p = gameData.players && gameData.players[gameData.activeIdx];
        if (p && p.isKiller) {
            const living = (gameData.players || []).filter((o, idx) =>
                o && idx !== gameData.activeIdx && !o.eliminated && (o.lives == null || o.lives > 0));
            if (living.length) {
                const victim = living[Math.floor(Math.random() * living.length)];
                return victim.targetNumber || 20;
            }
        }
        return (p && p.targetNumber) || 20;
    }

    if (gameType === 'cricket') {
        const p = gameData.players && gameData.players[gameData.activeIdx];
        const open = CRICKET_TARGETS.filter((t) => {
            const key = cricketTargetKey(t);
            return !p || !p.marks || (p.marks[key] || 0) < 3;
        });
        const pool = open.length ? open : CRICKET_TARGETS;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    if (gameType === 'demolition') {
        const idx = gameData.activeTurnIndex || 0;
        const score = Array.isArray(gameData.teamScores) ? Number(gameData.teamScores[idx]) : 0;
        if (score >= 1 && score <= 20) return score;
        return 20;
    }

    if (gameType === 'x01') {
        const p = gameData.players && gameData.players[gameData.activeIdx];
        const score = p ? Number(p.score) : 0;
        const dartOut = gameData.dartOut || 'none';
        if (dartOut === 'double' && score >= 2 && score <= 40 && score % 2 === 0) return score / 2;
        if (dartOut === 'double' && score === 50) return 'bull';
        if (dartOut === 'triple' && score >= 3 && score <= 60 && score % 3 === 0) return score / 3;
        if (dartOut === 'none' && score >= 1 && score <= 20) return score;
        return 20;
    }

    if (gameType === 'harperwins') {
        const active = gameData.players && gameData.players[gameData.activeIdx];
        if (active && !active.isHarper && Array.isArray(gameData.pattern)) {
            const target = resolveHarperWinsAimTarget(gameData);
            if (target && target.number != null && target.number !== 'bull') {
                return Number(target.number);
            }
            const nums = gameData.pattern
                .filter((d) => d && !d.free && !d.miss && d.number != null && d.number !== 'bull')
                .map((d) => Number(d.number))
                .filter((n) => n >= 1 && n <= 20);
            if (nums.length) return nums[Math.floor(Math.random() * nums.length)];
        }
        return 20;
    }

    // warmup, quick10, default
    return 20;
}

/**
 * Build a concrete throwSpec for TRIGGER_THROW using the selected skill profile.
 * Quackshot uses the inner-circle zone table; Harper Wins aims at pattern bed + mult.
 */
function buildProfiledThrowSpec(gameData, gameType, profileId) {
    if (gameType === 'quackshot') {
        return rollQuackshotAimThrow(profileId);
    }
    if (gameType === 'harperwins') {
        const target = resolveHarperWinsAimTarget(gameData);
        if (target && target.number != null) {
            return rollAimedSegmentThrow(target.number, target.multiplier, profileId);
        }
    }
    const aim = resolveDebugAimNumber(gameData, gameType);
    if (aim === 'bull') return rollBullAimThrow(profileId);
    return rollWheelAimThrow(aim, profileId);
}

/** Challenger bot: next pattern slot (or a random set bed) to chase. */
function resolveHarperWinsAimTarget(gameData) {
    const active = gameData && gameData.players && gameData.players[gameData.activeIdx];
    if (!active || active.isHarper || !Array.isArray(gameData.pattern)) return null;
    const pattern = gameData.pattern;
    const thrown = Array.isArray(active.visitDarts) ? active.visitDarts.length : 0;
    for (let i = thrown; i < HARPER_WINS_DARTS; i++) {
        const h = pattern[i];
        if (h && !h.free && !h.miss && h.number != null) {
            return { number: h.number, multiplier: normalizeMultiplier(h.multiplier) };
        }
    }
    const options = pattern.filter((d) => d && !d.free && !d.miss && d.number != null);
    if (!options.length) return null;
    const pick = options[Math.floor(Math.random() * options.length)];
    return { number: pick.number, multiplier: normalizeMultiplier(pick.multiplier) };
}

/** Hit aims at exact bed (number + mult); misses still scatter via profile. */
function rollAimedSegmentThrow(aimNumber, aimMultiplier, profileId) {
    const profile = getThrowProfile(profileId);
    const wantMult = normalizeMultiplier(aimMultiplier);
    if (aimNumber === 'bull') {
        if (Math.random() < profile.hitNumber) {
            return makeThrowSpec('bull', wantMult > 2 ? 2 : wantMult);
        }
        return rollBullAimThrow(profileId);
    }
    const aim = Number(aimNumber);
    if (!Number.isFinite(aim) || aim < 1 || aim > 20) {
        return makeThrowSpec(20, 1);
    }
    if (Math.random() < profile.hitNumber) {
        return makeThrowSpec(aim, wantMult);
    }
    return rollWheelAimThrow(aim, profileId);
}

function normalizeMultiplier(value) {
    const mult = Number(value);
    return mult === 2 ? 2 : mult === 3 ? 3 : 1;
}

function throwScoreFromTarget(number, multiplier) {
    if (number == null) return 0;
    let mult = normalizeMultiplier(multiplier);
    if (number === 'bull') {
        if (mult > 2) mult = 2;
        return 25 * mult;
    }
    const base = Number(number);
    if (!Number.isFinite(base) || base < 1 || base > 20) return 0;
    return base * mult;
}

function parseSpecificThrow(payload) {
    if (!payload || payload.type !== 'TRIGGER_SPECIFIC_THROW') return null;
    if (payload.miss) {
        return { miss: true, number: null, multiplier: 1, sector: null };
    }
    const number = payload.number === 'bull' ? 'bull' : Number(payload.number);
    if (number !== 'bull' && (!Number.isFinite(number) || number < 1 || number > 20)) {
        return null;
    }
    let multiplier = normalizeMultiplier(payload.multiplier);
    // No treble bull on a real board — double bull is the max
    if (number === 'bull' && multiplier > 2) multiplier = 2;
    return {
        number,
        multiplier,
        sector: payload.sector ? String(payload.sector) : null
    };
}

function dartboardHitFromSpec(throwSpec) {
    if (!throwSpec || throwSpec.miss || throwSpec.number === 'bull') return null;
    return throwSpec.number;
}

function normalizeAngle(deg) {
    let angle = deg % 360;
    if (angle < 0) angle += 360;
    return angle;
}

function angularDistance(a, b) {
    const diff = Math.abs(normalizeAngle(a) - normalizeAngle(b));
    return Math.min(diff, 360 - diff);
}

function wheelMidAngle(wheelIndex) {
    const slice = 360 / DARTBOARD_WHEEL.length;
    return wheelIndex * slice;
}

function generateDegreeSpacedTargets(count) {
    const targets = [];
    if (count <= 0) return targets;

    const slotStep = 360 / count;
    const offset = Math.random() * 360;
    const used = new Set();

    for (let i = 0; i < count; i++) {
        const slotAngle = normalizeAngle((i * slotStep) + offset);
        let bestIndex = -1;
        let bestDistance = Infinity;

        for (let wi = 0; wi < DARTBOARD_WHEEL.length; wi++) {
            if (used.has(wi)) continue;
            const dist = angularDistance(wheelMidAngle(wi), slotAngle);
            if (dist < bestDistance) {
                bestDistance = dist;
                bestIndex = wi;
            }
        }

        if (bestIndex < 0) break;
        used.add(bestIndex);
        targets.push(DARTBOARD_WHEEL[bestIndex]);
    }

    return targets;
}

function generateSymmetricTargets(count) {
    const targets = [];
    if (count <= 0) return targets;
    const startIndex = Math.floor(Math.random() * DARTBOARD_WHEEL.length);
    const step = DARTBOARD_WHEEL.length / count;
    for (let i = 0; i < count; i++) {
        const targetIndex = Math.floor(startIndex + (i * step)) % DARTBOARD_WHEEL.length;
        targets.push(DARTBOARD_WHEEL[targetIndex]);
    }
    return targets;
}

function clusterPlayersIntoTeams(playersList) {
    const teamSlots = Array.from({ length: DEMOLITION_MAX_LANES }, () => []);
    playersList.forEach((player, index) => {
        teamSlots[index % DEMOLITION_MAX_LANES].push(player);
    });
    return teamSlots.filter(team => team.length > 0);
}

function slimPlayer(p) {
    if (!p) return { id: null, name: '', avatar: null };
    const bot = parseBotFromName(p.name);
    const out = { id: p.id, name: p.name, avatar: p.avatar || null };
    if (bot.isBot) {
        out.isBot = true;
        out.botProfile = bot.botProfile;
    }
    return out;
}

/**
 * Hacky bot marker: name prefix "Bot/D ", "Bot/C ", "Bot/I ", or "Bot/A "
 * (Dummy / Casual / Intermediate / Advanced). Keeps the visible name as-is.
 */
function parseBotFromName(name) {
    const m = String(name || '').trim().match(/^bot\/([dcia])(?:\b|[\s:_-]+)/i);
    if (!m) return { isBot: false, botProfile: null };
    const map = { d: 'dummy', c: 'casual', i: 'intermediate', a: 'advanced' };
    return { isBot: true, botProfile: map[m[1].toLowerCase()] || DEFAULT_THROW_PROFILE };
}

/** Current person throwing (singles player, doubles thrower, demolition lane thrower, Quick10). */
function getActiveThrowerEntity(gameData, gameType) {
    if (!gameData) return null;
    if (gameType === 'quick10') return gameData.player || null;
    if (gameType === 'demolition') {
        const idx = gameData.activeTurnIndex;
        return demolitionCurrentThrower(gameData, idx)
            || (Array.isArray(gameData.teams) && gameData.teams[idx] && gameData.teams[idx][0])
            || null;
    }
    const idx = gameData.activeIdx;
    if (gameData.isDoublesLineup) {
        return doublesCurrentThrower(gameData, idx);
    }
    return (gameData.players || [])[idx] || null;
}

function makePhase(type, data = {}) {
    return { type, startedAt: Date.now(), data };
}

function killerRoundMultiplier(currentRound) {
    const round = Math.min(Math.max(currentRound || 1, 1), KILLER_MAX_ROUNDS);
    if (round >= 10) return 3;
    if (round >= 7) return 2;
    return 1;
}

/** Shared round-start takeover payload for round-based games. */
function roundAnnounceInfo(gameType, round) {
    const r = Math.max(1, Number(round) || 1);
    let maxRounds = null;
    let multiplier = 1;
    let eyebrow = 'NEW ROUND';
    let subtitle = '';

    if (gameType === 'quackshot') {
        maxRounds = QUACKSHOT_MAX_ROUNDS;
        multiplier = r >= QUACKSHOT_MAX_ROUNDS ? 2 : 1;
        eyebrow = 'CARNIVAL ROUND';
    } else if (gameType === 'killer') {
        maxRounds = KILLER_MAX_ROUNDS;
        multiplier = killerRoundMultiplier(r);
        eyebrow = 'CONTRACT ROUND';
    } else if (gameType === 'shanghai') {
        maxRounds = SHANGHAI_MAX_ROUNDS;
        eyebrow = 'SCROLL ROUND';
        subtitle = `AIM FOR ${r}`;
    } else if (gameType === 'bangkok') {
        maxRounds = BANGKOK_MAX_BEDS;
        eyebrow = 'NEXT BED';
        subtitle = `AIM FOR ${bangkokTargetForRound(r)}`;
    } else if (gameType === 'derby') {
        maxRounds = DERBY_MAX_ROUNDS;
        eyebrow = 'POST TIME';
    } else if (gameType === 'cricket') {
        eyebrow = 'NEXT OVER';
    }

    const isLast = maxRounds != null && r >= maxRounds;
    const tags = [];
    if (isLast) tags.push(gameType === 'derby' ? 'FINAL FURLONG' : 'FINAL ROUND');
    if (multiplier === 2) {
        tags.push(gameType === 'killer' ? 'DOUBLE MARKS' : 'DOUBLE POINTS');
    }
    if (multiplier === 3) {
        tags.push(gameType === 'killer' ? 'TRIPLE DAMAGE' : 'TRIPLE POINTS');
    }
    if (tags.length) {
        subtitle = subtitle ? `${tags.join(' · ')} · ${subtitle}` : tags.join(' · ');
    }

    return {
        gameType,
        round: r,
        maxRounds,
        multiplier,
        isLast: !!isLast,
        eyebrow,
        title: `ROUND ${r}`,
        subtitle,
        tags
    };
}

function makeRoundAnnouncePhase(gameType, round) {
    return makePhase('round_announce', roundAnnounceInfo(gameType, round));
}

function scheduleAfterRoundAnnounce(gameType) {
    return { delayMs: OVERLAY_ROUND_ANNOUNCE_MS, next: `${gameType}_after_round_announce` };
}

function finishWithOptionalRoundAnnounce(gameData, gameType, roundBumped) {
    gameData.lastThrow = null;
    if (roundBumped) {
        gameData.phase = makeRoundAnnouncePhase(gameType, gameData.currentRound);
        return { gameData, schedule: scheduleAfterRoundAnnounce(gameType) };
    }
    gameData.phase = makePhase('playing');
    return { gameData, schedule: null };
}

/** Round first (if wrapping), then next-player intermission. Used by all round-based games. */
function scheduleRoundThenNextPlayer(gameData, gameType, nextIdx, nextRound, wrapped, intermissionExtra = {}) {
    if (wrapped) {
        gameData.phase = makeRoundAnnouncePhase(gameType, nextRound);
        return {
            gameData,
            schedule: {
                delayMs: OVERLAY_ROUND_ANNOUNCE_MS,
                next: `${gameType}_show_next_after_round`,
                nextPlayerIndex: nextIdx,
                intermissionExtra
            }
        };
    }
    return showNextPlayerIntermission(gameData, gameType, nextIdx, intermissionExtra);
}

function showNextPlayerIntermission(gameData, gameType, nextIdx, intermissionExtra = {}) {
    const nextPlayer = gameData.players[nextIdx] || {};
    gameData.phase = makePhase('intermission', {
        nextPlayerIndex: nextIdx,
        nextPlayerName: doublesThrowerName(gameData, nextIdx),
        nextTeamName: doublesThrowerName(gameData, nextIdx),
        avatar: doublesThrowerAvatar(gameData, nextIdx),
        targetNumber: nextPlayer.targetNumber,
        ...intermissionExtra
    });
    return {
        gameData,
        schedule: { delayMs: OVERLAY_NEXT_PLAYER_MS, next: `${gameType}_advance_turn` }
    };
}

function shufflePlayers(players) {
    const shuffled = [...players];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = shuffled[i];
        shuffled[i] = shuffled[j];
        shuffled[j] = tmp;
    }
    return shuffled;
}

function initGameData(gameType, players, options = {}) {
    const isDoubles = options.lineupMode === 'doubles';

    // Doubles demolition: build teams from lineup (revert: remove this early return)
    if (gameType === 'demolition' && isDoubles) {
        const teams = buildDemolitionDoublesTeams(options.doublesTeams, players);
        const teamScores = teams.map(() => DEMOLITION_START);
        return {
            gameType: 'demolition',
            teams,
            teamScores,
            activeTurnIndex: 0,
            dartsThrownThisTurn: 0,
            roundInitialScores: [...teamScores],
            turnStartingScores: [...teamScores],
            teamsActedThisRound: teams.map(() => false),
            checkedOutThisRound: [],
            finishRoundMode: false,
            isPlayoff: false,
            isDoublesLineup: true,
            throwerIndices: teams.map(() => 0),
            phase: makePhase('playing'),
            helpVisible: false,
            lastThrow: null
        };
    }

    // Doubles for player-based games: each non-empty team = one scoring entity
    if (isDoubles && gameType !== 'warmup' && gameType !== 'quick10' && gameType !== 'harperwins' && gameType !== 'demolition') {
        const doublesBase = {
            activeIdx: 0,
            throwsThisTurn: 0,
            phase: makePhase('playing'),
            helpVisible: false,
            lastThrow: null
        };

        if (gameType === 'limbo') {
            const roster = buildDoublesPlayerRoster(options.doublesTeams, players, (base) => ({
                ...base,
                lives: 3
            }));
            return {
                gameType: 'limbo',
                ...roster,
                ...doublesBase,
                currentTargetBar: 60,
                currentRunningTotal: 0
            };
        }
        if (gameType === 'derby') {
            const roster = buildDoublesPlayerRoster(options.doublesTeams, players, (base) => ({
                ...base,
                score: 0,
                finished: false,
                targetNumber: 0
            }));
            const targets = generateSymmetricTargets(roster.players.length);
            roster.players.forEach((p, idx) => { p.targetNumber = targets[idx]; });
            return {
                gameType: 'derby',
                ...roster,
                ...doublesBase,
                currentRound: 1,
                finishLineOpen: false,
                phase: makeRoundAnnouncePhase('derby', 1)
            };
        }
        if (gameType === 'killer') {
            const roster = buildDoublesPlayerRoster(options.doublesTeams, players, (base) => ({
                ...base,
                targetNumber: 0,
                lives: KILLER_STARTING_LIVES,
                killerMarks: 0,
                isKiller: false
            }));
            const targets = generateDegreeSpacedTargets(roster.players.length);
            roster.players.forEach((p, idx) => { p.targetNumber = targets[idx]; });
            return {
                gameType: 'killer',
                ...roster,
                ...doublesBase,
                currentRound: 1,
                phase: makeRoundAnnouncePhase('killer', 1)
            };
        }
        if (gameType === 'quackshot') {
            const roster = buildDoublesPlayerRoster(options.doublesTeams, players, (base) => ({
                ...base,
                score: 0,
                bullseyes: 0
            }));
            return {
                gameType: 'quackshot',
                ...roster,
                ...doublesBase,
                currentRound: 1,
                phase: makeRoundAnnouncePhase('quackshot', 1)
            };
        }
        if (gameType === 'cricket') {
            const roster = buildDoublesPlayerRoster(
                options.doublesTeams,
                players,
                (base) => ({
                    ...base,
                    score: 0,
                    marks: cricketEmptyMarks()
                }),
                CRICKET_MAX_PLAYERS
            );
            return {
                gameType: 'cricket',
                ...roster,
                ...doublesBase,
                turnDarts: [],
                currentRound: 1,
                phase: makeRoundAnnouncePhase('cricket', 1)
            };
        }
        if (gameType === 'x01') {
            const roster = buildDoublesPlayerRoster(
                options.doublesTeams,
                players,
                (base) => ({
                    ...base,
                    score: X01_START_SCORE,
                    hasOpened: true
                }),
                X01_MAX_PLAYERS
            );
            return {
                gameType: 'x01',
                ...roster,
                ...doublesBase,
                turnDarts: [],
                turnStartingScore: X01_START_SCORE,
                startScore: X01_START_SCORE,
                dartIn: 'none',
                dartOut: 'none',
                currentRound: 1,
                phase: makePhase('setup')
            };
        }
        if (gameType === 'shanghai') {
            const roster = buildDoublesPlayerRoster(options.doublesTeams, players, (base) => ({
                ...base,
                score: 0,
                roundScores: shanghaiEmptyRoundScores()
            }));
            return {
                gameType: 'shanghai',
                ...roster,
                ...doublesBase,
                turnDarts: [],
                currentRound: 1,
                phase: makeRoundAnnouncePhase('shanghai', 1)
            };
        }
        if (gameType === 'bangkok') {
            const roster = buildDoublesPlayerRoster(options.doublesTeams, players, (base) => ({
                ...base,
                score: 0,
                bedScores: bangkokEmptyBedScores()
            }));
            return {
                gameType: 'bangkok',
                ...roster,
                ...doublesBase,
                turnDarts: [],
                currentRound: 1,
                phase: makeRoundAnnouncePhase('bangkok', 1)
            };
        }
    }

    const ordered = shufflePlayers(players || []);

    switch (gameType) {
        case 'demolition': {
            const teams = clusterPlayersIntoTeams(ordered);
            const teamScores = teams.map(() => DEMOLITION_START);
            return {
                gameType: 'demolition',
                teams: teams.map(team => team.map(slimPlayer)),
                teamScores,
                activeTurnIndex: 0,
                dartsThrownThisTurn: 0,
                roundInitialScores: [...teamScores],
                turnStartingScores: [...teamScores],
                teamsActedThisRound: teams.map(() => false),
                checkedOutThisRound: [],
                finishRoundMode: false,
                isPlayoff: false,
                isDoublesLineup: false,
                throwerIndices: teams.map(() => 0),
                phase: makePhase('playing'),
                helpVisible: false,
                lastThrow: null
            };
        }
        case 'limbo':
            return {
                gameType: 'limbo',
                players: ordered.map(p => ({ ...slimPlayer(p), lives: 3 })),
                activeIdx: 0,
                currentTargetBar: 60,
                currentRunningTotal: 0,
                throwsThisTurn: 0,
                isDoublesLineup: false,
                throwerIndices: ordered.map(() => 0),
                phase: makePhase('playing'),
                helpVisible: false,
                lastThrow: null
            };
        case 'derby': {
            const targets = generateSymmetricTargets(ordered.length);
            return {
                gameType: 'derby',
                players: ordered.map((p, idx) => ({
                    ...slimPlayer(p),
                    score: 0,
                    finished: false,
                    targetNumber: targets[idx]
                })),
                activeIdx: 0,
                throwsThisTurn: 0,
                currentRound: 1,
                finishLineOpen: false,
                isDoublesLineup: false,
                throwerIndices: ordered.map(() => 0),
                phase: makeRoundAnnouncePhase('derby', 1),
                helpVisible: false,
                lastThrow: null
            };
        }
        case 'killer': {
            const targets = generateDegreeSpacedTargets(ordered.length);
            return {
                gameType: 'killer',
                players: ordered.map((p, idx) => ({
                    ...slimPlayer(p),
                    targetNumber: targets[idx],
                    lives: KILLER_STARTING_LIVES,
                    killerMarks: 0,
                    isKiller: false
                })),
                activeIdx: 0,
                throwsThisTurn: 0,
                currentRound: 1,
                isDoublesLineup: false,
                throwerIndices: ordered.map(() => 0),
                phase: makeRoundAnnouncePhase('killer', 1),
                helpVisible: false,
                lastThrow: null
            };
        }
        case 'quackshot':
            return {
                gameType: 'quackshot',
                players: ordered.map(p => ({
                    ...slimPlayer(p),
                    score: 0,
                    bullseyes: 0
                })),
                activeIdx: 0,
                throwsThisTurn: 0,
                currentRound: 1,
                isDoublesLineup: false,
                throwerIndices: ordered.map(() => 0),
                phase: makeRoundAnnouncePhase('quackshot', 1),
                lastThrow: null,
                helpVisible: false
            };
        case 'cricket': {
            const roster = ordered.slice(0, CRICKET_MAX_PLAYERS);
            return {
                gameType: 'cricket',
                players: roster.map(p => ({
                    ...slimPlayer(p),
                    score: 0,
                    marks: cricketEmptyMarks()
                })),
                activeIdx: 0,
                throwsThisTurn: 0,
                turnDarts: [],
                currentRound: 1,
                isDoublesLineup: false,
                throwerIndices: roster.map(() => 0),
                phase: makeRoundAnnouncePhase('cricket', 1),
                helpVisible: false,
                lastThrow: null
            };
        }
        case 'x01': {
            const roster = ordered.slice(0, X01_MAX_PLAYERS);
            return {
                gameType: 'x01',
                players: roster.map(p => ({
                    ...slimPlayer(p),
                    score: X01_START_SCORE,
                    hasOpened: true
                })),
                activeIdx: 0,
                throwsThisTurn: 0,
                turnDarts: [],
                turnStartingScore: X01_START_SCORE,
                startScore: X01_START_SCORE,
                dartIn: 'none',
                dartOut: 'none',
                currentRound: 1,
                isDoublesLineup: false,
                throwerIndices: roster.map(() => 0),
                phase: makePhase('setup'),
                helpVisible: false,
                lastThrow: null
            };
        }
        case 'shanghai':
            return {
                gameType: 'shanghai',
                players: ordered.map(p => ({
                    ...slimPlayer(p),
                    score: 0,
                    roundScores: shanghaiEmptyRoundScores()
                })),
                activeIdx: 0,
                throwsThisTurn: 0,
                turnDarts: [],
                currentRound: 1,
                isDoublesLineup: false,
                throwerIndices: ordered.map(() => 0),
                phase: makeRoundAnnouncePhase('shanghai', 1),
                helpVisible: false,
                lastThrow: null
            };
        case 'bangkok':
            return {
                gameType: 'bangkok',
                players: ordered.map(p => ({
                    ...slimPlayer(p),
                    score: 0,
                    bedScores: bangkokEmptyBedScores()
                })),
                activeIdx: 0,
                throwsThisTurn: 0,
                turnDarts: [],
                currentRound: 1,
                isDoublesLineup: false,
                throwerIndices: ordered.map(() => 0),
                phase: makeRoundAnnouncePhase('bangkok', 1),
                helpVisible: false,
                lastThrow: null
            };
        case 'warmup':
            return {
                gameType: 'warmup',
                throwsThisTurn: 0,
                turnDarts: [],
                visitHistory: [],
                visitCount: 0,
                phase: makePhase('playing'),
                helpVisible: false,
                lastThrow: null
            };
        case 'quick10': {
            const candidates = (players || []).map(slimPlayer).filter((p) => p && p.id);
            const single = candidates.length === 1 ? candidates[0] : null;
            return {
                gameType: 'quick10',
                candidates,
                player: single,
                throwsThisTurn: 0,
                turnDarts: [],
                roundHistory: [],
                currentRound: 1,
                totalScore: 0,
                usedDebug: false,
                usedCorrection: false,
                leaderboardVisible: false,
                readyToPersist: false,
                persisted: false,
                phase: single
                    ? makePhase('playing')
                    : makePhase('pick_player', { candidates }),
                helpVisible: false,
                lastThrow: null
            };
        }
        case 'harperwins':
            return initHarperWinsGameData(players);
        default:
            return null;
    }
}

/* --- Shared doubles lineup helpers (revert: remove this block + isDoublesLineup/throwerIndices usage) --- */
const DOUBLES_MAX_TEAMS = 6;

function buildDoublesTeams(doublesTeams, players, maxTeams = DOUBLES_MAX_TEAMS) {
    const byId = new Map();
    (players || []).forEach(p => {
        if (p && p.id) byId.set(p.id, slimPlayer(p));
    });
    const teams = [];
    (doublesTeams || []).forEach(slots => {
        const members = [];
        (slots || []).forEach(id => {
            if (id && byId.has(id)) members.push(byId.get(id));
        });
        if (members.length > 0) teams.push(members);
    });
    return teams.slice(0, maxTeams);
}

/** Members for a team lane (demolition teams[]) or player entity (.members). */
function doublesMembersAt(gameData, idx) {
    if (gameData.teams && gameData.teams[idx]) return gameData.teams[idx];
    const p = gameData.players && gameData.players[idx];
    if (!p) return [];
    if (gameData.isDoublesLineup && Array.isArray(p.members) && p.members.length) return p.members;
    return [{ id: p.id, name: p.name, avatar: p.avatar || null }];
}

function doublesMembersOf(playerOrMembers) {
    if (Array.isArray(playerOrMembers)) return playerOrMembers;
    if (!playerOrMembers) return [];
    if (Array.isArray(playerOrMembers.members) && playerOrMembers.members.length) {
        return playerOrMembers.members;
    }
    return [{
        id: playerOrMembers.id,
        name: playerOrMembers.name,
        avatar: playerOrMembers.avatar || null
    }];
}

function doublesDisplayName(members) {
    const list = doublesMembersOf(members);
    if (!list.length) return 'PLAYER';
    if (list.length === 1) return list[0].name;
    return list.map(m => m.name).join(' & ');
}

function doublesEnsureThrowerIndices(gameData) {
    const n = gameData.teams
        ? gameData.teams.length
        : (gameData.players || []).length;
    if (!Array.isArray(gameData.throwerIndices) || gameData.throwerIndices.length !== n) {
        gameData.throwerIndices = Array.from({ length: n }, () => 0);
    }
}

function doublesCurrentThrower(gameData, idx) {
    const members = doublesMembersAt(gameData, idx);
    if (!members.length) return null;
    doublesEnsureThrowerIndices(gameData);
    const ti = gameData.throwerIndices[idx] % members.length;
    return members[ti];
}

function doublesThrowerName(gameData, idx) {
    const thrower = doublesCurrentThrower(gameData, idx);
    if (thrower) return thrower.name;
    const members = doublesMembersAt(gameData, idx);
    return doublesDisplayName(members);
}

function doublesThrowerAvatar(gameData, idx) {
    const thrower = doublesCurrentThrower(gameData, idx);
    return thrower ? (thrower.avatar || null) : null;
}

/** Advance departing team only when the next turn begins (not before intermission). */
function doublesAdvanceThrowerAfterVisit(gameData, idx) {
    if (!gameData.isDoublesLineup) return;
    const members = doublesMembersAt(gameData, idx);
    if (members.length <= 1) return;
    doublesEnsureThrowerIndices(gameData);
    gameData.throwerIndices[idx] = (gameData.throwerIndices[idx] + 1) % members.length;
}

function doublesWinnerFields(player) {
    const members = doublesMembersOf(player);
    return {
        winnerId: player.id,
        winnerName: doublesDisplayName(members),
        avatar: members[0] ? members[0].avatar : (player.avatar || null),
        members,
        avatars: members.map(m => m.avatar || null)
    };
}

function doublesContenderFields(player) {
    const members = doublesMembersOf(player);
    return {
        id: player.id,
        name: doublesDisplayName(members),
        avatar: members[0] ? members[0].avatar : (player.avatar || null),
        members,
        score: player.score || 0
    };
}

/** Build players[] where each doubles team is one scoring entity. */
function buildDoublesPlayerRoster(doublesTeams, players, enrichFn, maxTeams = DOUBLES_MAX_TEAMS) {
    const teams = buildDoublesTeams(doublesTeams, players, maxTeams);
    return {
        players: teams.map(members => {
            const base = { ...slimPlayer(members[0]), members: members.map(m => slimPlayer(m)) };
            return enrichFn ? enrichFn(base, members) : base;
        }),
        isDoublesLineup: true,
        throwerIndices: teams.map(() => 0)
    };
}

/* Demolition wrappers (keep call sites stable) */
function buildDemolitionDoublesTeams(doublesTeams, players) {
    return buildDoublesTeams(doublesTeams, players, DEMOLITION_MAX_LANES);
}

function demolitionEnsureThrowerIndices(gameData) {
    doublesEnsureThrowerIndices(gameData);
}

function demolitionCurrentThrower(gameData, teamIdx) {
    return doublesCurrentThrower(gameData, teamIdx);
}

/** Singles-style lane label (TEAM N when clustered). */
function demolitionTeamLabel(teams, index) {
    const team = teams[index];
    if (!team || !team.length) return 'PLAYER';
    return team.length > 1 ? `TEAM ${index + 1}` : team[0].name;
}

function demolitionTeamDisplayName(teams, index) {
    return doublesDisplayName(teams[index]);
}

function demolitionThrowerName(gameData, teamIdx) {
    const thrower = doublesCurrentThrower(gameData, teamIdx);
    if (thrower) return thrower.name;
    return demolitionTeamLabel(gameData.teams, teamIdx);
}

function demolitionThrowerAvatar(gameData, teamIdx) {
    return doublesThrowerAvatar(gameData, teamIdx);
}

function demolitionAdvanceThrowerAfterVisit(gameData, teamIdx) {
    doublesAdvanceThrowerAfterVisit(gameData, teamIdx);
}

function demolitionWinnerName(gameData, teamIdx) {
    if (gameData.isDoublesLineup) return demolitionTeamDisplayName(gameData.teams, teamIdx);
    return demolitionTeamLabel(gameData.teams, teamIdx);
}

function demolitionContenderName(gameData, teams, index) {
    if (gameData.isDoublesLineup) return doublesDisplayName(teams[index]);
    return demolitionTeamLabel(teams, index);
}

function demolitionWinnerMembers(gameData, teamIdx) {
    return doublesMembersAt(gameData, teamIdx);
}
/* --- end shared / demolition doubles helpers --- */

function demolitionMarkTurnActed(gameData, idx) {
    if (!gameData.teamsActedThisRound) {
        gameData.teamsActedThisRound = gameData.teamScores.map(() => false);
    }
    gameData.teamsActedThisRound[idx] = true;
}

function demolitionNextPendingIndex(gameData, fromIdx) {
    const n = gameData.teamScores.length;
    for (let step = 1; step <= n; step++) {
        const i = (fromIdx + step) % n;
        if (gameData.teamsActedThisRound[i]) continue;
        if (gameData.teamScores[i] <= 0) continue;
        return i;
    }
    return -1;
}

function demolitionBeginTurnAt(gameData, idx) {
    gameData.activeTurnIndex = idx;
    gameData.dartsThrownThisTurn = 0;
    gameData.roundInitialScores[idx] = gameData.teamScores[idx];
    gameData.turnStartingScores[idx] = gameData.teamScores[idx];
    gameData.phase = makePhase('playing');
    gameData.lastThrow = null;
}

function demolitionScheduleNextTurn(gameData, fromIdx, delayMs) {
    demolitionMarkTurnActed(gameData, fromIdx);

    if (gameData.finishRoundMode) {
        const nextIdx = demolitionNextPendingIndex(gameData, fromIdx);
        if (nextIdx < 0) {
            return {
                gameData,
                schedule: { delayMs, next: 'demolition_resolve_round' }
            };
        }
        // Wait for brick disappear anim before showing next-player overlay
        if (delayMs > 0) {
            return {
                gameData,
                schedule: { delayMs, next: 'demolition_show_intermission' }
            };
        }
        gameData.phase = makePhase('intermission', {
            nextTeamIndex: nextIdx,
            nextTeamName: demolitionThrowerName(gameData, nextIdx),
            avatar: demolitionThrowerAvatar(gameData, nextIdx)
        });
        return {
            gameData,
            schedule: { delayMs: OVERLAY_NEXT_PLAYER_MS, next: 'demolition_advance_turn' }
        };
    }

    if (gameData.teamsActedThisRound.every(Boolean)) {
        gameData.teamsActedThisRound = gameData.teamScores.map(() => false);
        gameData.checkedOutThisRound = [];
    }

    const nextIdx = (fromIdx + 1) % gameData.teamScores.length;
    if (delayMs > 0) {
        return {
            gameData,
            schedule: { delayMs, next: 'demolition_show_intermission' }
        };
    }
    gameData.phase = makePhase('intermission', {
        nextTeamIndex: nextIdx,
        nextTeamName: demolitionThrowerName(gameData, nextIdx),
        avatar: demolitionThrowerAvatar(gameData, nextIdx)
    });
    return {
        gameData,
        schedule: { delayMs: OVERLAY_NEXT_PLAYER_MS, next: 'demolition_advance_turn' }
    };
}

function demolitionAdvanceTurn(gameData) {
    const from = gameData.activeTurnIndex;
    let nextIdx;

    if (gameData.finishRoundMode) {
        nextIdx = demolitionNextPendingIndex(gameData, from);
        if (nextIdx < 0) {
            return;
        }
    } else {
        nextIdx = (from + 1) % gameData.teamScores.length;
    }

    // Doubles: rotate departing team so their next visit uses the other member
    demolitionAdvanceThrowerAfterVisit(gameData, from);
    demolitionBeginTurnAt(gameData, nextIdx);
}

function demolitionResolveRound(gameData) {
    const checked = gameData.checkedOutThisRound || [];

    if (checked.length <= 1) {
        const idx = checked.length === 1 ? checked[0] : gameData.activeTurnIndex;
        const members = demolitionWinnerMembers(gameData, idx);
        gameData.phase = makePhase('winner', {
            teamIndex: idx,
            winnerName: demolitionWinnerName(gameData, idx),
            avatar: members[0] ? members[0].avatar : null,
            members,
            avatars: members.map(m => m.avatar || null)
        });
        gameData.finishRoundMode = false;
        return { gameData, schedule: null };
    }

    const playoffTeams = checked.map(i => gameData.teams[i]);
    gameData.teams = playoffTeams;
    gameData.teamScores = playoffTeams.map(() => DEMOLITION_PLAYOFF_START);
    gameData.roundInitialScores = [...gameData.teamScores];
    gameData.turnStartingScores = [...gameData.teamScores];
    gameData.teamsActedThisRound = gameData.teamScores.map(() => false);
    gameData.checkedOutThisRound = [];
    gameData.finishRoundMode = false;
    gameData.isPlayoff = true;
    gameData.activeTurnIndex = 0;
    gameData.dartsThrownThisTurn = 0;
    gameData.lastThrow = null;
    gameData.throwerIndices = playoffTeams.map(() => 0);
    gameData.phase = makePhase('playoff', {
        contenderNames: playoffTeams.map((_, i) => demolitionContenderName(gameData, playoffTeams, i)),
        startScore: DEMOLITION_PLAYOFF_START
    });
    return {
        gameData,
        schedule: { delayMs: OVERLAY_EVENT_MS, next: 'demolition_start_playoff' }
    };
}

function handleDemolitionThrow(gameData, throwSpec = null) {
    if (gameData.phase.type !== 'playing') {
        return { gameData, schedule: null };
    }

    const idx = gameData.activeTurnIndex;
    // Already checked out — wait for brick anim + overlay schedule
    if (gameData.teamScores[idx] === 0) {
        return { gameData, schedule: null };
    }
    let currentScore = gameData.teamScores[idx];
    let totalTurnScore = 0;
    let rolledNumber = null;
    let rolledMultiplier = 1;
    let rolledMiss = false;

    if (throwSpec) {
        rolledMiss = !!throwSpec.miss;
        if (throwSpec.miss) {
            totalTurnScore = 0;
        } else {
            rolledNumber = throwSpec.number;
            rolledMultiplier = throwSpec.multiplier;
            totalTurnScore = throwScoreFromTarget(throwSpec.number, throwSpec.multiplier);
        }
    } else if (currentScore <= 20 && Math.random() < 0.33) {
        // Exact checkout helper — no discrete sector to report
        totalTurnScore = currentScore;
    } else {
        rolledNumber = Math.floor(Math.random() * 20) + 1;
        const modifierChance = Math.random() * 100;
        rolledMultiplier = 1;
        if (modifierChance < 15) rolledMultiplier = 3;
        else if (modifierChance < 35) rolledMultiplier = 2;
        totalTurnScore = rolledNumber * rolledMultiplier;
    }

    const scoreBeforeThrow = currentScore;
    gameData.dartsThrownThisTurn++;
    gameData.lastThrow = {
        score: totalTurnScore,
        bust: false,
        checkout: false,
        miss: rolledMiss,
        number: rolledNumber,
        multiplier: rolledMultiplier
    };

    if (currentScore - totalTurnScore < 0) {
        gameData.teamScores[idx] = gameData.roundInitialScores[idx];
        gameData.lastThrow.bust = true;
        const teamName = demolitionThrowerName(gameData, idx);
        gameData.phase = makePhase('bust', {
            teamIndex: idx,
            teamName,
            avatar: demolitionThrowerAvatar(gameData, idx)
        });
        return {
            gameData,
            schedule: { delayMs: OVERLAY_EVENT_MS, next: 'demolition_after_bust' }
        };
    }

    gameData.teamScores[idx] = currentScore - totalTurnScore;

    // Brick wait = this dart's actual score drop (not turnStartingScores — that can go
    // stale if another dart lands before demolition_sync_turn_baseline runs).
    const bricksRemoved = Math.max(0, scoreBeforeThrow - gameData.teamScores[idx]);
    const calculatedStaggerDuration = (bricksRemoved * DEMOLITION_STAGGER * 1000) + 250;
    const animDelay = Math.max(700, calculatedStaggerDuration + 200);

    if (gameData.teamScores[idx] === 0) {
        gameData.lastThrow.checkout = true;
        if (!Array.isArray(gameData.checkedOutThisRound)) gameData.checkedOutThisRound = [];
        if (!gameData.checkedOutThisRound.includes(idx)) {
            gameData.checkedOutThisRound.push(idx);
        }
        gameData.finishRoundMode = true;
        demolitionMarkTurnActed(gameData, idx);
        // Thrower rotation deferred to after_checkout so overlay still shows who checked out

        // Keep phase playing so bricks can animate to zero first, then TVM (if any) → checkout
        return {
            gameData,
            schedule: { delayMs: animDelay, next: 'demolition_show_tvm' }
        };
    }

    // Keep turnStartingScores at the pre-throw value so the viewer can stagger
    // this dart's brick removal. Sync the baseline after the anim completes.
    if (gameData.dartsThrownThisTurn >= 3) {
        return demolitionScheduleNextTurn(gameData, idx, animDelay);
    }

    return {
        gameData,
        schedule: { delayMs: animDelay, next: 'demolition_sync_turn_baseline' }
    };
}

function limboNextAliveIndex(players, fromIdx) {
    let idx = fromIdx;
    let loops = 0;
    do {
        idx = (idx + 1) % players.length;
        loops++;
    } while (players[idx].lives <= 0 && loops < players.length);
    return idx;
}

function limboAliveCount(players) {
    return players.filter(p => p.lives > 0).length;
}

function limboBeginTurn(gameData) {
    gameData.throwsThisTurn = 0;
    gameData.currentRunningTotal = 0;
    gameData.phase = makePhase('playing');
    gameData.lastThrow = null;
}

function limboApplyLifeLoss(gameData, player) {
    const bar = gameData.currentTargetBar;
    if (gameData.currentRunningTotal > bar) {
        gameData.currentRunningTotal = bar;
        gameData.lastThrow.hitBar = true;
    }
    const livesBefore = player.lives;
    player.lives--;
    gameData.lastThrow.lifeLost = true;
    const throwerName = doublesThrowerName(gameData, gameData.activeIdx);
    const throwerAvatar = doublesThrowerAvatar(gameData, gameData.activeIdx);
    gameData.phase = makePhase('life_loss', {
        playerId: player.id,
        playerName: throwerName,
        avatar: throwerAvatar,
        livesBefore,
        eliminated: livesBefore - 1 === 0,
        members: doublesMembersAt(gameData, gameData.activeIdx)
    });

    if (limboAliveCount(gameData.players) === 1) {
        const winner = gameData.players.find(p => p.lives > 0);
        return {
            gameData,
            schedule: { delayMs: OVERLAY_EVENT_MS, next: 'limbo_winner', winnerId: winner.id }
        };
    }

    return {
        gameData,
        schedule: { delayMs: OVERLAY_EVENT_MS, next: 'limbo_after_life_loss' }
    };
}

function handleLimboThrow(gameData, throwSpec = null) {
    if (gameData.phase.type !== 'playing') {
        return { gameData, schedule: null };
    }

    const player = gameData.players[gameData.activeIdx];
    if (!player || player.lives <= 0) {
        return { gameData, schedule: null };
    }

    const randomScore = throwSpec
        ? (throwSpec.miss ? 25 : throwScoreFromTarget(throwSpec.number, throwSpec.multiplier))
        : Math.floor(Math.random() * 20) + 1;
    gameData.currentRunningTotal += randomScore;
    gameData.throwsThisTurn++;
    gameData.lastThrow = {
        score: randomScore,
        hitBar: false,
        lifeLost: false,
        miss: !!(throwSpec && throwSpec.miss),
        number: throwSpec ? (throwSpec.miss ? null : throwSpec.number) : null,
        multiplier: throwSpec && !throwSpec.miss ? throwSpec.multiplier : 1
    };

    const bar = gameData.currentTargetBar;
    const remaining = 3 - gameData.throwsThisTurn;
    // Must finish all 3 darts at or under the bar (min 1 per remaining dart).
    // Bust now if already over, or if remaining darts make that impossible.
    if (gameData.currentRunningTotal > bar || gameData.currentRunningTotal + remaining > bar) {
        return limboApplyLifeLoss(gameData, player);
    }

    if (gameData.throwsThisTurn < 3) {
        return { gameData, schedule: null };
    }

    // Full visit complete — total is guaranteed <= bar
    const throwerName = doublesThrowerName(gameData, gameData.activeIdx);
    const throwerAvatar = doublesThrowerAvatar(gameData, gameData.activeIdx);

    if (gameData.currentRunningTotal === bar) {
        gameData.lastThrow.matchedBar = true;
        gameData.phase = makePhase('bar_status', {
            playerId: player.id,
            playerName: throwerName,
            avatar: throwerAvatar,
            mode: 'hold',
            headline: `${throwerName} Matched The Bar!`,
            badge: `BAR HOLDS: ${bar}`,
            barValue: bar
        });
        return {
            gameData,
            schedule: { delayMs: OVERLAY_EVENT_MS, next: 'limbo_after_bar' }
        };
    }

    gameData.currentTargetBar = gameData.currentRunningTotal;
    gameData.phase = makePhase('bar_status', {
        playerId: player.id,
        playerName: throwerName,
        avatar: throwerAvatar,
        mode: 'clear',
        headline: `${throwerName} Cleared The Bar!`,
        badge: `BAR LOWERED TO: ${gameData.currentTargetBar}`,
        barValue: gameData.currentTargetBar
    });
    return {
        gameData,
        schedule: { delayMs: OVERLAY_EVENT_MS, next: 'limbo_after_bar' }
    };
}

function derbyPlayersAtFinish(gameData) {
    return (gameData.players || []).filter(p => (p.score || 0) >= DERBY_MAX_TICKS);
}

function derbyLeaders(gameData) {
    let best = -1;
    (gameData.players || []).forEach(p => {
        best = Math.max(best, p.score || 0);
    });
    return (gameData.players || []).filter(p => (p.score || 0) === best);
}

function derbyWinner(gameData, winner = null) {
    const champ = winner || derbyLeaders(gameData)[0] || gameData.players[0];
    gameData.phase = makePhase('winner', doublesWinnerFields(champ));
}

function derbyDraw(gameData, contenders) {
    const list = (contenders || []).map(p => doublesContenderFields(p));
    gameData.phase = makePhase('draw', {
        contenders: list,
        names: list.map(p => p.name)
    });
}

function derbyResolveMatch(gameData) {
    const finishers = derbyPlayersAtFinish(gameData);
    if (finishers.length >= 2) {
        derbyDraw(gameData, finishers);
        return { gameData, schedule: null };
    }
    if (finishers.length === 1) {
        derbyWinner(gameData, finishers[0]);
        return { gameData, schedule: null };
    }

    const leaders = derbyLeaders(gameData);
    if (leaders.length >= 2) {
        derbyDraw(gameData, leaders);
        return { gameData, schedule: null };
    }
    derbyWinner(gameData, leaders[0] || gameData.players[0]);
    return { gameData, schedule: null };
}

function derbyPlayerFinished(player) {
    return !!(player && (player.finished || (player.score || 0) >= DERBY_MAX_TICKS));
}

function derbyPastPostPhase(player) {
    return makePhase('past_post', {
        playerId: player.id,
        playerName: player.name,
        avatar: player.avatar,
        targetNumber: player.targetNumber
    });
}

function derbyMarkFinishIfNeeded(gameData, player) {
    if ((player.score || 0) < DERBY_MAX_TICKS) return false;
    player.score = DERBY_MAX_TICKS;
    gameData.finishLineOpen = true;
    if (player.finished) return false;
    player.finished = true;
    return true;
}

function derbyScheduleAfterPastPost(gameData) {
    return {
        gameData,
        schedule: { delayMs: OVERLAY_EVENT_MS, next: 'derby_after_past_post' }
    };
}

function derbyShowPastPost(gameData, player) {
    gameData.pendingPastPost = null;
    gameData.phase = derbyPastPostPhase(player);
    return derbyScheduleAfterPastPost(gameData);
}

const DERBY_BOOST_QUIPS = [
    'Full Gallop!',
    'Thundering Ahead!',
    'Stretch Drive!',
    'On The Rail!',
    'Lightning Strides!'
];
const DERBY_KNOCK_QUIPS = [
    'Boxed In!',
    'Checked Hard!',
    'Lost A Length!',
    'Reined In!',
    'Fallen Back!'
];
const DERBY_KNOCK_SINGLE_QUIPS = [
    'Nicked!',
    'Tapped Back!',
    'One Length!',
    'Slight Check!',
    'Eased Off!'
];

function pickDerbyQuip(list) {
    return list[Math.floor(Math.random() * list.length)];
}

function derbyMultOverlayPhase(selfHit, hitPlayer, actor, multiplier) {
    const quipList = selfHit
        ? DERBY_BOOST_QUIPS
        : (multiplier === 1 ? DERBY_KNOCK_SINGLE_QUIPS : DERBY_KNOCK_QUIPS);
    return makePhase(selfHit ? 'mult_boost' : 'mult_knock', {
        playerName: hitPlayer.name,
        avatar: hitPlayer.avatar,
        actorName: actor.name,
        multiplier,
        steps: multiplier,
        quip: pickDerbyQuip(quipList),
        selfHit,
        targetNumber: hitPlayer.targetNumber
    });
}

function derbyContinueAfterThrow(gameData) {
    if (gameData.throwsThisTurn === 3) {
        let nextIdx = gameData.activeIdx + 1;
        let nextRound = gameData.currentRound;
        let wrapped = false;
        if (nextIdx >= gameData.players.length) {
            nextIdx = 0;
            nextRound++;
            wrapped = true;
        }

        // First past the post: finish the current rotation so trailing horses can catch up.
        // Also resolve when all 8 rounds are done.
        if (nextRound > DERBY_MAX_ROUNDS || (gameData.finishLineOpen && wrapped)) {
            gameData.phase = makePhase('playing');
            return {
                gameData,
                schedule: { delayMs: 900, next: 'derby_resolve_match' }
            };
        }

        return scheduleRoundThenNextPlayer(gameData, 'derby', nextIdx, nextRound, wrapped);
    }

    gameData.phase = makePhase('playing');
    return { gameData, schedule: null };
}

function handleDerbyThrow(gameData, throwSpec = null) {
    if (gameData.phase.type !== 'playing' || gameData.currentRound > 8) {
        return { gameData, schedule: null };
    }

    gameData.throwsThisTurn++;
    const currentPlayer = gameData.players[gameData.activeIdx];
    gameData.lastThrow = { hit: false, selfHit: false, multiplier: 1 };
    gameData.pendingPastPost = null;

    let hitPlayer = null;
    let multiplier = 1;
    let selfHit = false;
    let newlyFinished = false;
    let scoredKnock = false;

    if (throwSpec) {
        const hitNumber = dartboardHitFromSpec(throwSpec);
        if (hitNumber !== null) {
            // Always record the board hit for callouts — even if no horse owns that number
            multiplier = Number(throwSpec.multiplier) || 1;
            gameData.lastThrow.number = hitNumber;
            gameData.lastThrow.multiplier = multiplier;
            if (throwSpec.sector) gameData.lastThrow.sector = throwSpec.sector;

            const rolledIndex = gameData.players.findIndex(p => p.targetNumber === hitNumber);
            if (rolledIndex >= 0) {
                hitPlayer = gameData.players[rolledIndex];
                selfHit = rolledIndex === gameData.activeIdx;
                gameData.lastThrow.hit = true;
                gameData.lastThrow.selfHit = selfHit;
                gameData.lastThrow.hitPlayerName = hitPlayer.name;

                if (selfHit) {
                    currentPlayer.score = (currentPlayer.score || 0) + multiplier;
                    newlyFinished = derbyMarkFinishIfNeeded(gameData, currentPlayer);
                } else if (derbyPlayerFinished(hitPlayer)) {
                    // Finished horses can't be sent backwards
                    gameData.lastThrow.immune = true;
                } else {
                    const before = hitPlayer.score || 0;
                    // Already at the gate — knock is a no-op, skip overlay
                    if (before > 0) {
                        hitPlayer.score = Math.max(0, before - multiplier);
                        scoredKnock = true;
                    }
                }
            }
        } else if (throwSpec.miss) {
            // True board miss / bounce
            gameData.lastThrow.miss = true;
        } else if (throwSpec.number === 'bull') {
            // Bull is never a horse number — no race effect, but announce BULL/25 not MISS
            multiplier = Number(throwSpec.multiplier) || 1;
            gameData.lastThrow.miss = false;
            gameData.lastThrow.hit = false;
            gameData.lastThrow.number = 'bull';
            gameData.lastThrow.multiplier = multiplier;
            if (throwSpec.sector) gameData.lastThrow.sector = throwSpec.sector;
        } else {
            gameData.lastThrow.miss = true;
        }
    } else if (Math.random() < 0.60) {
        const rolledIndex = Math.floor(Math.random() * gameData.players.length);
        hitPlayer = gameData.players[rolledIndex];
        const randMult = Math.random();
        multiplier = 1;
        if (randMult > 0.70 && randMult <= 0.90) multiplier = 2;
        if (randMult > 0.90) multiplier = 3;
        selfHit = rolledIndex === gameData.activeIdx;
        gameData.lastThrow.hit = true;
        gameData.lastThrow.multiplier = multiplier;
        gameData.lastThrow.number = hitPlayer.targetNumber;
        gameData.lastThrow.selfHit = selfHit;
        gameData.lastThrow.hitPlayerName = hitPlayer.name;

        if (selfHit) {
            currentPlayer.score = (currentPlayer.score || 0) + multiplier;
            newlyFinished = derbyMarkFinishIfNeeded(gameData, currentPlayer);
        } else if (derbyPlayerFinished(hitPlayer)) {
            gameData.lastThrow.immune = true;
        } else {
            const before = hitPlayer.score || 0;
            if (before > 0) {
                hitPlayer.score = Math.max(0, before - multiplier);
                scoredKnock = true;
            }
        }
    } else {
        // Random path: no horse effect → treat as board miss for callout
        gameData.lastThrow.miss = true;
    }

    if (newlyFinished) {
        gameData.pendingPastPost = {
            playerId: currentPlayer.id,
            playerName: currentPlayer.name,
            avatar: currentPlayer.avatar,
            targetNumber: currentPlayer.targetNumber
        };
    }

    if (selfHit && multiplier >= 2) {
        gameData.phase = derbyMultOverlayPhase(true, currentPlayer, currentPlayer, multiplier);
        return {
            gameData,
            schedule: { delayMs: OVERLAY_EVENT_MS, next: 'derby_after_mult' }
        };
    }

    if (scoredKnock) {
        gameData.phase = derbyMultOverlayPhase(false, hitPlayer, currentPlayer, multiplier);
        return {
            gameData,
            schedule: { delayMs: OVERLAY_EVENT_MS, next: 'derby_after_mult' }
        };
    }

    if (newlyFinished) {
        return derbyShowPastPost(gameData, currentPlayer);
    }

    return derbyContinueAfterThrow(gameData);
}

function killerAlivePlayers(players) {
    return players.filter(p => p.lives >= 0);
}

function killerNextAliveIndex(players, fromIdx) {
    let idx = fromIdx;
    let loops = 0;
    do {
        idx = (idx + 1) % players.length;
        loops++;
    } while (players[idx].lives < 0 && loops < players.length);
    return idx;
}

function killerAdvanceTurn(gameData) {
    // Round announce (if any) already played before intermission.
    gameData.throwsThisTurn = 0;
    const prevIdx = gameData.activeIdx;
    doublesAdvanceThrowerAfterVisit(gameData, prevIdx);
    gameData.activeIdx = killerNextAliveIndex(gameData.players, gameData.activeIdx);
    if (gameData.activeIdx <= prevIdx && gameData.currentRound < KILLER_MAX_ROUNDS) {
        gameData.currentRound++;
    }
    gameData.lastThrow = null;
    gameData.phase = makePhase('playing');
    return { gameData, schedule: null };
}

function killerIsWrapping(gameData, nextIdx) {
    return nextIdx <= gameData.activeIdx;
}

function killerWouldBumpRound(gameData, nextIdx) {
    return killerIsWrapping(gameData, nextIdx) && gameData.currentRound < KILLER_MAX_ROUNDS;
}

/** Wedge fill on the board (0–3). Civilians use marks; Killers sit at 3. */
function killerWedgeCount(player) {
    if (!player || player.lives < 0) return 0;
    if (player.isKiller) return KILLER_MARKS_TO_QUALIFY;
    const marks = Number(player.killerMarks);
    if (Number.isFinite(marks) && marks > 0) return Math.min(KILLER_MARKS_TO_QUALIFY, marks);
    // Untouched civilians start with lives=3 but 0 wedges — don't count starting HP as wedges.
    return 0;
}

/**
 * After round 12 completes:
 * - sole Killer wins
 * - multiple Killers → co-winners
 * - no Killers → most wedges; tied wedges → co-winners
 */
function killerResolveMatch(gameData) {
    const alive = killerAlivePlayers(gameData.players);
    if (alive.length === 1) {
        gameData.phase = makePhase('winner', {
            ...doublesWinnerFields(alive[0]),
            reason: 'last_standing'
        });
        return { gameData, schedule: null };
    }
    if (alive.length === 0) {
        gameData.phase = makePhase('draw', {
            contenders: [],
            reason: 'rounds'
        });
        return { gameData, schedule: null };
    }

    const killers = alive.filter(p => !!p.isKiller);
    if (killers.length === 1) {
        gameData.phase = makePhase('winner', {
            ...doublesWinnerFields(killers[0]),
            reason: 'sole_killer'
        });
        return { gameData, schedule: null };
    }
    if (killers.length > 1) {
        gameData.phase = makePhase('draw', {
            contenders: killers.map(p => doublesContenderFields(p)),
            reason: 'killers'
        });
        return { gameData, schedule: null };
    }

    let bestWedges = -1;
    alive.forEach(p => {
        bestWedges = Math.max(bestWedges, killerWedgeCount(p));
    });
    const top = alive.filter(p => killerWedgeCount(p) === bestWedges);
    if (top.length === 1) {
        gameData.phase = makePhase('winner', {
            ...doublesWinnerFields(top[0]),
            reason: 'wedges',
            wedges: bestWedges
        });
        return { gameData, schedule: null };
    }
    gameData.phase = makePhase('draw', {
        contenders: top.map(p => doublesContenderFields(p)),
        reason: 'wedges',
        wedges: bestWedges
    });
    return { gameData, schedule: null };
}

function killerShowIntermission(gameData) {
    const nextIdx = killerNextAliveIndex(gameData.players, gameData.activeIdx);
    const wrapping = killerIsWrapping(gameData, nextIdx);

    // Finished the last round — don't keep looping on round 12.
    if (wrapping && (gameData.currentRound || 1) >= KILLER_MAX_ROUNDS) {
        return killerResolveMatch(gameData);
    }

    const wouldBump = killerWouldBumpRound(gameData, nextIdx);
    const nextRound = (gameData.currentRound || 1) + (wouldBump ? 1 : 0);

    // Solo survivor: no next-player card — still announce a new round when wrapping.
    if (nextIdx === gameData.activeIdx) {
        if (wouldBump) {
            gameData.phase = makeRoundAnnouncePhase('killer', nextRound);
            return {
                gameData,
                schedule: { delayMs: OVERLAY_ROUND_ANNOUNCE_MS, next: 'killer_advance_turn' }
            };
        }
        return killerAdvanceTurn(gameData);
    }

    return scheduleRoundThenNextPlayer(
        gameData,
        'killer',
        nextIdx,
        nextRound,
        wouldBump,
        { targetNumber: gameData.players[nextIdx].targetNumber }
    );
}

function killerCheckWinner(gameData) {
    const alive = killerAlivePlayers(gameData.players);
    if (alive.length === 1) {
        const winner = alive[0];
        gameData.phase = makePhase('winner', doublesWinnerFields(winner));
        return true;
    }
    return false;
}

/** Must match public/games/killer.html wedge flash timing. */
const KILLER_WEDGE_ANIM_MS = 900;
const KILLER_WEDGE_ANIM_TAIL_MS = 150;
/** On-screen takeover hold when Viewer Video is on (wedge wait is added separately). Clip must finish first. */
const KILLER_VIDEO_BECAME_MS = 5500;  // became-charon.mp4 ~5.0s
const KILLER_VIDEO_LOST_MS = 5200;    // lost-excommunicado.mp4 ~4.4s
const KILLER_VIDEO_DEATH_MS = 5500;   // elim-skyfall-take-the-shot.mp4 ~4.8s

function killerWedgeAnimWaitMs(gameData) {
    const last = gameData && gameData.lastThrow;
    if (!last) return 0;
    let count = 0;
    if (last.effect === 'mark' && Array.isArray(last.markSegments)) {
        count = last.markSegments.length;
    } else if (last.effect === 'strike' && Array.isArray(last.strikeSegments)) {
        count = last.strikeSegments.length;
    } else if (last.effect === 'mark' || last.effect === 'strike') {
        count = Math.max(1, last.multiplier || 1);
    }
    if (count <= 0) return 0;
    return (count * KILLER_WEDGE_ANIM_MS) + KILLER_WEDGE_ANIM_TAIL_MS;
}

/** Full event overlay hold = board wedge anim + on-screen takeover time. */
function killerOverlayDelayMs(gameData) {
    return killerWedgeAnimWaitMs(gameData) + OVERLAY_EVENT_MS;
}

function killerScheduleAfterOverlay(gameData, delayMs, opts) {
    const next = gameData.throwsThisTurn >= 3 ? 'killer_show_intermission' : 'killer_resume_playing';
    return {
        gameData,
        schedule: Object.assign({ delayMs, next }, opts || {})
    };
}

const KILLER_BOOST_QUIPS = [
    'Double Tap!',
    'Marked Cold!',
    'Closing In!',
    'Dead Eye!',
    'On Target!'
];
const KILLER_KNOCK_QUIPS = [
    'Cut Deep!',
    'Bleed Out!',
    'Wounded!',
    'Hit Confirmed!',
    'Softened Up!'
];

function pickKillerQuip(list) {
    return list[Math.floor(Math.random() * list.length)];
}

function killerContinueAfterThrow(gameData) {
    if (gameData.throwsThisTurn >= 3) {
        return {
            gameData,
            schedule: { delayMs: 600, next: 'killer_show_intermission' }
        };
    }
    gameData.phase = makePhase('playing');
    return { gameData, schedule: null };
}

// Rounds 1-6: 1x, 7-9: 2x, 10-12: 3x (matches the right-side rounds tracker)
function handleKillerThrow(gameData, throwSpec = null) {
    if (gameData.phase.type !== 'playing') {
        return { gameData, schedule: null };
    }

    const player = gameData.players[gameData.activeIdx];
    if (!player || player.lives < 0) {
        return { gameData, schedule: null };
    }

    gameData.throwsThisTurn++;
    const hitNumber = throwSpec
        ? dartboardHitFromSpec(throwSpec)
        : (Math.random() < 0.65
            ? DARTBOARD_WHEEL[Math.floor(Math.random() * DARTBOARD_WHEEL.length)]
            : null);

    const dartMultiplier = throwSpec
        ? throwSpec.multiplier
        : (Math.random() < 0.12 ? 3 : Math.random() < 0.28 ? 2 : 1);
    const roundMultiplier = killerRoundMultiplier(gameData.currentRound);
    const multiplier = dartMultiplier * roundMultiplier;
    const trueMultHit = dartMultiplier >= 2;
    const isBullHit = !!(throwSpec && !throwSpec.miss && throwSpec.number === 'bull');

    gameData.lastThrow = {
        hitNumber,
        effect: 'miss',
        // Bull isn't a wedge — no Killer effect, but callout must say BULL not MISS
        miss: hitNumber === null && !isBullHit,
        number: throwSpec
            ? (throwSpec.miss ? null : throwSpec.number)
            : hitNumber,
        multiplier,
        dartMultiplier,
        roundMultiplier
    };
    if (throwSpec && throwSpec.sector) gameData.lastThrow.sector = throwSpec.sector;

    let becameKiller = false;
    let lostKiller = false;
    let eliminated = false;
    let victim = null;
    let marksGained = 0;
    let marksLost = 0;

    if (hitNumber !== null && !player.isKiller && hitNumber === player.targetNumber) {
        const marksBefore = player.killerMarks;
        player.killerMarks = Math.min(
            KILLER_MARKS_TO_QUALIFY,
            player.killerMarks + multiplier
        );
        marksGained = player.killerMarks - marksBefore;
        const markSegments = [];
        for (let s = marksBefore; s < player.killerMarks; s++) {
            markSegments.push(s);
        }
        gameData.lastThrow.effect = 'mark';
        gameData.lastThrow.playerId = player.id;
        gameData.lastThrow.markSegments = markSegments;
        if (player.killerMarks >= KILLER_MARKS_TO_QUALIFY) {
            player.isKiller = true;
            player.lives = player.killerMarks;
            becameKiller = true;
        }
    } else if (hitNumber !== null && player.isKiller) {
        victim = gameData.players.find(p => (
            p.id !== player.id && p.lives >= 0 && p.targetNumber === hitNumber
        ));
        if (victim) {
            const strikeSegments = [];
            const mult = multiplier;
            const wasKiller = !!victim.isKiller;

            if (victim.isKiller) {
                const livesBefore = victim.lives;
                victim.lives -= mult;
                marksLost = Math.min(livesBefore, mult);
                const filledBefore = Math.max(0, Math.min(SEGMENTS_PER_NUMBER, livesBefore));
                const filledAfter = Math.max(0, Math.min(SEGMENTS_PER_NUMBER, victim.lives));
                for (let s = filledBefore - 1; s >= filledAfter; s--) {
                    strikeSegments.push(s);
                }
                if (victim.lives >= 0 && victim.lives < KILLER_MARKS_TO_QUALIFY) {
                    victim.isKiller = false;
                    victim.killerMarks = Math.max(0, victim.lives);
                    lostKiller = wasKiller;
                }
            } else if (victim.killerMarks > 0) {
                const marksBefore = victim.killerMarks;
                victim.killerMarks = Math.max(0, victim.killerMarks - mult);
                marksLost = marksBefore - victim.killerMarks;
                for (let s = marksBefore - 1; s >= victim.killerMarks; s--) {
                    strikeSegments.push(s);
                }
                // Exact clear leaves them empty for a follow-up kill;
                // overkill (e.g. 1 mark vs double) finishes them now.
                if (mult > marksBefore) {
                    victim.killerMarks = 0;
                    victim.lives = -1;
                } else {
                    victim.lives = victim.killerMarks;
                }
            } else {
                // Already empty — kill with no wedge flash
                victim.lives = -1;
            }

            eliminated = victim.lives < 0;
            gameData.lastThrow.effect = 'strike';
            gameData.lastThrow.victimId = victim.id;
            gameData.lastThrow.strikeSegments = strikeSegments;
            gameData.lastThrow.strikeSegment = strikeSegments.length
                ? strikeSegments[0]
                : null;
        }
    }

    if (becameKiller) {
        gameData.phase = makePhase('became_killer', {
            playerId: player.id,
            playerName: player.name,
            avatar: player.avatar,
            targetNumber: player.targetNumber
        });
        if (killerCheckWinner(gameData)) return { gameData, schedule: null };
        return killerScheduleAfterOverlay(gameData, killerOverlayDelayMs(gameData), {
            delayMsWithVideo: killerWedgeAnimWaitMs(gameData) + KILLER_VIDEO_BECAME_MS
        });
    }

    if (eliminated && victim) {
        gameData.phase = makePhase('death', {
            attackerId: player.id,
            attackerName: player.name,
            victimId: victim.id,
            victimName: victim.name,
            victimAvatar: victim.avatar,
            hitNumber
        });
        return {
            gameData,
            schedule: {
                delayMs: killerOverlayDelayMs(gameData),
                delayMsWithVideo: killerWedgeAnimWaitMs(gameData) + KILLER_VIDEO_DEATH_MS,
                next: 'killer_after_elimination'
            }
        };
    }

    if (lostKiller && victim) {
        gameData.phase = makePhase('lost_killer', {
            playerId: victim.id,
            playerName: victim.name,
            avatar: victim.avatar,
            attackerName: player.name,
            targetNumber: victim.targetNumber,
            livesRemaining: victim.lives
        });
        if (killerCheckWinner(gameData)) return { gameData, schedule: null };
        return killerScheduleAfterOverlay(gameData, killerOverlayDelayMs(gameData), {
            delayMsWithVideo: killerWedgeAnimWaitMs(gameData) + KILLER_VIDEO_LOST_MS
        });
    }

    if (trueMultHit && gameData.lastThrow.effect === 'mark' && marksGained > 0) {
        gameData.phase = makePhase('mult_boost', {
            playerName: player.name,
            avatar: player.avatar,
            multiplier: dartMultiplier,
            steps: marksGained,
            quip: pickKillerQuip(KILLER_BOOST_QUIPS),
            targetNumber: player.targetNumber
        });
        return killerScheduleAfterOverlay(gameData, killerOverlayDelayMs(gameData));
    }

    if (trueMultHit && gameData.lastThrow.effect === 'strike' && victim) {
        gameData.phase = makePhase('mult_knock', {
            playerName: victim.name,
            avatar: victim.avatar,
            actorName: player.name,
            multiplier: dartMultiplier,
            steps: Math.max(1, marksLost),
            quip: pickKillerQuip(KILLER_KNOCK_QUIPS),
            targetNumber: victim.targetNumber
        });
        if (killerCheckWinner(gameData)) return { gameData, schedule: null };
        return killerScheduleAfterOverlay(gameData, killerOverlayDelayMs(gameData));
    }

    if (killerCheckWinner(gameData)) return { gameData, schedule: null };
    return killerContinueAfterThrow(gameData);
}

/* ========== QUACKSHOT ========== */

function resolveQuackshotHit(throwSpec) {
    // Scoring:
    //   Bull (inner / double bull) → +3
    //   25 (outer bull) → +2
    //   s# (inner single, between treble & bull) → +1
    //   T# (triple) → −2
    //   anything else (S#, D#, miss) → −1
    if (throwSpec && throwSpec.miss) {
        return { zone: 'miss', points: -1, bullseye: false, label: '−1', title: 'Splash!' };
    }

    if (!throwSpec) {
        const roll = Math.random();
        if (roll < 0.03) return { zone: 'double_bull', points: 3, bullseye: true, label: '+3', title: 'Double Bullseye!' };
        if (roll < 0.09) return { zone: 'bull', points: 2, bullseye: true, label: '+2', title: 'Outer Bull!' };
        if (roll < 0.19) return { zone: 'triple', points: -2, bullseye: false, label: '−2', title: 'Ring of Fire!' };
        if (roll < 0.39) return { zone: 'board', points: -1, bullseye: false, label: '−1', title: 'Splash!' };
        return { zone: 'inner_single', points: 1, bullseye: false, label: '+1', title: null };
    }

    const sector = throwSpec.sector ? String(throwSpec.sector) : null;

    if (sector === 'Bull' || (throwSpec.number === 'bull' && throwSpec.multiplier >= 2)) {
        return { zone: 'double_bull', points: 3, bullseye: true, label: '+3', title: 'Double Bullseye!' };
    }
    if (sector === '25' || (throwSpec.number === 'bull' && throwSpec.multiplier === 1)) {
        return { zone: 'bull', points: 2, bullseye: true, label: '+2', title: 'Outer Bull!' };
    }
    // Inner single (between treble & bull): Scolia/OpenDarts use sN; Autodarts uses bed→sN
    if (
        (sector && /^s(20|1[0-9]|[1-9])$/.test(sector))
        || (sector && /singleinner/i.test(sector))
    ) {
        return { zone: 'inner_single', points: 1, bullseye: false, label: '+1', title: null };
    }
    if (throwSpec.multiplier === 3 || (sector && /^T(20|1[0-9]|[1-9])$/.test(sector))) {
        return { zone: 'triple', points: -2, bullseye: false, label: '−2', title: 'Ring of Fire!' };
    }
    return { zone: 'board', points: -1, bullseye: false, label: '−1', title: 'Splash!' };
}

function quackshotRoundMultiplier(gameData) {
    return (gameData.currentRound || 1) >= QUACKSHOT_MAX_ROUNDS ? 2 : 1;
}

function quackshotAdvanceTurn(gameData) {
    doublesAdvanceThrowerAfterVisit(gameData, gameData.activeIdx);
    gameData.throwsThisTurn = 0;
    gameData.activeIdx++;
    if (gameData.activeIdx >= gameData.players.length) {
        gameData.activeIdx = 0;
        gameData.currentRound++;
    }
    gameData.lastThrow = null;
    gameData.phase = makePhase('playing');
    return { gameData, schedule: null };
}

function quackshotResolveMatch(gameData) {
    const players = gameData.players || [];
    let bestScore = -Infinity;
    players.forEach(p => {
        bestScore = Math.max(bestScore, p.score || 0);
    });

    const pool = players.filter(p => (p.score || 0) === bestScore);

    if (pool.length > 1) {
        gameData.phase = makePhase('draw', {
            contenders: pool.map(p => doublesContenderFields(p)),
            reason: 'score'
        });
        return { gameData, schedule: null };
    }

    const champ = pool[0] || players[0];
    gameData.phase = makePhase('winner', {
        ...doublesWinnerFields(champ),
        reason: 'score'
    });
    return { gameData, schedule: null };
}

function quackshotContinueAfterThrow(gameData) {
    if (gameData.throwsThisTurn < 3) {
        gameData.phase = makePhase('playing');
        return { gameData, schedule: null };
    }

    let nextIdx = gameData.activeIdx + 1;
    let nextRound = gameData.currentRound;
    let wrapped = false;
    if (nextIdx >= gameData.players.length) {
        nextIdx = 0;
        nextRound++;
        wrapped = true;
    }

    if (nextRound > QUACKSHOT_MAX_ROUNDS) {
        gameData.phase = makePhase('playing');
        return {
            gameData,
            schedule: { delayMs: 600, next: 'quackshot_resolve_match' }
        };
    }

    return scheduleRoundThenNextPlayer(gameData, 'quackshot', nextIdx, nextRound, wrapped);
}

function handleQuackshotThrow(gameData, throwSpec = null) {
    if (gameData.phase.type !== 'playing') {
        return { gameData, schedule: null };
    }

    const player = gameData.players[gameData.activeIdx];
    if (!player) return { gameData, schedule: null };

    const hit = resolveQuackshotHit(throwSpec);
    const roundMult = quackshotRoundMultiplier(gameData);
    const awarded = hit.points * roundMult;
    gameData.throwsThisTurn++;
    player.score = (player.score || 0) + awarded;
    if (hit.bullseye) {
        player.bullseyes = (player.bullseyes || 0) + 1;
    }

    const label = roundMult > 1
        ? `${hit.label} ×2`
        : hit.label;

    gameData.lastThrow = {
        points: awarded,
        basePoints: hit.points,
        roundMultiplier: roundMult,
        zone: hit.zone,
        label,
        bullseye: !!hit.bullseye,
        playerId: player.id,
        playerName: player.name,
        number: throwSpec && !throwSpec.miss ? throwSpec.number : (hit.bullseye ? 'bull' : null),
        multiplier: throwSpec && !throwSpec.miss ? throwSpec.multiplier : 1,
        sector: throwSpec && throwSpec.sector ? throwSpec.sector : null
    };

    if (hit.bullseye) {
        gameData.phase = makePhase('bullseye', {
            playerName: player.name,
            avatar: player.avatar,
            bullseyes: player.bullseyes,
            zone: hit.zone,
            points: awarded,
            label,
            title: hit.title || (hit.zone === 'bull' ? 'Outer Bull!' : 'Double Bullseye!'),
            winning: false
        });
        return {
            gameData,
            schedule: { delayMs: OVERLAY_EVENT_MS, next: 'quackshot_after_hit' }
        };
    }

    /* +1 inner single: score only, no transition (default hit) */
    if (hit.zone === 'triple') {
        gameData.phase = makePhase('zone_hit', {
            playerName: player.name,
            avatar: player.avatar,
            zone: hit.zone,
            points: awarded,
            label,
            title: hit.title || 'Ring of Fire!'
        });
        return {
            gameData,
            schedule: { delayMs: OVERLAY_EVENT_MS, next: 'quackshot_after_hit' }
        };
    }

    // board / miss → −1 Splash overlay, then continue
    if (hit.zone === 'board' || hit.zone === 'miss') {
        gameData.phase = makePhase('splash', {
            playerName: player.name,
            avatar: player.avatar,
            zone: hit.zone,
            points: awarded,
            label,
            title: hit.title || 'Splash!'
        });
        return {
            gameData,
            schedule: { delayMs: OVERLAY_EVENT_MS, next: 'quackshot_after_hit' }
        };
    }

    return quackshotContinueAfterThrow(gameData);
}

/* ========== SHANGHAI ========== */

function shanghaiEmptyRoundScores() {
    return Array.from({ length: SHANGHAI_MAX_ROUNDS }, () => null);
}

function shanghaiTargetNumber(gameData) {
    const round = Math.min(Math.max(gameData.currentRound || 1, 1), SHANGHAI_MAX_ROUNDS);
    return round;
}

function shanghaiMultChar(multiplier) {
    return multiplier === 3 ? 'T' : multiplier === 2 ? 'D' : 'S';
}

function shanghaiMakeDart(throwSpec, targetNumber) {
    if (throwSpec) {
        if (throwSpec.miss || throwSpec.number == null || throwSpec.number === 'bull') {
            return {
                label: throwSpec.miss ? 'MISS' : (throwSpec.number === 'bull' ? 'BULL' : '—'),
                mult: null,
                points: 0,
                hit: false,
                number: throwSpec.miss ? null : throwSpec.number,
                multiplier: 1
            };
        }
        const number = Number(throwSpec.number);
        const multiplier = normalizeMultiplier(throwSpec.multiplier);
        const hit = number === targetNumber;
        const points = hit ? throwScoreFromTarget(number, multiplier) : 0;
        return {
            label: String(number),
            mult: shanghaiMultChar(multiplier),
            points,
            hit,
            number,
            multiplier
        };
    }

    // Debug / generic throw: bias toward the live target so playtests score often
    if (Math.random() < 0.12) {
        return { label: 'MISS', mult: null, points: 0, hit: false, number: null, multiplier: 1 };
    }
    const hitTarget = Math.random() < 0.55;
    const number = hitTarget ? targetNumber : (Math.floor(Math.random() * 20) + 1);
    const roll = Math.random();
    let multiplier = 1;
    if (roll > 0.82) multiplier = 3;
    else if (roll > 0.62) multiplier = 2;
    const hit = number === targetNumber;
    const points = hit ? throwScoreFromTarget(number, multiplier) : 0;
    return {
        label: String(number),
        mult: shanghaiMultChar(multiplier),
        points,
        hit,
        number,
        multiplier
    };
}

function shanghaiPushTurnDart(gameData, dart) {
    if (!Array.isArray(gameData.turnDarts)) gameData.turnDarts = [];
    gameData.turnDarts.push({
        label: dart.hit ? `${dart.mult || 'S'}${dart.label}` : (dart.label === 'MISS' ? 'MISS' : dart.label),
        mult: dart.hit ? dart.mult : null,
        points: dart.points || 0,
        hit: !!dart.hit
    });
    if (gameData.turnDarts.length > 3) {
        gameData.turnDarts = gameData.turnDarts.slice(-3);
    }
}

function shanghaiAdvanceTurn(gameData) {
    doublesAdvanceThrowerAfterVisit(gameData, gameData.activeIdx);
    gameData.throwsThisTurn = 0;
    gameData.turnDarts = [];
    gameData.activeIdx++;
    if (gameData.activeIdx >= gameData.players.length) {
        gameData.activeIdx = 0;
        gameData.currentRound++;
    }
    gameData.lastThrow = null;
    gameData.phase = makePhase('playing');
    return { gameData, schedule: null };
}

function shanghaiResolveMatch(gameData) {
    const players = gameData.players || [];
    let bestScore = -Infinity;
    players.forEach(p => {
        bestScore = Math.max(bestScore, p.score || 0);
    });

    const pool = players.filter(p => (p.score || 0) === bestScore);

    if (pool.length > 1) {
        gameData.phase = makePhase('draw', {
            contenders: pool.map(p => doublesContenderFields(p)),
            reason: 'score'
        });
        return { gameData, schedule: null };
    }

    const champ = pool[0] || players[0];
    gameData.phase = makePhase('winner', {
        ...doublesWinnerFields(champ),
        reason: 'score',
        score: champ ? (champ.score || 0) : 0,
        rounds: SHANGHAI_MAX_ROUNDS
    });
    return { gameData, schedule: null };
}

function shanghaiContinueAfterThrow(gameData) {
    if (gameData.throwsThisTurn < 3) {
        gameData.phase = makePhase('playing');
        return { gameData, schedule: null };
    }

    let nextIdx = gameData.activeIdx + 1;
    let nextRound = gameData.currentRound;
    let wrapped = false;
    if (nextIdx >= gameData.players.length) {
        nextIdx = 0;
        nextRound++;
        wrapped = true;
    }

    if (nextRound > SHANGHAI_MAX_ROUNDS) {
        gameData.phase = makePhase('playing');
        return {
            gameData,
            schedule: { delayMs: 600, next: 'shanghai_resolve_match' }
        };
    }

    return scheduleRoundThenNextPlayer(
        gameData,
        'shanghai',
        nextIdx,
        nextRound,
        wrapped,
        { targetNumber: Math.min(nextRound, SHANGHAI_MAX_ROUNDS) }
    );
}

function handleShanghaiThrow(gameData, throwSpec = null) {
    if (gameData.phase.type !== 'playing') {
        return { gameData, schedule: null };
    }
    if ((gameData.throwsThisTurn || 0) >= 3) {
        return { gameData, schedule: null };
    }

    const player = gameData.players[gameData.activeIdx];
    if (!player) return { gameData, schedule: null };

    const targetNumber = shanghaiTargetNumber(gameData);
    const dart = shanghaiMakeDart(throwSpec, targetNumber);

    gameData.throwsThisTurn = (gameData.throwsThisTurn || 0) + 1;
    shanghaiPushTurnDart(gameData, dart);

    if (!Array.isArray(player.roundScores) || player.roundScores.length !== SHANGHAI_MAX_ROUNDS) {
        player.roundScores = shanghaiEmptyRoundScores();
    }
    const roundIdx = targetNumber - 1;
    const prior = player.roundScores[roundIdx];
    const roundTotal = (prior == null ? 0 : prior) + (dart.points || 0);
    player.roundScores[roundIdx] = roundTotal;
    player.score = (player.score || 0) + (dart.points || 0);

    const label = dart.hit
        ? `+${dart.points}`
        : (dart.label === 'MISS' ? 'MISS' : dart.label);

    gameData.lastThrow = {
        points: dart.points || 0,
        hit: !!dart.hit,
        label,
        playerId: player.id,
        playerName: doublesThrowerName(gameData, gameData.activeIdx),
        number: dart.number,
        multiplier: dart.multiplier,
        targetNumber,
        sector: throwSpec && throwSpec.sector ? throwSpec.sector : null
    };

    return shanghaiContinueAfterThrow(gameData);
}

/* ========== BANGKOK ========== */
/* 20→1 beds, 6 darts each (120 darts solo). Marks on the live bed: S=1 D=2 T=3. */

function bangkokEmptyBedScores() {
    return Array.from({ length: BANGKOK_MAX_BEDS }, () => null);
}

function bangkokTargetForRound(round) {
    const r = Math.min(Math.max(Number(round) || 1, 1), BANGKOK_MAX_BEDS);
    return 21 - r;
}

function bangkokTargetNumber(gameData) {
    return bangkokTargetForRound(gameData && gameData.currentRound);
}

function bangkokBedIndex(gameData) {
    const round = Math.min(Math.max(gameData.currentRound || 1, 1), BANGKOK_MAX_BEDS);
    return round - 1;
}

function bangkokMultChar(multiplier) {
    return multiplier === 3 ? 'T' : multiplier === 2 ? 'D' : 'S';
}

function bangkokMakeDart(throwSpec, targetNumber) {
    if (throwSpec) {
        if (throwSpec.miss || throwSpec.number == null || throwSpec.number === 'bull') {
            return {
                label: throwSpec.miss ? 'MISS' : (throwSpec.number === 'bull' ? 'BULL' : '—'),
                mult: null,
                points: 0,
                hit: false,
                number: throwSpec.miss ? null : throwSpec.number,
                multiplier: 1
            };
        }
        const number = Number(throwSpec.number);
        const multiplier = normalizeMultiplier(throwSpec.multiplier);
        const hit = number === targetNumber;
        const points = hit ? multiplier : 0; // marks, not dartboard score
        return {
            label: String(number),
            mult: bangkokMultChar(multiplier),
            points,
            hit,
            number,
            multiplier
        };
    }

    if (Math.random() < 0.12) {
        return { label: 'MISS', mult: null, points: 0, hit: false, number: null, multiplier: 1 };
    }
    const hitTarget = Math.random() < 0.55;
    const number = hitTarget ? targetNumber : (Math.floor(Math.random() * 20) + 1);
    const roll = Math.random();
    let multiplier = 1;
    if (roll > 0.82) multiplier = 3;
    else if (roll > 0.62) multiplier = 2;
    const hit = number === targetNumber;
    const points = hit ? multiplier : 0;
    return {
        label: String(number),
        mult: bangkokMultChar(multiplier),
        points,
        hit,
        number,
        multiplier
    };
}

function bangkokPushTurnDart(gameData, dart) {
    if (!Array.isArray(gameData.turnDarts)) gameData.turnDarts = [];
    gameData.turnDarts.push({
        label: dart.hit ? `${dart.mult || 'S'}${dart.label}` : 'MISS',
        mult: dart.hit ? dart.mult : null,
        points: dart.points || 0,
        hit: !!dart.hit
    });
    if (gameData.turnDarts.length > BANGKOK_DARTS_PER_BED) {
        gameData.turnDarts = gameData.turnDarts.slice(-BANGKOK_DARTS_PER_BED);
    }
}

function bangkokAdvanceTurn(gameData) {
    doublesAdvanceThrowerAfterVisit(gameData, gameData.activeIdx);
    gameData.throwsThisTurn = 0;
    gameData.turnDarts = [];
    gameData.activeIdx++;
    if (gameData.activeIdx >= gameData.players.length) {
        gameData.activeIdx = 0;
        gameData.currentRound++;
    }
    gameData.lastThrow = null;
    gameData.phase = makePhase('playing');
    return { gameData, schedule: null };
}

function bangkokResolveMatch(gameData) {
    const players = gameData.players || [];
    let bestScore = -Infinity;
    players.forEach(p => {
        bestScore = Math.max(bestScore, p.score || 0);
    });

    const pool = players.filter(p => (p.score || 0) === bestScore);

    if (pool.length > 1) {
        gameData.phase = makePhase('draw', {
            contenders: pool.map(p => doublesContenderFields(p)),
            reason: 'score'
        });
        return { gameData, schedule: null };
    }

    const champ = pool[0] || players[0];
    gameData.phase = makePhase('winner', {
        ...doublesWinnerFields(champ),
        reason: 'score',
        score: champ ? (champ.score || 0) : 0,
        beds: BANGKOK_MAX_BEDS
    });
    return { gameData, schedule: null };
}

function bangkokContinueAfterThrow(gameData) {
    if ((gameData.throwsThisTurn || 0) < BANGKOK_DARTS_PER_BED) {
        gameData.phase = makePhase('playing');
        return { gameData, schedule: null };
    }

    const solo = (gameData.players || []).length <= 1;
    let nextIdx = gameData.activeIdx + 1;
    let nextRound = gameData.currentRound;
    let wrapped = false;
    if (nextIdx >= gameData.players.length) {
        nextIdx = 0;
        nextRound++;
        wrapped = true;
    }

    if (nextRound > BANGKOK_MAX_BEDS) {
        gameData.phase = makePhase('playing');
        return {
            gameData,
            schedule: { delayMs: 600, next: 'bangkok_resolve_match' }
        };
    }

    // Solo: skip next-player intermission; announce the next bed then resume
    if (solo) {
        gameData.throwsThisTurn = 0;
        gameData.turnDarts = [];
        gameData.activeIdx = 0;
        gameData.currentRound = nextRound;
        gameData.lastThrow = null;
        gameData.phase = makeRoundAnnouncePhase('bangkok', nextRound);
        return { gameData, schedule: scheduleAfterRoundAnnounce('bangkok') };
    }

    return scheduleRoundThenNextPlayer(
        gameData,
        'bangkok',
        nextIdx,
        nextRound,
        wrapped,
        { targetNumber: bangkokTargetForRound(nextRound) }
    );
}

function handleBangkokThrow(gameData, throwSpec = null) {
    if (gameData.phase.type !== 'playing') {
        return { gameData, schedule: null };
    }
    if ((gameData.throwsThisTurn || 0) >= BANGKOK_DARTS_PER_BED) {
        return { gameData, schedule: null };
    }

    const player = gameData.players[gameData.activeIdx];
    if (!player) return { gameData, schedule: null };

    const targetNumber = bangkokTargetNumber(gameData);
    const dart = bangkokMakeDart(throwSpec, targetNumber);

    gameData.throwsThisTurn = (gameData.throwsThisTurn || 0) + 1;
    bangkokPushTurnDart(gameData, dart);

    if (!Array.isArray(player.bedScores) || player.bedScores.length !== BANGKOK_MAX_BEDS) {
        player.bedScores = bangkokEmptyBedScores();
    }
    const bedIdx = bangkokBedIndex(gameData);
    const prior = player.bedScores[bedIdx];
    const bedTotal = (prior == null ? 0 : prior) + (dart.points || 0);
    player.bedScores[bedIdx] = bedTotal;
    player.score = (player.score || 0) + (dart.points || 0);

    const label = dart.hit ? `+${dart.points}` : 'MISS';

    gameData.lastThrow = {
        points: dart.points || 0,
        hit: !!dart.hit,
        label,
        playerId: player.id,
        playerName: doublesThrowerName(gameData, gameData.activeIdx),
        number: dart.number,
        multiplier: dart.multiplier,
        targetNumber,
        sector: throwSpec && throwSpec.sector ? throwSpec.sector : null
    };

    return bangkokContinueAfterThrow(gameData);
}

/* ========== CRICKET ========== */

function cricketEmptyMarks() {
    const marks = {};
    CRICKET_TARGETS.forEach(t => {
        marks[String(t)] = 0;
    });
    return marks;
}

function cricketTargetKey(target) {
    return String(target);
}

function cricketPointValue(target) {
    return target === 'bull' ? 25 : Number(target);
}

function cricketNormalizeTarget(number) {
    if (number === 'bull') return 'bull';
    const n = Number(number);
    if (CRICKET_TARGETS.includes(n)) return n;
    return null;
}

function cricketMarksForHit(target, multiplier) {
    if (target === 'bull') return multiplier >= 2 ? 2 : 1;
    return normalizeMultiplier(multiplier);
}

function cricketPlayerClosedAll(player) {
    return CRICKET_TARGETS.every(t => (player.marks[cricketTargetKey(t)] || 0) >= 3);
}

function cricketNumberFullyClosed(gameData, target) {
    const key = cricketTargetKey(target);
    return gameData.players.every(p => (p.marks[key] || 0) >= 3);
}

function cricketOthersHaveOpen(gameData, playerId, target) {
    const key = cricketTargetKey(target);
    return gameData.players.some(p => p.id !== playerId && (p.marks[key] || 0) < 3);
}

function cricketCheckWinner(gameData) {
    const closed = gameData.players.filter(cricketPlayerClosedAll);
    if (!closed.length) return false;
    const maxScore = Math.max(...gameData.players.map(p => p.score || 0));
    const winners = closed.filter(p => (p.score || 0) >= maxScore);
    if (!winners.length) return false;
    const active = gameData.players[gameData.activeIdx];
    const winner = (active && winners.find(p => p.id === active.id)) || winners[0];
    gameData.phase = makePhase('winner', {
        ...doublesWinnerFields(winner),
        score: winner.score || 0,
        rounds: gameData.currentRound || 1
    });
    return true;
}

function cricketApplyHit(gameData, player, target, hitMarks) {
    const key = cricketTargetKey(target);
    let remaining = hitMarks;
    let marksAdded = 0;
    let points = 0;
    const before = player.marks[key] || 0;
    let opened = false;
    const wasFullyClosed = cricketNumberFullyClosed(gameData, target);

    while (remaining > 0) {
        const cur = player.marks[key] || 0;
        if (cur < 3) {
            player.marks[key] = cur + 1;
            marksAdded++;
            remaining--;
            if (player.marks[key] === 3 && before < 3) opened = true;
        } else if (cricketOthersHaveOpen(gameData, player.id, target)) {
            const value = cricketPointValue(target);
            points += value;
            player.score = (player.score || 0) + value;
            remaining--;
        } else {
            break;
        }
    }

    return {
        target,
        targetLabel: target === 'bull' ? 'BULL' : String(target),
        marksAdded,
        points,
        opened,
        numberClosed: !wasFullyClosed && cricketNumberFullyClosed(gameData, target),
        marksBefore: before,
        marksAfter: player.marks[key] || 0
    };
}

function cricketContinueAfterThrow(gameData) {
    if (gameData.throwsThisTurn >= 3) {
        let nextIdx = gameData.activeIdx + 1;
        let nextRound = gameData.currentRound || 1;
        let wrapped = false;
        if (nextIdx >= gameData.players.length) {
            nextIdx = 0;
            nextRound++;
            wrapped = true;
        }
        return scheduleRoundThenNextPlayer(gameData, 'cricket', nextIdx, nextRound, wrapped);
    }
    gameData.phase = makePhase('playing');
    return { gameData, schedule: null };
}

function cricketEventOverlay(result, player, gameData) {
    const displayName = gameData
        ? doublesThrowerName(gameData, gameData.activeIdx)
        : player.name;
    const displayAvatar = gameData
        ? doublesThrowerAvatar(gameData, gameData.activeIdx)
        : player.avatar;
    if (result.points > 0) {
        return makePhase('cricket_score', {
            playerName: displayName,
            avatar: displayAvatar,
            target: result.target,
            targetLabel: result.targetLabel,
            points: result.points,
            marksAfter: result.marksAfter,
            opened: result.opened,
            numberClosed: result.numberClosed,
            totalScore: player.score || 0,
            quip: result.points >= 60 ? 'Big Points!' : (result.points >= 40 ? 'On The Board!' : 'Points!')
        });
    }
    if (result.numberClosed) {
        return makePhase('cricket_dead', {
            playerName: displayName,
            avatar: displayAvatar,
            target: result.target,
            targetLabel: result.targetLabel,
            quip: 'No More Points!'
        });
    }
    if (result.opened) {
        return makePhase('cricket_closed', {
            playerName: displayName,
            avatar: displayAvatar,
            target: result.target,
            targetLabel: result.targetLabel,
            marksAfter: result.marksAfter,
            quip: 'Closed!'
        });
    }
    return null;
}

function cricketRecordDart(gameData, label, mult) {
    if (!Array.isArray(gameData.turnDarts)) gameData.turnDarts = [];
    gameData.turnDarts.push({
        label: label || 'MISS',
        mult: mult || null
    });
    if (gameData.turnDarts.length > 3) {
        gameData.turnDarts = gameData.turnDarts.slice(-3);
    }
}

function cricketMultChar(multiplier) {
    return multiplier === 3 ? 'T' : multiplier === 2 ? 'D' : 'S';
}

/* --- X01 (configurable start / in / out) --- */

function x01NormalizeScore(value) {
    const n = Number(value);
    return X01_SCORES.includes(n) ? n : X01_START_SCORE;
}

function x01NormalizeInOut(value, fallback) {
    const v = String(value || '').toLowerCase();
    return X01_IN_OUT.includes(v) ? v : fallback;
}

function x01MeetsMultRule(number, multiplier, rule) {
    if (rule === 'none') return true;
    const mult = normalizeMultiplier(multiplier);
    if (rule === 'double') {
        if (number === 'bull') return mult === 2;
        return mult === 2;
    }
    if (rule === 'triple') {
        if (number === 'bull') return false;
        return mult === 3;
    }
    return false;
}

function x01IsValidFinish(number, multiplier, dartOut) {
    return x01MeetsMultRule(number, multiplier, dartOut || 'none');
}

function x01IsBust(scoreBefore, dartScore, number, multiplier, miss, dartOut) {
    if (miss) return false;
    const remaining = scoreBefore - dartScore;
    if (remaining < 0) return true;
    const out = dartOut || 'none';
    if (remaining === 0 && !x01IsValidFinish(number, multiplier, out)) return true;
    // Double-out cannot leave 1
    if (out === 'double' && remaining === 1) return true;
    return false;
}

function x01RecordDart(gameData, label, mult, score) {
    if (!Array.isArray(gameData.turnDarts)) gameData.turnDarts = [];
    gameData.turnDarts.push({
        label: label || 'MISS',
        mult: mult || null,
        score: score || 0
    });
    if (gameData.turnDarts.length > 3) {
        gameData.turnDarts = gameData.turnDarts.slice(-3);
    }
}

function x01RollDart(throwSpec, scoreBefore, dartOut) {
    if (throwSpec) {
        if (throwSpec.miss) {
            return { label: 'MISS', mult: null, score: 0, miss: true, number: null, multiplier: 1 };
        }
        const number = throwSpec.number;
        let multiplier = throwSpec.multiplier;
        if (number === 'bull' && multiplier > 2) multiplier = 2;
        return {
            label: number === 'bull' ? 'BULL' : String(number),
            mult: cricketMultChar(multiplier),
            score: throwScoreFromTarget(number, multiplier),
            miss: false,
            number,
            multiplier
        };
    }

    const out = dartOut || 'none';
    // Soft checkout assist for common finishes
    if (out === 'double' && scoreBefore >= 2 && scoreBefore <= 40 && scoreBefore % 2 === 0 && Math.random() < 0.4) {
        const d = scoreBefore / 2;
        if (d >= 1 && d <= 20) {
            return {
                label: String(d),
                mult: 'D',
                score: scoreBefore,
                miss: false,
                number: d,
                multiplier: 2
            };
        }
    }
    if (out === 'double' && scoreBefore === 50 && Math.random() < 0.35) {
        return {
            label: 'BULL',
            mult: 'D',
            score: 50,
            miss: false,
            number: 'bull',
            multiplier: 2
        };
    }
    if (out === 'triple' && scoreBefore >= 3 && scoreBefore <= 60 && scoreBefore % 3 === 0 && Math.random() < 0.35) {
        const t = scoreBefore / 3;
        if (t >= 1 && t <= 20) {
            return {
                label: String(t),
                mult: 'T',
                score: scoreBefore,
                miss: false,
                number: t,
                multiplier: 3
            };
        }
    }
    if (out === 'none' && scoreBefore >= 1 && scoreBefore <= 20 && Math.random() < 0.35) {
        return {
            label: String(scoreBefore),
            mult: 'S',
            score: scoreBefore,
            miss: false,
            number: scoreBefore,
            multiplier: 1
        };
    }

    if (Math.random() < 0.08) {
        return { label: 'MISS', mult: null, score: 0, miss: true, number: null, multiplier: 1 };
    }

    let number;
    let multiplier = 1;
    const roll = Math.random();
    if (roll < 0.06) {
        number = 'bull';
        multiplier = Math.random() < 0.35 ? 2 : 1;
    } else {
        number = Math.floor(Math.random() * 20) + 1;
        const mRoll = Math.random();
        if (mRoll < 0.12) multiplier = 3;
        else if (mRoll < 0.32) multiplier = 2;
    }
    return {
        label: number === 'bull' ? 'BULL' : String(number),
        mult: cricketMultChar(multiplier),
        score: throwScoreFromTarget(number, multiplier),
        miss: false,
        number,
        multiplier
    };
}

function x01ContinueAfterThrow(gameData) {
    if (gameData.throwsThisTurn >= 3) {
        let nextIdx = gameData.activeIdx + 1;
        if (nextIdx >= gameData.players.length) nextIdx = 0;
        return showNextPlayerIntermission(gameData, 'x01', nextIdx);
    }
    gameData.phase = makePhase('playing');
    return { gameData, schedule: null };
}

function x01BeginTurnAt(gameData, idx) {
    gameData.activeIdx = idx;
    gameData.throwsThisTurn = 0;
    gameData.turnDarts = [];
    gameData.lastThrow = null;
    const player = gameData.players[idx];
    gameData.turnStartingScore = player ? player.score : (gameData.startScore || X01_START_SCORE);
    gameData.phase = makePhase('playing');
}

function confirmX01Setup(gameData, payload = {}) {
    if (!gameData || gameData.gameType !== 'x01') return { gameData, schedule: null };
    const startScore = x01NormalizeScore(payload.startScore != null ? payload.startScore : gameData.startScore);
    const dartIn = x01NormalizeInOut(payload.dartIn != null ? payload.dartIn : gameData.dartIn, 'none');
    const dartOut = x01NormalizeInOut(payload.dartOut != null ? payload.dartOut : gameData.dartOut, 'none');
    gameData.startScore = startScore;
    gameData.dartIn = dartIn;
    gameData.dartOut = dartOut;
    (gameData.players || []).forEach((p) => {
        p.score = startScore;
        p.hasOpened = dartIn === 'none';
    });
    gameData.activeIdx = 0;
    gameData.throwsThisTurn = 0;
    gameData.turnDarts = [];
    gameData.turnStartingScore = startScore;
    gameData.currentRound = 1;
    gameData.lastThrow = null;
    gameData.phase = makePhase('playing');
    return { gameData, schedule: null };
}

function handleX01Throw(gameData, throwSpec = null) {
    if (!gameData || gameData.phase.type !== 'playing') {
        return { gameData, schedule: null };
    }
    const player = gameData.players[gameData.activeIdx];
    if (!player) return { gameData, schedule: null };

    if (gameData.turnStartingScore == null) {
        gameData.turnStartingScore = player.score;
    }

    const dartIn = gameData.dartIn || 'none';
    const dartOut = gameData.dartOut || 'none';
    gameData.throwsThisTurn = (gameData.throwsThisTurn || 0) + 1;
    const scoreBefore = player.score;
    const dart = x01RollDart(throwSpec, scoreBefore, dartOut);
    x01RecordDart(gameData, dart.label, dart.mult, dart.score);

    gameData.lastThrow = {
        score: dart.score,
        bust: false,
        checkout: false,
        miss: !!dart.miss,
        number: dart.number,
        multiplier: dart.multiplier,
        label: dart.label,
        mult: dart.mult,
        opened: false
    };

    // Still seeking dart-in — only a matching dart opens (and counts)
    if (!player.hasOpened) {
        const opens = !dart.miss && x01MeetsMultRule(dart.number, dart.multiplier, dartIn);
        if (!opens) {
            return x01ContinueAfterThrow(gameData);
        }
        player.hasOpened = true;
        gameData.lastThrow.opened = true;
    }

    if (x01IsBust(scoreBefore, dart.score, dart.number, dart.multiplier, dart.miss, dartOut)) {
        player.score = gameData.turnStartingScore;
        gameData.lastThrow.bust = true;
        gameData.phase = makePhase('bust', {
            teamIndex: gameData.activeIdx,
            teamName: doublesThrowerName(gameData, gameData.activeIdx),
            playerName: doublesThrowerName(gameData, gameData.activeIdx),
            avatar: doublesThrowerAvatar(gameData, gameData.activeIdx),
            members: doublesMembersAt(gameData, gameData.activeIdx)
        });
        return {
            gameData,
            schedule: { delayMs: OVERLAY_EVENT_MS, next: 'x01_after_bust' }
        };
    }

    player.score = scoreBefore - dart.score;

    if (player.score === 0) {
        gameData.lastThrow.checkout = true;
        gameData.phase = makePhase('checkout', {
            teamIndex: gameData.activeIdx,
            teamName: doublesThrowerName(gameData, gameData.activeIdx),
            playerName: doublesThrowerName(gameData, gameData.activeIdx),
            avatar: doublesThrowerAvatar(gameData, gameData.activeIdx),
            members: doublesMembersAt(gameData, gameData.activeIdx)
        });
        return {
            gameData,
            schedule: { delayMs: OVERLAY_EVENT_MS, next: 'x01_show_winner' }
        };
    }

    return x01ContinueAfterThrow(gameData);
}

function warmupMakeDart(throwSpec) {
    if (throwSpec) {
        if (throwSpec.miss) {
            return { label: 'MISS', mult: null, score: 0, miss: true, number: null, multiplier: 1 };
        }
        const number = throwSpec.number;
        let multiplier = throwSpec.multiplier;
        if (number === 'bull' && multiplier > 2) multiplier = 2;
        return {
            label: number === 'bull' ? 'BULL' : String(number),
            mult: cricketMultChar(multiplier),
            score: throwScoreFromTarget(number, multiplier),
            miss: false,
            number,
            multiplier
        };
    }

    if (Math.random() < 0.08) {
        return { label: 'MISS', mult: null, score: 0, miss: true, number: null, multiplier: 1 };
    }

    const number = Math.random() < 0.08 ? 'bull' : (Math.floor(Math.random() * 20) + 1);
    const roll = Math.random();
    let multiplier = 1;
    if (number === 'bull') {
        if (roll > 0.7) multiplier = 2;
    } else if (roll > 0.85) {
        multiplier = 3;
    } else if (roll > 0.65) {
        multiplier = 2;
    }

    return {
        label: number === 'bull' ? 'BULL' : String(number),
        mult: cricketMultChar(multiplier),
        score: throwScoreFromTarget(number, multiplier),
        miss: false,
        number,
        multiplier
    };
}

function warmupVisitTotal(darts) {
    return (darts || []).reduce((sum, d) => sum + (Number(d && d.score) || 0), 0);
}

function handleWarmupThrow(gameData, throwSpec = null) {
    if (gameData.phase.type !== 'playing') {
        return { gameData, schedule: null };
    }
    if ((gameData.throwsThisTurn || 0) >= 3) {
        return { gameData, schedule: null };
    }

    const dart = warmupMakeDart(throwSpec);
    if (!Array.isArray(gameData.turnDarts)) gameData.turnDarts = [];
    gameData.turnDarts.push({
        label: dart.label,
        mult: dart.mult,
        score: dart.score
    });
    if (gameData.turnDarts.length > 3) {
        gameData.turnDarts = gameData.turnDarts.slice(-3);
    }

    gameData.throwsThisTurn = (gameData.throwsThisTurn || 0) + 1;
    gameData.lastThrow = {
        label: dart.label,
        mult: dart.mult,
        score: dart.score,
        miss: !!dart.miss,
        number: dart.number,
        multiplier: dart.multiplier
    };

    if (gameData.throwsThisTurn < 3) {
        return { gameData, schedule: null };
    }

    return {
        gameData,
        schedule: { delayMs: 700, next: 'warmup_commit_visit' }
    };
}

function warmupCommitVisit(gameData) {
    const darts = Array.isArray(gameData.turnDarts) ? gameData.turnDarts.slice(0, 3) : [];
    const total = warmupVisitTotal(darts);
    if (!Array.isArray(gameData.visitHistory)) gameData.visitHistory = [];
    gameData.visitHistory.unshift({
        id: `${Date.now()}-${gameData.visitCount || 0}`,
        darts,
        total
    });
    if (gameData.visitHistory.length > WARMUP_HISTORY_MAX) {
        gameData.visitHistory = gameData.visitHistory.slice(0, WARMUP_HISTORY_MAX);
    }
    gameData.visitCount = (gameData.visitCount || 0) + 1;
    gameData.turnDarts = [];
    gameData.throwsThisTurn = 0;
    gameData.lastThrow = null;
    gameData.phase = makePhase('playing');
    return { gameData, schedule: null };
}

function normalizeThrowSource(source) {
    if (source === 'bot') return 'debug';
    if (source === 'debug' || source === 'correct') return source;
    if (source === 'scolia' || source === 'autodarts' || source === 'opendarts' || source === 'mock') return source;
    // Legacy / unknown board throws — treat as scolia-shaped provenance
    return 'scolia';
}

function quick10MakeDart(throwSpec, throwSource) {
    const dart = warmupMakeDart(throwSpec);
    const source = normalizeThrowSource(throwSource);
    return {
        label: dart.label,
        mult: dart.mult,
        score: dart.score,
        miss: !!dart.miss,
        number: dart.number,
        multiplier: dart.multiplier,
        source
    };
}

function selectQuick10Player(gameData, playerId) {
    if (!gameData || gameData.gameType !== 'quick10') return { gameData, schedule: null };
    if (!gameData.phase || gameData.phase.type !== 'pick_player') {
        return { gameData, schedule: null };
    }
    const candidates = Array.isArray(gameData.candidates) ? gameData.candidates : [];
    const chosen = candidates.find((p) => p && p.id === playerId);
    if (!chosen) return { gameData, schedule: null };
    gameData.player = slimPlayer(chosen);
    gameData.phase = makePhase('playing');
    return { gameData, schedule: null };
}

function handleQuick10Throw(gameData, throwSpec = null, throwSource = null) {
    if (!gameData.player) {
        return { gameData, schedule: null };
    }
    if (gameData.phase.type !== 'playing') {
        return { gameData, schedule: null };
    }
    if ((gameData.throwsThisTurn || 0) >= QUICK10_DARTS_PER_ROUND) {
        return { gameData, schedule: null };
    }
    if ((gameData.currentRound || 1) > QUICK10_ROUNDS) {
        return { gameData, schedule: null };
    }

    const dart = quick10MakeDart(throwSpec, throwSource);
    if (dart.source === 'debug') gameData.usedDebug = true;
    if (dart.source === 'correct') gameData.usedCorrection = true;

    if (!Array.isArray(gameData.turnDarts)) gameData.turnDarts = [];
    gameData.turnDarts.push({
        label: dart.label,
        mult: dart.mult,
        score: dart.score,
        miss: dart.miss,
        number: dart.number,
        multiplier: dart.multiplier,
        source: dart.source
    });
    if (gameData.turnDarts.length > QUICK10_DARTS_PER_ROUND) {
        gameData.turnDarts = gameData.turnDarts.slice(-QUICK10_DARTS_PER_ROUND);
    }

    gameData.throwsThisTurn = (gameData.throwsThisTurn || 0) + 1;
    gameData.lastThrow = {
        label: dart.label,
        mult: dart.mult,
        score: dart.score,
        miss: dart.miss,
        number: dart.number,
        multiplier: dart.multiplier,
        source: dart.source
    };

    if (gameData.throwsThisTurn < QUICK10_DARTS_PER_ROUND) {
        return { gameData, schedule: null };
    }

    return {
        gameData,
        schedule: { delayMs: 700, next: 'quick10_commit_visit' }
    };
}

function quick10CommitVisit(gameData) {
    const round = Math.max(1, Number(gameData.currentRound) || 1);
    const darts = Array.isArray(gameData.turnDarts)
        ? gameData.turnDarts.slice(0, QUICK10_DARTS_PER_ROUND)
        : [];
    const total = warmupVisitTotal(darts);
    if (!Array.isArray(gameData.roundHistory)) gameData.roundHistory = [];
    gameData.roundHistory.push({
        round,
        darts,
        total
    });
    gameData.totalScore = (Number(gameData.totalScore) || 0) + total;
    gameData.turnDarts = [];
    gameData.throwsThisTurn = 0;
    gameData.lastThrow = null;

    if (round >= QUICK10_ROUNDS) {
        const usedDebug = !!gameData.usedDebug;
        const usedCorrection = !!gameData.usedCorrection;
        gameData.phase = makePhase('complete', {
            totalScore: gameData.totalScore,
            playerName: (gameData.player && gameData.player.name) || 'PLAYER',
            playerAvatar: (gameData.player && gameData.player.avatar) || null,
            usedDebug,
            usedCorrection,
            clean: !usedDebug && !usedCorrection
        });
        gameData.readyToPersist = !gameData.persisted;
        return { gameData, schedule: null, persistQuick10: true };
    }

    gameData.currentRound = round + 1;
    gameData.phase = makePhase('playing');
    return { gameData, schedule: null };
}

function buildQuick10MatchRecord(gameData, matchId) {
    if (!gameData || gameData.gameType !== 'quick10' || !gameData.player) return null;
    const rounds = Array.isArray(gameData.roundHistory) ? gameData.roundHistory : [];
    const usedDebug = !!gameData.usedDebug;
    const usedCorrection = !!gameData.usedCorrection;
    return {
        id: matchId,
        gameType: 'quick10',
        playedAt: new Date().toISOString(),
        player: {
            id: gameData.player.id,
            name: gameData.player.name,
            avatar: gameData.player.avatar || null
        },
        totalScore: Number(gameData.totalScore) || 0,
        rounds,
        integrity: {
            usedDebug,
            usedCorrection,
            clean: !usedDebug && !usedCorrection
        }
    };
}

function harperNameKey(name) {
    return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isHarperPlayerName(name) {
    return harperNameKey(name) === 'harper';
}

/** Exact bed key: number + multiplier (e.g. 20:3, bull:2). */
function harperDartSegmentKey(dart) {
    if (!dart || dart.miss || dart.free) return null;
    const mult = normalizeMultiplier(dart.multiplier);
    if (dart.number === 'bull') return `bull:${Math.min(2, mult)}`;
    const n = Number(dart.number);
    if (!Number.isFinite(n) || n < 1 || n > 20) return null;
    return `${n}:${mult}`;
}

function harperDartDisplayLabel(dart) {
    if (!dart) return '';
    if (dart.free) return 'FREE';
    if (dart.miss) return 'MISS';
    const mult = normalizeMultiplier(dart.multiplier);
    if (dart.number === 'bull') return mult === 2 ? 'DBULL' : 'BULL';
    const prefix = mult === 3 ? 'T' : mult === 2 ? 'D' : 'S';
    const n = dart.number != null ? dart.number : dart.label;
    return `${prefix}${n}`;
}

function harperMakeDart(throwSpec) {
    const dart = warmupMakeDart(throwSpec);
    const out = {
        label: dart.label,
        mult: dart.mult,
        score: dart.score,
        miss: !!dart.miss,
        number: dart.number,
        multiplier: dart.multiplier,
        free: false,
        randomized: false
    };
    if (!out.miss && !out.free) {
        out.label = harperDartDisplayLabel(out);
    }
    return out;
}

function initHarperWinsGameData(players) {
    const seated = (players || []).map(slimPlayer).filter((p) => p && p.id);
    const harper = seated.find((p) => isHarperPlayerName(p.name));
    const others = seated.filter((p) => !isHarperPlayerName(p.name)).slice(0, HARPER_WINS_MAX_PLAYERS - 1);
    const roster = harper
        ? [harper, ...others].slice(0, HARPER_WINS_MAX_PLAYERS)
        : seated.slice(0, HARPER_WINS_MAX_PLAYERS);

    const harperIdx = Math.max(0, roster.findIndex((p) => isHarperPlayerName(p.name)));
    return {
        gameType: 'harperwins',
        players: roster.map((p) => ({
            ...slimPlayer(p),
            isHarper: isHarperPlayerName(p.name),
            points: HARPER_WINS_START_POINTS,
            eliminated: false,
            visitDarts: [],
            visitMarks: [],
            visitHits: null,
            visitHistory: []
        })),
        harperIdx,
        activeIdx: harperIdx,
        throwsThisTurn: 0,
        turnDarts: [],
        currentRound: 1,
        pattern: null,
        patternSet: false,
        phase: makePhase('playing'),
        helpVisible: false,
        lastThrow: null
    };
}

function harperLivingChallengerIndices(gameData) {
    const out = [];
    (gameData.players || []).forEach((p, idx) => {
        if (!p || p.isHarper || p.eliminated) return;
        out.push(idx);
    });
    return out;
}

function harperNextChallengerIdx(gameData, afterIdx) {
    const living = harperLivingChallengerIndices(gameData);
    if (!living.length) return -1;
    const start = Number(afterIdx);
    for (let i = 0; i < living.length; i++) {
        if (living[i] > start) return living[i];
    }
    return -1;
}

function harperPatternSlotIsFree(h) {
    return !h || h.miss || h.free;
}

/** Slot-locked match: same bed (number + mult). FREE slots always green when thrown. */
function harperCountHits(pattern, playerDarts) {
    const pat = Array.isArray(pattern) ? pattern.slice(0, HARPER_WINS_DARTS) : [];
    const darts = Array.isArray(playerDarts) ? playerDarts.slice(0, HARPER_WINS_DARTS) : [];
    const marks = Array.from({ length: HARPER_WINS_DARTS }, () => 'miss');
    let hits = 0;
    for (let i = 0; i < HARPER_WINS_DARTS; i++) {
        const h = pat[i];
        const p = darts[i];
        if (harperPatternSlotIsFree(h)) {
            if (p) {
                marks[i] = 'hit';
                hits++;
            }
            continue;
        }
        const hk = harperDartSegmentKey(h);
        const pk = harperDartSegmentKey(p);
        if (hk != null && pk != null && hk === pk) {
            marks[i] = 'hit';
            hits++;
        } else {
            marks[i] = 'miss';
        }
    }
    return { hits, marks };
}

function harperApplyPointLoss(player, amount) {
    if (!player) return;
    player.points = Math.max(0, (Number(player.points) || 0) - amount);
    if (player.points <= 0) player.eliminated = true;
}

function harperApplyPointGain(player, amount) {
    if (!player || player.eliminated) return;
    player.points = (Number(player.points) || 0) + Math.max(0, amount);
}

function harperCheckEnd(gameData) {
    const harper = gameData.players[gameData.harperIdx];
    if (harper && (harper.eliminated || harper.points <= 0)) {
        harper.eliminated = true;
        harper.points = 0;
        gameData.phase = makePhase('winner', {
            side: 'players',
            headline: 'You guys beat Harper?!?!?',
            sub: 'How did that happen!'
        });
        return true;
    }
    const living = harperLivingChallengerIndices(gameData);
    if (!living.length) {
        gameData.phase = makePhase('winner', {
            side: 'harper',
            winnerName: (harper && harper.name) || 'Harper',
            winnerAvatar: (harper && harper.avatar) || null,
            headline: 'Harper Wins',
            sub: 'Everyone else hit zero.'
        });
        return true;
    }
    return false;
}

function harperClearLiveVisit(player) {
    if (!player) return;
    player.visitDarts = [];
    player.visitMarks = [];
    player.visitHits = null;
}

function harperPushVisitHistory(player, entry) {
    if (!player) return;
    if (!Array.isArray(player.visitHistory)) player.visitHistory = [];
    // Newest finished round on top — blank live row sits above this in the Viewer
    player.visitHistory.unshift(entry);
}

/** Keep the current visit on the live row until the whole round finishes. */
function harperArchiveRoundVisits(gameData) {
    const round = Math.max(1, Number(gameData && gameData.currentRound) || 1);
    (gameData.players || []).forEach((p) => {
        if (!p) return;
        const darts = Array.isArray(p.visitDarts) ? p.visitDarts : [];
        if (!darts.length) return;
        harperPushVisitHistory(p, {
            round,
            darts: darts.slice(),
            marks: Array.isArray(p.visitMarks) ? p.visitMarks.slice() : [],
            hits: p.visitHits,
            kind: p.isHarper ? 'pattern' : 'challenge'
        });
    });
}

function harperClearVisitsForNewRound(gameData) {
    harperArchiveRoundVisits(gameData);
    (gameData.players || []).forEach((p) => harperClearLiveVisit(p));
    gameData.pattern = null;
    gameData.patternSet = false;
}

function harperBeginThrower(gameData, idx) {
    gameData.activeIdx = idx;
    gameData.throwsThisTurn = 0;
    gameData.turnDarts = [];
    gameData.lastThrow = null;
    const p = gameData.players[idx];
    // Only clear if this player has not finished a visit this round yet
    // (completed visits stay on the live row until round end)
    if (p && !(Array.isArray(p.visitDarts) && p.visitDarts.length >= HARPER_WINS_DARTS)) {
        harperClearLiveVisit(p);
    }
}

function handleHarperWinsThrow(gameData, throwSpec = null) {
    if (!gameData || gameData.phase.type !== 'playing') return { gameData, schedule: null };
    if ((gameData.throwsThisTurn || 0) >= HARPER_WINS_DARTS) return { gameData, schedule: null };

    const active = gameData.players[gameData.activeIdx];
    if (!active || active.eliminated) return { gameData, schedule: null };

    const dart = harperMakeDart(throwSpec);
    // Harper miss/bounce-out becomes a FREE slot in the pattern
    if (active.isHarper && dart.miss) {
        dart.free = true;
        dart.label = 'FREE';
    }
    if (!Array.isArray(gameData.turnDarts)) gameData.turnDarts = [];
    gameData.turnDarts.push(dart);
    if (gameData.turnDarts.length > HARPER_WINS_DARTS) {
        gameData.turnDarts = gameData.turnDarts.slice(-HARPER_WINS_DARTS);
    }
    active.visitDarts = gameData.turnDarts.slice();
    if (!active.isHarper && gameData.patternSet) {
        const live = harperCountHits(gameData.pattern, active.visitDarts);
        active.visitMarks = live.marks;
        active.visitHits = live.hits;
    }
    gameData.throwsThisTurn = (gameData.throwsThisTurn || 0) + 1;
    gameData.lastThrow = { ...dart };

    const visitDone = gameData.throwsThisTurn >= HARPER_WINS_DARTS;
    let harperFlash = null;
    if (active.isHarper && !dart.miss && !dart.free) {
        if (dart.number === 'bull') {
            harperFlash = { kind: 'harper_bullseye', videoMs: HARPER_BULLSEYE_VIDEO_MS, fallbackLabel: 'BULL' };
        } else if (Number(dart.multiplier) === 3) {
            harperFlash = { kind: 'harper_triple', videoMs: HARPER_TRIPLE_VIDEO_MS, fallbackLabel: 'T?' };
        } else if (Number(dart.multiplier) === 2) {
            harperFlash = { kind: 'harper_double', videoMs: HARPER_DOUBLE_VIDEO_MS, fallbackLabel: 'D?' };
        }
    }

    if (harperFlash) {
        gameData.phase = makePhase(harperFlash.kind, {
            playerName: active.name || 'Harper',
            avatar: active.avatar || null,
            label: dart.label || harperFlash.fallbackLabel,
            number: dart.number,
            dartIndex: gameData.throwsThisTurn
        });
        return {
            gameData,
            schedule: {
                delayMs: OVERLAY_EVENT_MS,
                delayMsWithVideo: harperFlash.videoMs,
                next: visitDone ? 'harperwins_commit_visit' : 'harperwins_resume_playing'
            }
        };
    }

    if (!visitDone) {
        return { gameData, schedule: null };
    }

    return {
        gameData,
        schedule: { delayMs: 700, next: 'harperwins_commit_visit' }
    };
}

function harperwinsCommitVisit(gameData) {
    const darts = Array.isArray(gameData.turnDarts)
        ? gameData.turnDarts.slice(0, HARPER_WINS_DARTS)
        : [];
    const active = gameData.players[gameData.activeIdx];
    if (!active) return { gameData, schedule: null };

    if (active.isHarper) {
        const pattern = darts.map((d) => {
            if (d && (d.miss || d.free)) {
                return {
                    ...d,
                    miss: true,
                    free: true,
                    label: 'FREE',
                    number: null,
                    mult: null,
                    multiplier: 1,
                    score: 0
                };
            }
            return {
                ...d,
                free: false,
                label: harperDartDisplayLabel(d)
            };
        });
        gameData.pattern = pattern;
        gameData.patternSet = true;
        const marks = pattern.map((d) => (d.free ? 'free' : 'set'));
        // Stay on the live row until every challenger finishes the round
        active.visitDarts = pattern.slice();
        active.visitMarks = marks;
        active.visitHits = null;

        // Board miss → FREE for challengers, and Harper loses 1 per miss
        const freeCount = pattern.filter((d) => d && d.free).length;
        if (freeCount > 0) {
            harperApplyPointLoss(active, freeCount);
        }

        gameData.throwsThisTurn = 0;
        gameData.turnDarts = [];
        gameData.lastThrow = null;

        if (harperCheckEnd(gameData)) {
            return { gameData, schedule: null };
        }

        const firstChallenger = harperNextChallengerIdx(gameData, gameData.harperIdx);
        if (firstChallenger < 0) {
            harperCheckEnd(gameData);
            return { gameData, schedule: null };
        }
        return harperwinsShowNextPlayer(gameData, firstChallenger);
    }

    // Challenger visit
    const { hits, marks } = harperCountHits(gameData.pattern, darts);
    // Keep completed visit on the live row until the round ends
    active.visitDarts = darts.slice();
    active.visitMarks = marks;
    active.visitHits = hits;

    const harper = gameData.players[gameData.harperIdx];
    if (hits >= 3) harperApplyPointLoss(harper, 2);
    else if (hits === 2) harperApplyPointLoss(harper, 1);
    else if (hits <= 0) {
        harperApplyPointLoss(active, 1);
        harperApplyPointGain(harper, 1);
    }
    // hits === 1 → push

    gameData.throwsThisTurn = 0;
    gameData.turnDarts = [];
    gameData.lastThrow = null;

    if (hits <= 0) {
        const eliminated = !!(active.eliminated || active.points <= 0);
        if (eliminated) {
            gameData.phase = makePhase('elim', {
                playerName: active.name || 'PLAYER',
                avatar: active.avatar || null,
                hits: 0,
                eliminated: true
            });
            return {
                gameData,
                schedule: {
                    delayMs: OVERLAY_EVENT_MS,
                    delayMsWithVideo: HARPER_ELIM_VIDEO_MS,
                    next: 'harperwins_after_visit_event'
                }
            };
        }
        gameData.phase = makePhase('miss', {
            playerName: active.name || 'PLAYER',
            avatar: active.avatar || null,
            hits: 0,
            eliminated: false
        });
        return {
            gameData,
            schedule: {
                delayMs: OVERLAY_EVENT_MS,
                delayMsWithVideo: HARPER_MISS_VIDEO_MS,
                next: 'harperwins_after_visit_event'
            }
        };
    }

    if (hits === 1) {
        gameData.phase = makePhase('push', {
            playerName: active.name || 'PLAYER',
            avatar: active.avatar || null,
            hits: 1
        });
        return {
            gameData,
            schedule: {
                delayMs: OVERLAY_EVENT_MS,
                delayMsWithVideo: HARPER_PUSH_VIDEO_MS,
                next: 'harperwins_after_visit_event'
            }
        };
    }

    if (hits === 2) {
        gameData.phase = makePhase('harper_minus1', {
            playerName: active.name || 'PLAYER',
            avatar: active.avatar || null,
            hits: 2,
            harperName: (harper && harper.name) || 'Harper',
            harperAvatar: (harper && harper.avatar) || null
        });
        return {
            gameData,
            schedule: {
                delayMs: OVERLAY_EVENT_MS,
                delayMsWithVideo: HARPER_MINUS1_VIDEO_MS,
                next: 'harperwins_after_visit_event'
            }
        };
    }

    if (hits >= 3) {
        gameData.phase = makePhase('harper_minus2', {
            playerName: active.name || 'PLAYER',
            avatar: active.avatar || null,
            hits: 3,
            harperName: (harper && harper.name) || 'Harper',
            harperAvatar: (harper && harper.avatar) || null
        });
        return {
            gameData,
            schedule: {
                delayMs: OVERLAY_EVENT_MS,
                delayMsWithVideo: HARPER_MINUS2_VIDEO_MS,
                next: 'harperwins_after_visit_event'
            }
        };
    }

    return harperwinsAdvanceAfterVisit(gameData);
}

/** After a challenger visit overlay (or non-overlay result): end / next / new round. */
function harperwinsAdvanceAfterVisit(gameData) {
    if (harperCheckEnd(gameData)) {
        return { gameData, schedule: null };
    }

    const nextChallenger = harperNextChallengerIdx(gameData, gameData.activeIdx);
    if (nextChallenger >= 0) {
        return harperwinsShowNextPlayer(gameData, nextChallenger);
    }

    // Round complete → archive, bump round, then next-player card for Harper
    harperClearVisitsForNewRound(gameData);
    gameData.currentRound = (gameData.currentRound || 1) + 1;
    return harperwinsShowNextPlayer(gameData, gameData.harperIdx, { harperSets: true });
}

/** Shared next-player card (same timing as other games). */
function harperwinsShowNextPlayer(gameData, nextIdx, opts = {}) {
    const next = gameData.players[nextIdx] || {};
    const harperSets = !!(opts.harperSets || next.isHarper);
    return showNextPlayerIntermission(gameData, 'harperwins', nextIdx, {
        quip: harperSets ? 'Set the pattern' : 'Match the bed'
    });
}

function harperwinsAdvanceTurn(gameData) {
    const phaseData = (gameData.phase && gameData.phase.data) || {};
    let nextIdx = Number(phaseData.nextPlayerIndex);
    if (!Number.isFinite(nextIdx) || nextIdx < 0 || nextIdx >= (gameData.players || []).length) {
        nextIdx = gameData.harperIdx;
    }
    harperBeginThrower(gameData, nextIdx);
    gameData.phase = makePhase('playing');
    return { gameData, schedule: null };
}

function handleCricketThrow(gameData, throwSpec = null) {
    if (gameData.phase.type !== 'playing') {
        return { gameData, schedule: null };
    }

    gameData.throwsThisTurn++;
    const currentPlayer = gameData.players[gameData.activeIdx];
    gameData.lastThrow = { hit: false, cricket: false };

    let target = null;
    let multiplier = 1;

    if (throwSpec) {
        if (throwSpec.miss) {
            target = null;
            multiplier = 1;
        } else {
            target = cricketNormalizeTarget(throwSpec.number);
            multiplier = throwSpec.multiplier;
        }
    } else if (Math.random() < 0.72) {
        target = CRICKET_TARGETS[Math.floor(Math.random() * CRICKET_TARGETS.length)];
        const roll = Math.random();
        multiplier = 1;
        if (target === 'bull') {
            if (roll > 0.75) multiplier = 2;
        } else {
            if (roll > 0.70 && roll <= 0.90) multiplier = 2;
            if (roll > 0.90) multiplier = 3;
        }
    }

    if (target == null) {
        // Off the board → MISS. On the board but not 15–20/bull → still announce the dart number.
        if (throwSpec && !throwSpec.miss) {
            const label = throwSpec.number === 'bull' ? 'BULL' : String(throwSpec.number);
            cricketRecordDart(gameData, label, cricketMultChar(multiplier));
            gameData.lastThrow = {
                hit: false,
                cricket: false,
                miss: false,
                number: throwSpec.number,
                multiplier,
                offTarget: true
            };
        } else {
            cricketRecordDart(gameData, 'MISS', null);
            gameData.lastThrow = { hit: false, cricket: false, miss: true };
        }
        return cricketContinueAfterThrow(gameData);
    }

    const hitMarks = cricketMarksForHit(target, multiplier);
    const result = cricketApplyHit(gameData, currentPlayer, target, hitMarks);
    cricketRecordDart(
        gameData,
        target === 'bull' ? 'BULL' : String(target),
        cricketMultChar(multiplier)
    );
    gameData.lastThrow = {
        hit: result.marksAdded > 0 || result.points > 0,
        cricket: true,
        target,
        number: target,
        multiplier,
        marksAdded: result.marksAdded,
        marksBefore: result.marksBefore,
        marksAfter: result.marksAfter,
        points: result.points,
        opened: result.opened,
        numberClosed: result.numberClosed
    };

    if (cricketCheckWinner(gameData)) {
        return { gameData, schedule: null };
    }

    const overlay = cricketEventOverlay(result, currentPlayer, gameData);
    if (overlay) {
        gameData.phase = overlay;
        return {
            gameData,
            schedule: { delayMs: OVERLAY_EVENT_MS, next: 'cricket_after_event' }
        };
    }

    return cricketContinueAfterThrow(gameData);
}

function applyScheduledAction(gameData, action) {
    switch (action.next) {
        case 'end_dart_callout': {
            const resume = gameData.dartCalloutResume || null;
            gameData.dartCalloutResume = null;
            if (resume && resume.phase && resume.phase.type) {
                gameData.phase = resume.phase;
                return { gameData, schedule: resume.schedule || null };
            }
            gameData.phase = makePhase('playing');
            return { gameData, schedule: null };
        }
        case 'demolition_after_bust': {
            const idx = gameData.activeTurnIndex;
            return demolitionScheduleNextTurn(gameData, idx, 0);
        }
        case 'demolition_sync_turn_baseline': {
            const idx = gameData.activeTurnIndex;
            gameData.turnStartingScores[idx] = gameData.teamScores[idx];
            return { gameData, schedule: null };
        }
        case 'demolition_show_intermission': {
            const idx = gameData.activeTurnIndex;
            gameData.turnStartingScores[idx] = gameData.teamScores[idx];

            let nextIdx;
            if (gameData.finishRoundMode) {
                nextIdx = demolitionNextPendingIndex(gameData, idx);
                if (nextIdx < 0) {
                    return demolitionResolveRound(gameData);
                }
            } else {
                nextIdx = (idx + 1) % gameData.teamScores.length;
            }

            gameData.phase = makePhase('intermission', {
                nextTeamIndex: nextIdx,
                nextTeamName: demolitionThrowerName(gameData, nextIdx),
                avatar: demolitionThrowerAvatar(gameData, nextIdx)
            });
            return {
                gameData,
                schedule: { delayMs: OVERLAY_NEXT_PLAYER_MS, next: 'demolition_advance_turn' }
            };
        }
        case 'demolition_show_tvm': {
            const idx = gameData.activeTurnIndex;
            gameData.turnStartingScores[idx] = gameData.teamScores[idx];
            const teamName = demolitionThrowerName(gameData, idx);
            gameData.phase = makePhase('tvm', {
                teamIndex: idx,
                teamName,
                avatar: demolitionThrowerAvatar(gameData, idx)
            });
            // Server shortens this when the face clip is ready / ends; long max if dump fails
            return {
                gameData,
                schedule: { delayMs: 20000, next: 'demolition_show_checkout' }
            };
        }
        case 'demolition_show_checkout': {
            const idx = gameData.activeTurnIndex;
            gameData.turnStartingScores[idx] = gameData.teamScores[idx];
            if (gameData.tvmClipUrl) delete gameData.tvmClipUrl;
            const teamName = demolitionThrowerName(gameData, idx);
            gameData.phase = makePhase('checkout', {
                teamIndex: idx,
                teamName,
                avatar: demolitionThrowerAvatar(gameData, idx)
            });

            const nextIdx = demolitionNextPendingIndex(gameData, idx);
            if (nextIdx < 0) {
                return {
                    gameData,
                    schedule: { delayMs: OVERLAY_EVENT_MS, next: 'demolition_resolve_round' }
                };
            }
            return {
                gameData,
                schedule: { delayMs: OVERLAY_EVENT_MS, next: 'demolition_after_checkout' }
            };
        }
        case 'demolition_after_checkout': {
            const idx = gameData.activeTurnIndex;
            const nextIdx = demolitionNextPendingIndex(gameData, idx);
            if (nextIdx < 0) {
                return demolitionResolveRound(gameData);
            }
            gameData.phase = makePhase('intermission', {
                nextTeamIndex: nextIdx,
                nextTeamName: demolitionThrowerName(gameData, nextIdx),
                avatar: demolitionThrowerAvatar(gameData, nextIdx)
            });
            return {
                gameData,
                schedule: { delayMs: OVERLAY_NEXT_PLAYER_MS, next: 'demolition_advance_turn' }
            };
        }
        case 'demolition_resolve_round':
            return demolitionResolveRound(gameData);
        case 'demolition_start_playoff':
            demolitionBeginTurnAt(gameData, 0);
            return { gameData, schedule: null };
        case 'demolition_advance_turn':
            demolitionAdvanceTurn(gameData);
            return { gameData, schedule: null };
        case 'limbo_after_life_loss':
            gameData.currentTargetBar = 60;
            doublesAdvanceThrowerAfterVisit(gameData, gameData.activeIdx);
            gameData.activeIdx = limboNextAliveIndex(gameData.players, gameData.activeIdx);
            limboBeginTurn(gameData);
            return { gameData, schedule: null };
        case 'limbo_after_bar':
            doublesAdvanceThrowerAfterVisit(gameData, gameData.activeIdx);
            gameData.activeIdx = limboNextAliveIndex(gameData.players, gameData.activeIdx);
            limboBeginTurn(gameData);
            return { gameData, schedule: null };
        case 'limbo_winner': {
            const winner = gameData.players.find(p => p.id === action.winnerId);
            gameData.phase = makePhase('winner', doublesWinnerFields(winner));
            return { gameData, schedule: null };
        }
        case 'derby_show_next_after_round':
        case 'killer_show_next_after_round':
        case 'quackshot_show_next_after_round':
        case 'shanghai_show_next_after_round':
        case 'bangkok_show_next_after_round':
        case 'cricket_show_next_after_round': {
            const gameType = String(action.next).replace('_show_next_after_round', '');
            const nextIdx = action.nextPlayerIndex != null ? action.nextPlayerIndex : 0;
            return showNextPlayerIntermission(
                gameData,
                gameType,
                nextIdx,
                action.intermissionExtra || {}
            );
        }
        case 'derby_advance_turn': {
            // Round announce (if any) already played before intermission.
            doublesAdvanceThrowerAfterVisit(gameData, gameData.activeIdx);
            gameData.throwsThisTurn = 0;
            gameData.activeIdx++;
            if (gameData.activeIdx >= gameData.players.length) {
                gameData.activeIdx = 0;
                gameData.currentRound++;
                if (gameData.currentRound > DERBY_MAX_ROUNDS || gameData.finishLineOpen) {
                    return derbyResolveMatch(gameData);
                }
            }
            gameData.lastThrow = null;
            gameData.phase = makePhase('playing');
            return { gameData, schedule: null };
        }
        case 'derby_resolve_match':
            return derbyResolveMatch(gameData);
        case 'derby_after_mult':
            if (gameData.pendingPastPost) {
                const pending = gameData.pendingPastPost;
                gameData.pendingPastPost = null;
                gameData.phase = makePhase('past_post', pending);
                return derbyScheduleAfterPastPost(gameData);
            }
            return derbyContinueAfterThrow(gameData);
        case 'derby_after_past_post':
            gameData.pendingPastPost = null;
            return derbyContinueAfterThrow(gameData);
        case 'killer_resume_playing':
            gameData.phase = makePhase('playing');
            return { gameData, schedule: null };
        case 'killer_after_elimination':
            // Return to the board first...
            gameData.phase = makePhase('playing');
            gameData.lastThrow = null;
            if (killerAlivePlayers(gameData.players).length === 1) {
                // ...then show winner after a short beat on the board
                return {
                    gameData,
                    schedule: { delayMs: 900, next: 'killer_show_winner' }
                };
            }
            if (gameData.throwsThisTurn >= 3) {
                return {
                    gameData,
                    schedule: { delayMs: 400, next: 'killer_show_intermission' }
                };
            }
            return { gameData, schedule: null };
        case 'killer_show_winner':
            killerCheckWinner(gameData);
            return { gameData, schedule: null };
        case 'killer_resolve_match':
            return killerResolveMatch(gameData);
        case 'killer_show_intermission':
            return killerShowIntermission(gameData);
        case 'killer_advance_turn':
            return killerAdvanceTurn(gameData);
        case 'killer_after_round_announce':
            gameData.phase = makePhase('playing');
            return { gameData, schedule: null };
        case 'quackshot_advance_turn':
            return quackshotAdvanceTurn(gameData);
        case 'quackshot_after_round_announce':
            gameData.phase = makePhase('playing');
            return { gameData, schedule: null };
        case 'quackshot_after_hit':
            return quackshotContinueAfterThrow(gameData);
        case 'quackshot_show_winner':
            return quackshotResolveMatch(gameData);
        case 'quackshot_resolve_match':
            return quackshotResolveMatch(gameData);
        case 'shanghai_advance_turn':
            return shanghaiAdvanceTurn(gameData);
        case 'shanghai_after_round_announce':
            gameData.phase = makePhase('playing');
            return { gameData, schedule: null };
        case 'shanghai_resolve_match':
            return shanghaiResolveMatch(gameData);
        case 'bangkok_advance_turn':
            return bangkokAdvanceTurn(gameData);
        case 'bangkok_after_round_announce':
            gameData.phase = makePhase('playing');
            return { gameData, schedule: null };
        case 'bangkok_resolve_match':
            return bangkokResolveMatch(gameData);
        case 'cricket_advance_turn': {
            doublesAdvanceThrowerAfterVisit(gameData, gameData.activeIdx);
            gameData.throwsThisTurn = 0;
            gameData.turnDarts = [];
            gameData.activeIdx++;
            if (gameData.activeIdx >= gameData.players.length) {
                gameData.activeIdx = 0;
                gameData.currentRound = (gameData.currentRound || 1) + 1;
            }
            gameData.lastThrow = null;
            gameData.phase = makePhase('playing');
            return { gameData, schedule: null };
        }
        case 'cricket_after_round_announce':
            gameData.phase = makePhase('playing');
            return { gameData, schedule: null };
        case 'derby_after_round_announce':
            gameData.phase = makePhase('playing');
            return { gameData, schedule: null };
        case 'cricket_after_event':
            return cricketContinueAfterThrow(gameData);
        case 'x01_after_bust': {
            let nextIdx = gameData.activeIdx + 1;
            if (nextIdx >= gameData.players.length) nextIdx = 0;
            return showNextPlayerIntermission(gameData, 'x01', nextIdx);
        }
        case 'x01_advance_turn': {
            doublesAdvanceThrowerAfterVisit(gameData, gameData.activeIdx);
            let nextIdx = gameData.activeIdx + 1;
            if (nextIdx >= gameData.players.length) {
                nextIdx = 0;
                gameData.currentRound = (gameData.currentRound || 1) + 1;
            }
            x01BeginTurnAt(gameData, nextIdx);
            return { gameData, schedule: null };
        }
        case 'x01_show_winner': {
            const winner = gameData.players[gameData.activeIdx];
            gameData.phase = makePhase('winner', doublesWinnerFields(winner));
            return { gameData, schedule: null };
        }
        case 'warmup_commit_visit':
            return warmupCommitVisit(gameData);
        case 'quick10_commit_visit':
            return quick10CommitVisit(gameData);
        case 'harperwins_commit_visit':
            return harperwinsCommitVisit(gameData);
        case 'harperwins_advance_turn':
            return harperwinsAdvanceTurn(gameData);
        case 'harperwins_after_triple':
        case 'harperwins_resume_playing':
            gameData.phase = makePhase('playing');
            return { gameData, schedule: null };
        case 'harperwins_after_miss':
        case 'harperwins_after_visit_event':
            return harperwinsAdvanceAfterVisit(gameData);
        default:
            return { gameData, schedule: null };
    }
}

function handleGameAction(gameData, gameType, payload, options = {}) {
    if (!gameData || !payload) return { gameData, schedule: null };

    if (payload.type === 'TOGGLE_HELP') {
        gameData.helpVisible = !gameData.helpVisible;
        return { gameData, schedule: null };
    }

    if (payload.type === 'TOGGLE_LEADERBOARD' && gameType === 'quick10') {
        gameData.leaderboardVisible = !gameData.leaderboardVisible;
        return { gameData, schedule: null };
    }

    if (payload.type === 'SELECT_QUICK10_PLAYER' && gameType === 'quick10') {
        return selectQuick10Player(gameData, payload.playerId);
    }

    if (payload.type === 'CONFIRM_X01_SETUP' && gameType === 'x01') {
        return confirmX01Setup(gameData, payload);
    }

    let throwSpec = null;
    if (payload.type === 'TRIGGER_SPECIFIC_THROW') {
        throwSpec = parseSpecificThrow(payload);
        if (!throwSpec) return { gameData, schedule: null };
    } else if (payload.type === 'TRIGGER_THROW') {
        throwSpec = buildProfiledThrowSpec(
            gameData,
            gameType,
            options.debugThrowProfile || DEFAULT_THROW_PROFILE
        );
    } else {
        return { gameData, schedule: null };
    }

    const throwSource = options.throwSource || null;

    switch (gameType) {
        case 'demolition':
            return handleDemolitionThrow(gameData, throwSpec);
        case 'limbo':
            return handleLimboThrow(gameData, throwSpec);
        case 'derby':
            return handleDerbyThrow(gameData, throwSpec);
        case 'killer':
            return handleKillerThrow(gameData, throwSpec);
        case 'quackshot':
            return handleQuackshotThrow(gameData, throwSpec);
        case 'shanghai':
            return handleShanghaiThrow(gameData, throwSpec);
        case 'bangkok':
            return handleBangkokThrow(gameData, throwSpec);
        case 'cricket':
            return handleCricketThrow(gameData, throwSpec);
        case 'x01':
            return handleX01Throw(gameData, throwSpec);
        case 'warmup':
            return handleWarmupThrow(gameData, throwSpec);
        case 'quick10':
            return handleQuick10Throw(gameData, throwSpec, throwSource);
        case 'harperwins':
            return handleHarperWinsThrow(gameData, throwSpec);
        default:
            return { gameData, schedule: null };
    }
}


function debugSampleActor(gameData) {
    if (!gameData) return { name: 'PLAYER', avatar: null };
    if (gameData.gameType === 'quick10' && gameData.player) {
        return {
            name: gameData.player.name || 'PLAYER',
            avatar: gameData.player.avatar || null,
            teamIndex: 0
        };
    }
    if (Array.isArray(gameData.teams) && gameData.teams.length) {
        const idx = Math.min(gameData.activeTurnIndex || 0, gameData.teams.length - 1);
        const member = demolitionCurrentThrower(gameData, idx) || (gameData.teams[idx] && gameData.teams[idx][0]);
        if (member) return { name: member.name || 'PLAYER', avatar: member.avatar || null, teamIndex: idx };
    }
    if (Array.isArray(gameData.players) && gameData.players.length) {
        const idx = Math.min(gameData.activeIdx || 0, gameData.players.length - 1);
        const thrower = doublesCurrentThrower(gameData, idx);
        if (thrower) return { name: thrower.name || 'PLAYER', avatar: thrower.avatar || null, teamIndex: idx };
        const p = gameData.players[idx];
        if (p) return { name: p.name || 'PLAYER', avatar: p.avatar || null, teamIndex: idx };
    }
    return { name: 'PLAYER', avatar: null, teamIndex: 0 };
}

function buildDebugPreviewPhase(gameType, gameData, screen) {
    const actor = debugSampleActor(gameData);
    const label = actor.name;

    switch (screen) {
        case 'clear':
        case 'playing':
            return makePhase('playing');

        case 'pick_player': {
            const candidates = (gameData && Array.isArray(gameData.candidates) && gameData.candidates.length)
                ? gameData.candidates
                : [{ id: 'preview', name: label, avatar: actor.avatar }];
            return makePhase('pick_player', { candidates });
        }

        case 'pick_mode':
            // Harper Wins no longer uses mode pick — show playing layout for previews
            return makePhase('playing');

        case 'complete':
            return makePhase('complete', {
                totalScore: Number(gameData && gameData.totalScore) || 180,
                playerName: label,
                playerAvatar: actor.avatar,
                usedDebug: !!(gameData && gameData.usedDebug),
                usedCorrection: !!(gameData && gameData.usedCorrection),
                clean: !(gameData && (gameData.usedDebug || gameData.usedCorrection))
            });

        case 'round':
        case 'round_announce': {
            const r = Math.max(1, Number(gameData && gameData.currentRound) || 1);
            return makeRoundAnnouncePhase(gameType, r);
        }

        case 'round_final': {
            let max = 8;
            if (gameType === 'quackshot') max = QUACKSHOT_MAX_ROUNDS;
            else if (gameType === 'killer') max = KILLER_MAX_ROUNDS;
            else if (gameType === 'shanghai') max = SHANGHAI_MAX_ROUNDS;
            else if (gameType === 'bangkok') max = BANGKOK_MAX_BEDS;
            else if (gameType === 'derby') max = DERBY_MAX_ROUNDS;
            else if (gameType === 'cricket') max = Math.max(1, Number(gameData && gameData.currentRound) || 1);
            return makeRoundAnnouncePhase(gameType, max);
        }

        case 'round_double': {
            const r = gameType === 'killer' ? 7 : (gameType === 'quackshot' ? QUACKSHOT_MAX_ROUNDS : 6);
            return makeRoundAnnouncePhase(gameType, r);
        }

        case 'round_triple':
            return makeRoundAnnouncePhase(gameType, 10);

        case 'bust':
            return makePhase('bust', {
                teamName: label,
                teamIndex: actor.teamIndex,
                avatar: actor.avatar
            });

        case 'intermission':
        case 'next': {
            const sampleTarget = (gameData.players && gameData.players[actor.teamIndex]
                && gameData.players[actor.teamIndex].targetNumber) || 20;
            return makePhase('intermission', {
                nextTeamIndex: actor.teamIndex,
                nextTeamName: label,
                nextPlayerIndex: actor.teamIndex,
                nextPlayerName: label,
                targetNumber: sampleTarget,
                avatar: actor.avatar
            });
        }

        case 'checkout':
            return makePhase('checkout', {
                teamName: label,
                teamIndex: actor.teamIndex,
                avatar: actor.avatar
            });

        case 'playoff': {
            const names = (gameData.teams || [])
                .slice(0, 2)
                .map((team, i) => (team[0] && team[0].name) || `Team ${i + 1}`);
            while (names.length < 2) names.push('Contender');
            return makePhase('playoff', {
                contenderNames: names,
                startScore: DEMOLITION_PLAYOFF_START
            });
        }

        case 'winner':
            if (gameType === 'harperwins') {
                return makePhase('winner', {
                    side: 'players',
                    headline: 'You guys beat Harper?!?!?',
                    sub: 'How did that happen!'
                });
            }
            return makePhase('winner', {
                teamIndex: actor.teamIndex,
                winnerId: 'preview',
                winnerName: label,
                avatar: actor.avatar,
                score: 85,
                rounds: 6
            });

        case 'harper_wins':
        case 'winner_harper': {
            const harper = (gameData && Array.isArray(gameData.players))
                ? gameData.players.find((p) => p && p.isHarper)
                : null;
            return makePhase('winner', {
                side: 'harper',
                winnerName: (harper && harper.name) || 'Harper',
                winnerAvatar: (harper && harper.avatar) || null,
                headline: 'Harper Wins',
                sub: 'Everyone else hit zero.'
            });
        }

        case 'draw': {
            const players = (gameData.players || []).slice(0, 2);
            while (players.length < 2) {
                players.push({ name: `Racer ${players.length + 1}`, avatar: null, score: DERBY_MAX_TICKS });
            }
            return makePhase('draw', {
                contenders: players.map(p => ({
                    id: p.id,
                    name: p.name || 'PLAYER',
                    avatar: p.avatar || null,
                    score: p.score != null ? p.score : DERBY_MAX_TICKS
                })),
                names: players.map(p => p.name || 'PLAYER')
            });
        }

        case 'past_post':
            return makePhase('past_post', {
                playerName: label,
                avatar: actor.avatar,
                targetNumber: (gameData.players && gameData.players[actor.teamIndex]
                    && gameData.players[actor.teamIndex].targetNumber) || 20
            });

        case 'life_loss':
            return makePhase('life_loss', {
                playerName: label,
                avatar: actor.avatar,
                livesBefore: 2,
                eliminated: false
            });

        case 'life_out':
            return makePhase('life_loss', {
                playerName: label,
                avatar: actor.avatar,
                livesBefore: 1,
                eliminated: true
            });

        case 'boost_double':
            return makePhase('mult_boost', {
                playerName: label,
                avatar: actor.avatar,
                actorName: label,
                multiplier: 2,
                steps: 2,
                quip: 'Full Gallop!',
                selfHit: true,
                targetNumber: 20
            });

        case 'boost_triple':
            return makePhase('mult_boost', {
                playerName: label,
                avatar: actor.avatar,
                actorName: label,
                multiplier: 3,
                steps: 3,
                quip: 'Thundering Ahead!',
                selfHit: true,
                targetNumber: 20
            });

        case 'knock_single':
            return makePhase('mult_knock', {
                playerName: label,
                avatar: actor.avatar,
                actorName: 'RIVAL',
                multiplier: 1,
                steps: 1,
                quip: 'Nicked!',
                selfHit: false,
                targetNumber: 20
            });

        case 'knock_double':
            return makePhase('mult_knock', {
                playerName: label,
                avatar: actor.avatar,
                actorName: 'RIVAL',
                multiplier: 2,
                steps: 2,
                quip: 'Boxed In!',
                selfHit: false,
                targetNumber: 20
            });

        case 'knock_triple':
            return makePhase('mult_knock', {
                playerName: label,
                avatar: actor.avatar,
                actorName: 'RIVAL',
                multiplier: 3,
                steps: 3,
                quip: 'Lost A Length!',
                selfHit: false,
                targetNumber: 20
            });

        case 'bar_set':
        case 'bar_status':
        case 'bar_clear':
            return makePhase('bar_status', {
                playerName: label,
                avatar: actor.avatar,
                mode: 'clear',
                headline: `${label} Cleared The Bar!`,
                badge: 'BAR LOWERED TO: 28',
                barValue: 28
            });

        case 'bar_hold':
            return makePhase('bar_status', {
                playerName: label,
                avatar: actor.avatar,
                mode: 'hold',
                headline: `${label} Matched The Bar!`,
                badge: 'BAR HOLDS: 36',
                barValue: 36
            });

        case 'became_killer':
            return makePhase('became_killer', {
                playerName: label,
                avatar: actor.avatar,
                targetNumber: 20
            });

        case 'lost_killer':
            return makePhase('lost_killer', {
                playerName: label,
                avatar: actor.avatar,
                attackerName: 'RIVAL',
                targetNumber: 20,
                livesRemaining: 1
            });

        case 'death':
            return makePhase('death', {
                attackerName: 'RIVAL',
                victimName: label,
                victimAvatar: actor.avatar,
                hitNumber: 20
            });

        case 'k_boost_double':
            return makePhase('mult_boost', {
                playerName: label,
                avatar: actor.avatar,
                multiplier: 2,
                steps: 2,
                quip: 'Double Tap!',
                targetNumber: 20
            });

        case 'k_boost_triple':
            return makePhase('mult_boost', {
                playerName: label,
                avatar: actor.avatar,
                multiplier: 3,
                steps: 3,
                quip: 'Marked Cold!',
                targetNumber: 20
            });

        case 'k_knock_double':
            return makePhase('mult_knock', {
                playerName: label,
                avatar: actor.avatar,
                actorName: 'RIVAL',
                multiplier: 2,
                steps: 2,
                quip: 'Cut Deep!',
                targetNumber: 20
            });

        case 'k_knock_triple':
            return makePhase('mult_knock', {
                playerName: label,
                avatar: actor.avatar,
                actorName: 'RIVAL',
                multiplier: 3,
                steps: 3,
                quip: 'Bleed Out!',
                targetNumber: 20
            });

        case 'strike':
            return makePhase('death', {
                attackerName: 'RIVAL',
                victimName: label,
                victimAvatar: actor.avatar,
                hitNumber: 20
            });

        case 'cricket_score':
            return makePhase('cricket_score', {
                playerName: label,
                avatar: actor.avatar,
                target: 20,
                targetLabel: '20',
                points: 40,
                marksAfter: 3,
                opened: false,
                numberClosed: false,
                totalScore: 40,
                quip: 'On The Board!'
            });

        case 'cricket_closed':
        case 'cricket_open':
            return makePhase('cricket_closed', {
                playerName: label,
                avatar: actor.avatar,
                target: 19,
                targetLabel: '19',
                marksAfter: 3,
                quip: 'Closed!'
            });

        case 'cricket_dead':
        case 'cricket_close':
            return makePhase('cricket_dead', {
                playerName: label,
                avatar: actor.avatar,
                target: 18,
                targetLabel: '18',
                quip: 'No More Points!'
            });

        // Outer bull (+2) and double bull (+3) both use phase type 'bullseye'
        // (engine sets hit.bullseye for zone 'bull' and 'double_bull').
        case 'outer_bull':
            return makePhase('bullseye', {
                playerName: label,
                avatar: actor.avatar,
                bullseyes: 1,
                zone: 'bull',
                points: 2,
                label: '+2',
                title: 'Outer Bull!',
                winning: false
            });

        case 'double_bull':
        case 'bullseye':
            // bullseyes: 2 triggers the double-duck knockdown on the bull overlay
            return makePhase('bullseye', {
                playerName: label,
                avatar: actor.avatar,
                bullseyes: 2,
                zone: 'double_bull',
                points: 3,
                label: '+3',
                title: 'Double Bullseye!',
                winning: false
            });

        case 'zone_minus':
        case 'ring_of_fire':
            return makePhase('zone_hit', {
                playerName: label,
                avatar: actor.avatar,
                zone: 'triple',
                points: -2,
                label: '−2',
                title: 'Ring of Fire!'
            });

        case 'splash':
        case 'zone_splash':
            return makePhase('splash', {
                playerName: label,
                avatar: actor.avatar,
                zone: 'board',
                points: -1,
                label: '−1',
                title: 'Splash!'
            });

        case 'miss':
            return makePhase('miss', {
                playerName: label,
                avatar: actor.avatar,
                hits: 0,
                eliminated: false
            });

        case 'elim':
        case 'eliminated':
            return makePhase('elim', {
                playerName: label,
                avatar: actor.avatar,
                hits: 0,
                eliminated: true
            });

        case 'push':
            return makePhase('push', {
                playerName: label,
                avatar: actor.avatar,
                hits: 1
            });

        case 'harper_minus1':
        case 'harper-1': {
            const harper = (gameData && Array.isArray(gameData.players))
                ? gameData.players.find((p) => p && p.isHarper)
                : null;
            return makePhase('harper_minus1', {
                playerName: label,
                avatar: actor.avatar,
                hits: 2,
                harperName: (harper && harper.name) || 'Harper',
                harperAvatar: (harper && harper.avatar) || null
            });
        }

        case 'harper_minus2':
        case 'harper-2': {
            const harper = (gameData && Array.isArray(gameData.players))
                ? gameData.players.find((p) => p && p.isHarper)
                : null;
            return makePhase('harper_minus2', {
                playerName: label,
                avatar: actor.avatar,
                hits: 3,
                harperName: (harper && harper.name) || 'Harper',
                harperAvatar: (harper && harper.avatar) || null
            });
        }

        case 'harper_triple':
        case 'triple': {
            const harper = (gameData && Array.isArray(gameData.players))
                ? gameData.players.find((p) => p && p.isHarper)
                : null;
            return makePhase('harper_triple', {
                playerName: (harper && harper.name) || 'Harper',
                avatar: (harper && harper.avatar) || actor.avatar,
                label: 'T20',
                number: 20,
                dartIndex: 1
            });
        }

        case 'harper_double':
        case 'double': {
            const harper = (gameData && Array.isArray(gameData.players))
                ? gameData.players.find((p) => p && p.isHarper)
                : null;
            return makePhase('harper_double', {
                playerName: (harper && harper.name) || 'Harper',
                avatar: (harper && harper.avatar) || actor.avatar,
                label: 'D20',
                number: 20,
                dartIndex: 1
            });
        }

        case 'harper_bullseye': {
            const harper = (gameData && Array.isArray(gameData.players))
                ? gameData.players.find((p) => p && p.isHarper)
                : null;
            return makePhase('harper_bullseye', {
                playerName: (harper && harper.name) || 'Harper',
                avatar: (harper && harper.avatar) || actor.avatar,
                label: 'DBULL',
                number: 'bull',
                dartIndex: 1
            });
        }

        default:
            return null;
    }
}

function initialMatchSchedule(gameData) {
    if (!gameData || !gameData.phase || gameData.phase.type !== 'round_announce') return null;
    const gt = gameData.gameType;
    if (!gt) return null;
    return scheduleAfterRoundAnnounce(gt);
}

module.exports = {
    initGameData,
    handleGameAction,
    applyScheduledAction,
    buildDebugPreviewPhase,
    initialMatchSchedule,
    buildQuick10MatchRecord,
    buildProfiledThrowSpec,
    normalizeThrowProfileId,
    getThrowProfile,
    parseBotFromName,
    getActiveThrowerEntity,
    THROW_PROFILES,
    THROW_PROFILE_IDS,
    DEFAULT_THROW_PROFILE,
    CRICKET_MAX_PLAYERS,
    X01_MAX_PLAYERS,
    HARPER_WINS_MAX_PLAYERS,
    QUICK10_ROUNDS
};
