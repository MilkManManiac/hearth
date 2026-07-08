# Elor: Rebirth — review snapshot (notes only)

This is a **portable, audio-less copy of the campaign notes** for reviewing/
editing the story with Claude on any machine. It is NOT the full campaign.

- The **real** campaign (with the ~2GB sound library, `library.json`, scenes)
  lives at `C:\Users\weshu\Campaigns\Elor Rebirth` and is intentionally NOT in
  git.
- Only `notes/*.json` (83 notes: 25 sessions, PCs, NPCs, locations, factions,
  threads, items, lore) travel here — they're small text and are the material
  for the campaign review / cleanup pass.

## To review in the Hearth app
Point Hearth's 📁 campaign picker at this `campaigns/elor-rebirth/` folder.
Hearth creates the empty audio subfolders + a blank `library.json` on load; the
📓 Notes tab shows everything. (No audio here — that's fine for a notes review.)

## ⚠️ Keeping edits in sync
If we edit notes **here** during a review, they do NOT automatically flow back
to the real campaign folder. After a review session, copy `notes/*.json` back:
`campaigns/elor-rebirth/notes/  →  C:\Users\weshu\Campaigns\Elor Rebirth\notes\`
(or, if reviewing on the machine that has the real campaign, Claude edits the
real folder directly and this snapshot is refreshed from it).
