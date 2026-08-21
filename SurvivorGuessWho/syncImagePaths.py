#!/usr/bin/env python3
"""
syncImagePaths.py

Synchronize Guess Who image paths to the files that actually exist in the
sibling SlidePuzzle/Images directory.

Usage:
    python3 syncImagePaths.py
    python3 syncImagePaths.py 41 42 43 44 45 46 47
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
SLIDEPUZZLE_DIR = APP_DIR.parent / "SlidePuzzle"
IMAGES_ROOT = SLIDEPUZZLE_DIR / "Images"
PLAYERS_FILE = APP_DIR / "data" / "players.json"
IMAGE_EXTENSIONS = {".png", ".webp", ".jpg", ".jpeg"}


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
    value = re.sub(r"\.(png|webp|jpg|jpeg)$", "", value)
    value = re.sub(r"^s\d+[_ -]+", "", value)
    value = value.replace("_", " ")
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def season_directories() -> dict[int, Path]:
    result = {}
    if not IMAGES_ROOT.exists():
        return result

    for directory in IMAGES_ROOT.iterdir():
        if not directory.is_dir():
            continue
        match = re.match(r"^(\d+)\s+-\s+", directory.name)
        if match:
            result[int(match.group(1))] = directory

    return result


def score(player_name: str, path: Path):
    player = normalize(player_name)
    filename = normalize(path.name)

    if player == filename:
        return (0, 0, path.name)
    if filename.startswith(player + " "):
        return (1, len(filename) - len(player), path.name)
    if player in filename:
        return (2, len(filename) - len(player), path.name)

    player_tokens = set(player.split())
    file_tokens = set(filename.split())
    return (10 + len(player_tokens - file_tokens), len(file_tokens - player_tokens), path.name)


def find_image(directory: Path, player_name: str) -> Path | None:
    files = [
        path for path in directory.iterdir()
        if path.is_file()
        and path.suffix.lower() in IMAGE_EXTENSIONS
        and path.stem.lower() != "logo"
    ]

    if not files:
        return None

    best = min(files, key=lambda path: score(player_name, path))
    return best if score(player_name, best)[0] < 10 else None


def browser_path(path: Path) -> str:
    return "../SlidePuzzle/" + path.relative_to(SLIDEPUZZLE_DIR).as_posix()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("seasons", nargs="*", type=int)
    args = parser.parse_args()

    directories = season_directories()
    if not directories:
        print(f"No season image directories found under {IMAGES_ROOT}")
        return 1

    requested = set(args.seasons) if args.seasons else set(directories)
    payload = json.loads(PLAYERS_FILE.read_text(encoding="utf-8"))

    matched = 0
    unresolved = []

    for player in payload["players"]:
        for appearance in player.get("appearances", []):
            season = appearance.get("season")
            if season not in requested:
                continue

            directory = directories.get(season)
            if directory is None:
                unresolved.append((season, player["name"], "season directory missing"))
                continue

            image = find_image(directory, player["name"])
            if image is None:
                unresolved.append((season, player["name"], "image not matched"))
                continue

            appearance["image"] = browser_path(image)
            matched += 1

        image_appearances = [
            appearance for appearance in player.get("appearances", [])
            if appearance.get("image")
        ]
        if image_appearances:
            player["image"] = max(
                image_appearances,
                key=lambda appearance: appearance["season"],
            )["image"]

    PLAYERS_FILE.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print(f"Image paths matched: {matched}")
    print(f"Unresolved: {len(unresolved)}")
    for season, name, reason in unresolved:
        print(f"  S{season}: {name} ({reason})")

    return 0 if not unresolved else 2


if __name__ == "__main__":
    raise SystemExit(main())
