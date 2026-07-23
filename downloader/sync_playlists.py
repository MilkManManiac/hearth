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

Not every playlist is music. A playlist's `kind` decides where its files land
and what they become: music -> music/ + a queue-able PlaylistPreset; ambience
-> ambience/; sfx -> sfx/. Ambience and SFX get NO preset — in Hearth those are
palette assets the DM taps per scene, not queues — so they're categorized
per-track (rain -> weather, wolves -> creatures) and found via the library
browser. Discovery guesses the kind from the playlist name ("... SFX",
"... Ambient Sounds"); curate it in the PLAYLISTS table below.

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
import argparse, json, re, subprocess, sys, tempfile, time, unicodedata
from pathlib import Path

CAMPAIGN = Path(r"C:\Users\weshu\Campaigns\Elor Rebirth")
MUSIC = CAMPAIGN / "music"
LIB = CAMPAIGN / "library.json"

# A playlist's kind decides where its files land and what they become in the
# library. Music playlists also become queue-able PlaylistPresets; ambience and
# sfx do NOT — in Hearth those are palette assets a DM taps per scene, not
# queues, so they're tagged for the library browser and left out of playlists[].
FOLDERS = {"music": MUSIC, "ambience": CAMPAIGN / "ambience", "sfx": CAMPAIGN / "sfx"}

# downloader/spotify_sync.json (gitignored — holds an API secret):
#   { "user": "<spotify user id or full profile URL>",
#     "client_id": "...", "client_secret": "..." }
# client_id/secret are optional; without them we borrow spotdl's shared creds,
# which Spotify frequently rate-limits (429, 24h) — own creds are reliable.
CONFIG = Path(__file__).with_name("spotify_sync.json")
PREFIX = "dnd hearth"  # case-insensitive substring that marks a Hearth playlist

# Playlist vibe words → the shared mood vocabulary (LIBRARY_MOODS in
# src/shared/types.ts). Written onto NEW assets as `moods` so the 🎧 Review
# queue opens with a meaningful pre-checked guess — Wes still confirms by ear.
MOOD_MAP = {
    "boss": ["epic", "tense"], "combat": ["epic", "tense"], "battle": ["epic"],
    "intense": ["tense"], "suspense": ["tense"], "tension": ["tense"],
    "chase": ["tense"], "danger": ["tense"], "pursuit": ["tense"],
    "ethereal": ["hopeful", "mysterious"], "angelic": ["hopeful"], "sacred": ["hopeful"],
    "chill": ["calm"], "calm": ["calm"], "peaceful": ["calm"], "downtime": ["calm"],
    "sad": ["somber"], "somber": ["somber"], "melancholy": ["somber"], "grief": ["somber"],
    "scary": ["eerie", "dark"], "eerie": ["eerie"], "horror": ["dark"],
    "creepy": ["eerie"], "dread": ["dark"], "unsettling": ["eerie"],
    "adventure": ["heroic", "hopeful"], "exploration": ["mysterious"],
    "wonder": ["hopeful"], "journey": ["heroic"], "travel": ["heroic"],
    "mystery": ["mysterious"], "mysterious": ["mysterious"],
    "epic": ["epic"], "heroic": ["heroic"], "romance": ["hopeful"],
    "festive": ["festive"], "tavern": ["festive"], "playful": ["playful"],
    "triumphant": ["triumphant"], "victory": ["triumphant"],
}


def suggest_moods(words):
    out = []
    for w in words:
        for m in MOOD_MAP.get(w, []):
            if m not in out:
                out.append(m)
    return out

def P(url, pid, name, cat, cats, tags, kind="music"):
    """One curated playlist row."""
    return {"url": url, "id": pid, "name": name, "kind": kind,
            "category": cat, "categories": list(cats), "tags": list(tags)}


