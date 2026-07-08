#!/usr/bin/env python3
"""
hearth.py — paste a Spotify (or YouTube) link, get tagged audio files.

Run:  python hearth.py     (or double-click it)

Powered by spotDL: it reads the track list + real metadata/cover art from a
Spotify playlist/album/song link, finds the matching audio on YouTube Music,
downloads it, and tags the file. YouTube links work too.

Files land in:  ~/Downloads/Hearth YT Downloads
For personal, local testing only. Don't redistribute what you download.
"""

import os
import queue
import shutil
import subprocess
import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import scrolledtext, ttk

OUT_DIR = Path.home() / "Downloads" / "Hearth YT Downloads"


def build_command(urls, codec):
    """spotDL command: download each link, tag it, save into OUT_DIR."""
    return [
        sys.executable, "-m", "spotdl", "download", *urls,
        "--format", codec,
        "--output", str(OUT_DIR / "{artists} - {title}.{output-ext}"),
        "--bitrate", "192k",
    ]


def run_download(urls, codec, on_log, on_done):
    """Runs spotDL in a background thread, streaming its output line by line."""
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    try:
        proc = subprocess.Popen(
            build_command(urls, codec),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            env=env,
        )
        for line in proc.stdout:
            on_log(line.rstrip("\n"))
        proc.wait()
        if proc.returncode == 0:
            on_log(f"\n✓ Done. Saved to: {OUT_DIR.resolve()}\n")
        else:
            on_log(f"\n✗ spotDL exited with code {proc.returncode}. "
                   "Check the log above.\n")
    except FileNotFoundError:
        on_log("✗ Could not launch spotDL. Is it installed?  pip install spotdl\n")
    except Exception as e:  # noqa: BLE001
        on_log(f"\n✗ Error: {e}\n")
    finally:
        on_done()


class App:
    def __init__(self, root):
        self.root = root
        root.title("Hearth — Spotify/YouTube Grabber")
        root.geometry("640x500")
        pad = {"padx": 12, "pady": 6}

        tk.Label(root, text="Paste Spotify or YouTube link(s) — one per line:",
                 anchor="w").pack(fill="x", **pad)
        self.url_box = scrolledtext.ScrolledText(root, height=5, wrap="word")
        self.url_box.pack(fill="x", **pad)
        self.url_box.focus()

        row = tk.Frame(root)
        row.pack(fill="x", **pad)
        tk.Label(row, text="Format:").pack(side="left")
        self.codec = tk.StringVar(value="m4a")
        ttk.Combobox(row, textvariable=self.codec, values=["m4a", "mp3", "opus", "flac"],
                     width=6, state="readonly").pack(side="left", padx=(6, 16))
        self.btn = tk.Button(row, text="⬇  Download", command=self.start,
                             bg="#2d7d46", fg="white", padx=16, pady=4)
        self.btn.pack(side="left")
        tk.Button(row, text="Open folder", command=self.open_folder).pack(side="left", padx=8)

        tk.Label(root, text="Progress:", anchor="w").pack(fill="x", padx=12)
        self.log = scrolledtext.ScrolledText(root, height=13, wrap="word",
                                             bg="#1e1e1e", fg="#d4d4d4")
        self.log.pack(fill="both", expand=True, **pad)

        if shutil.which("ffmpeg") is None:
            self.write("Note: ffmpeg not detected on this shell's PATH. If downloads "
                       "fail to convert, relaunch from a fresh terminal.\n\n")
        self.write("Paste a Spotify playlist/album/song link (or a YouTube link) "
                   "and click Download.\n\n")

        # Thread-safe log pump.
        self.q: "queue.Queue[str]" = queue.Queue()
        self.root.after(100, self._drain)

    def write(self, msg):
        self.log.insert("end", msg if msg.endswith("\n") else msg + "\n")
        self.log.see("end")

    def _drain(self):
        try:
            while True:
                self.write(self.q.get_nowait())
        except queue.Empty:
            pass
        self.root.after(100, self._drain)

    def open_folder(self):
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        os.startfile(OUT_DIR)  # Windows

    def start(self):
        raw = self.url_box.get("1.0", "end").strip()
        urls = [u.strip() for u in raw.splitlines() if u.strip()]
        if not urls:
            self.write("Paste at least one link first.\n")
            return
        self.btn.config(state="disabled", text="Downloading…")
        self.write(f"Starting {len(urls)} link(s) as {self.codec.get().upper()}…\n")

        def done():
            self.root.after(0, lambda: self.btn.config(state="normal", text="⬇  Download"))

        threading.Thread(
            target=run_download,
            args=(urls, self.codec.get(), self.q.put, done),
            daemon=True,
        ).start()


if __name__ == "__main__":
    root = tk.Tk()
    App(root)
    root.mainloop()
