# Might As Well Jump Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first plain-JavaScript Survivor Geek puzzle with Standard/Random modes, rotating six-chute wheel mechanics, resumable timing, sharing, and separate Firebase leaderboards.

**Architecture:** Create a new `EmbeddedApps/MightAsWellJump/` app. Keep deterministic puzzle state and rules in `src/game-engine.js`, browser persistence in `src/persistence.js`, Firebase leaderboard logic in `src/leaderboard.js`, sound in `src/audio.js`, and DOM/input orchestration in `src/app.js`. Use CSS transforms for a rotating wheel with balls as children of each chute so they remain locked to the wheel during rotation.

**Tech Stack:** HTML5, CSS3, vanilla ES modules, Pointer Events, Web Audio API, localStorage, Firebase Web SDK 10.12.2, Node 20+ built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-01-might-as-well-jump-design.md`

## Global Constraints

- Plain HTML/CSS/JavaScript; no framework and no build step.
- Mobile-first and usable in a GitHub Pages/iframe deployment.
- Six 60-degree wheel stops; passer starts at 6 o'clock in both modes.
- Normal chute target order outside → inside is yellow, orange, red, blue, green.
- Successful ball transfer = 1 move; wheel rotation = 0 moves.
- Timer starts on first successful transfer or rotation to a different snapped stop.
- No pause.
- Standard and Random leaderboards are independent; fastest time first, fewest moves tiebreaker.
- Sound and color symbols default off and persist locally.
- Do not reveal the green-ball solving strategy in normal instructions.
- Do not replace currently deployed Firestore rules wholesale without first merging against the live/current rules.
- Do not invent the Cloudflare Worker route implementation; add that only after the Worker source is available.

---

### Task 1: Scaffold the app and isolate deterministic game rules

**Files:**
- Create: `EmbeddedApps/MightAsWellJump/package.json`
- Create: `EmbeddedApps/MightAsWellJump/src/game-engine.js`
- Create: `EmbeddedApps/MightAsWellJump/tests/game-engine.test.js`

**Interfaces:**
- Produces: `COLORS`, `TARGET_ORDER`, `MODE`, `STANDARD_START`, `createStandardGame()`, `createRandomGame(randomFn?)`, `rotate(state, deltaStops)`, `transferChuteToCenter(state)`, `transferCenterToChute(state)`, `isSolved(state)`, `serializeState(state)`.
- Game state shape: `{ mode, chutes, center, wheelStop, moves, started, solved, initialChutes }` where `chutes` contains six arrays indexed `[passer, chute1, chute2, chute3, chute4, chute5]` and each chute array is outside → inside.

- [ ] **Step 1: Add a dependency-free test command**

```json
{
  "type": "module",
  "scripts": {
    "test": "node --test tests/*.test.js"
  }
}
```

- [ ] **Step 2: Write failing tests for exact Standard state and target order**

Test that `TARGET_ORDER` is `['yellow','orange','red','blue','green']`, passer is empty, `wheelStop === 0`, center is null, and the five standard chutes exactly match the approved layout.

- [ ] **Step 3: Run the tests and verify failure**

Run: `cd EmbeddedApps/MightAsWellJump && npm test`
Expected: FAIL because `src/game-engine.js` does not exist.

- [ ] **Step 4: Implement constants and `createStandardGame()` minimally**

Use immutable source constants and clone arrays when creating state so Restart cannot mutate the canonical Standard definition.

- [ ] **Step 5: Write failing tests for Random mode invariants**

Cover exactly 25 balls, five of each color, five balls in each normal chute, empty passer/center, passer at 6 o'clock, and rejection of an already-solved shuffle. Inject `randomFn` so tests are deterministic.

- [ ] **Step 6: Implement `createRandomGame(randomFn = Math.random)`**

Use Fisher-Yates shuffle over the 25-color multiset, split into five 5-ball normal chutes, and reshuffle if all five chutes equal `TARGET_ORDER`.

- [ ] **Step 7: Write failing tests for legal and blocked transfers**

Cover chute→center taking the innermost occupied ball, no movement of remaining balls, center→chute using the innermost available slot, full-chute rejection, occupied-center rejection, move increments only for successful transfers, and transfer availability only for the chute at `wheelStop` aligned to 6 o'clock.

- [ ] **Step 8: Implement transfer functions**

Represent a partially emptied chute as a fixed five-slot array containing color strings or `null`, preserving outer positions. For center→chute, place into the highest-index `null` slot that is directly inward of the occupied block; for an empty passer, fill from outside toward inside as balls accumulate so the next transfer back out always removes the innermost currently occupied ball.

- [ ] **Step 9: Write failing tests for wheel rotation and win detection**

Verify rotation wraps 0–5, does not increase moves, reports whether the stop changed, and `isSolved()` requires five exact target chutes plus empty passer and center regardless of wheel stop.

- [ ] **Step 10: Implement rotation and solved-state logic**

`rotate()` returns `{ state, changed }` or an equivalent explicit signal so UI timing can start only when the snapped stop actually changes.

- [ ] **Step 11: Run all engine tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add EmbeddedApps/MightAsWellJump/package.json EmbeddedApps/MightAsWellJump/src/game-engine.js EmbeddedApps/MightAsWellJump/tests/game-engine.test.js
git commit -m "feat: add Might As Well Jump game engine"
```

