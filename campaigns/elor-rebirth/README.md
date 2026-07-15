# Elor: Rebirth — review snapshot (notes only)

This is a **portable, audio-less copy of the campaign notes** for reviewing/
editing the story with Claude on any machine. It is NOT the full campaign.

- The **real** campaign (with the ~2GB sound library, `library.json`, scenes)
  lives at `C:\Users\weshu\Campaigns\Elor Rebirth` and is intentionally NOT in
  git.
- Only `notes/*.json` (90+ notes: sessions 0–25, PCs, NPCs, locations,
  factions, threads, items, lore) travel here — small text, the material for
  campaign review/brainstorm. **`grill-queue.json` is the running brainstorm
  ledger — start there.**

## To review in the Hearth app
Point Hearth's 📁 campaign picker at this `campaigns/elor-rebirth/` folder.
Hearth creates the empty audio subfolders + a blank `library.json` on load; the
📓 Notes tab shows everything. (No audio here — that's fine for a notes review.)

## ⚠️ Keeping edits in sync
If we edit notes **here** during a review, they do NOT automatically flow back
to the real campaign folder. After a review session, copy the content folders
back (`notes/`, and now also `maps/`, `characters/`, `scenes/`, `homebrew/`,
`art/` — the snapshot grew beyond notes with the one-stop work):
`campaigns/elor-rebirth/<dir>/  →  C:\Users\weshu\Campaigns\Elor Rebirth\<dir>\`
(2026-07-15: a missed sync of exactly these folders left the live campaign
without its maps/characters — check both directions before assuming a bug.)
(or, if reviewing on the machine that has the real campaign, Claude edits the
real folder directly and this snapshot is refreshed from it).
