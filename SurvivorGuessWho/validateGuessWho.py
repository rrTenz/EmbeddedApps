#!/usr/bin/env python3
"""
validateGuessWho.py

Offline consistency checks for Survivor Guess Who metadata.

Usage:
    python3 validateGuessWho.py
"""

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
DATA_FILE = APP_DIR / "data" / "players.json"


def main() -> int:
    payload = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    players = payload["players"] if isinstance(payload, dict) else payload

    errors: list[str] = []
    warnings: list[str] = []

    ids = [player.get("id") for player in players]
    names = [player.get("name") for player in players]

    duplicate_ids = [value for value, count in Counter(ids).items() if value and count > 1]
    duplicate_names = [value for value, count in Counter(names).items() if value and count > 1]

    castaway_ids = [player.get("castawayId") for player in players if player.get("castawayId")]
    duplicate_castaway_ids = [
        value for value, count in Counter(castaway_ids).items()
        if value and count > 1
    ]

    if duplicate_castaway_ids:
        errors.append(f"Duplicate castaway IDs: {duplicate_castaway_ids}")

    if duplicate_ids:
        errors.append(f"Duplicate player ids: {duplicate_ids}")
    if duplicate_names:
        errors.append(f"Duplicate player names: {duplicate_names}")

    coverage = defaultdict(lambda: {
        "players": 0,
        "tribe": 0,
        "placement": 0,
        "age": 0,
        "merge": 0,
        "jury": 0,
        "finalist": 0,
        "winner": 0,
    })

    for player in players:
        name = player.get("name", "<unknown>")
        seasons = sorted(set(player.get("seasons", [])))
        appearances = player.get("appearances", [])
        appearance_seasons = [appearance.get("season") for appearance in appearances]

        for season in seasons:
            if season not in appearance_seasons:
                warnings.append(f"{name}: Season {season} is listed but has no appearance record.")

        if player.get("image") and not str(player["image"]).startswith("../SlidePuzzle/Images/"):
            warnings.append(f"{name}: image is not using the shared SlidePuzzle image path.")

        for appearance in appearances:
            season = appearance.get("season")
            if not season:
                errors.append(f"{name}: appearance missing season.")
                continue

            coverage[season]["players"] += 1

            fields = {
                "tribe": "originalTribe",
                "placement": "placement",
                "age": "age",
                "merge": "madeMerge",
                "jury": "juror",
                "finalist": "finalist",
                "winner": "winner",
            }

            for label, field in fields.items():
                if appearance.get(field) is not None:
                    coverage[season][label] += 1

            placement = appearance.get("placement")
            winner = appearance.get("winner")
            finalist = appearance.get("finalist")

            if winner is True and placement is not None and placement != 1:
                errors.append(f"{name} S{season}: winner=true but placement={placement}.")
            if placement == 1 and winner is False:
                errors.append(f"{name} S{season}: placement=1 but winner=false.")
            if placement is not None and placement <= 3 and finalist is False:
                warnings.append(f"{name} S{season}: top-3 placement but finalist=false.")

    print(f"Players: {len(players)}")
    print(f"Schema version: {payload.get('schemaVersion', 'unknown') if isinstance(payload, dict) else 'unknown'}")
    print()

    print("Metadata coverage")
    print("-----------------")
    for season in sorted(coverage):
        row = coverage[season]
        total = row["players"]
        print(
            f"S{season}: {total} players | "
            f"tribe {row['tribe']}/{total} | "
            f"placement {row['placement']}/{total} | "
            f"age {row['age']}/{total} | "
            f"merge {row['merge']}/{total} | "
            f"jury {row['jury']}/{total}"
        )

    if warnings:
        print("\nWarnings")
        print("--------")
        for warning in warnings:
            print(f"- {warning}")

    if errors:
        print("\nERRORS")
        print("------")
        for error in errors:
            print(f"- {error}")
        return 1

    print("\nValidation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
