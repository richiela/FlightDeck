# FlightDeck Changelog

Reconstructed from version freezes under `../revisions/` and project chat history.
Working copy: `FlightDeck`. Frozen snapshots: `../revisions/FlightDeck.v*`.

Keep **`## Unreleased`** at the **bottom** current between revision freezes — that is the pending-changes list for the side window.

---

## v0.1 — FlightDeck.v01 (≈ Jul 13)

- Warm Up polish; first formal checkpoint
- Deploy preserving live `players.json`
- Dev/mock on **4000**, live board on **3000**
- Early foundation (same era): Demolition, Limbo, Derby, Killer, Quackshot, Cricket; Control/Viewer sync; doubles roster beginnings; SFX/help; Quackshot transition polish

## v0.12 — FlightDeck.v12 (≈ Jul 14)

- Doubles / duo layout polish
- Shared gold dart counters
- Killer duo layout fix

## v0.13 — FlightDeck.v13 (≈ Jul 14)

- Roster UI: Control team frames match Viewer
- Singles / doubles seating layout

## v0.13.1 — FlightDeck.v13.1 (≈ Jul 15)

- Limbo rules: always 3 darts, bar starts at 60, early bust when remaining darts can’t keep under the bar

## v0.14 — FlightDeck.v14 (≈ Jul 15)

- Correct Score (last-dart undo / correct)
- `revisions/` checkpoint workflow
- Deploy must preserve `players.json` and `scolia.json`

## v0.15 — FlightDeck.v15 (≈ Jul 15–16)

- Event Video mode: bust / winner clips
- Viewer Video toggle
- Overlay holds until clip finishes (`transition-video-timing`)

## v0.15.1 — FlightDeck.v15.1 (≈ Jul 16)

- Additional winner clips + redeploy

## v0.15.2 — FlightDeck.v15.2 (≈ Jul 16)

- **Shanghai** ships (8 rounds, Killer-like board, singles + doubles)

## v0.15.3 — FlightDeck.v15.3 (≈ Jul 20 AM)

- Checkpoint QA charter + visual baselines
- Themed round-announce intros
- Active-player orbit ring
- Killer / video timing fixes

## v0.15.4 — FlightDeck.v15.4 (≈ Jul 20 midday)

- **Quick 10** game
- Match history persistence (`data/matches.jsonl`)

## v0.16 — FlightDeck.v16 (≈ Jul 20 PM)

- Social / Classic game-selection tabs
- **X01** (301 / 501 / 701 / 901, dart-in / dart-out)
- Updated playing-layout visual baselines

## v0.16.1 (≈ Jul 21) — badge only; no `revisions/` freeze

- Deploy target → **`FlightDeck.prod`** (containerized)
- Viewer header version badge (kept in sync with Control)

## v0.17 — FlightDeck.v17 (≈ Jul 21)

- **Harper Wins** (FREE / miss rules, Easy/Hard, red theme, photo bg)
- Unique player names on registration
- Debug Next Player keeps normal overlays (no flush/skip)
- Throw skill profiles: Casual / Intermediate / Advanced (debug dropdown; Quackshot zone table; Derby threat/lead aim)
- Bots via name prefix `Bot/C`, `Bot/I`, `Bot/A` + auto-throw on their turn
- Everyone from `players.json` starts on the waiting bench; **singles mode by default** on load (no auto-doubles for large rosters)
- Dart callout on Viewer after every throw; Control **Callout ms** (0 = off)
- Derby callout shows the sector hit; **MISS** only for real board misses
- Playing-layout visual baselines → `qa/visual-baselines/2026-07-21-v17` (incl. Harper Wins)

---

## v0.17.1 — FlightDeck.v17.1 (≈ Jul 22)

