# Survivor 5-Piece Slide Puzzle

A responsive, touch-friendly recreation of the five-piece slide puzzle from
**Survivor: Edge of Extinction (Season 38, Episode 5)**.

The app is plain HTML/CSS/JavaScript, so it can be hosted directly on GitHub
Pages and embedded in Google Sites with an iframe.

## Included

- Authentic 4 × 6 board geometry
- Exact starting arrangement discussed for the S38 puzzle
- Four fixed-orientation L/corner pieces
- One 2 × 2 center square
- Drag/swipe movement on desktop and mobile
- Desktop board size is viewport-aware so the full puzzle fits comfortably on typical screens
- Portrait layouts switch to one column and cap board size by viewport height as well as width
- v10 portrait polish reduces header/HUD height without shrinking the puzzle board
- v11 adds a dedicated phone-width layout for Google Sites embeds without changing desktop/tablet sizing
- v12 hardens score submission against duplicate records
- Share Result now includes the canonical Survivor Geek puzzle URL
- Keyboard arrow support for accessibility/testing
- Legal collision detection based on occupied 1 × 1 cells
- No piece rotation
- Timer begins on the first successful move
- Move counter (each successful 1 × 1 grid step = one move)
- Drag input uses axis locking and hysteresis so one physical grid step is counted once
- Reset / Play Again
- Solved celebration
- Share Result
- Nickname entry with lightweight profanity filtering
- Public leaderboard support through Firebase
- Stores `game: "survivor-5-piece"` and `version: 1` with each score for future compatibility
- Local leaderboard fallback until Firebase is configured
- Fastest time ranks first; moves break equal-time ties

## 1. Test locally

Because the JavaScript uses ES modules, serve the folder with a local web
server instead of double-clicking `index.html`.

On a Mac with Python installed:

```bash
cd survivor-5-piece-slide-puzzle
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

The game works immediately. Until Firebase is configured, leaderboard scores
are stored only in that browser.

## 2. Add the public Firebase leaderboard

### Create the project

1. Go to Firebase Console and create a project.
2. Add a **Web App** to the project.
3. Firebase will show a `firebaseConfig` object.
4. Copy those values into `firebase-config.js`.

### Enable anonymous authentication

In Firebase Console:

**Build → Authentication → Sign-in method → Anonymous → Enable**

Players will not see a login screen. Anonymous auth is only used to make
Firestore submissions less open than completely unauthenticated writes.

### Create Firestore

Create a Cloud Firestore database, then replace its rules with the contents of:

```text
firestore.rules
```

Publish the rules.

You do **not** have to manually create the `slidePuzzleScores` collection.
Firebase creates it when the first score is submitted.

## 3. Upload to GitHub

A convenient layout alongside your existing EmbeddedApps repository would be:

```text
EmbeddedApps/
├── SurvivorGuessWho/
└── SurvivorSlidePuzzle/
    ├── index.html
    ├── styles.css
    ├── app.js
    ├── firebase-config.js
    ├── firestore.rules
    └── assets/
```

If your GitHub Pages site is already serving:

```text
https://rrtenz.github.io/EmbeddedApps/
```

then this game would be available at:

```text
https://rrtenz.github.io/EmbeddedApps/SurvivorSlidePuzzle/
```

after you copy these files into a `SurvivorSlidePuzzle` directory and push.

## 4. Embed in Google Sites

In Google Sites choose:

**Insert → Embed → Embed code**

Use:

```html
<iframe
  src="https://rrtenz.github.io/EmbeddedApps/SurvivorSlidePuzzle/"
  width="100%"
  height="1350"
  style="border:0"
  loading="lazy"
  allow="clipboard-write; web-share">
</iframe>
```

You can adjust the iframe height once you see it inside your actual page.

## Leaderboard moderation

The nickname field:

- allows 2–20 characters
- allows Unicode letters/numbers, spaces, `_` and `-`
- escapes names automatically by rendering them as text
- includes a lightweight profanity blocklist

No automated profanity list will catch every possible spelling. As project
owner, you can delete a bad leaderboard row in:

**Firebase Console → Firestore Database → slidePuzzleScores**

The included rules deliberately prevent public users from editing or deleting
scores.

## Anti-cheat expectations

This is a lightweight browser game, so a determined developer can still forge
requests. The current setup is intended to stop casual abuse, not provide
competition-grade verification.

Current safeguards include:

- anonymous Firebase authentication
- Firestore type/range validation
- immutable scores
- minimum 44-move validation in Firestore rules
- server-generated submission timestamp

If the leaderboard becomes competitive enough to attract cheating, the next
step would be to validate completed games server-side with a Firebase Cloud
Function or store a signed move sequence.

## Files

- `index.html` – page and app markup
- `styles.css` – responsive Survivor-inspired visual design
- `app.js` – puzzle engine, drag controls, timer, sharing, leaderboard
- `firebase-config.js` – your Firebase web configuration
- `firestore.rules` – public leaderboard security rules
- `assets/survivor-puzzle-logo.svg` – original Survivor-inspired app mark
- `assets/tribal-pattern.svg` – puzzle piece texture
- `assets/wood-grain.svg` – board texture
