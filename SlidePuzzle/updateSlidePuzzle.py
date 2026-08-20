#!/usr/bin/env python3

import argparse
import json
import os
import re
import time
import unicodedata
from io import BytesIO
from pathlib import Path
from urllib.parse import quote, unquote, urljoin

import requests
from bs4 import BeautifulSoup
from PIL import Image, ImageDraw, ImageFont, UnidentifiedImageError


# ============================================================
# CONFIGURATION
# ============================================================

BASE_URL = "https://survivor.fandom.com"
API_URL = f"{BASE_URL}/api.php"
VERSION = "United States"

APP_DIR = Path(__file__).resolve().parent
IMAGES_ROOT = APP_DIR / "Images"
MANIFEST_PATH = APP_DIR / "images.json"
FONT_PATH = APP_DIR / "survivant.ttf"

REQUEST_TIMEOUT = 30
REQUEST_DELAY = 0.10
HTTP_MAX_ATTEMPTS = 4
HTTP_RETRY_DELAY = 1.0

SOURCE_DOWNLOAD_WIDTH = 800
LOGO_DOWNLOAD_WIDTH = 800

WEB_MAX_WIDTH = 700
WEB_TARGET_KB = 300
WEB_START_QUALITY = 88
WEB_MIN_QUALITY = 65
WEB_MIN_WIDTH = 500

SUPPORTED_IMAGE_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/151.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,image/apng,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
}

session = requests.Session()
session.headers.update(HEADERS)
SEASON_INFO_CACHE = {}


# ============================================================
# GENERAL HELPERS
# ============================================================

def sanitize_name(name):
    for char in ['\\', '/', ':', '*', '?', '"', '<', '>', '|']:
        name = name.replace(char, "_")
    return re.sub(r"\s+", " ", name.strip())


def normalize_text(value):
    if not value:
        return ""
    value = unquote(str(value)).lower()
    value = unicodedata.normalize("NFKD", value)
    return re.sub(r"[^a-z0-9]", "", value)


def normalize_filename(value):
    if not value:
        return ""
    return os.path.basename(unquote(str(value))).lower()


def season_display_name(season_number):
    return f"Survivor {season_number}"


def get_font_path():
    candidates = [
        FONT_PATH,
        Path.cwd() / "survivant.ttf",
    ]

    for candidate in candidates:
        if candidate.exists():
            return str(candidate)

    print()
    print("WARNING: survivant.ttf was not found.")
    print("Using Pillow's default font.")
    print()
    return None


def season_number_from_folder(folder_name):
    match = re.match(r"^\s*(\d+)\s*-", folder_name)
    if not match:
        return None
    return int(match.group(1))


def find_existing_season_folder(season_number):
    if not IMAGES_ROOT.exists():
        return None

    matches = []
    for path in IMAGES_ROOT.iterdir():
        if not path.is_dir():
            continue
        if season_number_from_folder(path.name) == season_number:
            matches.append(path)

    if not matches:
        return None

    matches.sort(key=lambda p: p.name.casefold())
    return matches[0]


def get_season_folder_path(season_number, season_title):
    existing = find_existing_season_folder(season_number)
    if existing is not None:
        return existing

    folder_name = f"{season_number} - {sanitize_name(season_title)}"
    return IMAGES_ROOT / folder_name


# ============================================================
# HTTP
# ============================================================

def request_url(url, binary=False, quiet=False, params=None):
    retry_statuses = {403, 408, 425, 429, 500, 502, 503, 504}
    last_error = None

    for attempt in range(1, HTTP_MAX_ATTEMPTS + 1):
        try:
            response = session.get(
                url,
                params=params,
                timeout=REQUEST_TIMEOUT,
                allow_redirects=True,
            )

            if response.status_code == 200:
                if REQUEST_DELAY:
                    time.sleep(REQUEST_DELAY)
                if binary:
                    return response.content, response.url
                return response.text, response.url

            if response.status_code in retry_statuses:
                last_error = f"{response.status_code} {response.reason}"
                if attempt < HTTP_MAX_ATTEMPTS:
                    wait = HTTP_RETRY_DELAY * attempt
                    if not quiet:
                        print(
                            f"  HTTP {response.status_code}; "
                            f"retrying in {wait:.1f}s..."
                        )
                    time.sleep(wait)
                    continue

            response.raise_for_status()

        except requests.RequestException as exc:
            last_error = str(exc)
            if attempt < HTTP_MAX_ATTEMPTS:
                wait = HTTP_RETRY_DELAY * attempt
                if not quiet:
                    print(f"  Request error; retrying in {wait:.1f}s...")
                time.sleep(wait)
                continue

    if not quiet:
        print()
        print("Request failed:")
        print(f"  {url}")
        if last_error:
            print(f"  {last_error}")

    return None, None


def fetch_html(url, quiet=False):
    return request_url(url, binary=False, quiet=quiet)


# ============================================================
# SEASON RESOLUTION
# ============================================================

def get_infobox_value(soup, label_text):
    target = normalize_text(label_text)

    for label in soup.find_all(["h3", "div", "span"]):
        label_value = normalize_text(label.get_text(" ", strip=True))
        if label_value != target:
            continue

        parent = label.parent
        if parent:
            value = parent.find(class_=re.compile(r"pi-data-value"))
            if value:
                return value.get_text(" ", strip=True)

        next_element = label.find_next(["div", "span"])
        if next_element:
            text = next_element.get_text(" ", strip=True)
            if text:
                return text

    return None


