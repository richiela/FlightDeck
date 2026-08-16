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
 *
 * `bounce_suspected` / `ranked_sectors` (added 2026-08-16 on dart3d's
 * feature/native-bounce-detection branch — not yet merged to main, not
 * yet what the live :8788 instance runs; see docs/ENGINES.md's "Bounce-out
 * detection" / "Ranked sector candidates" sections for the full contract):
 *   bounce_suspected: null | true | false — tri-state, per-engine native
 *     signal. Does NOT override ok/sector/ring itself (each engine's own
 *     unvalidated opinion, most informative when ok:false already). Only
 *     used here to make a miss's `sector` label more specific.
 *   ranked_sectors: null, or [{rank, sector, ring, votes}, ...] sorted by
 *     votes desc, only ever populated when primary_engine is "Uber" (the
 *     only engine with >1 candidate to rank) — every other engine reports
 *     null (single-candidate, nothing to rank). Rank 1 always matches the
 *     top-level sector/ring when ok:true. Scoring doesn't need this at
 *     all — it's carried through untouched (mapThrow only reads sector/
 *     ring/ok) so a future Correct Score UI can prepopulate its guess
 *     with rank 2 when the operator says the primary read was wrong.
 */
function mapOpenDarts3DThrow(payload) {
    if (!payload || typeof payload !== 'object') {
        return { type: 'TRIGGER_SPECIFIC_THROW', miss: true };
    }

    const ring = payload.ring != null ? String(payload.ring).trim() : '';
    const sectorRaw = payload.sector != null ? String(payload.sector).trim() : '';

    if (payload.ok === false || ring === 'outside' || !ring) {
        const bounceSuspected = payload.bounce_suspected === true;
        return {
            type: 'TRIGGER_SPECIFIC_THROW',
            miss: true,
            sector: bounceSuspected
                ? 'bounceout'
                : (payload.reason ? String(payload.reason) : (ring || 'outside'))
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

module.exports = { mapOpenDarts3DThrow };
