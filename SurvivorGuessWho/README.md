# Survivor Guess Who? v10.2

v10.2 improves the layout without changing gameplay.

## Main mobile improvement

v10 moved the suspect board above the question controls, which made the game immediately look like Guess Who.

The downside was that a phone user could then need to scroll past a 24-player board before reaching the question controls.

v10.2 keeps the board near the top **and** adds a compact sticky mobile action bar:

```text
Ask a Question | Make a Guess
```

These buttons smoothly jump to the relevant panel.

Question, Guess, and Clue Log panels also include:

```text
Back to Suspects
```

so moving between deduction and the board is much faster on a phone.

## Mobile hierarchy

```text
Header
Stats + Game Pool
Status
Quick Actions
Suspect Board
Ask a Question
Make a Guess
Clue Log
```

The Quick Actions remain visible while scrolling on phone-sized screens.

## Other layout improvements

- slightly tighter desktop spacing
- narrower desktop sidebar so the board gets more room
- more compact top controls
- improved phone control wrapping
- shorter mobile Clue Log
- better scroll offsets for sticky mobile actions
- touch-friendly Back to Suspects controls

## Portrait grid

The v10.1 breakpoints remain:

```text
> 460px       4 columns
341–460px     3 columns
<= 340px      2 columns
```

## No gameplay changes

The full Seasons 1–50 database, Random 24 modes, question engine, streaks, personal bests, and clue system are unchanged.