def parse_season_page(html, final_url):
    soup = BeautifulSoup(html, "html.parser")
    heading = soup.find("h1", id="firstHeading") or soup.find("h1")
    page_title = heading.get_text(" ", strip=True) if heading else ""

    season_number_text = get_infobox_value(soup, "Season No.")
    version = get_infobox_value(soup, "Version")
    season_number = None

    if season_number_text:
        match = re.search(r"\d+", season_number_text)
        if match:
            season_number = int(match.group(0))

    return {
        "soup": soup,
        "url": final_url,
        "page_title": page_title,
        "season_number": season_number,
        "version": version,
    }


def validate_season_page(url, requested_season, quiet=True):
    html, final_url = fetch_html(url, quiet=quiet)
    if not html:
        return None

    info = parse_season_page(html, final_url)
    if info["season_number"] != requested_season:
        return None

    if info["version"] and "united states" not in info["version"].lower():
        return None

    return info


def search_fandom(query, limit=20):
    params = {
        "action": "query",
        "list": "search",
        "srsearch": query,
        "srnamespace": 0,
        "srlimit": limit,
        "format": "json",
        "utf8": 1,
    }

    try:
        response = session.get(API_URL, params=params, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        data = response.json()
        return data.get("query", {}).get("search", [])
    except (requests.RequestException, ValueError):
        return []


def wiki_title_to_url(title):
    title = title.replace(" ", "_")
    return f"{BASE_URL}/wiki/" + quote(title, safe="_():,-.'")


def clean_season_title(page_title, season_number):
    text = re.sub(r"\s+", " ", page_title).strip()

    numbered_subtitle = re.match(
        rf"^Survivor\s+{season_number}\s*:\s*(.+)$",
        text,
        flags=re.IGNORECASE,
    )
    if numbered_subtitle:
        return numbered_subtitle.group(1).strip()

    classic_subtitle = re.match(
        r"^Survivor\s*:\s*(.+)$",
        text,
        flags=re.IGNORECASE,
    )
    if classic_subtitle:
        return classic_subtitle.group(1).strip()

    if re.fullmatch(
        rf"Survivor\s+{season_number}",
        text,
        flags=re.IGNORECASE,
    ):
        return f"Season {season_number}"

    cleaned = re.sub(
        r"^Survivor\s*[:\-]?\s*",
        "",
        text,
        flags=re.IGNORECASE,
    ).strip()

    return cleaned or f"Season {season_number}"


def resolve_season_page(season_number):
    if season_number in SEASON_INFO_CACHE:
        return SEASON_INFO_CACHE[season_number]

    print(f"Resolving Survivor season {season_number}...")

    direct_url = f"{BASE_URL}/wiki/Survivor_{season_number}"
    info = validate_season_page(direct_url, season_number, quiet=True)

    if info:
        result = {
            "url": info["url"],
            "page_title": info["page_title"],
            "title": clean_season_title(info["page_title"], season_number),
        }
        SEASON_INFO_CACHE[season_number] = result
        print(f"  Resolved directly: {info['page_title']}")
        return result

    search_queries = [
        f'"Season No." "{season_number}" Survivor',
        f'"Season No." {season_number} Survivor',
        f'Survivor "season {season_number}"',
        f"Survivor {season_number}",
    ]

    candidate_urls = []
    seen = set()

    for query in search_queries:
        for result in search_fandom(query, limit=25):
            title = result.get("title", "")
            if not title:
                continue

            lower = title.lower()
            blocked = [
                "user:",
                "user blog:",
                "template:",
                "category:",
                "list of",
                "/gallery",
                "episode",
            ]
            if any(item in lower for item in blocked):
                continue

            url = wiki_title_to_url(title)
            if url in seen:
                continue
            seen.add(url)
            candidate_urls.append(url)

    for candidate_url in candidate_urls:
        info = validate_season_page(candidate_url, season_number, quiet=True)
        if not info:
            continue

        result = {
            "url": info["url"],
            "page_title": info["page_title"],
            "title": clean_season_title(info["page_title"], season_number),
        }
        SEASON_INFO_CACHE[season_number] = result
        print(f"  Resolved by search: {info['page_title']}")
        return result

    print(f"ERROR: Could not resolve Survivor season {season_number}.")
    return None


# ============================================================
# IMAGE URL HELPERS
# ============================================================

def clean_image_url(url):
    if not url:
        return None

    url = url.strip()
    if not url or url.startswith("data:"):
        return None
    if url.startswith("//"):
        return "https:" + url
    if not url.startswith("http"):
        return urljoin(BASE_URL, url)
    return url


def extract_srcset_urls(srcset):
    results = []
    if not srcset:
        return results

    for item in srcset.split(","):
        item = item.strip()
        if not item:
            continue

        parts = item.split()
        url = clean_image_url(parts[0])
        if not url:
            continue

        width_hint = 0
        if len(parts) > 1 and parts[1].lower().endswith("w"):
            try:
                width_hint = int(parts[1][:-1])
            except ValueError:
                pass

        results.append((width_hint, url))

    return results


def get_scale_width_from_url(url):
    match = re.search(
        r"/scale-to-width-down/(\d+)",
        url,
        flags=re.IGNORECASE,
    )
    if not match:
        return 0
    try:
        return int(match.group(1))
    except ValueError:
        return 0


def extract_image_urls_from_tag(img_tag):
    results = []
    seen = set()

    for attr in ["data-src", "data-original", "src"]:
        value = img_tag.get(attr)
        if not value:
            continue

        url = clean_image_url(value)
        if not url or url in seen:
            continue

        seen.add(url)
        results.append(
            {
                "url": url,
                "width_hint": get_scale_width_from_url(url),
            }
        )

    for attr in ["data-srcset", "srcset"]:
        for width_hint, url in extract_srcset_urls(img_tag.get(attr)):
            if url in seen:
                continue

            seen.add(url)
            results.append(
                {
                    "url": url,
                    "width_hint": max(
                        width_hint,
                        get_scale_width_from_url(url),
                    ),
                }
            )

    return results


def get_image_filename(img_tag, image_url=None):
    values = [
        img_tag.get("data-image-name"),
        img_tag.get("data-image-key"),
        img_tag.get("alt"),
        image_url,
    ]

    for value in values:
        if not value:
            continue

        value = unquote(str(value))

        match = re.search(
            r"/([^/]+\.(?:jpg|jpeg|png|webp|gif))"
            r"(?:/revision|$|\?)",
            value,
            flags=re.IGNORECASE,
        )
        if match:
            return match.group(1)

        match = re.search(
            r"([^/]+\.(?:jpg|jpeg|png|webp|gif))$",
            value,
            flags=re.IGNORECASE,
        )
        if match:
            return match.group(1)

    return ""


def build_scaled_source_url(url, width):
    clean = url.split("?", 1)[0]
    if "/revision/" in clean:
        base = clean.split("/revision/", 1)[0]
        return f"{base}/revision/latest/scale-to-width-down/{width}"
    return clean


def download_single_image(url):
    content, _ = request_url(url, binary=True, quiet=True)
    if not content:
        return None

    try:
        image = Image.open(BytesIO(content))
        image.load()
        return image.copy()
    except (UnidentifiedImageError, OSError):
        return None


def download_image_from_urls(urls, width=SOURCE_DOWNLOAD_WIDTH):
    tried = set()

    for url in urls:
        candidate = build_scaled_source_url(url, width)
        if candidate in tried:
            continue
        tried.add(candidate)

        image = download_single_image(candidate)
        if image is not None:
            return image, candidate

    fallback_urls = sorted(
        urls,
        key=get_scale_width_from_url,
        reverse=True,
    )

    for url in fallback_urls:
        if url in tried:
            continue
        tried.add(url)

        image = download_single_image(url)
        if image is not None:
            return image, url

    return None, None


# ============================================================
# SEASON LOGO
# ============================================================

def score_logo_candidate(
    img_tag,
    image_url,
    season_number,
    season_title,
    page_title,
):
    filename = get_image_filename(img_tag, image_url)
    normalized_filename = normalize_text(filename)
    alt = normalize_text(img_tag.get("alt", ""))
    normalized_title = normalize_text(season_title)
    normalized_page_title = normalize_text(page_title)

    score = 0

    if "logo" in normalized_filename:
        score += 700
    if "logo" in alt:
        score += 350
    if normalized_title and normalized_title in normalized_filename:
        score += 450
    if normalized_page_title and normalized_page_title in normalized_filename:
        score += 450

    season_patterns = [
        f"survivor{season_number}",
        f"season{season_number}",
        f"s{season_number}",
    ]
    if any(pattern in normalized_filename for pattern in season_patterns):
        score += 400

    if img_tag.find_parent("aside") is not None:
        score += 250
    if img_tag.find_parent(class_=re.compile(r"portable-infobox|pi-image")):
        score += 250

    width = img_tag.get("width")
    height = img_tag.get("height")

    try:
        width = int(width)
    except (TypeError, ValueError):
        width = 0

    try:
        height = int(height)
    except (TypeError, ValueError):
        height = 0

    if width and height:
        ratio = width / height
        if ratio >= 1.15:
            score += 80
        if ratio >= 1.50:
            score += 60
        if 0.85 <= ratio <= 1.15:
            score -= 100

    bad_words = [
        "cast",
        "castaway",
        "contestant",
        "tribe",
        "buff",
        "torch",
        "vote",
        "jury",
        "episode",
        "challenge",
        "winner",
        "finale",
        "press",
        "portrait",
        "headshot",
        "promo",
    ]

    for bad in bad_words:
        if bad in normalized_filename:
            score -= 500

    return {
        "score": score,
        "filename": filename,
        "url": image_url,
    }


def find_season_logo(
    soup,
    season_number,
    season_title,
    page_title,
):
    candidates = []
    seen_urls = set()

    infobox_images = []
    for selector in ["aside img", ".portable-infobox img", ".pi-image img"]:
        for img in soup.select(selector):
            if img not in infobox_images:
                infobox_images.append(img)

    all_images = list(soup.find_all("img"))
    ordered_images = infobox_images + [
        img for img in all_images if img not in infobox_images
    ]

    for img_tag in ordered_images:
        for source in extract_image_urls_from_tag(img_tag):
            image_url = source["url"]
            if image_url in seen_urls:
                continue
            seen_urls.add(image_url)

            candidates.append(
                score_logo_candidate(
                    img_tag,
                    image_url,
                    season_number,
                    season_title,
                    page_title,
                )
            )

    if not candidates:
        return None

    candidates.sort(key=lambda item: item["score"], reverse=True)
    best = candidates[0]
    return best if best["score"] >= 400 else None


def existing_logo_path(output_folder):
    for path in output_folder.iterdir() if output_folder.exists() else []:
        if (
            path.is_file()
            and path.stem.casefold() == "logo"
            and path.suffix.lower() in SUPPORTED_IMAGE_EXTENSIONS
        ):
            return path
    return None


def remove_existing_logos(output_folder):
    if not output_folder.exists():
        return

    for path in output_folder.iterdir():
        if (
            path.is_file()
            and path.stem.casefold() == "logo"
            and path.suffix.lower() in SUPPORTED_IMAGE_EXTENSIONS
        ):
            path.unlink()


def save_logo_image(image, source_filename, output_folder):
    extension = Path(source_filename).suffix.lower()

    if extension not in {".png", ".jpg", ".jpeg", ".webp"}:
        if image.mode in {"RGBA", "LA", "P"}:
            extension = ".png"
        else:
            extension = ".webp"

    output_path = output_folder / f"logo{extension}"

    if extension == ".png":
        image.save(output_path, format="PNG", optimize=True)
    elif extension in {".jpg", ".jpeg"}:
        image.convert("RGB").save(
            output_path,
            format="JPEG",
            quality=88,
            optimize=True,
        )
    else:
        save_image = image
        if image.mode not in {"RGB", "RGBA"}:
            save_image = image.convert("RGBA")
        save_image.save(
            output_path,
            format="WEBP",
            quality=88,
            method=6,
        )

    return output_path


def download_season_logo(
    soup,
    season_number,
    season_title,
    page_title,
    output_folder,
    overwrite=False,
):
    output_folder.mkdir(parents=True, exist_ok=True)

    current_logo = existing_logo_path(output_folder)
    if current_logo and not overwrite:
        print(f"Season logo already exists: {current_logo.name}")
        return current_logo

    print("Looking for season logo...")
    logo = find_season_logo(
        soup,
        season_number,
        season_title,
        page_title,
    )

    if logo is None:
        print("WARNING: Could not confidently identify the season logo.")
        return None

    image, _ = download_image_from_urls(
        [logo["url"]],
        width=LOGO_DOWNLOAD_WIDTH,
    )

    if image is None:
        print("  ERROR: Could not download season logo.")
        return None

    if overwrite:
        remove_existing_logos(output_folder)

    output_path = save_logo_image(
        image,
        logo["filename"],
        output_folder,
    )

    print(f"  Selected logo: {logo['filename'] or '(unnamed image)'}")
    print(f"  Logo dimensions: {image.width} x {image.height}")
    print(f"  Saved logo: {output_path.name}")
    return output_path


# ============================================================
# CAST DISCOVERY
# ============================================================

def looks_like_wiki_person_link(link):
    href = link.get("href", "")
    text = link.get_text(" ", strip=True)

    if not href.startswith("/wiki/") or not text:
        return False

    blocked_prefixes = [
        "/wiki/Survivor_",
        "/wiki/Survivor:",
        "/wiki/Category:",
        "/wiki/File:",
        "/wiki/Template:",
        "/wiki/Help:",
        "/wiki/Special:",
        "/wiki/Tribe",
        "/wiki/Episode",
    ]

    if any(item in href for item in blocked_prefixes):
        return False
    if len(text) > 70 or len(text.split()) > 7:
        return False
    return bool(re.search(r"[A-Za-z]", text))


def find_cast_heading(soup):
    for element_id in ["Cast", "Castaways"]:
        element = soup.find(id=element_id)
        if element:
            heading = element.find_parent(["h2", "h3", "h4"])
            if heading:
                return heading

    for heading in soup.find_all(["h2", "h3", "h4"]):
        text = re.sub(
            r"\[\s*\]",
            "",
            heading.get_text(" ", strip=True),
        ).strip()
        if text.lower() in {"cast", "castaways"}:
            return heading

    return None


def find_cast_tables_from_heading(heading):
    if heading is None:
        return []

    heading_level = int(heading.name[1])
    tables = []
    node = heading.find_next()

    while node is not None:
        if node.name in ["h1", "h2", "h3", "h4"]:
            try:
                level = int(node.name[1])
            except ValueError:
                level = 9
            if level <= heading_level:
                break

        if node.name == "table" and node not in tables:
            tables.append(node)

        node = node.find_next()

    return tables


def get_row_portrait_image(row):
    for img in row.find_all("img"):
        width = img.get("width")
        height = img.get("height")

        try:
            width = int(width)
        except (TypeError, ValueError):
            width = 0

        try:
            height = int(height)
        except (TypeError, ValueError):
            height = 0

        if width and height and 30 <= width <= 300 and 30 <= height <= 300:
            ratio = width / height
            if 0.60 <= ratio <= 1.40:
                return img

        src = (img.get("src") or img.get("data-src") or "").lower()
        classes = " ".join(img.get("class", [])).lower()
        if (
            "thumbnail" in classes
            or "thumb" in classes
            or "scale-to-width-down" in src
        ):
            return img

    return None


def get_player_link_from_cast_row(row):
    candidates = []

    for link in row.find_all("a", href=True):
        if not looks_like_wiki_person_link(link):
            continue

        text = link.get_text(" ", strip=True)
        if text.lower() in {
            "jury",
            "merged tribe",
            "united states",
            "day",
            "episode",
            "winner",
            "runner-up",
            "runner up",
        }:
            continue

        candidates.append(link)

    if not candidates:
        return None

    for link in candidates:
        if link.find_parent(["b", "strong"]):
            return link

    cells = row.find_all(["td", "th"])
    for cell in cells[:3]:
        cell_links = cell.find_all("a", href=True)
        for link in candidates:
            if link in cell_links:
                return link

    return candidates[0]


def score_cast_table(table):
    score = 0
    players = 0
    portraits = 0

    for row in table.find_all("tr"):
        player = get_player_link_from_cast_row(row)
        portrait = get_row_portrait_image(row)

        if player:
            players += 1
            score += 5
        if portrait:
            portraits += 1
            score += 3

    if 14 <= players <= 30:
        score += 100

    return score, players, portraits


def find_best_cast_table(soup):
    cast_heading = find_cast_heading(soup)
    cast_tables = find_cast_tables_from_heading(cast_heading)

    best = None
    best_score = -1
    best_players = 0
    best_portraits = 0
    method = ""

    for table in cast_tables:
        score, players, portraits = score_cast_table(table)
        score += 500
        if score > best_score:
            best = table
            best_score = score
            best_players = players
            best_portraits = portraits
            method = "Cast section"

    if best is not None:
        return best, best_players, best_portraits, method

    for table in soup.find_all("table"):
        score, players, portraits = score_cast_table(table)
        if score > best_score:
            best = table
            best_score = score
            best_players = players
            best_portraits = portraits
            method = "page fallback"

    return best, best_players, best_portraits, method


def get_cast_and_season_page(season_number, overwrite=False):
    info = resolve_season_page(season_number)
    if not info:
        return [], None, None

    season_title = info["title"]
    output_folder = get_season_folder_path(season_number, season_title)
    output_folder.mkdir(parents=True, exist_ok=True)

    print()
    print("=" * 76)
    print(f"READING SURVIVOR {season_number} CAST")
    print("=" * 76)
    print(f"Season page: {info['url']}")
    print(f"Season title: {season_title}")
    print(f"Season folder: {output_folder.name}")
    print()

    html, _ = fetch_html(info["url"])
    if not html:
        return [], output_folder, season_title

    soup = BeautifulSoup(html, "html.parser")

    download_season_logo(
        soup=soup,
        season_number=season_number,
        season_title=season_title,
        page_title=info["page_title"],
        output_folder=output_folder,
        overwrite=overwrite,
    )

    print()

    table, player_count, portrait_count, method = find_best_cast_table(soup)
    if table is None:
        print("ERROR: Could not locate a cast table.")
        return [], output_folder, season_title

    print(f"Cast table source: {method}")
    print(f"Player-like rows: {player_count}")
    print(f"Portrait rows: {portrait_count}")

    contestants = []
    seen_pages = set()

    for row in table.find_all("tr"):
        if get_row_portrait_image(row) is None:
            continue

        player_link = get_player_link_from_cast_row(row)
        if player_link is None:
            continue

        name = player_link.get_text(" ", strip=True)
        href = player_link.get("href")
        contestant_url = urljoin(BASE_URL, href)
        key = contestant_url.lower()

        if key in seen_pages:
            continue

        seen_pages.add(key)
        contestants.append(
            {
                "name": name,
                "link": contestant_url,
            }
        )

    return contestants, output_folder, season_title


# ============================================================
# CONTESTANT IMAGE MATCHING
# ============================================================

def build_contestant_season_url(contestant_url, season_title):
    title = season_title.replace(" ", "_")
    encoded = quote(title, safe="_-'âôō")
    return contestant_url.rstrip("/") + "/" + encoded


def page_looks_like_contestant_season_page(
    soup,
    contestant_name,
    season_title,
):
    text = normalize_text(soup.get_text(" ", strip=True))
    return (
        normalize_text(contestant_name) in text
        and normalize_text(season_title) in text
    )


def contestant_name_tokens(name):
    return [
        token.lower()
        for token in re.findall(r"[A-Za-z0-9]+", name)
        if len(token) >= 2
    ]


def filename_season_numbers(filename):
    results = set()
    lower = filename.lower()

    patterns = [
        r"(?:^|[^a-z])s(\d{1,2})(?:[^0-9]|$)",
        r"survivor[_\-\s]*(\d{1,2})",
        r"season[_\-\s]*(\d{1,2})",
    ]

    for pattern in patterns:
        for match in re.finditer(pattern, lower, flags=re.IGNORECASE):
            try:
                results.add(int(match.group(1)))
            except ValueError:
                pass

    return results


def filename_matches_player(filename, contestant_name):
    normalized_file = normalize_text(filename)
    normalized_name = normalize_text(contestant_name)

    if normalized_name and normalized_name in normalized_file:
        return True, True

    tokens = contestant_name_tokens(contestant_name)
    matched = sum(
        1
        for token in tokens
        if normalize_text(token) in normalized_file
    )

    return matched > 0, matched == len(tokens)


def score_image_candidate(
    img_tag,
    image_url,
    width_hint,
    contestant_name,
    season_number,
    season_page_bonus=False,
):
    filename = get_image_filename(img_tag, image_url)
    lower_filename = normalize_filename(filename)
    seasons = filename_season_numbers(filename)
    partial_name, full_name = filename_matches_player(
        filename,
        contestant_name,
    )

    score = 0

    if season_page_bonus:
        score += 1000
    if season_number in seasons:
        score += 1000
    elif seasons:
        score -= 800

    if full_name:
        score += 500
    elif partial_name:
        score += 100

    width = img_tag.get("width")
    height = img_tag.get("height")

    try:
        width = int(width)
    except (TypeError, ValueError):
        width = 0

    try:
        height = int(height)
    except (TypeError, ValueError):
        height = 0

    if width and height:
        ratio = height / width
        if ratio >= 1.15:
            score += 75
        if ratio >= 1.35:
            score += 50
        if 0.85 <= ratio <= 1.15:
            score -= 150

    if width_hint:
        score += min(width_hint, 1000) / 20

    bad_words = [
        "logo",
        "tribe",
        "buff",
        "torch",
        "icon",
        "vote",
        "jury",
        "site-logo",
        "site_logo",
        "placeholder",
        "transparent",
        "wedding",
        "traitors",
        "_t.",
        " t.",
    ]

    for bad in bad_words:
        if bad in lower_filename:
            score -= 1200

    return {
        "score": score,
        "filename": filename,
        "url": image_url,
        "width_hint": width_hint,
        "season_page_bonus": season_page_bonus,
    }


def collect_image_candidates(
    soup,
    contestant_name,
    season_number,
    season_page_bonus=False,
):
    candidates = []
    seen_urls = set()

    for img_tag in soup.find_all("img"):
        for source in extract_image_urls_from_tag(img_tag):
            image_url = source["url"]
            if image_url in seen_urls:
                continue

            seen_urls.add(image_url)
            candidates.append(
                score_image_candidate(
                    img_tag,
                    image_url,
                    source["width_hint"],
                    contestant_name,
                    season_number,
                    season_page_bonus,
                )
            )

    return candidates


def candidate_is_exact_match(
    candidate,
    contestant_name,
    season_number,
):
    filename = candidate["filename"]
    if not filename:
        return False

    seasons = filename_season_numbers(filename)
    partial_name, full_name = filename_matches_player(
        filename,
        contestant_name,
    )

    if season_number not in seasons or not (partial_name or full_name):
        return False

    lower = normalize_filename(filename)
    bad_words = [
        "logo",
        "tribe",
        "buff",
        "torch",
        "icon",
        "vote",
        "jury",
        "site-logo",
        "site_logo",
        "placeholder",
        "transparent",
        "wedding",
        "traitors",
        "_t.",
        " t.",
    ]
    return not any(word in lower for word in bad_words)


def choose_best_exact_match(
    candidates,
    contestant_name,
    season_number,
):
    exact = [
        candidate
        for candidate in candidates
        if candidate_is_exact_match(
            candidate,
            contestant_name,
            season_number,
        )
    ]

    if not exact:
        return None

    exact.sort(
        key=lambda item: (item["score"], item["width_hint"]),
        reverse=True,
    )
    return exact[0]


def add_download_urls(best, candidates):
    best_filename = normalize_text(best["filename"])
    same_file_urls = []

    if best_filename:
        for candidate in candidates:
            if normalize_text(candidate["filename"]) == best_filename:
                if candidate["url"] not in same_file_urls:
                    same_file_urls.append(candidate["url"])

    if not same_file_urls:
        same_file_urls = [best["url"]]

    best["download_urls"] = same_file_urls
    return best


def print_candidate_debug(candidates):
    print()
    print("  TOP IMAGE CANDIDATES")
    print("  " + "-" * 68)

    for index, candidate in enumerate(candidates[:10], start=1):
        print(f"  #{index}: score={candidate['score']:.1f}")
        print(f"      File: {candidate['filename'] or '(unknown)'}")
        print(f"      URL: {candidate['url']}")

    print()


def find_full_body_image(
    contestant_url,
    contestant_name,
    season_number,
    season_title,
    debug=False,
):
    # Fast path: main contestant page first.
    main_html, _ = fetch_html(contestant_url)
    main_candidates = []

    if main_html:
        main_soup = BeautifulSoup(main_html, "html.parser")
        main_candidates = collect_image_candidates(
            main_soup,
            contestant_name,
            season_number,
            season_page_bonus=False,
        )
        main_candidates.sort(
            key=lambda item: (item["score"], item["width_hint"]),
            reverse=True,
        )

        exact_match = choose_best_exact_match(
            main_candidates,
            contestant_name,
            season_number,
        )
        if exact_match is not None:
            if debug:
                print_candidate_debug(main_candidates)
            return add_download_urls(exact_match, main_candidates)

    # Older-season fallback: season-specific contestant subpage.
    season_specific_url = build_contestant_season_url(
        contestant_url,
        season_title,
    )
    season_html, _ = fetch_html(season_specific_url, quiet=True)
    season_candidates = []

    if season_html:
        season_soup = BeautifulSoup(season_html, "html.parser")
        if page_looks_like_contestant_season_page(
            season_soup,
            contestant_name,
            season_title,
        ):
            season_candidates = collect_image_candidates(
                season_soup,
                contestant_name,
                season_number,
                season_page_bonus=True,
            )

    candidates = main_candidates + season_candidates
    if not candidates:
        return None

    unique = {}
    for candidate in candidates:
        existing = unique.get(candidate["url"])
        if existing is None or candidate["score"] > existing["score"]:
            unique[candidate["url"]] = candidate

    candidates = list(unique.values())
    candidates.sort(
        key=lambda item: (item["score"], item["width_hint"]),
        reverse=True,
    )

    if debug:
        print_candidate_debug(candidates)

    exact_match = choose_best_exact_match(
        candidates,
        contestant_name,
        season_number,
    )
    if exact_match is not None:
        return add_download_urls(exact_match, candidates)

    season_page_candidates = [
        candidate
        for candidate in candidates
        if candidate["season_page_bonus"] and candidate["score"] >= 900
    ]

    if season_page_candidates:
        season_page_candidates.sort(
            key=lambda item: (item["score"], item["width_hint"]),
            reverse=True,
        )
        return add_download_urls(season_page_candidates[0], candidates)

    best = candidates[0]
    print("  WARNING: Could not confidently identify the season-specific image.")
    print(f"  Best candidate: {best['filename'] or best['url']}")
    return None


# ============================================================
# WEB IMAGE PROCESSING
# ============================================================

def resize_to_width(image, max_width):
    if image.width <= max_width:
        return image.copy()

    scale = max_width / image.width
    new_height = int(round(image.height * scale))
    return image.resize(
        (max_width, new_height),
        Image.Resampling.LANCZOS,
    )


def fit_font(
    draw,
    text,
    font_path,
    maximum_size,
    maximum_width,
):
    if font_path is None:
        return ImageFont.load_default()

    size = maximum_size
    while size >= 12:
        font = ImageFont.truetype(font_path, size)
        bbox = draw.textbbox((0, 0), text, font=font)
        if bbox[2] - bbox[0] <= maximum_width:
            return font
        size -= 1

    return ImageFont.truetype(font_path, 12)


def add_text_with_shadow(
    image,
    contestant_name,
    season,
    version,
    font_path,
):
    img = image.convert("RGB")
    draw = ImageDraw.Draw(img)

    margin_x = max(10, int(img.width * 0.025))
    maximum_width = img.width - margin_x * 2
    base_font_size = max(18, min(int(img.width * 0.055), 54))

    name_font = fit_font(
        draw,
        contestant_name,
        font_path,
        base_font_size,
        maximum_width,
    )

    detail_size = max(16, int(base_font_size * 0.85))
    season_font = fit_font(
        draw,
        season,
        font_path,
        detail_size,
        maximum_width,
    )
    version_font = fit_font(
        draw,
        version,
        font_path,
        detail_size,
        maximum_width,
    )

    lines = [
        (contestant_name, name_font),
        (season, season_font),
        (version, version_font),
    ]

    spacing = max(4, int(img.height * 0.008))
    heights = []

    for text, font in lines:
        bbox = draw.textbbox((0, 0), text, font=font)
        heights.append(bbox[3] - bbox[1])

    total_height = sum(heights) + spacing * (len(lines) - 1)
    bottom_margin = max(10, int(img.height * 0.025))
    current_y = img.height - bottom_margin - total_height
    shadow_offset = max(1, int(img.width * 0.004))

    for index, (text, font) in enumerate(lines):
        shadows = [
            (-shadow_offset, -shadow_offset),
            (shadow_offset, -shadow_offset),
            (-shadow_offset, shadow_offset),
            (shadow_offset, shadow_offset),
            (0, shadow_offset),
        ]

        for dx, dy in shadows:
            draw.text(
                (margin_x + dx, current_y + dy),
                text,
                font=font,
                fill="black",
            )

        draw.text(
            (margin_x, current_y),
            text,
            font=font,
            fill="white",
        )

        current_y += heights[index] + spacing

    return img


def encode_webp(image, quality):
    buffer = BytesIO()
    image.save(
        buffer,
        format="WEBP",
        quality=quality,
        method=6,
    )
    return buffer.getvalue()


def save_web_image(
    image,
    output_path,
    target_kb=WEB_TARGET_KB,
    max_width=WEB_MAX_WIDTH,
):
    image = image.convert("RGB")
    current_width = min(max_width, image.width)

    while True:
        resized = resize_to_width(image, current_width)
        quality = WEB_START_QUALITY
        best_data = None
        best_quality = quality
        best_size_kb = None

        while quality >= WEB_MIN_QUALITY:
            data = encode_webp(resized, quality)
            size_kb = len(data) / 1024

            best_data = data
            best_quality = quality
            best_size_kb = size_kb

            if size_kb <= target_kb:
                break

            quality -= 3

        if best_size_kb <= target_kb:
            break
        if current_width <= WEB_MIN_WIDTH:
            break

        current_width = max(
            WEB_MIN_WIDTH,
            int(current_width * 0.90),
        )

    with open(output_path, "wb") as file:
        file.write(best_data)

    print(f"  Web dimensions: {resized.width} x {resized.height}")
    print(f"  WebP quality: {best_quality}")
    print(f"  File size: {best_size_kb:.0f} KB")


# ============================================================
# SEASON DOWNLOAD
# ============================================================

def save_contestant_image(
    contestant,
    season_number,
    season_title,
    output_folder,
    font_path,
    overwrite=False,
    debug=False,
):
    contestant_name = contestant["name"]
    output_path = output_folder / f"{sanitize_name(contestant_name)}.webp"

    if output_path.exists() and not overwrite:
        print(f"  Already exists: {output_path.name}")
        return True

    print("  Looking for season-specific full-body image...")
    lookup_start = time.perf_counter()

    candidate = find_full_body_image(
        contestant_url=contestant["link"],
        contestant_name=contestant_name,
        season_number=season_number,
        season_title=season_title,
        debug=debug,
    )

    print(f"  Image lookup time: {time.perf_counter() - lookup_start:.1f}s")

    if candidate is None:
        print("  ERROR: No confident season-specific player image found.")
        return False

    print(f"  Selected: {candidate['filename'] or '(unnamed image)'}")
    print(f"  Match score: {candidate['score']:.1f}")
    print(
        f"  Downloading approximately "
        f"{SOURCE_DOWNLOAD_WIDTH}px-wide source image..."
    )

    image, _ = download_image_from_urls(
        candidate["download_urls"],
        width=SOURCE_DOWNLOAD_WIDTH,
    )

    if image is None:
        print("  ERROR: Could not download selected image.")
        return False

    print(f"  Source dimensions: {image.width} x {image.height}")

    web_image = resize_to_width(image, WEB_MAX_WIDTH)
    processed = add_text_with_shadow(
        image=web_image,
        contestant_name=contestant_name,
        season=season_display_name(season_number),
        version=VERSION,
        font_path=font_path,
    )

    save_web_image(
        processed,
        output_path,
    )

    print(f"  Saved: {output_path.name}")
    return True


def update_season(
    season_number,
    font_path,
    overwrite=False,
    debug=False,
):
    contestants, output_folder, season_title = get_cast_and_season_page(
        season_number,
        overwrite=overwrite,
    )

    if not contestants:
        print(f"ERROR: No contestants found for Survivor {season_number}.")
        return 0, 0

    print()
    print(f"Found {len(contestants)} castaways.")
    print(f"Output folder: {output_folder.name}")
    print()

    success_count = 0

    for index, contestant in enumerate(contestants, start=1):
        print("-" * 76)
        print(f"[{index}/{len(contestants)}] {contestant['name']}")
        print(f"  Page: {contestant['link']}")

        success = save_contestant_image(
            contestant=contestant,
            season_number=season_number,
            season_title=season_title,
            output_folder=output_folder,
            font_path=font_path,
            overwrite=overwrite,
            debug=debug,
        )

        if success:
            success_count += 1

        print()

    return success_count, len(contestants)


# ============================================================
# IMAGES.JSON MANIFEST
# ============================================================

def is_manifest_image(path):
    return (
        path.is_file()
        and not path.name.startswith(".")
        and path.suffix.lower() in SUPPORTED_IMAGE_EXTENSIONS
    )


def manifest_image_sort_key(filename):
    path = Path(filename)
    is_logo = path.stem.casefold() == "logo"
    return (
        0 if is_logo else 1,
        path.stem.casefold(),
        path.suffix.casefold(),
    )


def rebuild_images_json():
    IMAGES_ROOT.mkdir(parents=True, exist_ok=True)

    seasons = []
    ignored_folders = []

    for folder in IMAGES_ROOT.iterdir():
        if not folder.is_dir() or folder.name.startswith("."):
            continue

        number = season_number_from_folder(folder.name)
        if number is None:
            ignored_folders.append(folder.name)
            continue

        images = [
            path.name
            for path in folder.iterdir()
            if is_manifest_image(path)
        ]

        if not images:
            continue

        images.sort(key=manifest_image_sort_key)
        seasons.append(
            {
                "number": number,
                "season": folder.name,
                "images": images,
            }
        )

    seasons.sort(
        key=lambda item: (
            item["number"],
            item["season"].casefold(),
        ),
        reverse=True,
    )

    manifest = [
        {
            "season": season["season"],
            "images": season["images"],
        }
        for season in seasons
    ]

    with MANIFEST_PATH.open("w", encoding="utf-8") as file:
        json.dump(
            manifest,
            file,
            indent=4,
            ensure_ascii=False,
        )
        file.write("\n")

    total_images = sum(
        len(season["images"])
        for season in manifest
    )

    print()
    print("=" * 76)
    print("REBUILT images.json")
    print("=" * 76)
    print(f"Seasons: {len(manifest)}")
    print(f"Images:  {total_images}")
    print(f"File:    {MANIFEST_PATH}")

    if manifest:
        print(f"Newest:  {manifest[0]['season']}")

    if ignored_folders:
        print()
        print("Ignored non-season folders:")
        for folder in sorted(ignored_folders, key=str.casefold):
            print(f"  {folder}")

    return manifest


# ============================================================
# COMMAND LINE
# ============================================================

def parse_args():
    parser = argparse.ArgumentParser(
        description=(
            "Update the Survivor Slide Puzzle. Download one or more "
            "Survivor seasons, save their logo/player images into Images/, "
            "and rebuild images.json automatically."
        )
    )

    parser.add_argument(
        "seasons",
        nargs="*",
        type=int,
        help=(
            "Season numbers to download/update. Example: "
            "python3 updateSlidePuzzle.py 48 49 50"
        ),
    )

    parser.add_argument(
        "--rebuild",
        action="store_true",
        help=(
            "Only rebuild images.json from the existing Images folders. "
            "No web downloads are performed."
        ),
    )

    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing player images and logos.",
    )

    parser.add_argument(
        "--debug-images",
        action="store_true",
        help="Show image-matching diagnostics.",
    )

    return parser.parse_args()


