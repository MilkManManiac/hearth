# Papercuts — friction log

Wes asked for every issue hit while building to be noted "via the papercut
skill/api." **No such skill exists in this environment**, so this file is the
log. One line per papercut, newest first, with enough context to fix or avoid
it later.

- **2026-07-10 · EBUSY round 2** — pack-wait fired the instant Hearth.exe left the process list and still hit EBUSY on `win-unpacked` (Windows/Defender hold handles for seconds after exit; the DM can also relaunch mid-pack). Fixed: 8s grace + relaunch re-check + 4 retries. Lesson: process-gone ≠ locks-released on Windows.
- **2026-07-10 · PS 5.1 here-string args** — `git commit -m @'...'@` silently SPLITS the argument at embedded double quotes (PS 5.1 native-exe quoting), scattering the message into bogus pathspecs; the commit fails. Rule: no `"` inside commit messages passed via here-string (or use `git commit -F <file>`).
- **2026-07-10 · shell escaping (recurring)** — writing template-literal TS (authoring.ts) through bash-heredoc node scripts mangles backticks/escapes EVERY time; three separate breakages today. Rule: content going into a TS template literal gets written via the Edit tool with hand-escaped backticks, never via shell pipelines.
- **2026-07-10 · CRITICAL near-miss** — a bulk regex replace (fs.writeFile→writeJsonAtomic) rewrote the helper's OWN body into infinite recursion; typecheck passed, boot passed (saves aren't exercised at boot), and it shipped in the P0 commit. Caught by eye during C4. Lesson: after mechanical rewrites, grep the definition site AND smoke-test a WRITE path, not just boot.
- **2026-07-10 · bundle** — konva (+react-konva) pushed the renderer chunk 1.65 MB → 2.48 MB; fine for desktop, but if it ever matters, React.lazy the MapEditor/PresenterMap.
- **2026-07-10 · tooling** — "papercut skill" requested but not installed/available in the Claude Code environment; falling back to this file. If a papercut skill exists on another machine/account, port these entries into it.
- **2026-07-10 · packaging** — `npm run pack` fails with EBUSY whenever Hearth.exe is running; had to arm a background watcher to repack after close. Recurring friction — consider a `pack:wait` script that polls for the process before building.
- **2026-07-10 · line endings** — the repo mixes CRLF (older files) and LF (newer), which silently breaks exact-string patch scripts; git warns loudly on every commit. Consider a `.gitattributes` normalizing to LF.
- **2026-07-10 · text visibility** — prose written between tool calls sometimes never reaches Wes (he once saw none of a long analysis); everything important must be restated in the turn's final message.