# Curated playlists: url, preset id, display name, primary category, extra
# categories, base tags, and (for non-music) the asset kind. Discovery matches
# these by playlist id and keeps this metadata; playlists found on the profile
# but NOT listed here get auto tags — promote them into this table to curate.
PLAYLISTS = [
    P("https://open.spotify.com/playlist/1y5dRModd4RO3nLgHNg4ae",
      "spotify-boss-combat", "Boss / Combat", "boss", ["boss", "combat"],
      ["boss", "combat", "epic", "battle", "orchestral", "intense"]),
    P("https://open.spotify.com/playlist/6Mu21QzVeADro7kQYtZs3M",
      "spotify-ethereal", "Angelic / Ethereal", "ethereal", ["ethereal"],
      ["angelic", "ethereal", "vocals", "choir", "sacred", "atmospheric"]),
    P("https://open.spotify.com/playlist/0ZIkA0Dk8yXRe0qa1on2Bs",
      "spotify-chase-suspense", "Chase / Suspense", "tension", ["tension"],
      ["chase", "suspense", "tension", "pursuit", "danger"]),
    P("https://open.spotify.com/playlist/50ck6o9PDn5CWLOMRPZcEZ",
      "spotify-adventure", "Adventure / Exploration", "exploration",
      ["exploration", "travel"],
      ["adventure", "exploration", "travel", "wonder", "journey"]),
    P("https://open.spotify.com/playlist/4C1CjrntCYeFZWZDUUJM4d",
      "spotify-chill", "Chill", "chill", ["chill"],
      ["chill", "calm", "peaceful", "downtime", "ambient"]),
    P("https://open.spotify.com/playlist/15IV0OLu3oCzX3l6A4REWr",
      "spotify-sad", "Sad / Somber", "somber", ["somber"],
      ["sad", "somber", "melancholy", "emotional", "grief"]),
]

# Discovered 2026-07-18 from the profile.
PLAYLISTS += [
    P("https://open.spotify.com/playlist/3wee9GwyRWIw6FDZAARhZI",
      "spotify-scary-eerie", "Scary / Eerie", "horror", ["horror"],
      ["scary", "eerie", "horror", "creepy", "dread", "unsettling"]),
    P("https://open.spotify.com/playlist/2TmorVazZM7KALsafPuFZU",
      "spotify-ambiance", "Ambiance", "ambient", ["ambient"],
      ["ambient", "ambiance", "atmosphere", "background", "underscore"]),
    P("https://open.spotify.com/playlist/1l3t4VDpkEouJeavnCbvet",
      "spotify-combat-action", "Combat / Action", "combat", ["combat"],
      ["combat", "action", "battle", "fight", "energetic", "driving"]),
    P("https://open.spotify.com/playlist/5DryaWFKgo9dKeyigLvBbF",
      "spotify-romance", "Romance", "romance", ["romance"],
      ["romance", "love", "tender", "emotional", "intimate", "warm"]),
]

# Discovered 2026-07-20 — NOT music. These are loops and one-shots, so they
# land in ambience/ and sfx/ as palette assets. Per-track categories are
# refined by TRACK_CATS below; the row category is the fallback.
PLAYLISTS += [
    P("https://open.spotify.com/playlist/5WeIO0p4JGQtp2vttL0NYo",
      "spotify-ambient-sounds", "Ambient Sounds", "places", ["places"],
      ["ambient", "loop", "background", "atmosphere"], kind="ambience"),
    P("https://open.spotify.com/playlist/3T45IxdwSZbQIFeAyrpXOP",
      "spotify-sfx", "SFX", "objects", ["objects"],
      ["sfx", "one-shot", "effect"], kind="sfx"),
]

