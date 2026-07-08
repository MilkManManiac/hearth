# Elor: Rebirth — review kickoff (read me first, Claude)

If you're a fresh Claude session on a machine that just pulled this repo: this
is everything you need to run a campaign review/cleanup with the DM (Wes). You
do **not** need the Hearth app running — the material is the JSON in `notes/`.
Read all of `notes/*.json` before starting; they're the ground truth.

## The campaign in three sentences
Underground world (Elor) 50 years after a cataclysm; the surface is quietly
becoming habitable again but nobody knows. The party (Eddy/Paladin-Aasimar,
Varen/Drow wizard, Felson/Monk, Brolin/Cleric, + the late Trunks, + NPCs Cumb,
Eira) has spent 24 sessions uncovering a plague, a witch (Ms. Judy), a drow
druid (Kena) causing it as an exodus scheme, and **the Pool** — an entity older
than the gods that has swallowed Lathander, Felson's parents, and (soul-wise)
Eddy himself. They just killed Root Darkpass and are descending the river toward
the Pool (Session 24, prepped, unplayed).

## How the notes are organized
Kinds: `session` (0–24, canon = the recap read aloud the following session),
`pc`, `npc`, `location`, `faction`, `thread` (open questions/secrets), `item`,
`note` (lore + the Ideas Parking Lot). `> [!dm]` callouts hold secrets and my
flags. Cross-refs use `[[note-id]]`.

## The DM's goals for this review
1. **Grill him** on the basic concepts first (he asked for this — use
   `/grill-me` if available, or just interview): decide what's **useful / gets
   merked / stays** across the 12 threads and the `ideas-parking-lot`.
2. Then a thorough review + **brainstorm campaign ideas** where he wants help.
3. Separately, he finds the notes **hard to read** — offer a wording/formatting
   cleanup pass as you go (shorter, punchier, skimmable at 2am mid-session).

## Direction questions I had queued (ask these during the review)
- **Tone of the Pool arc** — commit to cosmic horror, or keep the horror+levity
  mix that worked in sessions 17–23?
- **The Pool's endgame role** — final antagonist? a doorway to the surface
  exodus ("Rebirth")? something you survive but never beat? (He may not have
  decided — brainstorm it.)
- **Cost of killing Root** — the party mostly walked away clean. How much should
  it haunt them (Ghruom's vendetta, Brolin's dead god, town suspicion)?
- **Where "Rebirth" ends** — the surface/exodus? the gods sorted? the PC arcs
  resolved? (Worth pinning before the threads multiply.)

## Known flags / contradictions to resolve with him (already noted in-line)
- **Sellie/Eira truth** is 3-layered (Root believed both died in childbirth vs
  Sellie fled with the baby vs the genocide-plan draft) — see `eira-cavernborn`,
  `roots-journal`, `ideas-parking-lot`.
- **Sessions 22/23 blur** in the source doc — I split them best-guess; confirm.
- **Brolin, Eira, Michael are not on the Session 24 roster** — where did they
  stay and why? (Notes ask this.)
- **Unfired hooks worth surfacing:** Kena secretly *has Tad*; one guild leader
  *knows the surface is safe*; Mr. Spells' actual endgame want; the topside
  giant-tree vision.

## Editing + sync
Edit the JSON in `notes/` directly (same schema you're reading). ⚠️ This is a
**snapshot** — after the review, the DM copies `notes/*.json` back to the real
campaign at `C:\Users\weshu\Campaigns\Elor Rebirth\notes\` (see README.md). If
you're on the machine that has the real campaign, edit that folder instead.
