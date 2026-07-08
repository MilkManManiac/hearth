#!/usr/bin/env python3
"""
yt_mp3.py — download YouTube playlists/videos as MP3 for LOCAL testing.

Usage:
    python yt_mp3.py "PLAYLIST_OR_VIDEO_URL" [more urls...]
    python yt_mp3.py --file playlists.txt
    python yt_mp3.py --file playlists.txt --out music --quality 320

Features:
    - Accepts URLs on the command line or from a text file (one per line, # = comment).
    - Extracts audio to MP3 and embeds metadata + thumbnail as cover art.
    - Skips tracks already downloaded (an archive file tracks what's done).
    - Keeps going if a single track fails; prints a summary at the end.

Note: For personal, local experimentation only. Downloading from YouTube may
conflict with its Terms of Service and content may be copyrighted — don't
redistribute what you download.
"""

import argparse
import shutil
import sys
from pathlib import Path

try:
    import yt_dlp
except ImportError:
    sys.exit("yt-dlp is not installed. Run:  pip install yt-dlp")


def read_urls_from_file(path: Path) -> list[str]:
    urls = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            urls.append(line)
    return urls


def build_options(out_dir: Path, quality: str, archive: Path) -> dict:
    return {
        "format": "bestaudio/best",
        # <playlist>/<NN - title>.mp3  (falls back gracefully for single videos)
        "outtmpl": str(out_dir / "%(playlist_title|Singles)s" /
                       "%(playlist_index|)s%(playlist_index& - |)s%(title)s.%(ext)s"),
        "ignoreerrors": True,          # skip a broken track, keep going
        "download_archive": str(archive),  # remember completed tracks -> skip on re-run
        "quiet": False,
        "no_warnings": False,
        "postprocessors": [
            {"key": "FFmpegExtractAudio", "preferredcodec": "mp3",
             "preferredquality": quality},
            {"key": "FFmpegMetadata"},
            {"key": "EmbedThumbnail"},
        ],
        "writethumbnail": True,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Download YouTube playlists/videos as MP3 (local testing).")
    parser.add_argument("urls", nargs="*", help="Playlist or video URLs.")
    parser.add_argument("--file", "-f", type=Path,
                        help="Text file with one URL per line (# for comments).")
    parser.add_argument("--out", "-o", type=Path, default=Path("downloads"),
                        help="Output directory (default: ./downloads).")
    parser.add_argument("--quality", "-q", default="192",
                        help="MP3 bitrate in kbps, e.g. 128/192/320 (default: 192).")
    args = parser.parse_args()

    if shutil.which("ffmpeg") is None:
        print("WARNING: ffmpeg not found on PATH. MP3 conversion will fail.\n"
              "         Open a fresh terminal, or install it and retry.\n",
              file=sys.stderr)

    urls = list(args.urls)
    if args.file:
        if not args.file.exists():
            sys.exit(f"URL file not found: {args.file}")
        urls += read_urls_from_file(args.file)

    if not urls:
        parser.error("No URLs given. Pass them as arguments or via --file.")

    args.out.mkdir(parents=True, exist_ok=True)
    archive = args.out / ".download-archive.txt"
    opts = build_options(args.out, args.quality, archive)

    print(f"Downloading {len(urls)} source(s) -> {args.out.resolve()}")
    print(f"MP3 quality: {args.quality} kbps | archive: {archive.name}\n")

    with yt_dlp.YoutubeDL(opts) as ydl:
        ret = ydl.download(urls)

    print("\nDone. Tracks already downloaded are skipped on re-runs "
          f"(tracked in {archive}).")
    return ret


if __name__ == "__main__":
    raise SystemExit(main())