---

### Task 2: Build the mobile-first board and setup experience

**Files:**
- Create: `EmbeddedApps/MightAsWellJump/index.html`
- Create: `EmbeddedApps/MightAsWellJump/styles.css`
- Create: `EmbeddedApps/MightAsWellJump/src/app.js`

**Interfaces:**
- Consumes: Task 1 engine functions.
- Produces DOM hooks: `#modeScreen`, `#gameScreen`, `#wheel`, `#centerSlot`, `#timer`, `#moves`, `#rotateLeft`, `#rotateRight`, `#restartBtn`, `#newRandomBtn`, `#infoBtn`, `#symbolsToggle`, `#soundToggle`.

- [ ] **Step 1: Create semantic opening screen and game shell**

Include title, subtitle, Standard and Random selection, settings, HUD, square board region, rotation controls, restart controls, leaderboard placeholder, How to Play dialog, win dialog, and share dialog.

- [ ] **Step 2: Add mobile-first CSS foundation**

Use a square `.board` constrained by viewport width/height, a circular `.wheel`, a stationary `.hub`, and six absolutely positioned radial `.chute` elements. Keep the board close to full phone width while reserving enough vertical space for HUD and controls.

- [ ] **Step 3: Render five target chutes plus passer from state**

Each normal chute renders five fixed target wells with data attributes for target color. Balls render inside chute-local coordinates so rotating `.wheel` automatically carries all balls with it. The passer renders neutral wells.

- [ ] **Step 4: Implement Standard/Random mode selection and 1–2 second setup animation**

Disable input while setup runs. Render empty wells first, then stagger ball appearance/slide into positions. Finish with passer at 6 o'clock, timer `0:00.0`, moves `0`.

- [ ] **Step 5: Add responsive checks for phone, portrait tablet, desktop, and iframe-like narrow windows**

Manually verify at approximately 390×844, 430×932, 768×1024, 1366×768, and a narrow embedded width. Ensure the board remains fully usable without horizontal scrolling.

- [ ] **Step 6: Commit**

```bash
git add EmbeddedApps/MightAsWellJump/index.html EmbeddedApps/MightAsWellJump/styles.css EmbeddedApps/MightAsWellJump/src/app.js
git commit -m "feat: add Might As Well Jump board UI"
```

---

### Task 3: Implement wheel dragging, snapping, buttons, taps, and swipe transfers

**Files:**
- Create: `EmbeddedApps/MightAsWellJump/src/input-controller.js`
- Modify: `EmbeddedApps/MightAsWellJump/src/app.js`
- Modify: `EmbeddedApps/MightAsWellJump/styles.css`
- Create: `EmbeddedApps/MightAsWellJump/tests/input-math.test.js`

**Interfaces:**
- Produces: `angleFromCenter(x, y, rect)`, `nearestWheelStop(angleDeg)`, `classifyGesture(start, end, boardRect)`, `createInputController(options)`.
- `options` exposes callbacks `onRotateStop(deltaStops)`, `onChuteToCenter()`, `onCenterToChute()`.

- [ ] **Step 1: Write tests for angle normalization and nearest 60-degree stop**

Include wraparound near 0/360 and exact half-step boundaries.

- [ ] **Step 2: Write tests for gesture classification**

At the 6 o'clock transfer zone, vertical/radial gestures classify as transfer; tangential/circular motion classifies as rotate; very short movement classifies as tap.