- Harper Wins: **removed Easy/Hard** — one ruleset only
- Harper Wins: must hit the **same bed in order** (S/D/T + bull); FREE still auto-greens Harper’s miss slots
- Harper Wins: Harper can **earn points** (challenger 0 hits → you −1 and Harper +1); Harper also −1 per board miss when setting the pattern
- Harper Wins: start at **5 pts**; next-player screens between throwers
- Harper Wins: event/transition **videos** (miss, push, elim, Harper −1/−2, triple/double/bullseye, win screens) with Video-mode overlay holds
- Harper Wins: visit history scrolls with **newest on top** (blank live row until round ends, then archive downward)
- Bot persona **Dummy** (`Bot/D`) — very low hit rate (~12% on aim)
- Control Waiting bench: drag reorder with **insert/shift** (not swap); drop on a card inserts before it, drop on empty track appends
- Waiting drag: Mac-dock-style slide — other cards shift aside to open a gap (no gold highlight on the card under the cursor)
- Control lineup (singles + doubles): drag reorder uses the same **insert/shift** + dock-style slide (flat seat order for doubles; no more swap/replace)
- `PORT` env override so mock QA can bind when 4000 is busy
- Playing-layout visual baselines → `qa/visual-baselines/2026-07-22-v17.1`

---

## v0.18.0 — FlightDeck.v0.18.0 (Jul 22, 2026)

- Board provider spike: `BoardDriver` factory (`board/createBoardDriver.js`) — pick **scolia** / **autodarts** / **mock** via `data/board.json` or `BOARD_PROVIDER`
- Autodarts **local Board Manager** driver (`ws://host:3180/api/events`) with throw/takeout/reset mapping (`data/board.json`)
- Control **Board Debug** panel: provider dropdown (Scolia / Autodarts / Mock) + Autodarts host/port + Apply — writes `data/board.json` and hot-swaps the driver (no hand-editing JSON)
- User-facing “Scolia” labels → **Board** (header pill toggle, debug title, waiting-for-events copy); vendor name kept only on the provider option / cloud-forward row
- WS `BOARD_UPDATE` (+ legacy `SCOLIA_UPDATE`); Control actions `BOARD_*` / `SET_BOARD_PROVIDER`
- Thin **Tapo P110M** dart-lights driver (`lights/tapoLights.js`) + Control **Dart Lights** panel (On / Off / Toggle / Refresh); creds in `data/credentials.json` (`tapo` block)
- Autodarts: board **Stopped → lights off**; board **active/Ready (incl. AD app Start) → lights on**; Control UI while stopped still **Start detection** (Scolia unchanged)
- Venue config `data/venue.json` (defaults in `venueConfig.js`): `arenaName`, `dartCalloutMs` (default 1200), `registrationIdleMs` / `inGameIdleMs` (default 5 min each), `autodartsStandbyMinutes` (5|10|15|30|60 → PATCH Board Manager camera standby), `splitGameCategories`, per-game `games` — **auto-reloads** when the file changes (no server restart)
- Venue idle: Control parks avatar camera after `registrationIdleMs`; Screen Wake Lock only while `IN_GAME` and within `inGameIdleMs` of last Control action / throw (Control + Viewer)
- Arena title drives Control + Viewer headers; disabled games hidden; category tabs optional; Debug Callout ms control removed
- Control Board Debug is a **global right dock** (same panel as in-game); Board toggle defaults **off** on Registration / Game Selection, **on** in-match
- Autodarts Start/Stop/Calibrate/Reset: await HTTP, log ↑ results in Board Debug, refresh Status/Phase; fallback paths `/api/detection/start|stop`
- Playing-layout visual baselines → `qa/visual-baselines/2026-07-22-v18.0`
- Checkpoint QA: port **3001** mock; class V layout chrome unchanged (promoted new baseline for capture noise); smoke start/exit all shipping games

---

## v0.18.1 — FlightDeck.v0.18.1 (Jul 22, 2026)

