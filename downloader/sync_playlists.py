#!/usr/bin/env python3
"""
sync_playlists.py — keep Wes's "DND Hearth ..." Spotify playlists in sync
with the Elor: Rebirth campaign as queue-able PlaylistPresets.

Zero-paste discovery: if downloader/spotify_sync.json holds Wes's Spotify
user id (+ his own API client id/secret), the script fetches his PUBLIC
profile playlists and syncs every one whose name contains "DND Hearth" —
new playlists need no link-pasting, just the naming convention. (Spotify's
API cannot see folders, so the name is the marker.) Known playlists keep
their curated categories/tags from the table below; newly discovered ones
get auto-derived tags and are flagged for curation. If discovery is
unavailable (no config, offline, rate-limited) it falls back to the table.

Re-runnable: the playlists grow over time. Before downloading anything,
every playlist track is fuzzy-matched against the mp3s already on disk
(from any source, any filename); only the missing ones are fetched. Dupes
across playlists — or songs left in Spotify that we already grabbed another
way — are never downloaded twice. Rewrites the "spotify-*" presets in
place; non-spotify assets/presets are never touched.

    python sync_playlists.py              # discover + sync everything
    python sync_playlists.py --save-only  # just refresh the track lists, no DL

Pipeline per playlist:  spotdl save (metadata) -> spotdl download (mp3, skips
existing) -> match each track to its file -> library.json assets + preset.
Tracks spotdl can't find on YouTube are reported; grab those with yt-dlp:
    yt-dlp --default-search ytsearch5 "Artist Title" -I 1:1 \
      -x --audio-format mp3 -o "<music>/Artist - Title.%(ext)s"
then re-run this script to fold them in.

Personal-table use only: assets are stamped source="spotify", license="private"
and live under the gitignored music/ folder. Don't redistribute.
"""
import argparse, json, re, subprocess, sys, tempfile, unicodedata
from pathlib import Path

CAMPAIGN = Path(r"C:\Users\weshu\Campaigns\Elor Rebirth")
MUSIC = CAMPAIGN / "music"
LIB = CAMPAIGN / "library.json"

# downloader/spotify_sync.json (gitignored — holds an API secret):
#   { "user": "<spotify user id or full profile URL>",
#     "client_id": "...", "client_secret": "..." }
# client_id/secret are optional; without them we borrow spotdl's shared creds,
# which Spotify frequently rate-limits (429, 24h) — own creds are reliable.
CONFIG = Path(__file__).with_name("spotify_sync.json")
PREFIX = "dnd hearth"  # case-insensitive substring that marks a Hearth playlist

# Curated playlists: url, preset id, display name, primary category, extra
# categories, base tags. Discovery matches these by playlist id and keeps this
# metadata; playlists found on the profile but NOT listed here get auto tags —
# promote them into this table to curate.
PLAYLISTS = [
    ("https://open.spotify.com/playlist/1y5dRModd4RO3nLgHNg4ae",
     "spotify-boss-combat", "Boss / Combat", "boss", ["boss", "combat"],
     ["boss", "combat", "epic", "battle", "orchestral", "intense"]),
    ("https://open.spotify.com/playlist/6Mu21QzVeADro7kQYtZs3M",
     "spotify-ethereal", "Angelic / Ethereal", "ethereal", ["ethereal"],
     ["angelic", "ethereal", "vocals", "choir", "sacred", "atmospheric"]),
    ("https://open.spotify.com/playlist/0ZIkA0Dk8yXRe0qa1on2Bs",
     "spotify-chase-suspense", "Chase / Suspense", "tension", ["tension"],
     ["chase", "suspense", "tension", "pursuit", "danger"]),
    ("https://open.spotify.com/playlist/50ck6o9PDn5CWLOMRPZcEZ",
     "spotify-adventure", "Adventure / Exploration", "exploration",
     ["exploration", "travel"],
     ["adventure", "exploration", "travel", "wonder", "journey"]),
    ("https://open.spotify.com/playlist/4C1CjrntCYeFZWZDUUJM4d",
     "spotify-chill", "Chill", "chill", ["chill"],
     ["chill", "calm", "peaceful", "downtime", "ambient"]),
    ("https://open.spotify.com/playlist/15IV0OLu3oCzX3l6A4REWr",
     "spotify-sad", "Sad / Somber", "somber", ["somber"],
     ["sad", "somber", "melancholy", "emotional", "grief"]),
]


