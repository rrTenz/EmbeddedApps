# Might As Well Jump Design

## Goal
Build a mobile-first Survivor Geek browser puzzle called **Might As Well Jump** for the EmbeddedApps repository and eventual publication at `play.survivorgeek.app/might-as-well-jump/`.

## Puzzle Model
- The rotating outer wheel contains six chutes spaced 60 degrees apart.
- Five are normal puzzle chutes. Each normal chute has five fixed target positions, ordered **outside → inside**: yellow, orange, red, blue, green.
- The sixth chute is the neutral **passer chute**. It can temporarily hold up to five balls and must be empty to win.
- There are 25 balls total: five each of yellow, orange, red, blue, and green.
- The center hub is stationary and contains a one-ball transfer slot at 6 o'clock.
- Only the chute snapped to 6 o'clock can exchange a ball with the center.
- While the wheel rotates, all balls remain locked to their chute positions and rotate with the wheel.
- The wheel snaps to the nearest 60-degree position on release.

## Ball Transfer Rules
- A chute-to-center transfer moves the innermost currently occupied ball from the aligned chute into the empty center.
- Existing balls in that chute do not slide after removal. Empty positions remain on the inner side.
- A center-to-chute transfer places the center ball in the innermost available position of the aligned chute.
- If the center is occupied, no chute ball can enter it.
- If the aligned chute is full, the center ball cannot enter it.
- Invalid attempts do not change state and do not increase the move count.
- Each successful chute-to-center or center-to-chute transfer counts as one move.
- Wheel rotation never counts as a move.

## Starting Modes
### Standard
The passer chute starts empty and at 6 o'clock. Reading each normal chute outside → inside:

- Chute 1: yellow, blue, red, green, orange
- Chute 2: yellow, blue, green, red, orange
- Chute 3: yellow, green, blue, red, orange
- Chute 4: yellow, red, orange, green, blue
- Chute 5: yellow, green, red, orange, blue

### Random
- Passer empty.
- Center empty.
- Five balls in each normal chute.
- Exactly five balls of each color total.
- Passer starts at 6 o'clock.
- Shuffle is genuinely random each new game.
- Reject an already-solved shuffle.
- Restart restores the same random arrangement; New Random creates a new one.

## Timing and Moves
- After mode selection and setup animation, HUD begins at `0:00.0` and `0` moves.
- Timer starts on the first meaningful state-changing interaction: a successful ball transfer or a wheel rotation that snaps to a different chute.
- Invalid transfers and drags that snap back to the same wheel position do not start the timer.
- No pause function exists. Instructions, tab changes, refresh/resume, or leaving the page do not pause elapsed time.

## Win Condition
The game ends immediately when:
- Every one of the five normal chutes matches the target order yellow, orange, red, blue, green from outside → inside.
- Passer chute is empty.
- Center is empty.
- Wheel orientation is irrelevant.

## Controls
- Drag/swipe around the wheel to rotate; release snaps to nearest 60-degree stop.
- Provide explicit counterclockwise and clockwise buttons, each rotating exactly 60 degrees.
- Tap/click aligned chute to move its innermost ball to center when legal.
- Tap/click center to move the center ball into the aligned chute when legal.
- Support radial swipe toward the center for chute-to-center and away from center for center-to-chute.
- Gesture classification must prevent radial transfer gestures from being mistaken for tangential wheel rotation.
- Ball transfers and wheel snapping should animate smoothly.

## Intro and Setup
Opening screen:
- Title: **MIGHT AS WELL JUMP**
- Subtitle: **Sort the balls. Beat the clock.**
- Standard button: “Play the original Survivor arrangement”
- Random button: “A new shuffle every game”
- Access to How to Play, Color Symbols, and Sound.

After selecting a mode, display a 1–2 second setup animation showing balls entering their starting positions. Input is disabled during setup. Timer remains at zero.

## Instructions
Use an information button to open How to Play. Core copy:

> Sort all 25 balls into their matching colored positions.
>
> Rotate the outer wheel to align a chute with the center. The wheel will snap into position.
>
> Move the innermost ball into the center, rotate to another chute, then move the ball out of the center. The center holds only one ball.
>
> Use the empty passer chute to temporarily store balls while you solve the puzzle.
>
> Win: Make all five normal chutes match their colored target positions. The passer chute and center must be empty.

Do not reveal the green-ball strategy in normal instructions.

## Visual Design
- Use screenshots only as geometry/mechanics references, not as a visual style to copy.
- Modern Survivor Geek look: dark dimensional wheel, clean target lanes, polished balls, subtle depth and shadows, smooth motion, clear active 6 o'clock alignment.
- Mobile-first, nearly full-width square game board on phones.
- Desktop keeps a large but bounded board and adapts controls/leaderboard around available width.
- Preserve responsive lessons from the existing 5-Piece Slide Puzzle, especially portrait and iframe sizing.

## Accessibility
- Optional **Color Symbols** toggle, off by default.
- Each ball color gets a distinct geometric symbol; the corresponding target position uses the same symbol.
- Remember the preference in localStorage.
- Provide keyboard-accessible rotation and transfer buttons plus useful ARIA labels.

## Sound
- Subtle sounds for transfer, wheel snap, and victory.
- Sound defaults off.
- Visible mute/unmute toggle.
- Remember preference in localStorage.

## Restart, Mode Switching, and Resume
- Restart restores the current game's exact initial arrangement.
- Random mode also exposes New Random.
- Once timer has started, Restart, New Random, or mode switching asks for confirmation.
- Before timer starts, no confirmation is needed.
- Persist active state in localStorage: mode, original arrangement, current chute contents, center ball, wheel stop, move count, and absolute start timestamp.
- On return after refresh, offer Resume Game or Start Over.
- Resumed elapsed time uses real wall-clock time, so refresh cannot pause a leaderboard run.

## Leaderboards
- Separate Standard and Random rankings.
- Primary sort: fastest time.
- Tiebreaker: fewest moves.
- Show Top 10 by default.
- See More loads additional results in batches.
- Every submitted score is independently eligible, including multiple scores by the same display name.
- After submission, show the player's latest score and mode-specific overall rank even when outside Top 10.
- Remember last-used display name locally and prefill it.
- Local personal best may be displayed but does not affect public leaderboard eligibility.

## Score Submission and Anti-Abuse
- Reuse anonymous Firebase authentication and the existing Survivor Geek Firebase project.
- Preserve display-name validation and duplicate-submit protection from the 5-Piece puzzle.
- Store mode, time, moves, version, and server timestamp with each score.
- Apply conservative server-side Firestore type/range checks that reject malformed or clearly impossible values without rejecting plausible elite scores.
- Strong server-authoritative anti-cheat is out of scope for v1.

## Win and Sharing
Win overlay displays completion time, move count, mode, leaderboard submission, Share Result, and Play Again.

Share text format:

```text
🏝️ Might As Well Jump
⏱️ 1:24.7
🎯 63 moves
🟢 Standard

Can you beat my time?
play.survivorgeek.app/might-as-well-jump/
```

Random uses `🎲 Random`. Do not reveal starting arrangement or solution details.

## Deployment Boundary
This design covers the game itself in the EmbeddedApps repository. Publishing the final friendly route at `play.survivorgeek.app/might-as-well-jump/` also requires updating the existing Cloudflare Worker routing once its current source is available. That routing change should not be guessed from the puzzle files alone.