def main():
    args = parse_args()

    if not args.seasons and not args.rebuild:
        print(
            "Nothing to do. Supply one or more season numbers, "
            "or use --rebuild."
        )
        print()
        print("Examples:")
        print("  python3 updateSlidePuzzle.py 51")
        print("  python3 updateSlidePuzzle.py 48 49 50")
        print("  python3 updateSlidePuzzle.py --rebuild")
        return

    print()
    print("SURVIVOR SLIDE PUZZLE UPDATER")
    print("=" * 76)
    print(f"App folder:    {APP_DIR}")
    print(f"Images folder: {IMAGES_ROOT}")
    print(f"Manifest:      {MANIFEST_PATH}")

    if args.rebuild and not args.seasons:
        print("Mode:          Rebuild manifest only")
        rebuild_images_json()
        return

    print(
        "Seasons:       "
        + ", ".join(str(season) for season in args.seasons)
    )
    print(f"Overwrite:     {'Yes' if args.overwrite else 'No'}")
    print(f"Debug images:  {'Yes' if args.debug_images else 'No'}")

    font_path = get_font_path()
    if font_path:
        print(f"Font:          {font_path}")

    total_success = 0
    total_players = 0

    for season_number in args.seasons:
        success, total = update_season(
            season_number=season_number,
            font_path=font_path,
            overwrite=args.overwrite,
            debug=args.debug_images,
        )
        total_success += success
        total_players += total

    # Always rebuild the manifest after a season update, even if some
    # contestants failed. This keeps images.json synchronized with disk.
    rebuild_images_json()

    print()
    print("=" * 76)
    print("UPDATE COMPLETE")
    print("=" * 76)
    print(f"Player images ready: {total_success}/{total_players}")
    print("images.json rebuilt from the actual Images folders.")


if __name__ == "__main__":
    main()
