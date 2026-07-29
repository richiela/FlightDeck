/**
 * OpenDarts THROW_DETECTED / throw entry → FlightDeck TRIGGER_SPECIFIC_THROW
 * Sectors: sN/SN (inner/outer single), DN, TN, Bull, 25, None/MISS
 */
function mapOpenDartsThrow(payload) {
    if (!payload || typeof payload !== 'object') {
        return { type: 'TRIGGER_SPECIFIC_THROW', miss: true };
    }

    if (payload.bounceout) {
        return {
            type: 'TRIGGER_SPECIFIC_THROW',
            miss: true,
            sector: payload.sector || 'bounceout'
        };
    }

    const sectorRaw = payload.sector != null ? String(payload.sector).trim() : '';
    const sector = sectorRaw;
    const upper = sector.toUpperCase();

    if (!sector || upper === 'NONE' || upper === 'MISS') {
        return {
            type: 'TRIGGER_SPECIFIC_THROW',
            miss: true,
            sector: sector || 'None'
        };
    }

    if (upper === 'BULL') {
        return {
            type: 'TRIGGER_SPECIFIC_THROW',
            number: 'bull',
            multiplier: 2,
            sector
        };
    }

    if (sector === '25' || upper === 'S25') {
        return {
            type: 'TRIGGER_SPECIFIC_THROW',
            number: 'bull',
            multiplier: 1,
            sector
        };
    }

    // Prefer explicit number + multiplier when present
    const multNum = Number(payload.multiplier);
    const numField = payload.number;
    if (
        [1, 2, 3].includes(multNum)
        && numField != null
        && String(numField).toLowerCase() !== 'bull'
    ) {
        const n = Number(numField);
        if (Number.isFinite(n) && n >= 1 && n <= 20) {
            return {
                type: 'TRIGGER_SPECIFIC_THROW',
                number: n,
                multiplier: multNum,
                sector: sector || `${multNum === 3 ? 'T' : multNum === 2 ? 'D' : 'S'}${n}`
            };
        }
    }

    const match = sector.match(/^([SsDT])(20|1[0-9]|[1-9])$/);
    if (!match) {
        return { type: 'TRIGGER_SPECIFIC_THROW', miss: true, sector };
    }
    const multChar = match[1];
    const multiplier = multChar === 'T' ? 3 : multChar === 'D' ? 2 : 1;
    return {
        type: 'TRIGGER_SPECIFIC_THROW',
        number: Number(match[2]),
        multiplier,
        sector
    };
}

module.exports = { mapOpenDartsThrow };