# Name keyword -> primary category for auto-tagging discovered playlists.
AUTO_CATS = [
    (("boss", "combat", "battle", "fight"), "boss"),
    (("chase", "suspense", "tension"), "tension"),
    (("ethereal", "angelic", "divine", "sacred"), "ethereal"),
    (("adventure", "exploration", "travel", "journey"), "exploration"),
    (("chill", "calm", "tavern", "rest", "downtime"), "chill"),
    (("sad", "somber", "grief", "mourn"), "somber"),
    (("horror", "creepy", "dread", "undead"), "horror"),
    (("mystery", "intrigue", "sneak", "stealth"), "mystery"),
]


def playlist_id(url: str) -> str:
    return url.rstrip("/").split("/")[-1].split("?")[0]


def auto_row(url: str, name: str):
    """Build a playlist row for a discovered playlist not in the curated table."""
    label = re.sub(re.escape(PREFIX), "", name, flags=re.I).strip(" -–—:")
    slug = re.sub(r"[^a-z0-9]+", "-", (label or name).lower()).strip("-")
    low = name.lower()
    cat = next((c for words, c in AUTO_CATS if any(w in low for w in words)), "misc")
    tags = sorted({w for w in re.findall(r"[a-z]+", (label or name).lower()) if len(w) > 2})
    return (url, f"spotify-{slug}", label or name, cat, [cat], tags or [cat])


def discover() -> list | None:
    """Fetch Wes's public profile playlists and return rows for every one whose
    name contains PREFIX — curated-table metadata when known, auto tags when
    new. Returns None (with a reason printed) if discovery can't run; the
    caller falls back to the curated table."""
    if not CONFIG.exists():
        print(f"No {CONFIG.name} — using the built-in playlist table.")
        return None
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    user = (cfg.get("user") or "").rstrip("/").split("/")[-1].split("?")[0]
    if not user:
        print(f'{CONFIG.name} has no "user" — using the built-in playlist table.')
        return None
    cid, secret = cfg.get("client_id"), cfg.get("client_secret")
    if not (cid and secret):  # fall back to spotdl's shared (rate-limited) creds
        from spotdl.utils.config import DEFAULT_CONFIG
        cid, secret = DEFAULT_CONFIG["client_id"], DEFAULT_CONFIG["client_secret"]
    import requests
    try:
        tok = requests.post("https://accounts.spotify.com/api/token",
                            data={"grant_type": "client_credentials"},
                            auth=(cid, secret), timeout=15).json()["access_token"]
        found, url = [], f"https://api.spotify.com/v1/users/{user}/playlists?limit=50"
        while url:
            r = requests.get(url, headers={"Authorization": f"Bearer {tok}"}, timeout=15)
            if r.status_code == 429:
                print(f"Spotify rate-limited playlist discovery (retry in {r.headers.get('Retry-After', '?')}s) "
                      "— using the built-in playlist table. Own client_id/secret in "
                      f"{CONFIG.name} avoids this.")
                return None
            r.raise_for_status()
            page = r.json()
            found += [(p["external_urls"]["spotify"], p["name"])
                      for p in page["items"] if p and PREFIX in p["name"].lower()]
            url = page.get("next")
    except Exception as e:  # offline, bad creds, API change — sync must still run
        print(f"Playlist discovery failed ({e}) — using the built-in playlist table.")
        return None

    known = {playlist_id(row[0]): row for row in PLAYLISTS}
    rows, fresh = [], []
    for purl, pname in found:
        row = known.get(playlist_id(purl))
        if row is None:
            row = auto_row(purl, pname)
            fresh.append(pname)
        rows.append(row)
    print(f'Discovered {len(rows)} "{PREFIX}" playlist(s) on profile "{user}".')
    for pname in fresh:
        print(f"  ✨ NEW: {pname} — auto-tagged; tell Claude to curate its tags.")
    missing = [row[2] for pid, row in known.items()
               if pid not in {playlist_id(u) for u, _ in found}]
    for name in missing:
        print(f"  ⚠ known playlist not on the public profile (private? renamed?): {name} — still syncing it.")
    rows += [known[pid] for pid in known
             if pid not in {playlist_id(u) for u, _ in found}]
    return rows or None


def norm(s: str) -> str:
    # Keep Unicode letters/digits (Japanese titles survive), drop punctuation.
    s = unicodedata.normalize("NFKC", s).lower()
    return "".join(ch for ch in s if ch.isalnum())


def spotdl_save(url: str, dest: Path) -> list[dict]:
    subprocess.run([sys.executable, "-m", "spotdl", "save", url,
                    "--save-file", str(dest)], check=True)
    d = json.loads(dest.read_text(encoding="utf-8"))
    return d if isinstance(d, list) else d.get("songs", d)


