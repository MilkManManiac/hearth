# Deploying Hearth to a computer without Claude / a dev setup

Hearth is a normal Electron app — **it does not need Claude, Node, or any dev
tools to *run***. Claude is only used here (on the dev machine) to *author*
scenes. On the target PC you can still author and edit scenes with the app's
own editor (rich-text script + drag-drop cue chips, Ideas, Cast & Loot); you
just can't ask Claude to write a scene for you there.

This produces a **self-contained Windows build** that bundles its own
Node + Electron runtime. The target PC needs nothing installed.

---

## 1. Build the app (on this dev machine)

```
npm run pack     # -> self-contained folder  (win-unpacked\Hearth.exe)
npm run dist     # -> that folder + a single portable .exe
```

Output lands in **`%LOCALAPPDATA%\hearth-release`**
(`C:\Users\weshu\AppData\Local\hearth-release`), not the repo:

- `win-unpacked\` — ~387 MB folder, `Hearth.exe` inside. Copy the whole folder.
- `Hearth-0.1.0-portable.exe` — ~92 MB single file that self-extracts on launch.
  Easiest to move; **use this**.

> **Why not the repo's `release\` folder?** Building into the `CodeProjects`
> tree fails with `EPERM: … rename win-unpacked.tmp -> win-unpacked` — Windows
> Defender / folder indexing locks the freshly-extracted Electron files mid-build.
> Building under `%LOCALAPPDATA%` avoids it, so the `pack`/`dist` scripts point
> there. (Same family of gotcha as the `vc_redist` note in CLAUDE.md.) If you
> ever build by hand, pass `-c.directories.output="%LOCALAPPDATA%\hearth-release"`.

A durable copy of the portable exe is also kept at
`C:\Users\weshu\Hearth-dist\` for convenience.

## 2. Move your campaign folder (separately)

The build **does not include your campaign** — the ~2,000 audio files are far
too big to bundle (and are gitignored). The campaign travels on its own:

1. Copy your whole campaign folder — e.g. `campaign-sample\` (scenes + `music\`,
   `ambience\`, `sfx\`, `art\`, `library.json`) — to a USB stick / external
   drive / cloud folder.
2. On the target PC, drop it anywhere, e.g. `C:\Hearth\MyCampaign`.

Keeping it separate means you can update scenes and re-copy just the campaign
folder without rebuilding the app.

## 3. Run on the target PC

1. Copy `Hearth-0.1.0-portable.exe` (or the whole `win-unpacked\` folder) over.
2. Double-click it.
   - **Unsigned-app warning:** Windows SmartScreen may say "Windows protected
     your PC" (the build isn't code-signed). Click **More info → Run anyway**.
3. On first launch the app opens an empty default campaign
   (`%APPDATA%\Hearth\Hearth Campaign`).
4. Click the **📁 folder button** in the top bar (top-left, shows the current
   campaign name) and pick the campaign folder you copied in step 2.
   Your scenes, library, and audio load, and the app remembers this choice.

That's it — pre-built scenes play, and you can author/edit scenes in-app.

## Notes & limitations

- **No Claude on the target.** Authoring via natural language ("build me a
  tavern scene") happens here with Claude. On the target, use the in-app editor.
- **Discord voice bridge** (🎧 button) is experimental and needs a bot token —
  see `DISCORD-BRIDGE.md`. It is not required for local playback.
- **App icon:** currently the default Electron icon. To brand it, drop a
  256×256 `build\icon.ico` and rebuild.
- **Updating the app:** rebuild here, recopy the exe. **Updating scenes only:**
  just recopy the campaign folder — no rebuild needed.
