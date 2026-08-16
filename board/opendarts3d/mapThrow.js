/**
 * OpenDarts-3D (dart3d) THROW_DETECTED → FlightDeck TRIGGER_SPECIFIC_THROW
 *
 * Vocabulary per ~/Projects/opendarts-3d/docs/LIVE_API.md (authoritative;
 * confirmed against dart3d.geometry.board.sector_ring_for_point directly):
 *   ring:   "bull" | "outer_bull" | "single_inner" | "treble" | "single_outer"
 *           | "double" | "outside"
 *   sector: wedge number as a string ("1".."20"), or null for
 *           bull/outer_bull/outside.
 * Not OD's "T20"/"D5" spelling — deliberately different (see that doc's
 * "Deliberate divergences from OD").
 *
 * single_inner / single_outer stay distinct (sN vs SN), same convention
 * Autodarts uses here (board/autodarts/mapThrow.js) — SingleInner → sN
 * (+1 Quackshot duck), SingleOuter → SN (−1 splash). Ring, not a shared
 * "S5" string, is the real discriminator on both providers.
 */

/**
 * A dart that isn't scored surfaces today as `ok: false` + `sector: null`
 * + a real `reason` string — LIVE_API.md's own "Gaps" section is explicit
 * that there is no dedicated bounce-out flag *yet*. Richie's said one is
 * coming (2026-08-16): once the API adds an explicit field, check it here
 * first, before falling back to the ok:false inference below — do not
 * delete the fallback when that lands, older/standalone dart3d instances
 * won't have the new field either.
 */
function isExplicitBounceout(payload) {
    return !!(payload && (payload.bounceout || payload.bounce_out));
}

function mapOpenDarts3DThrow(payload) {
    if (!payload || typeof payload !== 'object') {
        return { type: 'TRIGGER_SPECIFIC_THROW', miss: true };
    }

    if (isExplicitBounceout(payload)) {
        return {
            type: 'TRIGGER_SPECIFIC_THROW',
            miss: true,
            sector: 'bounceout'
        };
    }

    const ring = payload.ring != null ? String(payload.ring).trim() : '';
    const sectorRaw = payload.sector != null ? String(payload.sector).trim() : '';

    // ok:false is the current (pre-explicit-bounceout) miss signal — sector
    // is always null alongside it per LIVE_API.md, but don't depend on that.
    if (payload.ok === false || ring === 'outside' || !ring) {
        return {
            type: 'TRIGGER_SPECIFIC_THROW',
            miss: true,
            sector: payload.reason ? String(payload.reason) : (ring || 'outside')
        };
    }

    if (ring === 'bull') {
        return {
            type: 'TRIGGER_SPECIFIC_THROW',
            number: 'bull',
            multiplier: 2,
            sector: 'Bull'
        };
    }

    if (ring === 'outer_bull') {
        return {
            type: 'TRIGGER_SPECIFIC_THROW',
            number: 'bull',
            multiplier: 1,
            sector: '25'
        };
    }

    const n = Number(sectorRaw);
    if (!Number.isFinite(n) || n < 1 || n > 20) {
        return { type: 'TRIGGER_SPECIFIC_THROW', miss: true, sector: sectorRaw || ring };
    }

    if (ring === 'treble') {
        return { type: 'TRIGGER_SPECIFIC_THROW', number: n, multiplier: 3, sector: `T${n}` };
    }
    if (ring === 'double') {
        return { type: 'TRIGGER_SPECIFIC_THROW', number: n, multiplier: 2, sector: `D${n}` };
    }
    if (ring === 'single_inner') {
        return { type: 'TRIGGER_SPECIFIC_THROW', number: n, multiplier: 1, sector: `s${n}` };
    }
    if (ring === 'single_outer') {
        return { type: 'TRIGGER_SPECIFIC_THROW', number: n, multiplier: 1, sector: `S${n}` };
    }

    // Unknown ring name (future API addition) — don't silently misscore.
    return { type: 'TRIGGER_SPECIFIC_THROW', miss: true, sector: `${ring}:${sectorRaw}` };
}

module.exports = { mapOpenDarts3DThrow, isExplicitBounceout };
