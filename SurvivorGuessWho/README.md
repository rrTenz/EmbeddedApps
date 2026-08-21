# Survivor Guess Who? v10.1

v10.1 is a small responsive-layout adjustment to the v10 release candidate.

## Mobile portrait grid

Based on testing, the four-column portrait board remained clear and compact at medium/narrow widths.

The responsive behavior is now:

```text
> 460px wide      4 portrait columns
341-460px wide    3 portrait columns
<= 340px wide     2 portrait columns
```

This keeps the board shorter on most phones and narrow browser windows while still giving very small screens enough room for recognizable faces and readable names.

## Preserved v10 behavior

- suspect board appears before questions on narrow screens
- responsive Game Pool / button layout
- mobile-safe victory modal
- season context on victory screen
- question split hover tooltip removed
- full U.S. Survivor Seasons 1-50
- Random 24 + era modes + all 50 specific seasons
- shared SlidePuzzle image library

## Final mobile test

After local testing, publish to GitHub Pages and open the actual page on a physical phone. That will verify:

- viewport width
- touch targets
- iframe behavior
- browser chrome
- scrolling
