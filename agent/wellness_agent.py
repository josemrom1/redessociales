#!/usr/bin/env python3
"""
wellness_agent.py — Wellness Social-Media Image Agent
Generates paired EN/ES 9:16 quote images via the Ideogram API.

Usage:
    python wellness_agent.py [--category CATEGORY] [--quote-id ID]
                             [--template {a,b,c}] [--all] [--dry-run]

Environment variables required:
    IDEOGRAM_API_KEY   — your Ideogram API key (https://ideogram.ai/manage-api)

Dependencies (see requirements.txt):
    requests, pyyaml, Pillow (optional, for local preview thumbnails)
"""

import argparse
import json
import os
import random
import sys
import time
from datetime import datetime
from pathlib import Path
from string import Template

import requests
import yaml

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
BANK_PATH = ROOT / "messages" / "wellness_bank.json"
PROMPTS_PATH = ROOT / "prompts" / "image_prompts.yaml"
OUTPUT_PENDING = ROOT / "output" / "pending"
OUTPUT_APPROVED = ROOT / "output" / "approved"

IDEOGRAM_API_URL = "https://api.ideogram.ai/generate"

# ---------------------------------------------------------------------------
# Load data
# ---------------------------------------------------------------------------

def load_bank() -> dict:
    with open(BANK_PATH, encoding="utf-8") as f:
        return json.load(f)