- [ ] **Step 3: Run tests and verify failure**

Run: `npm test`
Expected: FAIL because input helpers do not exist.

- [ ] **Step 4: Implement pure gesture math helpers**

Keep thresholds in one exported constants object so tuning does not require editing event handlers.

- [ ] **Step 5: Implement wheel Pointer Events**

On pointerdown capture current wheel angle; on move preview wheel rotation without changing logical state; on pointerup snap to nearest stop and call engine rotation only if stop changes. Balls remain children of the wheel and therefore visually locked while rotating.

- [ ] **Step 6: Add ↶ and ↷ buttons**

Each button animates exactly one 60-degree stop and triggers the same logical rotation path as dragging.

- [ ] **Step 7: Add click/tap transfers**

Clicking/tapping the aligned chute attempts chute→center. Clicking/tapping the center attempts center→chute. Invalid transfers produce no state change.

- [ ] **Step 8: Add radial swipe transfers**

Only recognize transfer swipes within the bottom transfer sector. Prevent propagation into wheel rotation once classified as radial.

- [ ] **Step 9: Add keyboard accessibility**

Provide keyboard-operable rotation buttons and transfer controls with visible focus states and ARIA labels.

- [ ] **Step 10: Run tests and manual gesture matrix**

Verify mouse drag, touch-like pointer drag, buttons, taps, radial swipes, blocked transfer, and rotation with a ball in center.

- [ ] **Step 11: Commit**

```bash
git add EmbeddedApps/MightAsWellJump/src/input-controller.js EmbeddedApps/MightAsWellJump/src/app.js EmbeddedApps/MightAsWellJump/styles.css EmbeddedApps/MightAsWellJump/tests/input-math.test.js
git commit -m "feat: add wheel and transfer controls"
```

---

### Task 4: Add timer, move HUD, win flow, Restart/New Random confirmations, and resume

**Files:**
- Create: `EmbeddedApps/MightAsWellJump/src/persistence.js`
- Modify: `EmbeddedApps/MightAsWellJump/src/app.js`
- Create: `EmbeddedApps/MightAsWellJump/tests/persistence.test.js`

**Interfaces:**
- Produces: `saveActiveGame(snapshot)`, `loadActiveGame()`, `clearActiveGame()`, `savePreference(key, value)`, `loadPreference(key, fallback)`.
- Persisted timing uses `startedAtEpochMs`, not `performance.now()`.

- [ ] **Step 1: Write persistence round-trip and corrupt-data tests**

Verify a valid snapshot survives JSON round-trip and malformed/unsupported-version data returns null safely.

- [ ] **Step 2: Implement versioned localStorage persistence**

Use a dedicated key such as `mightAsWellJump.activeGame.v1`. Validate mode, chute lengths, colors/nulls, center value, wheel stop, moves, and timestamps before restoring.

- [ ] **Step 3: Implement timer start semantics**

Start on first successful transfer or changed snapped rotation. Do not start for invalid transfers or a drag snapping back to same stop. Format time to tenths using the same `m:ss.t` convention as the existing 5-Piece puzzle.

- [ ] **Step 4: Save after every meaningful game-state change**

Persist initial arrangement separately from current arrangement so Restart restores the exact Random game.

- [ ] **Step 5: Add Resume Game / Start Over return flow**

If an active unfinished game exists, offer resume before mode selection. Resume computes elapsed time from current epoch minus `startedAtEpochMs`; it never pauses while away.

- [ ] **Step 6: Implement confirmation rules**

If timer has started, Restart, New Random, and mode switching require confirmation. If timer has not started, perform immediately.

- [ ] **Step 7: Implement immediate win detection**

After every successful transfer, run `isSolved()`. On win, freeze input/timer, clear active-game resume state, and open result dialog immediately. Wheel orientation is ignored.

- [ ] **Step 8: Run tests and refresh/resume manual checks**

Verify refresh before timer start, refresh during active play, refresh with ball in center, restart same Random arrangement, New Random new arrangement, and no pause while tab is hidden.

- [ ] **Step 9: Commit**

```bash
git add EmbeddedApps/MightAsWellJump/src/persistence.js EmbeddedApps/MightAsWellJump/src/app.js EmbeddedApps/MightAsWellJump/tests/persistence.test.js
git commit -m "feat: add timing restart and resume flow"
```