# Track-title keyword -> category for ambience/sfx assets, so a big sound
# playlist doesn't land as one undifferentiated blob in the library browser.
# FIRST MATCH WINS, so order is load-bearing: creatures precedes horror (else
# "screaming crows" files as horror), footsteps precedes combat ("marching
# soldiers" is footsteps). Keywords are matched as substrings, so prefer stems
# ("wolv" catches wolf/wolves) over whole words.
TRACK_CATS = [
    (("rain", "storm", "thunder", "wind", "snow", "blizzard", "weather"), "weather"),
    (("ocean", "sea", "wave", "river", "stream", "water", "waterfall", "underwater",
      "rapids", "surf"), "water"),
    (("fire", "campfire", "flame", "torch", "hearth", "burn", "ember"), "fire"),
    (("dragon", "wolv", "wolf", "howl", "beast", "monster", "growl", "roar", "bird",
      "crow", "raven", "horse", "insect", "cricket", "bat ", "rat ", "creature",
      "animal", "dog", "cat ", "owl"), "creatures"),
    (("footstep", "walk", "run ", "step", "march", "boots"), "footsteps"),
    (("ghost", "horror", "scream", "eerie", "haunt", "demon", "evil", "creepy",
      "scary", "clown", "nightmare", "dread", "undead", "zombie"), "horror"),
    (("sword", "battle", "arrow", "shield", "axe", "combat", "war", "soldier",
      "siege"), "combat"),
    (("tavern", "market", "crowd", "village", "town", "city", "inn ", "people",
      "street", "bazaar"), "town"),
    (("spell", "magic", "arcane", "portal", "teleport", "ritual"), "magic"),
    (("shout", "cry", "voice", "chant", "whisper", "laugh"), "voices"),
    (("forest", "cave", "dungeon", "swamp", "desert", "mountain", "jungle", "field",
      "carriage", "ship", "road", "camp"), "places"),
    (("door", "chest", "lock", "chain", "bell", "coin", "glass", "wood", "chime",
      "clock", "paper"), "objects"),
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


# One-time browser OAuth: new dev-mode Spotify apps get 403 on the public
# profile endpoints, but /me/playlists works once the owner approves the app.
# The refresh_token lands in spotify_sync.json; after that it's zero-touch
# (and private playlists work too — no need to keep them public).
REDIRECT = "http://127.0.0.1:8080/"
SCOPES = "playlist-read-private playlist-read-collaborative"


def user_token(cfg) -> str | None:
    """Access token for Wes's account — silent via refresh_token, else a
    one-time browser approval. None if creds are missing or auth fails."""
    import requests
    cid, secret = cfg.get("client_id"), cfg.get("client_secret")
    if not (cid and secret):
        return None
    if cfg.get("refresh_token"):
        r = requests.post("https://accounts.spotify.com/api/token",
                          data={"grant_type": "refresh_token",
                                "refresh_token": cfg["refresh_token"]},
                          auth=(cid, secret), timeout=15)
        if r.ok:
            return r.json()["access_token"]
        print("Stored Spotify login expired — need a fresh browser approval.")

    import http.server, secrets, urllib.parse, webbrowser
    state = secrets.token_urlsafe(16)
    got: dict = {}

    class Catch(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            if q.get("state", [""])[0] == state and q.get("code"):
                got["code"] = q["code"][0]
                self.wfile.write("<h2>Hearth is connected — you can close this tab. 🔥</h2>".encode())
            else:
                self.wfile.write("<h2>Hmm, that didn't work — go back to Claude.</h2>".encode())

        def log_message(self, *a):
            pass

    auth_url = "https://accounts.spotify.com/authorize?" + urllib.parse.urlencode({
        "client_id": cid, "response_type": "code", "redirect_uri": REDIRECT,
        "scope": SCOPES, "state": state})
    srv = http.server.HTTPServer(("127.0.0.1", 8080), Catch)
    srv.timeout = 10
    print("Opening a browser tab — approve Hearth's access to your playlists…")
    webbrowser.open(auth_url)
    deadline = time.monotonic() + 240
    # Keep serving until the real callback arrives — the browser may hit us
    # with favicon/probe requests first, which must not end the wait.
    while "code" not in got and time.monotonic() < deadline:
        srv.handle_request()
    srv.server_close()
    if "code" not in got:
        print("No approval received (timed out) — running without discovery.")
        return None
    r = requests.post("https://accounts.spotify.com/api/token",
                      data={"grant_type": "authorization_code", "code": got["code"],
                            "redirect_uri": REDIRECT},
                      auth=(cid, secret), timeout=15)
    r.raise_for_status()
    tok = r.json()
    cfg["refresh_token"] = tok["refresh_token"]
    CONFIG.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    print("Spotify login saved — future syncs need no browser.")
    return tok["access_token"]


def playlist_id(url: str) -> str:
    return url.rstrip("/").split("/")[-1].split("?")[0]


def auto_row(url: str, name: str):
    """Build a playlist row for a discovered playlist not in the curated table."""
    label = re.sub(re.escape(PREFIX), "", name, flags=re.I).strip(" -–—:")
    slug = re.sub(r"[^a-z0-9]+", "-", (label or name).lower()).strip("-")
    low = name.lower()
    # A playlist named for sounds rather than songs isn't music — route it to
    # the right folder/kind instead of dumping loops into the music palette.
    # Any spelling counts — Wes's "Ambiance" playlist is beds, not songs.
    kind = "sfx" if "sfx" in low or "sound effect" in low else \
        "ambience" if any(w in low for w in ("ambient", "ambience", "ambiance", "atmosphere")) \
        else "music"
    cat = next((c for words, c in AUTO_CATS if any(w in low for w in words)), "misc")
    if kind != "music":
        cat = "places" if kind == "ambience" else "objects"
    tags = sorted({w for w in re.findall(r"[a-z]+", (label or name).lower()) if len(w) > 2})
    return P(url, f"spotify-{slug}", label or name, cat, [cat], tags or [cat], kind)


def track_category(title: str, fallback: str) -> str:
    low = title.lower()
    return next((c for words, c in TRACK_CATS if any(w in low for w in words)), fallback)


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
    import requests
    try:
        # Preferred: logged-in as Wes (one-time browser approval, then silent).
        # Sees private playlists; immune to the dev-mode 403 on /users/{id}.
        tok = user_token(cfg)
        if tok:
            url = "https://api.spotify.com/v1/me/playlists?limit=50"
        elif user:
            # Fallback: public profile via client credentials (may 403/429).
            cid, secret = cfg.get("client_id"), cfg.get("client_secret")
            if not (cid and secret):  # last resort: spotdl's shared creds
                from spotdl.utils.config import DEFAULT_CONFIG
                cid, secret = DEFAULT_CONFIG["client_id"], DEFAULT_CONFIG["client_secret"]
            tok = requests.post("https://accounts.spotify.com/api/token",
                                data={"grant_type": "client_credentials"},
                                auth=(cid, secret), timeout=15).json()["access_token"]
            url = f"https://api.spotify.com/v1/users/{user}/playlists?limit=50"
        else:
            print(f'{CONFIG.name} has no login or "user" — using the built-in playlist table.')
            return None
        found = []
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

    known = {playlist_id(row["url"]): row for row in PLAYLISTS}
    rows, fresh = [], []
    for purl, pname in found:
        row = known.get(playlist_id(purl))
        if row is None:
            row = auto_row(purl, pname)
            fresh.append(f'{pname} → {row["kind"]}')
        rows.append(row)
    print(f'Discovered {len(rows)} "{PREFIX}" playlist(s) on profile "{user}".')
    for pname in fresh:
        print(f"  ✨ NEW: {pname} — auto-tagged; tell Claude to curate its tags.")
    missing = [row["name"] for pid, row in known.items()
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


def spotdl_download(urls: list[str], dest: Path):
    dest.mkdir(parents=True, exist_ok=True)
    subprocess.run([sys.executable, "-m", "spotdl", "download", *urls,
                    "--format", "mp3", "--bitrate", "192k",
                    "--output", str(dest / "{artists} - {title}.{output-ext}")])


def match_file(files_index, artists, title, strict=False):
    """Best mp3 whose normalized stem contains the title (and ideally artist).

    strict=True also REQUIRES the artist — used for ambience/sfx, whose titles
    are short generic words ("Fire", "Door", "Thunder") that would otherwise
    substring-match an unrelated CC0 file already in the folder and either skip
    a needed download or overwrite that file's curated tags."""
    nt, na = norm(title), norm(artists[0] if artists else "")
    if strict and not na:
        return None
    best, best_score = None, -1
    for name, nstem in files_index:
        if nt and nt in nstem:
            hit_artist = bool(na and na in nstem)
            if strict and not hit_artist:
                continue
            score = len(nt) + (5 if hit_artist else 0)
            if score > best_score:
                best, best_score = name, score
    return best


def main():
    # Windows consoles default to cp1252, which raises on the ✓/✨/⚠ in our
    # output (and mangles non-ASCII track titles). Never let a print kill a sync.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    ap = argparse.ArgumentParser()
    ap.add_argument("--save-only", action="store_true",
                    help="refresh track lists only; skip downloading")
    args = ap.parse_args()

    playlists = discover() or PLAYLISTS

    tmp = Path(tempfile.mkdtemp())
    saved = []
    for i, row in enumerate(playlists, 1):
        songs = spotdl_save(row["url"], tmp / f"pl{i}.spotdl")
        kind = "" if row["kind"] == "music" else f'  [{row["kind"]}]'
        print(f'[{i}/{len(playlists)}] {row["name"]}: {len(songs)} tracks{kind}')
        saved.append(songs)

    # Dedupe BEFORE downloading: fuzzy-match every playlist track against the
    # mp3s already on disk (any source — spotdl, yt-dlp, the GUI grabber) and
    # only fetch the ones we genuinely don't have. spotdl's own skip only
    # catches exact filename matches, which re-downloads dupes whenever the
    # metadata differs slightly.
    # Dedupe and download per kind — each kind has its own folder, so a track's
    # "do we already have it?" question is only ever asked of that folder.
    if not args.save_only:
        for kind, dest in FOLDERS.items():
            rows = [(r, s) for r, s in zip(playlists, saved) if r["kind"] == kind]
            if not rows:
                continue
            index = [(f.name, norm(f.stem)) for f in dest.glob("*.mp3")]
            to_download, have = {}, 0
            for _row, songs in rows:
                for s in songs:
                    artists = s.get("artists") or ([s["artist"]] if s.get("artist") else [])
                    if match_file(index, artists, s.get("name", ""), strict=kind != "music"):
                        have += 1
                    elif s.get("url"):
                        to_download[s["url"]] = f"{', '.join(artists)} - {s.get('name', '')}"
            print(f"\n[{kind}] already on disk: {have} — skipping those.")
            if to_download:
                print(f"[{kind}] downloading {len(to_download)} new track(s):")
                for label in to_download.values():
                    print(f"  + {label}")
                spotdl_download(list(to_download), dest)
            else:
                print(f"[{kind}] nothing new to download. ✓")

    lib = json.loads(LIB.read_text(encoding="utf-8"))
    assets_by_file = {a["file"]: a for a in lib["assets"]}
    index_by_kind = {k: [(f.name, norm(f.stem)) for f in d.glob("*.mp3")]
                     for k, d in FOLDERS.items()}
    keep = [p for p in lib.get("playlists", []) if not p["id"].startswith("spotify-")]

    new_presets, unmatched, added = [], [], {}
    for songs, row in zip(saved, playlists):
        kind, pname, cat = row["kind"], row["name"], row["category"]
        folder = FOLDERS[kind].name
        files = []
        for s in songs:
            artists = s.get("artists") or ([s["artist"]] if s.get("artist") else [])
            title = s.get("name", "")
            fname = match_file(index_by_kind[kind], artists, title, strict=kind != "music")
            if not fname:
                unmatched.append((pname, f"{', '.join(artists)} - {title}"))
                continue
            rel = f"{folder}/{fname}"
            if rel in files:  # same song twice in one playlist — keep one
                continue
            files.append(rel)
            if rel not in assets_by_file:
                # Sound assets get a per-track category so they scatter into the
                # right library buckets instead of landing as one lump.
                tcat = cat if kind == "music" else track_category(title, cat)
                tags = list(row["tags"])
                if kind != "music":  # title words are the searchable handle
                    tags += [w for w in re.findall(r"[a-z]+", title.lower())
                             if len(w) > 2 and w not in tags]
                a = {"file": rel, "kind": kind, "category": tcat,
                     "categories": sorted({tcat, *row["categories"]}), "tags": tags,
                     "name": title,
                     "description": f"{', '.join(artists)} — from the “{pname}” playlist.",
                     "source": "spotify", "license": "private"}
                moods = suggest_moods([cat, *row["categories"], *row["tags"]])
                if moods:
                    a["moods"] = moods
                assets_by_file[rel] = a
                lib["assets"].append(a)
                added[kind] = added.get(kind, 0) + 1
            else:  # shared across playlists — merge categories/tags
                a = assets_by_file[rel]
                a.setdefault("categories", [])
                for c in row["categories"]:
                    if c not in a["categories"]:
                        a["categories"].append(c)
                for t in row["tags"]:
                    if t not in a.setdefault("tags", []):
                        a["tags"].append(t)
        # Only music becomes a queue-able preset; ambience/sfx are palette
        # assets the DM taps per scene, found via the library browser.
        if files and kind == "music":
            new_presets.append({"id": row["id"], "name": pname, "files": files})
        elif files:
            print(f'  {row["id"]:24} {len(files):3} {kind} assets — no preset (palette kind)')

    lib["playlists"] = keep + new_presets
    LIB.write_text(json.dumps(lib, indent=2, ensure_ascii=False), encoding="utf-8")

    print("\nPresets written:")
    for p in new_presets:
        print(f"  {p['id']:22} {len(p['files']):2} tracks  — {p['name']}")
    if added:
        print("New library assets: " + ", ".join(f"{n} {k}" for k, n in added.items()))
    print(f"Library assets total: {len(lib['assets'])}")
    if unmatched:
        print("\nNot matched (grab with yt-dlp, then re-run):")
        for pname, t in unmatched:
            print(f"  [{pname}] {t}")
    else:
        print("\nEvery playlist track matched a file. ✓")


if __name__ == "__main__":
    main()
