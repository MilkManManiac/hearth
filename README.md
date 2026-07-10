# 🔥 Hearth

**The one-stop D&D shop for a DM running games over Discord** — an experiment
in how far AI-driven development can take a real, daily-use tool. Everything
below was designed and built by Claude in collaboration with one DM, for one
real table, over a handful of sessions.

Local-first Electron app. No accounts, no subscriptions, no cloud — a campaign
is a folder of JSON and audio files you can read, edit, git-sync, and hand to
an AI to author.

## What it does

**🎵 Sound, live** — scenes hold *palettes* of music/ambience/SFX the DM taps
mid-sentence; read-aloud scripts have inline cue buttons and a Space-driven
teleprompter; Web Audio mixing (crossfades, gapless loops, ducking, loudness
normalization) streams as one feed into a Discord voice channel. A 2,300-asset
tagged library with search, audition, triage inbox, and playlists.

**📓 Notes, linked** — the campaign notebook: sessions, NPCs, locations,
threads with `[[wiki-links]]`, hover-peek cards, backlinks, unlinked-mention
detection, browser-style history, secrets-&-clues checklists that carry
forward between sessions, Ctrl+K everything, Ctrl+J quick capture.

**📖 Rules, offline** — the complete 2024 SRD 5.2.1 (331 monsters, 339
spells, all classes/species/items/conditions) as fast stat blocks with
condition tooltips, filters, and search. Unlimited homebrew: drop JSON in
`<campaign>/homebrew/` and it merges in with a 🏠 badge.

**⚔ Combat** — encounter tracker with SRD monster search, 2024 XP budgets,
initiative, round-timed conditions — and party rows *linked to character
sheets*, so damage in the tracker hits the sheet, the dashboard, and every
player's browser at once.

**🗺 Maps** — fog-of-war battle maps painted with reveal/hide brushes; players
see nothing until the DM hits *Send*, on a presenter window built for
screen-share.

**🛡 Characters** — native 2024-rules sheets (choices stored, stats derived):
level-up, spell slots (incl. Pact Magic), rests, death saves, expertise,
suggested HP. Plus the at-a-glance party dashboard.

**🌐 Player portal** — Hearth hosts a local web page where each player opens
*their* character in any browser: build, level, swap spells, manage inventory,
tick HP — live-synced with the DM's app.

## Running it

```bash
npm install
npm run dev        # hot-reloading dev app
npm run build      # production bundle
npm run pack       # packaged Windows build (see DEPLOY.md)
```

See `CLAUDE.md` for the full map (it's written for AI sessions — the primary
"developer" here), `ONESTOP-PLAN.md` for the research + build plan, and
`AUDIT-2026-07-10.md` for the current punch list. `PAPERCUTS.md` logs the
friction hit along the way.

## Data & licensing

Compendium data is the **SRD 5.2.1** via [Open5e](https://github.com/open5e/open5e-api),
CC-BY-4.0 — see `LICENSE-SRD.md` for the required attribution. Bundled sample
audio is CC0/CC-BY (per-file credits in `campaign-sample/CREDITS.md`); bulk
personal audio is gitignored and never ships. This is a personal,
non-commercial project.
