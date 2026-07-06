# SOUND-SOURCES.md — vetted wells for bulk-expanding the library

Research for TODOS.md #8 step 1, done 2026-07-06. All licenses verified against
the source's own license page (or its published license PDF) on this date.

**The one distinction that matters for Hearth:** our audio ships as *loose
files* in a campaign folder. That is "redistribution of raw files" under most
royalty-free licenses. So every source falls in one of two tiers:

- **Tier A — bundle-safe.** CC0/public-domain (do anything) or CC BY
  (anything + credit in CREDITS.md). These can go in the sample campaign, the
  repo, or any campaign folder we share.
- **Tier B — personal-library only.** "Royalty-free" licenses that allow use
  *inside* a project but forbid redistributing the files as files (Sonniss,
  ZapSplat, Pixabay, Mixkit…). Fine for your own local campaigns; must never
  go in the repo / sample campaign / shared folders.

Tag Tier B keepers in CREDITS.md as `no-redistribute` so the triage tool
(step 2) and future-you keep them out of anything shared.

---

## 1. Ranked shortlist

### 1. Sonniss #GameAudioGDC bundles — Tier B — the quality ceiling
- **What:** Annual free bundles of *professional* game-audio libraries,
  2015–2024 (10 bundles, multi-part zips, ~10–30 GB each, 100+ GB total).
  Pro field recordings and designed SFX: long seamless ambience beds, weather,
  water, fire, creatures, impacts, foley, horror drones — the fidelity/length
  upgrade the current library lacks.
- **License (verified):** Sonniss royalty-free license. Unlimited personal +
  commercial projects, **no attribution**, may be embedded in games/apps —
  but "Licensee may not sell any of the sound effects as they come" and raw
  redistribution is prohibited. AI training explicitly forbidden.
  https://sonniss.com/gdc-bundle-license/
- **Download:** https://sonniss.com/gameaudiogdc — direct links + torrents +
  Google Sheets track lists per year. Start with 2023/2024.
- **Fills:** weather, water, fire, places (long loopable beds), creatures,
  combat foley, horror, objects. Not music.
