# FlightDeck — open todos

Working notes (not a roadmap). Check items off or move into changelog when done.

## Venue idle

- [x] **Two idle knobs** in `data/venue.json`: `registrationIdleMs`, `inGameIdleMs` (default 5 min each).
- [x] **Control Registration** — after `registrationIdleMs` quiet, release avatar camera; interaction reopens it.
- [x] **Wake lock** — only while `IN_GAME` and within `inGameIdleMs` of last activity (Control action / throw); otherwise release so OS may sleep.
- [x] **Autodarts standby via venue** — `autodartsStandbyMinutes` (5|10|15|30|60) pushed with `PATCH /api/config` on boot / venue reload / board swap.
- [ ] **OS sleep vs wake** — releasing wake lock allows sleep; a sleeping Viewer Mac will not auto-wake on match start (power/wake-on-LAN / display settings).

## Pinned (later)

- [x] **TVMRecorder / face-cam rolling buffer** — ADMac agent `public/tvm-recorder/`. Venue `tvmRecorderEnabled` + Demolition checkout TVM.
