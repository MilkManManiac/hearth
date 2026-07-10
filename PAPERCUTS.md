# Papercuts — friction log

Wes asked for every issue hit while building to be noted "via the papercut
skill/api." **No such skill exists in this environment**, so this file is the
log. One line per papercut, newest first, with enough context to fix or avoid
it later.

- **2026-07-10 · bundle** — konva (+react-konva) pushed the renderer chunk 1.65 MB → 2.48 MB; fine for desktop, but if it ever matters, React.lazy the MapEditor/PresenterMap.
- **2026-07-10 · tooling** — "papercut skill" requested but not installed/available in the Claude Code environment; falling back to this file. If a papercut skill exists on another machine/account, port these entries into it.
- **2026-07-10 · packaging** — `npm run pack` fails with EBUSY whenever Hearth.exe is running; had to arm a background watcher to repack after close. Recurring friction — consider a `pack:wait` script that polls for the process before building.
- **2026-07-10 · line endings** — the repo mixes CRLF (older files) and LF (newer), which silently breaks exact-string patch scripts; git warns loudly on every commit. Consider a `.gitattributes` normalizing to LF.
- **2026-07-10 · text visibility** — prose written between tool calls sometimes never reaches Wes (he once saw none of a long analysis); everything important must be restated in the turn's final message.