---

### Task 5: Add color symbols, How to Play, and sound

**Files:**
- Create: `EmbeddedApps/MightAsWellJump/src/audio.js`
- Modify: `EmbeddedApps/MightAsWellJump/src/app.js`
- Modify: `EmbeddedApps/MightAsWellJump/index.html`
- Modify: `EmbeddedApps/MightAsWellJump/styles.css`

**Interfaces:**
- Produces: `createAudioController()` with `setEnabled(boolean)`, `playTransfer()`, `playSnap()`, `playWin()`.

- [ ] **Step 1: Add five consistent geometric symbol mappings**

Use distinct shapes mapped to colors and render the same shape on balls and their target wells when Color Symbols is enabled.

- [ ] **Step 2: Persist the Color Symbols preference**

Default off. Toggle updates board immediately and saves locally.

- [ ] **Step 3: Implement the information dialog**

Use the approved instruction copy and a compact Controls section explaining tap/click, swipe, drag, and ↶/↷. Opening instructions during play does not pause the timer.

- [ ] **Step 4: Implement dependency-free sound with Web Audio API**

Generate short subtle tones/noise envelopes programmatically rather than requiring audio asset files. Do not initialize/resume AudioContext until a user gesture permits it.

- [ ] **Step 5: Persist sound preference**

Default off. Play transfer only on successful moves, snap only when a wheel stop changes, and victory once on solve.

- [ ] **Step 6: Manual accessibility review**

Verify symbols remain readable on small phones, focus indicators are visible, buttons have accessible names, and game remains understandable with sound disabled.

- [ ] **Step 7: Commit**

```bash
git add EmbeddedApps/MightAsWellJump/src/audio.js EmbeddedApps/MightAsWellJump/src/app.js EmbeddedApps/MightAsWellJump/index.html EmbeddedApps/MightAsWellJump/styles.css
git commit -m "feat: add puzzle accessibility and sound"
```

---

### Task 6: Add separate Standard/Random Firebase leaderboards

**Files:**
- Create: `EmbeddedApps/MightAsWellJump/firebase-config.js`
- Create: `EmbeddedApps/MightAsWellJump/src/leaderboard.js`
- Modify: `EmbeddedApps/MightAsWellJump/src/app.js`
- Modify: `EmbeddedApps/MightAsWellJump/index.html`
- Modify: `EmbeddedApps/MightAsWellJump/styles.css`
- Create: `EmbeddedApps/MightAsWellJump/firestore-rule-addition.md`

**Interfaces:**
- Produces: `initializeLeaderboard()`, `submitScore({name, mode, timeMs, moves})`, `loadScores({mode, pageSize, after})`, `getRank({mode, timeMs, moves})`, `validateNickname(raw)`.
- Firestore collection: `mightAsWellJumpScores`.
- Score schema: `{ game: 'might-as-well-jump', version: 1, mode: 'standard'|'random', name, timeMs, moves, createdAt }`.

- [ ] **Step 1: Copy the existing Survivor Geek Firebase web configuration**

Use the same public Firebase project values already used by the 5-Piece puzzle.

- [ ] **Step 2: Reuse and isolate nickname validation**

Keep 2–20 characters, Unicode letters/numbers, spaces, `_`, `-`, and the lightweight profanity blocklist. Render names using `textContent` only.

- [ ] **Step 3: Initialize Firebase with anonymous authentication**

Use Firebase Web SDK 10.12.2 dynamic imports, matching the existing app pattern. If Firebase is unavailable, fall back to a local-device leaderboard rather than blocking the puzzle.

- [ ] **Step 4: Implement duplicate-submit protection**

Lock submission immediately on submit event and only unlock after a failed request, preventing double click/Enter duplicate rows.

- [ ] **Step 5: Implement mode-separated leaderboard queries**

Query `mightAsWellJumpScores` by mode and time ordering, then apply moves as the equal-time tiebreaker client-side. Create the required Firestore composite index if Firebase reports that one is needed for mode + time queries.

- [ ] **Step 6: Render Top 10 with Standard/Random tabs**

Rows show rank, display name, time, and moves. Switching tabs never changes the active game mode.

- [ ] **Step 7: Implement See More pagination**

Load additional results in batches (for example 40 at a time) and append while preserving ranking order.

- [ ] **Step 8: Show the submitted player's latest score and overall mode rank**