- **TVMRecorder** (ADMac): `public/tvm-recorder/` — rolling face-cam ring while `IN_GAME`; dump → upload to FD `public/clips/winner-*.mp4`
- Venue: `tvmRecorderEnabled` / `tvmRecorderHost` / `tvmRecorderPort` (match start → buffer start; leave/reset → stop)
- **Demolition TV Moment:** human checkout → brick clear → face clip → classic Site Cleared overlay (clip end advances; 20s safety max)
- Bot checkouts skip TVM (no dump / no face clip)
- Cam resolved by **`camName`** (default `Full HD webcam`) so USB index drift doesn’t break open; `camIndex` fallback
- TVMRecorder: serialize start/stop/dump; await ffmpeg exit + cam settle; timestamped logs; dump fails fast if ring empty
- HTTP listen defaults to **3000**; local `npm run dev` uses `PORT=4000` (mock board no longer moves the app off :3000)
- Renamed/removed all **admini** / ADMini naming; ADMac pull → `~/TVMRecorder` via `/tvm-recorder/pull.sh` (dev `10.0.0.111:4000`, prod `10.0.0.180:3000`)
- Cleanup: dropped obsolete `qa/face-clip-spike/` and `qa/visual-baselines/_pending/`
- Playing-layout visual baselines → `qa/visual-baselines/2026-07-22-v18.1`
- Checkpoint QA: port **3001** mock; class V layout chrome unchanged (promoted new baseline for capture noise)

---

## v0.18.2 — (Jul 23, 2026) — deploy only, no revision freeze

Mid-cycle prod deploy of the first Unreleased items (registration fade + min competitors). Folded into **v0.18.3** below.

---

## v0.18.3 — FlightDeck.v0.18.3 (Jul 23, 2026)

- Control registration refresh: hide form + Board Debug until shared BG is ready, then fade panels and BG together (no early UI flash)
- Block starting multiplayer games with fewer than **2 competitors** (singles: seated players; doubles: non-empty teams). Solo still allowed for **Warm Up**, **Quick 10**, and **X01**
- Registration camera: taller preview box (`min 200px` / up to `260px`) + `AVATAR_GUIDE.zoomOut` so laptop webcams frame more of the person (preview matches snap)
- Control registration camera: remove selfie mirror so preview + snap match real left/right
- Debug / throw provenance: rename leftover `SCOLIA_*` events to `BOARD_*` (`BOARD_THROW`, `BOARD_AWAIT_TAKEOUT`, `BOARD_TAKEOUT_CLEAR`, `BOARD_FALSE_TAKEOUT`); `source` uses the real provider (`scolia` / `autodarts` / `mock`) instead of always `"scolia"`
- TVMRecorder logs: timestamps use local wall clock instead of UTC (`toISOString`)
- Cricket: off-target hits (e.g. 14) call out the real dart (`S14`) instead of **MISS**; only bounce/miss stays MISS
- Cricket: dart callout uses hit number (`S19` / `BULL`) instead of `points` (avoids “Name + 0” on mark-only hits)
- Cricket mark hits: custom dart callout — avatar + hit (`S19`) + animated mark (`/` → `X` → circle), **1500ms** when marks progress; already-closed target (points/dead dart) and off-target/miss keep default callout + `dartCalloutMs`
- Cricket marks: larger X so tips sit outside the close-circle (scoreboard + mark-draw geometry)
- Control registration: **Add All** with more than 6 registered players auto-switches to doubles and seats everyone; **Remove All** always returns to singles mode
- Control Board Debug: Dart Lights folded into a compact strip (above provider); Apply aligned beside provider; unused log filters removed; tighter spacing; log height via `--fc-board-log-max` (Board Debug card sizes to content)
- Checkpoint QA: mandatory pre-freeze visual/layout pass **paused** (noisy PNG diffs; not catching real UI regressions)

---

## v0.18.4 — FlightDeck.v0.18.4 (Jul 29, 2026)

