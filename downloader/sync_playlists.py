#!/usr/bin/env python3
"""
sync_playlists.py — keep Hearth's 6 "DND Hearth ..." Spotify playlists in sync
with the Elor: Rebirth campaign as queue-able PlaylistPresets.

Re-runnable: the user's future links are the SAME playlists with new songs
added. Running this again downloads only the new tracks (spotdl skips files
already on disk), dedupes shared tracks, and rewrites the 6 "spotify-*" presets
in place. Non-spotify assets/presets are never touched.

    python sync_playlists.py              # sync all 6
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

# The 6 playlists, in order. Each: url, preset id, display name, primary
# category, extra categories, base tags. To add a new "DND Hearth X" playlist,
# append a row here.
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


def norm(s: str) -> str:
    # Keep Unicode letters/digits (Japanese titles survive), drop punctuation.
    s = unicodedata.normalize("NFKC", s).lower()
    return "".join(ch for ch in s if ch.isalnum())


def spotdl_save(url: str, dest: Path) -> list[dict]:
    subprocess.run([sys.executable, "-m", "spotdl", "save", url,
                    "--save-file", str(dest)], check=True)
    d = json.loads(dest.read_text(encoding="utf-8"))
    return d if isinstance(d, list) else d.get("songs", d)


def spotdl_download(url: str):
    subprocess.run([sys.executable, "-m", "spotdl", "download", url,
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

    tmp = Path(tempfile.mkdtemp())
    saved = []
    for i, (url, *_rest) in enumerate(PLAYLISTS, 1):
        songs = spotdl_save(url, tmp / f"pl{i}.spotdl")
        print(f"[{i}/6] {_rest[1]}: {len(songs)} tracks")
        if not args.save_only:
            spotdl_download(url)
        saved.append(songs)

    lib = json.loads(LIB.read_text(encoding="utf-8"))
    assets_by_file = {a["file"]: a for a in lib["assets"]}
    files_index = [(f.name, norm(f.stem)) for f in MUSIC.glob("*.mp3")]
    keep = [p for p in lib.get("playlists", []) if not p["id"].startswith("spotify-")]

    new_presets, unmatched = [], []
    for songs, (url, pid, pname, cat, cats, base_tags) in zip(saved, PLAYLISTS):
        files = []
        for s in songs:
            artists = s.get("artists") or ([s["artist"]] if s.get("artist") else [])
            title = s.get("name", "")
            fname = match_file(files_index, artists, title)
            if not fname:
                unmatched.append((pname, f"{', '.join(artists)} - {title}"))
                continue
            rel = f"music/{fname}"
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
