#!/usr/bin/env python3
"""
updateGuessWho.py

Builds data/players.json for Survivor Guess Who using Survivor Wiki/Fandom
and the local Images directory.

The deployed app stays static. Run this updater locally whenever new seasons
or images are added, then commit the generated JSON with the rest of the app.

Requirements:
    python3 -m pip install requests beautifulsoup4

Examples:
    python3 updateGuessWho.py 48 49 50
    python3 updateGuessWho.py 1 2 3 4 5
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import time
import unicodedata
from pathlib import Path
from typing import Iterable

import requests
from bs4 import BeautifulSoup

API_URL = "https://survivor.fandom.com/api.php"
APP_DIR = Path(__file__).resolve().parent
IMAGES_DIR = APP_DIR.parent / "SlidePuzzle" / "Images"
OUTPUT_FILE = APP_DIR / "data" / "players.json"

# Survivor Wiki uses the season subtitle for many older contestant categories.
# This is season metadata, not a hardcoded cast list.
SEASON_NAMES = {
    1: "Borneo",
    2: "The Australian Outback",
    3: "Africa",
    4: "Marquesas",
    5: "Thailand",
    6: "The Amazon",
    7: "Pearl Islands",
    8: "All-Stars",
    9: "Vanuatu",
    10: "Palau",
    11: "Guatemala",
    12: "Panama",
    13: "Cook Islands",
    14: "Fiji",
    15: "China",
    16: "Micronesia",
    17: "Gabon",
    18: "Tocantins",
    19: "Samoa",
    20: "Heroes vs. Villains",
    21: "Nicaragua",
    22: "Redemption Island",
    23: "South Pacific",
    24: "One World",
    25: "Philippines",
    26: "Caramoan",
    27: "Blood vs. Water",
    28: "Cagayan",
    29: "San Juan del Sur",
    30: "Worlds Apart",
    31: "Cambodia",
    32: "Kaôh Rōng",
    33: "Millennials vs. Gen X",
    34: "Game Changers",
    35: "Heroes vs. Healers vs. Hustlers",
    36: "Ghost Island",
    37: "David vs. Goliath",
    38: "Edge of Extinction",
    39: "Island of the Idols",
    40: "Winners at War",
    41: "Survivor 41",
    42: "Survivor 42",
    43: "Survivor 43",
    44: "Survivor 44",
    45: "Survivor 45",
    46: "Survivor 46",
    47: "Survivor 47",
    48: "Survivor 48",
    49: "Survivor 49",
    50: "In the Hands of the Fans",
}

session = requests.Session()
session.headers.update(
    {
        "User-Agent": "SurvivorGeekGuessWhoUpdater/1.0 (personal fan-site utility)"
    }
)


def api_get(params: dict) -> dict:
    params = {"format": "json", **params}
    response = session.get(API_URL, params=params, timeout=30)
    response.raise_for_status()
    time.sleep(0.10)
    return response.json()


def clean_text(value: str) -> str:
    value = html.unescape(value)
    value = re.sub(r"\[[^\]]*\]", "", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def normalized_filename(value: str) -> str:
    return unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()


def category_members(category: str) -> list[str]:
    titles: list[str] = []
    cmcontinue = None

    while True:
        params = {
            "action": "query",
            "list": "categorymembers",
            "cmtitle": f"Category:{category}",
            "cmnamespace": 0,
            "cmlimit": "max",
        }
        if cmcontinue:
            params["cmcontinue"] = cmcontinue

        data = api_get(params)
        titles.extend(item["title"] for item in data["query"]["categorymembers"])

        cmcontinue = data.get("continue", {}).get("cmcontinue")
        if not cmcontinue:
            break

    return titles


def parsed_page_text(page_title: str) -> str:
    data = api_get(
        {
            "action": "parse",
            "page": page_title,
            "prop": "text",
        }
    )
    raw_html = data["parse"]["text"]["*"]
    soup = BeautifulSoup(raw_html, "html.parser")
    return soup.get_text("\n", strip=True)


def contestant_category_name(season: int) -> str:
    name = SEASON_NAMES.get(season, f"Survivor {season}")
    if season >= 41 and season <= 49:
        return f"Survivor {season} Contestants"
    if season == 50:
        return "In the Hands of the Fans Contestants"
    return f"{name} Contestants"


def jury_category_name(season: int) -> str:
    name = SEASON_NAMES.get(season, f"Survivor {season}")
    if season >= 41 and season <= 49:
        return f"Survivor {season} Jury Members"
    if season == 50:
        return "In the Hands of the Fans Jury Members"
    return f"{name} Jury Members"


def season_page_title(season: int) -> str:
    if season >= 41 and season <= 49:
        return f"Survivor {season}"
    if season == 50:
        return "Survivor 50: In the Hands of the Fans"
    return f"Survivor: {SEASON_NAMES[season]}"


def extract_winner_and_finalists(page_text: str) -> tuple[str | None, set[str]]:
    lines = [clean_text(line) for line in page_text.splitlines() if clean_text(line)]

    winner = None
    finalists: set[str] = set()

    for index, line in enumerate(lines):
        lowered = line.lower()

        if lowered == "winner" and index + 1 < len(lines):
            winner = lines[index + 1]
            finalists.add(winner)

        if lowered in {"runner(s)-up", "runner-up", "runners-up"}:
            for candidate in lines[index + 1 : index + 5]:
                if candidate.lower() in {
                    "tribes",
                    "prize for winner",
                    "season chronology",
                    "cast",
                    "opening sequence",
                }:
                    break
                if re.search(r"^[A-Za-zÀ-ÿ' .-]+$", candidate):
                    finalists.add(candidate)

    return winner, finalists


def normalized_image_name(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
    value = re.sub(r"\.(png|webp|jpg|jpeg)$", "", value)
    value = re.sub(r"^s\d+[_ -]+", "", value)
    value = value.replace("_", " ")
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def image_match_score(player_name: str, path: Path) -> tuple[int, int, str]:
    player = normalized_image_name(player_name)
    filename = normalized_image_name(path.name)

    if player == filename:
        return (0, 0, path.name)
    if filename.startswith(player + " "):
        return (1, len(filename) - len(player), path.name)
    if player in filename:
        return (2, len(filename) - len(player), path.name)

    player_tokens = set(player.split())
    file_tokens = set(filename.split())
    return (10 + len(player_tokens - file_tokens), len(file_tokens - player_tokens), path.name)


def find_player_image(name: str, season: int | None = None) -> str | None:
    if not IMAGES_DIR.exists():
        return None

    search_roots = []

    if season is not None:
        for directory in IMAGES_DIR.iterdir():
            if directory.is_dir() and re.match(rf"^{season}\s+-\s+", directory.name):
                search_roots = [directory]
                break

    if not search_roots:
        search_roots = [IMAGES_DIR]

    candidates = []
    for root in search_roots:
        iterator = root.iterdir() if root != IMAGES_DIR else root.rglob("*")
        for path in iterator:
            if (
                path.is_file()
                and path.suffix.lower() in {".png", ".webp", ".jpg", ".jpeg"}
                and path.stem.lower() != "logo"
            ):
                candidates.append(path)

    if not candidates:
        return None

    best = min(candidates, key=lambda path: image_match_score(name, path))
    if image_match_score(name, best)[0] >= 10:
        return None

    return "../SlidePuzzle/" + best.relative_to(APP_DIR.parent / "SlidePuzzle").as_posix()


def load_existing() -> dict[str, dict]:
    if not OUTPUT_FILE.exists():
        return {}

    with OUTPUT_FILE.open("r", encoding="utf-8") as file:
        payload = json.load(file)

    players = payload["players"] if isinstance(payload, dict) else payload
    return {player["name"]: player for player in players}


def update_seasons(seasons: Iterable[int]) -> list[dict]:
    existing = load_existing()

    for season in seasons:
        print(f"\nSeason {season}: {SEASON_NAMES.get(season, f'Survivor {season}')}")
        cast_category = contestant_category_name(season)
        print(f"  Cast category: {cast_category}")

        cast = category_members(cast_category)
        if not cast:
            print("  WARNING: no contestants found")
            continue

        try:
            jurors = set(category_members(jury_category_name(season)))
        except requests.RequestException:
            jurors = set()

        winner = None
        finalists: set[str] = set()
        try:
            page_text = parsed_page_text(season_page_title(season))
            winner, finalists = extract_winner_and_finalists(page_text)
        except Exception as exc:
            print(f"  WARNING: could not parse winner/finalists: {exc}")

        for name in cast:
            player = existing.setdefault(
                name,
                {
                    "id": re.sub(r"[^a-z0-9]+", "-", normalized_filename(name)).strip("-"),
                    "name": name,
                    "seasons": [],
                    "winner": False,
                    "finalist": False,
                    "juror": False,
                    "returningPlayer": False,
                    "image": None,
                    "appearances": [],
                },
            )

            if season not in player["seasons"]:
                player["seasons"].append(season)

            player["seasons"] = sorted(set(player["seasons"]))
            player["winner"] = bool(player.get("winner") or (winner and name == winner))
            player["finalist"] = bool(player.get("finalist") or name in finalists)
            player["juror"] = bool(player.get("juror") or name in jurors)
            player["returningPlayer"] = len(player["seasons"]) > 1
            player["image"] = find_player_image(name, season) or player.get("image")
            player.setdefault("appearances", [])
            appearance = next((a for a in player["appearances"] if a.get("season") == season), None)
            if appearance is None:
                appearance = {
                    "season": season,
                    "originalTribe": None,
                    "placement": None,
                    "age": None,
                    "madeMerge": None,
                    "juror": name in jurors,
                    "finalist": name in finalists,
                    "winner": bool(winner and name == winner),
                }
                player["appearances"].append(appearance)
            else:
                appearance["juror"] = name in jurors
                appearance["finalist"] = name in finalists
                appearance["winner"] = bool(winner and name == winner)

        print(f"  Contestants found: {len(cast)}")
        if winner:
            print(f"  Winner: {winner}")
        if finalists:
            print(f"  Finalists: {', '.join(sorted(finalists))}")

    players = sorted(existing.values(), key=lambda player: player["name"].lower())

    for player in players:
        player["seasons"] = sorted(set(player["seasons"]))
        player["returningPlayer"] = len(player["seasons"]) > 1
        player["image"] = find_player_image(player["name"]) or player.get("image")

    return players


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "seasons",
        nargs="+",
        type=int,
        help="Season numbers to add/update, e.g. 48 49 50",
    )
    args = parser.parse_args()

    invalid = [season for season in args.seasons if season < 1]
    if invalid:
        print(f"Invalid season numbers: {invalid}", file=sys.stderr)
        return 2

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

    try:
        players = update_seasons(args.seasons)
    except requests.RequestException as exc:
        print(f"\nNetwork/API error: {exc}", file=sys.stderr)
        return 1

    payload = {
        "generatedBy": "updateGuessWho.py",
        "schemaVersion": 2,
        "playerCount": len(players),
        "players": players,
    }

    with OUTPUT_FILE.open("w", encoding="utf-8") as file:
        json.dump(payload, file, indent=2, ensure_ascii=False)

    print(f"\nWrote {len(players)} players to {OUTPUT_FILE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