- Viewer/Control keep-awake: run Screen Wake Lock **and** silent looping video together (don’t drop video when Wake Lock “succeeds”); watchdog + pause/release retries
- Viewer keep-awake: full-screen “Tap to keep display on” gate on **iPad/iPhone only** (Control scoring does not count); enable Wake Lock + video in the same tap; re-show gate if the OS releases the lock
- Viewer keep-awake: only count Wake Lock from a Viewer tap as “held” on iOS (background request was hiding the gate while the screen still dimmed)
- Keep-awake: remove port-4000 no-op so mock/dev can test the tap gate and Wake Lock
- Keep-awake: headless/desktop Viewer auto Wake Lock + video with **no** tap overlay
- Limbo background: new beach sunset photo (`public/assets/limbo/bg.jpg`, right edge trimmed to drop watermark while keeping last guy clipped at the edge); previous kept as `bg-prev.jpg` for revert
- Repo layout: move `scoliaClient.js` → `board/scolia/scoliaClient.js` (alongside Autodarts)
- Cleanup: remove stray `players.json.backup`, leftover `public/clips/winner-*.mp4`, `.DS_Store`; drop all `*.example` config stubs (defaults live in code / `pull.sh` seeds `tvm-recorder.json`)
- Demolition/X01 bust (Video on): advance when bust clip ends (`BUST_VIDEO_COMPLETE`) instead of always holding 8.5s — removes dead pause after shorter clips; 8.5s remains safety max
- TVMRecorder: `transpose: 0` (or false/none) means **no rotation** — was broken by `|| 1` which forced rotate-90 and made Brio clips portrait (720×1280)

## v0.18.5 — FlightDeck.v0.18.5 (Aug 11, 2026)

