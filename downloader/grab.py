#!/usr/bin/env python3
"""
grab.py — paste a YouTube URL, get audio files. That's it.

Just run:   python grab.py          (saves M4A — fast, best quality)
       or:  python grab.py mp3      (saves MP3 — universal compatibility)

Then paste a song or playlist URL when asked. Files land in ./downloads.

For personal, local testing only. Don't redistribute what you download.
"""

import shutil
import sys
from pathlib import Path

try:
    import yt_dlp
except ImportError:
    sys.exit("yt-dlp is not installed. Run:  pip install yt-dlp")

OUT_DIR = Path(__file__).parent / "downloads"


def download(url: str, codec: str) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    opts = {
        "format": "bestaudio/best",
        "outtmpl": str(OUT_DIR / "%(playlist_title|Singles)s" /
                       "%(playlist_index|)s%(playlist_index& - |)s%(title)s.%(ext)s"),
        "ignoreerrors": True,
        "download_archive": str(OUT_DIR / ".download-archive.txt"),
        "writethumbnail": True,
        "postprocessors": [
            {"key": "FFmpegExtractAudio", "preferredcodec": codec, "preferredquality": "192"},
            {"key": "FFmpegMetadata"},
            {"key": "EmbedThumbnail"},
        ],
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([url])


def main() -> None:
    # Default to m4a (fast, no re-encode, best quality). "python grab.py mp3" for MP3.
    codec = "mp3" if len(sys.argv) > 1 and sys.argv[1].lower() == "mp3" else "m4a"

    if shutil.which("ffmpeg") is None:
        print("WARNING: ffmpeg not found. Open a fresh terminal and try again.\n")

    print("=" * 50)
    print(f"  YouTube -> {codec.upper()}   (paste a URL, press Enter)")
    print("  Leave blank and press Enter to quit.")
    print("=" * 50)

    while True:
        try:
            url = input("\nURL: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nBye.")
            break
        if not url:
            print("Done.")
            break
        try:
            download(url, codec)
            print(f"\n✓ Saved to: {OUT_DIR.resolve()}")
        except Exception as e:  # noqa: BLE001 - keep the prompt alive on any failure
            print(f"\n✗ Something went wrong: {e}")


if __name__ == "__main__":
    main()
