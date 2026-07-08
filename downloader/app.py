#!/usr/bin/env python3
"""
app.py — a dumb little window: paste a YouTube URL, click Download, done.

Run:  python app.py     (or just double-click it)

Paste one or more URLs (one per line), pick M4A or MP3, hit Download.
Files land in ./downloads. For personal, local testing only.
"""

import shutil
import threading
import tkinter as tk
from pathlib import Path
from tkinter import scrolledtext, ttk

try:
    import yt_dlp
except ImportError:
    raise SystemExit("yt-dlp is not installed. Run:  pip install yt-dlp")

OUT_DIR = Path.home() / "Downloads" / "Hearth YT Downloads"


def download(urls, codec, on_log, on_done):
    """Runs in a background thread so the window stays responsive."""
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    class Logger:
        def debug(self, m):
            if m.strip():
                on_log(m)
        def info(self, m):
            on_log(m)
        def warning(self, m):
            on_log(m)
        def error(self, m):
            on_log(m)

    opts = {
        "format": "bestaudio/best",
        "outtmpl": str(OUT_DIR / "%(playlist_title|Singles)s" /
                       "%(playlist_index|)s%(playlist_index& - |)s%(title)s.%(ext)s"),
        "ignoreerrors": True,
        "download_archive": str(OUT_DIR / ".download-archive.txt"),
        "writethumbnail": True,
        "logger": Logger(),
        "postprocessors": [
            {"key": "FFmpegExtractAudio", "preferredcodec": codec, "preferredquality": "192"},
            {"key": "FFmpegMetadata"},
            {"key": "EmbedThumbnail"},
        ],
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download(urls)
        on_log(f"\n✓ Done. Saved to: {OUT_DIR.resolve()}\n")
    except Exception as e:  # noqa: BLE001
        on_log(f"\n✗ Error: {e}\n")
    finally:
        on_done()


class App:
    def __init__(self, root):
        self.root = root
        root.title("YouTube Grabber")
        root.geometry("620x460")
        pad = {"padx": 12, "pady": 6}

        tk.Label(root, text="Paste YouTube URL(s) — one per line:",
                 anchor="w").pack(fill="x", **pad)
        self.url_box = scrolledtext.ScrolledText(root, height=5, wrap="word")
        self.url_box.pack(fill="x", **pad)
        self.url_box.focus()

        row = tk.Frame(root)
        row.pack(fill="x", **pad)
        tk.Label(row, text="Format:").pack(side="left")
        self.codec = tk.StringVar(value="m4a")
        ttk.Combobox(row, textvariable=self.codec, values=["m4a", "mp3"],
                     width=6, state="readonly").pack(side="left", padx=(6, 16))
        self.btn = tk.Button(row, text="⬇  Download", command=self.start,
                             bg="#2d7d46", fg="white", padx=16, pady=4)
        self.btn.pack(side="left")
        tk.Button(row, text="Open folder", command=self.open_folder).pack(side="left", padx=8)

        tk.Label(root, text="Progress:", anchor="w").pack(fill="x", padx=12)
        self.log = scrolledtext.ScrolledText(root, height=11, wrap="word",
                                             bg="#1e1e1e", fg="#d4d4d4")
        self.log.pack(fill="both", expand=True, **pad)

        if shutil.which("ffmpeg") is None:
            self.write("WARNING: ffmpeg not found on PATH. Conversion may fail.\n"
                       "Close this, open a fresh terminal, and relaunch.\n\n")

    def write(self, msg):
        self.log.insert("end", msg if msg.endswith("\n") else msg + "\n")
        self.log.see("end")

    def open_folder(self):
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        import os
        os.startfile(OUT_DIR)  # Windows

    def start(self):
        raw = self.url_box.get("1.0", "end").strip()
        urls = [u.strip() for u in raw.splitlines() if u.strip()]
        if not urls:
            self.write("Paste at least one URL first.\n")
            return
        self.btn.config(state="disabled", text="Downloading…")
        self.write(f"Starting {len(urls)} download(s) as {self.codec.get().upper()}…\n")

        def log_safe(m):
            self.root.after(0, self.write, m)

        def done():
            self.root.after(0, lambda: self.btn.config(state="normal", text="⬇  Download"))

        threading.Thread(
            target=download,
            args=(urls, self.codec.get(), log_safe, done),
            daemon=True,
        ).start()


if __name__ == "__main__":
    root = tk.Tk()
    App(root)
    root.mainloop()