- **Caveats:** WAV-heavy and huge — install ffmpeg and transcode keepers to
  OGG before import (we already hit the giant-WAV problem in TODOS #5).

### 2. kmontesdev — Fantasy Ambient Sound Effects Pack — Tier A — best single grab
- **What:** 2 GB of fantasy-specific SFX: hits, ambience, foley, **monsters,
  weapons, spells**. Made for exactly our genre. No generative AI used.
- **License (verified):** **CC0** — "to be used, remixed, or altered in any
  type of project, be it commercial or non-commercial." Free (pay-what-you-want).
- **Download:** https://kmontesdev.itch.io/fantasy-ambient-sound-effects-pack-cc0
- **Fills:** creatures, combat, magic, places, objects — the hardest
  categories to find CC0 at quality.

### 3. Nox_Sound — Essentials Series — Tier A — pro field recordings, CC0
- **What:** 1,644 SFX at 24-bit/48–96 kHz: 479 footsteps (13 surfaces),
  **looped nature ambiences**, looped water/river flows (Iceland/São Miguel
  recordings), 526 voice recordings, vehicles, electromagnetic.
- **License (verified):** **CC0** — "use them freely without attribution or
  restrictions," commercial + redistribution OK.
- **Download:** https://nox-sound-design.itch.io/essentials-series-sfx-nox-sound
- **Fills:** weather, water (loop-ready), places/nature beds, creature/PC
  footsteps, crowd voices. Real recordings, not synth — big fidelity jump.

### 4. Blacis — Fantasy Music Mega Pack — Tier A — mood music in bulk
- **What:** 100+ tracks: fantasy, cinematic, ambience, cartoon.
- **License (verified):** **CC0** (Creative Commons Zero v1.0 Universal). Free.
- **Download:** https://blacis.itch.io/royalty-free-music-megapack
- **Fills:** mood music across the board — audition for tension, mystery,
  somber, travel; expect to keep a fraction (megapacks vary track-to-track).

### 5. Alexander Nakarada (CreatorChords) — Tier A (CC BY) — mood-gap sniper
- **What:** 678 tracks, heavily fantasy/medieval/Nordic; many have loop-ready
  versions. Consistent, genuinely good composer — the reliable well for the
  exact moods we still lack.
- **License (verified):** **CC BY 4.0** — free anywhere incl. commercial, must
  credit "Alexander Nakarada (CreatorChords)" → one CREDITS.md line. Full
  discography downloadable for $15 (attribution still required).
- **Download:** https://creatorchords.com (per-track, free) ·
  https://alexandernakarada.bandcamp.com/album/complete-discography-creative-commons-by-40
- **Fills:** **tension, mystery, somber, travel, seafaring**, tavern, combat —
  search his tags per mood.

### 6. itch.io CC0 audio tag — Tier A — the ongoing well
- **What:** Browse pages that filter game-asset packs to license = CC0:
  - SFX: https://itch.io/game-assets/assets-cc0/tag-sound-effects
  - Music: https://itch.io/game-assets/assets-cc0/tag-music
  Known-good starters: TomMusic "Free Fantasy 200 SFX Pack"
  (https://tommusic.itch.io/free-fantasy-200-sfx-pack), Leohpaz "Minifantasy —
  Dungeon Audio" (https://leohpaz.itch.io/minifantasy-dungeon-sfx-pack),
  JDSherbert "Ambiences Music Pack" (https://jdsherbert.itch.io/ambiences-music-pack).
- **License:** the itch filter shows CC0-tagged packs, but **confirm the
  license text on each pack page** before import — authors occasionally
  mis-tag or add conditions in the description.
- **Fills:** whatever's left; new packs appear constantly.

### 7. Freesound (CC0 filter) — Tier A — targeted gap-filler
- **What:** Community database; uneven, but the CC0 slice is huge and it's the
  best place to find one *specific* missing sound (dice on wood, portcullis,
  distant wolf, ship rigging creak).
- **License:** filter to **CC0 only**: https://freesound.org/browse/tags/cc0
  (or search with license facet "Creative Commons 0"). Ignore CC-BY-NC results.
- **Caveats:** downloads need a free account (auth-gated — same blocker noted
  in TODOS #5); preview everything, quality varies wildly.
- **Fills:** taxonomy holes one sound at a time: UI/table (dice!), objects,
  creature one-shots.

### 8. Pixabay SFX/music — Tier B — big easy catalog, personal use only
- **What:** Large, decent-quality SFX + music catalog, no account needed for
  most downloads, good search.
- **License (verified):** Pixabay Content License — free commercial use, no
  attribution, **but** "you cannot sell or distribute the Content… on a
  Standalone basis," where standalone = "no creative effort applied… remains
  in substantially the same form." Loose files in a shared campaign folder =
  standalone. https://pixabay.com/service/license-summary/
- **Fills:** anything, quickly — for *your* campaigns only; never in the repo.

Also fine, already in use: **Kenney** (CC0) and **OpenGameArt** (per-asset
CC0/CC-BY — keep filtering to CC0). Honorable mention for music breadth:
**Kevin MacLeod / incompetech.com** (CC BY 4.0, enormous, quality varies).

---

## 2. Skip these — and why

| Source | Why skipped |
|---|---|
| **BBC Sound Effects archive** | RemArc licence = personal / research / education **only**; commercial use requires buying via Pro Sound Effects; no redistribution. Gorgeous 33k-sound archive, but unusable for a bundleable library. |
| **Tabletop Audio** | CC **BY-NC-ND** 4.0: no derivatives, no commercial, and effectively no redistribution; SoundPad sounds "not for use outside tabletopaudio.com." Use the *website live* at the table if you like it — just can't import it. |
| **Michael Ghelfi Studios** | Explicitly *not* copyright-free. Free personal/streaming use with credit; paid GMs asked to join Patreon; no redistribution. Great listening reference for what D&D audio should sound like; not a library source. |
| **Uppbeat** | Subscription model: free tier = 3 downloads/month, mandatory credit, **SFX not included on free tier**, no redistribution. Nothing here beats the free wells above. |
| **ZapSplat** | Free tier requires attribution; license expressly prohibits redistributing sounds "in any form (e.g. sound libraries, file sharing, apps…)". Decent catalog but strictly dominated by Sonniss (better quality, no attribution). |
| **Mixkit** | License is fine for embedding (commercial, no attribution) but forbids redistributing raw files; catalog is small and generic (UI/whooshes/pop) — nothing D&D-shaped. Not worth a Tier B slot. |
| **SoundBible** | Mixed per-file licenses (CC BY 3.0 / sampling+ / PD) requiring per-file checking; recordings are dated, low-bitrate, mono-era. Quality below our current floor. |
| **99Sounds** | Genuinely free + royalty-free commercial, but packs skew electronic/cinematic sound-design (risers, impacts, glitch); redistribution terms not clearly permissive. Marginal fit — revisit only for horror stingers/cinematic impacts as Tier B. |
| **archive.org audio** | Public-domain gems exist but license is per-item (lots of mislabeled uploads) and fidelity is usually poor (78rpm-era noise). Special-case tool only (period music, foghorns), not a bulk well. |

---

## 3. Acquisition plan (in order)

**Prep (once):** install ffmpeg (`winget install ffmpeg`) so keepers can be
transcoded WAV→OGG on import — Sonniss and Nox are WAV-heavy and we already
carry three oversized WAVs from the last batch.

**Wave 1 — CC0 core (bundle-safe, biggest coverage per download):**
1. kmontesdev Fantasy Ambient pack (2 GB) → creatures, combat, magic, objects.
2. Nox_Sound Essentials (1,644 SFX) → weather, water loops, nature beds, footsteps.
3. Blacis Fantasy Music Mega Pack (100+ tracks) → mood-music breadth.
4. TomMusic 200 Fantasy SFX + Leohpaz Minifantasy Dungeon + JDSherbert
   Ambiences (verify each pack's license text on its page at download time).

Expect Wave 1 alone to cover most of the taxonomy; run everything through the
step-2 triage tool — keep ratio on megapacks will be maybe 20–40%.

**Wave 2 — mood-music gaps, surgical (CC BY):**
5. Nakarada: pick tracks per remaining gap — tension, mystery, somber, travel,
   seafaring — from creatorchords.com; add one attribution line to CREDITS.md
   (per-track listing like we already do).

**Wave 3 — fidelity ceiling (Tier B, local-only):**
6. Sonniss GDC 2024 + 2023 bundles. Skim the Google Sheets track lists first
   and download only the parts with ambience/creature/weather libraries.
   Mark every keeper `no-redistribute` in CREDITS.md.

**Ongoing:** Freesound CC0 (needs account) and the itch.io CC0 tag pages for
specific holes — dice/table UI sounds are the most likely stragglers.

**Bookkeeping rule for the triage tool (step 2):** every keeper records
`source`, `license`, `attribution` (if CC BY), and `redistributable: yes/no`
at intake — retrofitting license info later is the thing that never happens.
