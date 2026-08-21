#!/usr/bin/env python3
"""
applySeasonMetadata.py

Merge a curated season metadata JSON file into data/players.json.

Usage:
    python3 applySeasonMetadata.py data/season-metadata-41-47.json
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
PLAYERS_FILE = APP_DIR / "data" / "players.json"


def slug(name: str) -> str:
    value = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("metadata_file", type=Path)
    args = parser.parse_args()

    metadata_file = args.metadata_file
    if not metadata_file.is_absolute():
        metadata_file = APP_DIR / metadata_file

    payload = json.loads(PLAYERS_FILE.read_text(encoding="utf-8"))
    players = payload["players"]
    by_name = {player["name"]: player for player in players}

    batch = json.loads(metadata_file.read_text(encoding="utf-8"))
    updated_appearances = 0
    new_players = 0

    for season_text, entries in batch["seasons"].items():
        season = int(season_text)

        for entry in entries:
            name = entry["name"]
            player = by_name.get(name)

            if player is None:
                player = {
                    "id": slug(name),
                    "name": name,
                    "seasons": [],
                    "winner": False,
                    "finalist": False,
                    "juror": False,
                    "returningPlayer": False,
                    "image": entry.get("image"),
                    "appearances": [],
                }
                players.append(player)
                by_name[name] = player
                new_players += 1

            if season not in player["seasons"]:
                player["seasons"].append(season)

            player.setdefault("appearances", [])
            player["appearances"] = [
                appearance
                for appearance in player["appearances"]
                if appearance.get("season") != season
            ]

            appearance = dict(entry)
            appearance.pop("name", None)
            appearance["season"] = season
            player["appearances"].append(appearance)
            updated_appearances += 1

    for player in players:
        player["seasons"] = sorted(set(player["seasons"]))
        player["appearances"] = sorted(player.get("appearances", []), key=lambda item: item["season"])
        player["returningPlayer"] = len(player["seasons"]) > 1

        winner_values = [a["winner"] for a in player["appearances"] if a.get("winner") is not None]
        finalist_values = [a["finalist"] for a in player["appearances"] if a.get("finalist") is not None]
        juror_values = [a["juror"] for a in player["appearances"] if a.get("juror") is not None]

        if winner_values:
            player["winner"] = any(winner_values)
        if finalist_values:
            player["finalist"] = any(finalist_values)
        if juror_values:
            player["juror"] = any(juror_values)

        images = [a for a in player["appearances"] if a.get("image")]
        if images:
            player["image"] = max(images, key=lambda item: item["season"])["image"]

    players.sort(key=lambda player: player["name"].lower())
    payload["playerCount"] = len(players)

    PLAYERS_FILE.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print(f"New players: {new_players}")
    print(f"Appearance records applied: {updated_appearances}")
    print(f"Total unique players: {len(players)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
