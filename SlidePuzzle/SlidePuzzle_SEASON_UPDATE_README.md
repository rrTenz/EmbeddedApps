# Survivor Geek Slide Puzzle: Season Update Guide

This is the checklist for adding a new U.S. Survivor season to the Slide
Puzzle app.

## For Survivor 51

### 1. Open Terminal and go to the SlidePuzzle directory

``` bash
cd /Users/ryantensmeyer/Documents/GitHub/EmbeddedApps/SlidePuzzle
```

### 2. Run the updater

``` bash
python3 updateSlidePuzzle.py 51
```

The updater should handle the season-specific work, including
downloading/generating the Season 51 player images and logo and updating
the app data.

`survivant.ttf` should remain in the `SlidePuzzle` directory because the
local update process uses it. It is intentionally ignored by Git and
will not be uploaded to GitHub.

### 3. Review the generated files

Confirm that a new folder exists under:

``` text
SlidePuzzle/Images/
```

It should look similar to:

``` text
51 - <Season Title>/
```

Check that the folder contains:

-   One `.webp` image for each contestant
-   `logo.png` (or the generated logo image)
-   No unrelated/non-player carousel images

Also verify that `images.json` and any other generated season data were
updated.

### 4. Test locally before deploying

From the `SlidePuzzle` directory, start a simple local web server:

``` bash
python3 -m http.server 8000
```

Then open:

``` text
http://localhost:8000
```

Test the following:

-   Season 51 appears in the season dropdown.
-   The Season 51 logo appears as an image option.
-   All Season 51 contestants appear.
-   Several contestant images load correctly.
-   The slide puzzle starts and works normally.
-   An older season still works.
-   The styling still looks correct.

Stop the local server with:

``` text
Control + C
```

### 5. Commit the update to Git

Go to the repository root:

``` bash
cd /Users/ryantensmeyer/Documents/GitHub/EmbeddedApps
```

Check what changed:

``` bash
git status
```

Make sure `.DS_Store` is not included. `SlidePuzzle/survivant.ttf`
should also not appear because it is listed in `.gitignore`.

Stage the SlidePuzzle changes:

``` bash
git add SlidePuzzle
```

Then check again:

``` bash
git status
```

Commit:

``` bash
git commit -m "Add Survivor 51 to Slide Puzzle"
```

### 6. Push to GitHub

Push the commit using GitHub Desktop, which is already authenticated and
worked for the Season 50 deployment.

If command-line Git authentication has been configured by then, this can
also be used:

``` bash
git push
```

Note: In August 2026, an HTTPS command-line push prompted for a GitHub
password and failed because GitHub does not support password
authentication for Git operations. GitHub Desktop successfully pushed
the commit instead.

### 7. Confirm GitHub received the update

From Terminal:

``` bash
git status
git log -1 --oneline
```

After a successful push, `git status` should report that `main` is up to
date with `origin/main`.

### 8. Verify the live GitHub Pages app

Open:

``` text
https://rrtenz.github.io/EmbeddedApps/SlidePuzzle
```

Confirm Season 51 and its images are live.

If the old version initially appears, wait a minute or two and
hard-refresh the page.

### 9. Verify Survivor Geek

Open the Slide Puzzle page on the Survivor Geek Google Site and make
sure the embedded app has updated.

There should be NO need to edit or republish the iframe just for a
normal season update. The Google Site already embeds:

``` html
<iframe src="https://rrtenz.github.io/EmbeddedApps/SlidePuzzle"
        width="100%"
        height="600px"
        frameborder="0"></iframe>
```

Because that URL stays the same, pushing the updated SlidePuzzle app to
GitHub Pages updates what the existing Google Sites embed loads.

------------------------------------------------------------------------

## Short Version

For a normal future season, the workflow should be approximately:

``` bash
cd /Users/ryantensmeyer/Documents/GitHub/EmbeddedApps/SlidePuzzle

python3 updateSlidePuzzle.py 51

python3 -m http.server 8000
# Test at http://localhost:8000
# Control+C when finished

cd ..

git status
git add SlidePuzzle
git commit -m "Add Survivor 51 to Slide Puzzle"
```

Then push with GitHub Desktop and verify:

``` text
https://rrtenz.github.io/EmbeddedApps/SlidePuzzle
```

Finally, check the embedded version on Survivor Geek.

## Important Files

``` text
EmbeddedApps/
└── SlidePuzzle/
    ├── Images/
    ├── images.json
    ├── index.html
    ├── script.js
    ├── season_data.json
    ├── styles.css
    ├── survivant.ttf          # Local only; ignored by Git
    └── updateSlidePuzzle.py
```

## Goal

For Season 51 and later, you should not need to manually edit contestant
lists, image paths, or the Google Sites embed. The updater prepares the
new season locally, and GitHub Pages serves the updated app after the
changes are pushed.
