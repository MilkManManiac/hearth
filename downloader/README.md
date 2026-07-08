# Hearth Downloader

Little local tool to download audio from Spotify/YouTube links for personal testing.

## Current app (use this one)

**`hearth.py`** — GUI. Paste a Spotify or YouTube link, click Download.
Powered by [spotDL](https://github.com/spotDL/spotify-downloader): reads the track
list + metadata from Spotify, matches each track to YouTube Music, downloads and tags it.

```powershell
python hearth.py
```

- Formats: m4a (default), mp3, opus, flac
- Output: `~/Downloads/Hearth YT Downloads` (i.e. `C:\Users\weshu\Downloads\Hearth YT Downloads`)
- Spotify links must be **public/shareable** (this version does not log into an account,
  so it can't see private playlists or Liked Songs).

## Dependencies (already installed system-wide)

- Python 3.12
- `pip install spotdl yt-dlp`  (spotDL bundles yt-dlp)
- FFmpeg (installed via `winget install Gyan.FFmpeg`) — must be on PATH

## Older iterations (kept for reference)

- `app.py` — earlier GUI, YouTube-only (no Spotify).
- `grab.py` — terminal version: `python grab.py` then paste a URL.
- `yt_mp3.py` — CLI: `python yt_mp3.py --file playlists.txt`.
- `playlists.txt` — URL list used by `yt_mp3.py`.

## Ideas / possible future work

- Log into Spotify account to reach private playlists + Liked Songs
  (needs a one-time Spotify developer app: client id/secret).
- Desktop shortcut / `.bat` launcher so no terminal is needed.