After submission, calculate/display the player's rank even if it is outside the Top 10. If it is already visible in Top 10, highlight that row instead of duplicating it.

- [ ] **Step 9: Create a Firestore rule addition document, not a replacement rules file**

Document a `match /mightAsWellJumpScores/{scoreId}` block requiring authenticated create-only writes, exact `game`/`version`, valid mode, 2–20 character name, positive integer `timeMs`, positive integer `moves`, and server timestamp; deny update/delete. Explicitly state that this block must be merged into the current deployed project rules so the existing Slide Puzzle collection is not broken.

- [ ] **Step 10: Tighten only clearly safe anti-abuse bounds**

Use broad upper bounds (for example time under 24 hours and moves below a very high ceiling) plus positive lower bounds. Do not introduce an unverified minimum solve time or minimum move count that could reject a legitimate record. If a mathematically verified minimum is later established, update the rules in a separate change.

- [ ] **Step 11: Manual leaderboard test**

Submit multiple Standard and Random scores under the same name; verify all are independently eligible, Top 10 separates modes, ties sort by moves, See More works, and latest rank is shown.

- [ ] **Step 12: Commit**

```bash
git add EmbeddedApps/MightAsWellJump/firebase-config.js EmbeddedApps/MightAsWellJump/src/leaderboard.js EmbeddedApps/MightAsWellJump/src/app.js EmbeddedApps/MightAsWellJump/index.html EmbeddedApps/MightAsWellJump/styles.css EmbeddedApps/MightAsWellJump/firestore-rule-addition.md
git commit -m "feat: add Might As Well Jump leaderboards"
```

---

### Task 7: Add Share Result, polish win flow, and document deployment

**Files:**
- Modify: `EmbeddedApps/MightAsWellJump/src/app.js`
- Modify: `EmbeddedApps/MightAsWellJump/index.html`
- Modify: `EmbeddedApps/MightAsWellJump/styles.css`
- Create: `EmbeddedApps/MightAsWellJump/README.md`

**Interfaces:**
- Share URL: `https://play.survivorgeek.app/might-as-well-jump/`.

- [ ] **Step 1: Implement approved share payload**

Standard:

```text
🏝️ Might As Well Jump
⏱️ 1:24.7
🎯 63 moves
🟢 Standard

Can you beat my time?
https://play.survivorgeek.app/might-as-well-jump/
```

Random uses `🎲 Random`.

- [ ] **Step 2: Reuse robust sharing fallbacks from the existing 5-Piece puzzle**

In-app share dialog always works; provide Copy Result, optional native share sheet, Clipboard API, legacy copy fallback, and visible selected-text fallback.

- [ ] **Step 3: Complete the win dialog**

Show time, moves, mode, score submission, latest rank, Share Result, Play Again, and Close. Prefill last display name from localStorage.

- [ ] **Step 4: Write README**

Document local serving with `python3 -m http.server`, `npm test`, controls, Standard layout, Random semantics, Firebase collection/schema, Firestore rule merge requirement, GitHub Pages folder path, and iframe permissions `allow="clipboard-write; web-share"`.

- [ ] **Step 5: Add cache-busting version query strings**

Start at `v=0.1` for `styles.css` and `src/app.js`, and show a small visible `v0.1` badge in the header to simplify deployment/cache checks.

- [ ] **Step 6: Run final automated verification**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 7: Run final manual verification matrix**

Check Standard exact starting layout, Random invariants, setup animation, all transfer methods, wheel drag/snap/buttons, center-ball rotation, blocked moves, timer start cases, restart/new random confirmations, resume, win at any wheel orientation, symbols, sound default off, both leaderboards, repeated same-name submissions, sharing, and phone/desktop layout.

- [ ] **Step 8: Commit**

```bash
git add EmbeddedApps/MightAsWellJump
git commit -m "feat: finish Might As Well Jump puzzle"
```


---

## Deployment Handoff (separate follow-up)

This implementation plan intentionally stops after the GitHub Pages app is complete and verified. Publishing the friendly route `https://play.survivorgeek.app/might-as-well-jump/` requires the current Cloudflare Worker source so its existing Guess Who, Slide Puzzle, asset pass-through, homepage, privacy, and other routing behavior can be preserved exactly. Once that source is supplied, create a separate bounded routing change rather than reconstructing the Worker from memory.