def spotdl_download(urls: list[str]):
    subprocess.run([sys.executable, "-m", "spotdl", "download", *urls,
                    "--format", "mp3", "--bitrate", "192k",
                    "--output", str(MUSIC / "{artists} - {title}.{output-ext}")])


def match_file(files_index, artists, title):
    """Best mp3 whose normalized stem contains the title (and ideally artist)."""
    nt, na = norm(title), norm(artists[0] if artists else "")
    best, best_score = None, -1
    for name, nstem in files_index:
        if nt and nt in nstem:
            score = len(nt) + (5 if na and na in nstem else 0)
            if score > best_score:
                best, best_score = name, score
    return best


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--save-only", action="store_true",
                    help="refresh track lists only; skip downloading")
    args = ap.parse_args()

    playlists = discover() or PLAYLISTS

    tmp = Path(tempfile.mkdtemp())
    saved = []
    for i, (url, *_rest) in enumerate(playlists, 1):
        songs = spotdl_save(url, tmp / f"pl{i}.spotdl")
        print(f"[{i}/{len(playlists)}] {_rest[1]}: {len(songs)} tracks")
        saved.append(songs)

    # Dedupe BEFORE downloading: fuzzy-match every playlist track against the
    # mp3s already on disk (any source — spotdl, yt-dlp, the GUI grabber) and
    # only fetch the ones we genuinely don't have. spotdl's own skip only
    # catches exact filename matches, which re-downloads dupes whenever the
    # metadata differs slightly.
    if not args.save_only:
        files_index = [(f.name, norm(f.stem)) for f in MUSIC.glob("*.mp3")]
        to_download, have = {}, 0
        for songs in saved:
            for s in songs:
                artists = s.get("artists") or ([s["artist"]] if s.get("artist") else [])
                if match_file(files_index, artists, s.get("name", "")):
                    have += 1
                elif s.get("url"):
                    to_download[s["url"]] = f"{', '.join(artists)} - {s.get('name', '')}"
        print(f"\nAlready on disk: {have} tracks — skipping those.")
        if to_download:
            print(f"Downloading {len(to_download)} new track(s):")
            for label in to_download.values():
                print(f"  + {label}")
            spotdl_download(list(to_download))
        else:
            print("Nothing new to download. ✓")

    lib = json.loads(LIB.read_text(encoding="utf-8"))
    assets_by_file = {a["file"]: a for a in lib["assets"]}
    files_index = [(f.name, norm(f.stem)) for f in MUSIC.glob("*.mp3")]
    keep = [p for p in lib.get("playlists", []) if not p["id"].startswith("spotify-")]

    new_presets, unmatched = [], []
    for songs, (url, pid, pname, cat, cats, base_tags) in zip(saved, playlists):
        files = []
        for s in songs:
            artists = s.get("artists") or ([s["artist"]] if s.get("artist") else [])
            title = s.get("name", "")
            fname = match_file(files_index, artists, title)
            if not fname:
                unmatched.append((pname, f"{', '.join(artists)} - {title}"))
                continue
            rel = f"music/{fname}"
            if rel in files:  # same song twice in one playlist — keep one
                continue
            files.append(rel)
            if rel not in assets_by_file:
                a = {"file": rel, "kind": "music", "category": cat,
                     "categories": list(cats), "tags": list(base_tags), "name": title,
                     "description": f"{', '.join(artists)} — from the “{pname}” playlist.",
                     "source": "spotify", "license": "private"}
                assets_by_file[rel] = a
                lib["assets"].append(a)
            else:  # shared across playlists — merge categories/tags
                a = assets_by_file[rel]
                a.setdefault("categories", [])
                for c in cats:
                    if c not in a["categories"]:
                        a["categories"].append(c)
                for t in base_tags:
                    if t not in a.setdefault("tags", []):
                        a["tags"].append(t)
        if files:
            new_presets.append({"id": pid, "name": pname, "files": files})

    lib["playlists"] = keep + new_presets
    LIB.write_text(json.dumps(lib, indent=2, ensure_ascii=False), encoding="utf-8")

    print("\nPresets written:")
    for p in new_presets:
        print(f"  {p['id']:22} {len(p['files']):2} tracks  — {p['name']}")
    print(f"Library assets total: {len(lib['assets'])}")
    if unmatched:
        print("\nNot matched (grab with yt-dlp, then re-run):")
        for pname, t in unmatched:
            print(f"  [{pname}] {t}")
    else:
        print("\nEvery playlist track matched a file. ✓")


if __name__ == "__main__":
    main()