def load_prompts() -> dict:
    with open(PROMPTS_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


# ---------------------------------------------------------------------------
# Quote selection
# ---------------------------------------------------------------------------

def pick_quote(bank: dict, category: str | None = None, quote_id: str | None = None) -> tuple[str, str, str]:
    """Return (category, en_quote, es_quote)."""
    categories = bank["categories"]

    if quote_id:
        for cat, quotes in categories.items():
            for q in quotes:
                if q["id"] == quote_id:
                    return cat, q["en"], q["es"]
        sys.exit(f"Quote ID '{quote_id}' not found in bank.")

    if category:
        if category not in categories:
            sys.exit(f"Category '{category}' not found. Available: {list(categories)}")
        pool = categories[category]
    else:
        all_quotes = [(cat, q) for cat, qs in categories.items() for q in qs]
        category, quote_obj = random.choice(all_quotes)
        return category, quote_obj["en"], quote_obj["es"]

    quote_obj = random.choice(pool)
    return category, quote_obj["en"], quote_obj["es"]


def all_quotes(bank: dict):
    """Yield (category, en, es) for every entry."""
    for cat, quotes in bank["categories"].items():
        for q in quotes:
            yield cat, q["en"], q["es"]


# ---------------------------------------------------------------------------
# Prompt building
# ---------------------------------------------------------------------------

TEMPLATE_MAP = {
    "a": ("template_a_en", "template_a_es"),
    "b": ("template_b_en", "template_b_es"),
    "c": ("template_c_en", "template_c_es"),
}

CATEGORY_TEMPLATE_DEFAULT = {
    "mindfulness": "a",
    "nutrition": "c",
    "movement": "b",
    "sleep": "c",
    "mental_health": "a",
}


def build_prompt(prompts: dict, template_key: str, category: str,
                 en_quote: str, es_quote: str, lang: str) -> str:
    tpl_raw = prompts[template_key]["prompt"]
    palette = prompts["palettes"].get(category, "soft blue and white")
    nature = prompts["nature_scenes"].get(category, "serene natural landscape")

    filled = (
        tpl_raw
        .replace("{{EN_QUOTE}}", en_quote)
        .replace("{{ES_QUOTE}}", es_quote)
        .replace("{{CATEGORY}}", category.replace("_", " ").title())
        .replace("{{PALETTE}}", palette)
        .replace("{{NATURE_SCENE}}", nature)
    )
    return filled.strip()


# ---------------------------------------------------------------------------
# Ideogram API call
# ---------------------------------------------------------------------------

def generate_image(api_key: str, prompt: str, prompts_cfg: dict,
                   dry_run: bool = False) -> str | None:
    """Call Ideogram and return the image URL, or None on failure."""
    defaults = prompts_cfg["defaults"]
    payload = {
        "image_request": {
            "prompt": prompt,
            "negative_prompt": prompts_cfg["negative_prompt"].strip(),
            "aspect_ratio": defaults["aspect_ratio"],
            "model": defaults["model"],
            "style_type": defaults["style_type"],
            "magic_prompt_option": defaults["magic_prompt"],
        }
    }

    if dry_run:
        print(f"  [DRY RUN] Would POST to Ideogram:\n  {json.dumps(payload, indent=2)[:400]}…")
        return "https://example.com/dry-run-image.png"

    headers = {
        "Api-Key": api_key,
        "Content-Type": "application/json",
    }
    resp = requests.post(IDEOGRAM_API_URL, headers=headers, json=payload, timeout=60)
    if resp.status_code != 200:
        print(f"  [ERROR] Ideogram API returned {resp.status_code}: {resp.text[:300]}")
        return None
    data = resp.json()
    try:
        return data["data"][0]["url"]
    except (KeyError, IndexError):
        print(f"  [ERROR] Unexpected response shape: {data}")
        return None


# ---------------------------------------------------------------------------
# Save image
# ---------------------------------------------------------------------------

def download_and_save(url: str, dest: Path, dry_run: bool = False) -> None:
    if dry_run:
        print(f"  [DRY RUN] Would download {url} → {dest}")
        return
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(resp.content)
    print(f"  Saved → {dest}")


def make_filename(category: str, lang: str, quote_snippet: str, ts: str) -> str:
    snippet = quote_snippet[:30].strip().lower().replace(" ", "_").replace(".", "")
    return f"{ts}_{category}_{lang}_{snippet}.png"


# ---------------------------------------------------------------------------
# Main orchestration
# ---------------------------------------------------------------------------

def process_quote(category: str, en: str, es: str, template: str,
                  prompts: dict, api_key: str, ts: str, dry_run: bool) -> None:
    t_key = template or CATEGORY_TEMPLATE_DEFAULT.get(category, "a")
    t_en_key, t_es_key = TEMPLATE_MAP[t_key]

    for lang, quote, tpl_key in [("en", en, t_en_key), ("es", es, t_es_key)]:
        print(f"\n▶ Generating [{lang.upper()}] {category} — "{quote[:50]}…"")
        prompt = build_prompt(prompts, tpl_key, category, en, es, lang)
        url = generate_image(api_key, prompt, prompts, dry_run=dry_run)
        if url:
            fname = make_filename(category, lang, quote, ts)
            download_and_save(url, OUTPUT_PENDING / fname, dry_run=dry_run)
        time.sleep(1)  # polite rate limit


def main() -> None:
    parser = argparse.ArgumentParser(description="Wellness image agent")
    parser.add_argument("--category", help="Filter by category")
    parser.add_argument("--quote-id", help="Use specific quote ID")
    parser.add_argument("--template", choices=["a", "b", "c"], help="Override template")
    parser.add_argument("--all", action="store_true", dest="all_quotes",
                        help="Generate images for ALL quotes in the bank")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print prompts without calling the API")
    args = parser.parse_args()

    api_key = os.environ.get("IDEOGRAM_API_KEY", "")
    if not api_key and not args.dry_run:
        sys.exit("Set IDEOGRAM_API_KEY environment variable or use --dry-run.")

    bank = load_bank()
    prompts = load_prompts()
    OUTPUT_PENDING.mkdir(parents=True, exist_ok=True)
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")

    if args.all_quotes:
        for cat, en, es in all_quotes(bank):
            process_quote(cat, en, es, args.template, prompts, api_key, ts, args.dry_run)
    else:
        cat, en, es = pick_quote(bank, args.category, args.quote_id)
        process_quote(cat, en, es, args.template, prompts, api_key, ts, args.dry_run)

    print("\n✅ Done. Images saved to output/pending/ — run the approval checklist before publishing.")


if __name__ == "__main__":
    main()