- Autodarts: map `SingleInner` → `sN` and `SingleOuter` → `SN` so Quackshot awards +1 on inner singles (was always −1 splash because Autodarts names both `S5`)
- Derby / Killer: bull hits announce **BULL**/**DBULL** in dart callout (not MISS) — bull still has no horse/wedge effect
- Dart callout: if `lastThrow` has `miss` plus `number: 'bull'`, prefer BULL over MISS (safety net)
- Viewer keep-awake: remove full-screen tap gate (was annoying on Mac Mini Viewer); auto Wake Lock + silent video only
- Cleanup (Killer/X01/Cricket/Shanghai/Derby/Limbo): removed the dead `window.FC_renderPlayerBadge ? ... : '<div class="avatar-box">...'` fallback in each roster render — `shared-player-theme.js` is always loaded before this code runs, so the fallback branch never executed; now calls `FC_renderPlayerBadge()` directly. No visual change.
- Cleanup (Derby/Limbo): removed the local `.avatar-box` base rule (size/border/background/shadow) — fully duplicated `.fc-player-badge .avatar-box` in `shared-player-theme.css`; kept only each game's own `transition` value, which the shared rule doesn't set. No visual change (Derby's box-shadow now matches the shared 0.12 alpha instead of its previous 0.1, a barely-perceptible nudge).
- Cleanup (Demolition): Bust/Winner overlay split layout (`bust-split`/`winner-split` + stage/video-pane) now backed by the shared `.fd-winner-split`/`.fd-winner-stage`/`.fd-winner-video-pane` classes from `event-videos.css` instead of duplicating that geometry locally; removed the now-redundant local copies (base layout + `video-off` display/justify-content overrides). Kept Demolition-specific deltas as explicit local overrides: Bust's red/no-glow video border (Winner's gold+glow already matched the shared default exactly), and an explicit `height: 100%` in the `video-off` state so Demolition's centering doesn't pick up the shared default's `height: auto`. No visual change — verified with before/after screenshots of every debug-preview screen (bust, checkout, playoff, winner, next) in both Video-on and Video-off modes, real doubles + true singles lineups, and a genuine two-avatar doubles-team checkout (not just the debug-preview shortcut); only diffs were animated confetti/rubble particle positions and which random winner clip played, not layout.
- Cleanup (Derby): removed the redundant `window.FC_renderPlayerBadge` existence guard on the incremental avatar-refresh path (`else if (window.FC_renderPlayerBadge)` → `else`) — the shared script always loads, so the check was always true. No behavior change.
- Cleanup (`event-videos.css`): collapsed the three copy-pasted "multi-mode takeover" blocks (`.cricket-takeover`, `.killer-takeover`, `.sh-takeover` — each ~35 lines of identical split/stage/video-pane overrides, differing only in selector) into one shared rule set with combined selectors. Same selectors, same declared properties, just deduplicated — mathematically equivalent CSS. No visual change — verified with before/after screenshots across all of Killer's split modes (became/lost/death/winner) and Cricket/Shanghai's winner mode, video-on and video-off; Cricket came back byte-identical, Killer/Shanghai diffs were only random video-clip content.
- Cleanup (Harper Wins): `.hw-avatar` (event-card spotlight portrait, e.g. "Pattern Dart" overlay) now sized via `calc(var(--fc-avatar-overlay) - 20px)` instead of a hardcoded `120px`. Pixel-exact — 140 − 20 = 120 — verified 0px diff before/after on Triple/Bullseye/Miss event cards.

## v0.18.6 — FlightDeck.v0.18.6 (Aug 11, 2026)

- Control registration: player cards (waiting bench + singles/doubles lineup) use **pointer drag** instead of HTML5 DnD so **iPad finger** can reorder / seat players the same way a mouse can (HTML5 drag-and-drop does not fire for touch on iPadOS Safari)
- Control registration left panel: photo preview is the flexible middle (`min-height` 120px, shrinks first) so Register + Lineup buttons stay inside the gold box on shorter / non-fullscreen iPad viewports
- Control lineup drag: drop on an **empty** slot places the player there; drop on an **occupied** slot **swaps** (bench→occupied sends the previous occupant back to Waiting). Replaces the old insert-shift / dock-pack behavior that made open seats feel blocked. Singles still caps at 6 seated (7th onto an empty slot still auto-promotes to doubles)

## v0.18.7 — FlightDeck.v0.18.7 (Aug 16, 2026)

- **Bangkok** (Classic): new game — beds **20→1**, **6 darts** per bed (120 darts solo), marks on the live bed only (**S=1 / D=2 / T=3**); singles or doubles (max 6), solo-start allowed; Viewer shows big target, 18-mark tick row, 6 dart slots, and a 20→1 bed strip; next-player overlay for multiplayer only (solo skips straight to next-bed announce); light winner/draw screens
- Bangkok Viewer: fix roster avatar call (`FC_renderPlayerBadge(avatar, name, …)` was passed the whole player object) and show the active thrower’s badge above the target
- Bangkok Viewer: drop the 18-tick mark grid; keep the 6 dart slots; **Marks this bed** uses Cricket glyphs in groups of 3 (`/` / `X` / circled-X) instead of a numeric total; thrower sits as a clean circle beside the bed number (no square card chrome)
- Bangkok Viewer: remove center avatar + bottom 20→1 strip; restore boxed left roster; dartboard beside bed number with live wedge lit in place (no pizza-pull — that left a hole and made 20 look wrong); main stage spaced out more
- Bangkok Viewer: drop “Bed X of 20…”; under the big number, a fixed **6-slot marks tray** (room for 6 circled-X) fills **middle → out** as marks land
- Bangkok dart slots: off-target hits no longer show as a red bare number (e.g. “11”); true miss → red **MISS**, wrong bed → muted number, scoring hit → gold S/D/T
- Bangkok Viewer: replace under-number marks tray with a vertical **20→1** beds board (20 on top); each row has a box of **6 cricket mark slots** filled from the active thrower’s `bedScores`; current bed highlighted, future beds muted
- Bangkok dart slots: any non-scoring throw shows red **MISS** again (no muted off-target number labels)
- Bangkok Viewer: rebuild main stage — large board + aim number + live cricket marks for the current bed; **6 dart slots** only for this bed; slim **20→1** mark trail (glyphs only, no empty boxes); drop the full beds spreadsheet pane
- Bangkok Viewer: strip to play surface only — aim number + lit board + 6 dart slots; drop marks under the aim and the bottom trail (history parked); lineup is a compact list (40px face + name + total), vertically centered
- Bangkok Viewer: past-bed history as **board heat** — completed wedges glow lotus by marks from the active thrower’s `bedScores` (cold = 0 / hot ≈ 12+); current stays gold; future stays muted (no cricket trail / number grid)
- Dart lights (Autodarts/OpenDarts): auto **off** only after board stays **Stopped ≥ 3s**; leaving Stopped (or any brief flap) cancels the pending off so reset/status bounce no longer blinks the LED
- **New board provider: OpenDarts-3D** (`board/opendarts3d/`) — dart3d's multi-camera capture server (`ws://host:8788/api/events` + REST), default `10.0.0.181:8788` (the Mac Mini running camera capture, not the Synology other providers default to). Throw mapping uses dart3d's real ring vocabulary (`bull`/`outer_bull`/`single_inner`/`treble`/`single_outer`/`double`/`outside`, confirmed against `~/Projects/opendarts-3d/docs/LIVE_API.md` and `dart3d.geometry.board.sector_ring_for_point` directly, not guessed from samples). Selectable in Control's Board Debug provider dropdown alongside Autodarts/OpenDarts. Verified against the live instance: connects, parses `HELLO`, correctly derives status/calibration/websocket-client-count.
  - `sendCommand('correct', {visitId, index, sector, ring, source, note})` pushes an operator correction back to dart3d via its real `/api/visits/{id}/throws/{index}/correct` endpoint.
- OpenDarts-3D driver updated for the real `bounce_suspected` / `ranked_sectors` contract (dart3d's `feature/native-bounce-detection` branch, not yet merged to main or live on :8788 — `docs/ENGINES.md`'s "Bounce-out detection" / "Ranked sector candidates" sections). Replaced the earlier speculative `payload.bounceout`/`bounce_out` guess with the real, tri-state `bounce_suspected` field — a miss (`ok:false`) now reports sector `"bounceout"` when the primary engine's own native signal says `true`, otherwise falls through to the real `reason` string as before. `THROW_DETECTED`'s `ranked_sectors` (populated only when `primary_engine` is `"Uber"`, the only engine with >1 candidate to rank) is now surfaced as `lastThrow.rankedSectors`.
- Control's existing Correct Score form now defaults to OpenDarts-3D's rank-2 candidate instead of the static S20/Inner default, when one exists (`lastThrow.rankedSectors`, Uber-only per above). No new UI — same number/multiplier/ring fields, just prepopulated with the next most-voted candidate so the common "the primary read was wrong, the second guess was right" case is one click. Applied once per correction session (not every state broadcast) so it never overwrites an operator's manual edit mid-correction; every other provider keeps today's static default unchanged.

## v0.18.8 — FlightDeck.v0.18.8 (Aug 17, 2026)

- **Bangkok fix**: was scoring each bed as one continuous 6-dart visit, so the shared 3-dart takeout trigger (`server.js`, applies to every game, unmodified) fired mid-bed after the 3rd dart while Bangkok's own turn state still expected 3 more — the board got told to wait for a takeout it wasn't ready for. Fixed entirely in `gameEngines.js`: a bed is now two proper 3-dart visits (`BANGKOK_DARTS_PER_VISIT = 3`, matching the hard 3-dart-per-visit rule every other game and real board hardware already use — not a Bangkok exception), tracked via a new `bangkokVisitInBed` counter. Multiplayer is round-robin: all players throw visit 1 on the bed, wrap back for visit 2, *then* the bed advances (with the round-announce firing only on that real bed change, not on the visit-1→visit-2 handoff). Verified by driving the actual game engine directly through 13 darts in both solo and 2-player shapes — turn/visit/bed sequencing all correct, scores land exactly right (6 points each from 6 darts per bed, split 3+3).
- Dart lights: OpenDarts-3D now counts as a detection-lights provider (stop/start actually drive the LED). Delayed auto-off no longer bails if the “still stopped?” check is messy — if Start never cancelled the 3s timer, lights go off. `detectionBoardLooksStopped` now treats 3D `!running` (and not `starting`) as stopped.

## Unreleased — since FlightDeck.v0.18.8

- None yet.

