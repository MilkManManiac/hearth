// This markdown is written into every campaign folder as AUTHORING.md so any
// Claude session (or the DM) has the scene schema + conventions on hand.

export const AUTHORING_MD = `# Authoring Hearth scenes

A **campaign folder** holds everything for one game. Structure:

\`\`\`
<campaign>/
  scenes/        scene JSON files (one per scene)
  music/         background music tracks (loop while a scene is active)
  ambience/      ambient loops (rain, crowd, wind — all play together)
  sfx/           one-shot sound effects
  art/           images / handouts
  library.json   tag index of every asset (used to suggest tracks)
  AUTHORING.md   this file
\`\`\`

All \`file\` paths in scenes and in library.json are **relative to the campaign
folder**, e.g. \`music/combat-drums.mp3\`.

## Scene file

A scene is \`scenes/<id>.json\`. Music and SFX are **palettes** — a set of options
the DM triggers live. Nothing auto-advances except the one music track marked
\`"default": true\`, which starts when the scene is loaded.

\`\`\`jsonc
{
  "id": "goblin-ambush",
  "name": "Goblin Ambush — Old Forest Road",
  "dmNotes": "Krag flees at half HP. Stealth DC 13 to spot the snare line.",

  "music": [
    { "id": "travel",   "label": "Uneasy travel", "file": "music/forest-tension.mp3", "volume": 0.6, "default": true },
    { "id": "combat",   "label": "Ambush!",        "file": "music/combat-drums.mp3",   "volume": 0.7 },
    { "id": "aftermath","label": "Aftermath",      "file": "music/somber-strings.mp3", "volume": 0.5 }
  ],

  "ambience": [
    { "file": "ambience/forest-birds.ogg", "volume": 0.4 },
    { "file": "ambience/wind-light.ogg",   "volume": 0.3 },
    { "file": "ambience/rain-heavy.ogg",   "volume": 0.5, "autoplay": false }
  ],

  "sfx": [
    { "id": "shriek", "label": "Goblin shriek", "file": "sfx/goblin-shriek.wav", "hotkey": "1", "duckMusic": true },
    { "id": "snare",  "label": "Snare springs", "file": "sfx/rope-snap.wav",     "hotkey": "2" }
  ],

  "images": [
    { "file": "art/forest-road.jpg", "caption": "The Old Forest Road", "playerFacing": true },
    { "file": "art/krag.png",        "caption": "Krag the Vile",       "playerFacing": true }
  ],

  "scriptText": "# The Old Forest Road\\n\\nThe road narrows beneath ancient oaks. Birdsong thins, then *stops*. {{music:combat}}\\n\\n> [!dm] Stealth (DC 13) to spot the snare line. Krag flees at half HP.\\n\\nShapes drop from the branches {{sfx:shriek}} and a snarling voice cries out: **\\"Take the fat one alive!\\"** {{image:art/krag.png}}",

  "transition": { "crossfadeMs": 2500 }
}
\`\`\`

### Read-aloud script (\`scriptText\`)

Write \`scriptText\` as **markdown prose with inline cue markers**. The app
compiles it at load time into a rich document tree (the \`script\` field, below).

**Cue markers** — on the control board a small tappable button lands exactly
where each marker sits, so the DM reads and taps mid-sentence. Place them for
dramatic timing:

- \`{{music:<trackId>}}\` — crossfade to that music track
- \`{{sfx:<sfxId>}}\` — fire that sound effect
- \`{{image:<path>}}\` — push that image to the presenter/players (use the art path)
- \`{{amb:<file-or-stem>}}\` — **toggle** an ambience bed on/off (fires again = off).
  The ref is the layer's file (\`ambience/rain-heavy.ogg\`) or just its filename
  stem (\`rain-heavy\`). Give script-driven beds \`"autoplay": false\` so they wait
  for their cue instead of starting when the scene goes live — see below.

**Amb cue lifecycle options** — an amb cue can carry \`|\`-separated options that
pre-mix the bed so the DM never rides faders while talking:

\`\`\`
{{amb:rain-heavy|vol=35%|in=4s|out=8s|until=section}}
\`\`\`

- \`vol=\` — target volume the bed fades **up to** (overrides the layer's
  \`volume\`). \`35%\` or \`0.35\`. Use it to balance beds against each other, e.g.
  campfire at 50% over rain at 30%.
- \`in=\` / \`out=\` — fade-in / fade-out duration. \`4s\`, \`2.5s\`, or bare ms
  (\`4000\`). Default ~0.8 s.
- \`until=section\` — the bed **auto-fades out** when the teleprompter pointer
  crosses the next heading (any level). Without it a bed plays until toggled
  off (a second cue, the console, or Stop All). Headings therefore double as
  atmosphere boundaries: start section-scoped beds just after a heading and
  they clean themselves up when the DM moves on.

Options are amb-only; unknown options are ignored (a typo degrades gracefully).
In the app's script editor the same settings live behind the ⚙ on each amb chip.

Whitespace inside the braces is tolerated (\`{{ sfx : shriek }}\` works).

**Go-live & autoplay** — selecting a scene in the app is *silent* (the DM can
prep while the previous atmosphere keeps playing). Hitting **▶ Go live** starts
the default music track and every ambience layer except those marked
\`"autoplay": false\`; those wait for their \`{{amb:...}}\` cue or a tap in the
mixer. A storm that rolls in mid-scene is an \`autoplay: false\` bed with an
\`{{amb:...}}\` cue at the right sentence — and a second cue later to cut it.

**Structure** — a small, forgiving markdown subset:

- \`# Title\` / \`## Section\` / \`### Beat\` — headings, levels 1–3 only
  (\`####\` and deeper are *not* parsed; they stay literal text)
- \`**bold**\` — bold; \`*italic*\` or \`_italic_\` — italic
- \`> [!dm] ...\` — a **DM-note callout**: renders as a visually distinct box so
  the DM never reads their own stage directions aloud
- A blank line starts a new paragraph. Consecutive non-blank lines reflow into
  **one** paragraph (soft line breaks become spaces).

Callout details: one or more consecutive \`>\` lines form a single callout. The
leading \`[!dm]\` tag is optional (and stripped from the text). Callout bodies
are parsed like the top level, so a callout can hold several paragraphs,
headings, and even cue markers.

Gotchas:

- Keep a \`**...**\` / \`*...*\` pair inside one paragraph, and don't put a cue
  marker between the opening and closing stars — emphasis never spans a cue.
- Text **color/highlight have no markdown syntax** — they're app-only polish
  the DM applies in the in-app editor. Don't try to author them in \`scriptText\`.

Example (shown unescaped — in the scene JSON it's one string with \`\\n\` breaks):

\`\`\`markdown
# The Old Forest Road

The road narrows beneath ancient oaks. Birdsong thins, then *stops*. {{music:combat}}

> [!dm] Stealth (DC 13) to spot the snare line before the wagon reaches it.
> Krag hangs back and flees at half HP.

Shapes drop from the branches {{sfx:shriek}} and a snarling voice cries out:
**"Take the fat one alive!"** {{image:art/krag.png}}
\`\`\`

### The stored \`script\` tree

Once the DM edits the read-aloud in the app (drag cue chips into the words,
apply formatting), the scene is saved back with a structured \`script\` field and
\`scriptText\` is dropped. Both are valid on load; if both are present, \`script\`
wins. \`script\` is a block tree:

\`\`\`jsonc
"script": [
  { "type": "heading", "level": 1, "content": [
    { "type": "text", "text": "The Old Forest Road" }
  ]},
  { "type": "paragraph", "content": [
    { "type": "text", "text": "Birdsong thins, then " },
    { "type": "text", "text": "stops", "marks": [{ "type": "italic" }] },
    { "type": "text", "text": ". " },
    { "type": "cue", "kind": "music", "ref": "combat", "label": "▶ combat" }
  ]},
  { "type": "callout", "content": [
    { "type": "paragraph", "content": [
      { "type": "text", "text": "Stealth (DC 13) to spot the snare line." }
    ]}
  ]}
]
\`\`\`

- **Blocks:** \`paragraph\`, \`heading\` (\`level\` 1–3), \`callout\` — a callout's
  \`content\` nests *blocks*, not inlines.
- **Inlines:** text runs (optional \`marks\`) and atomic cues
  (\`kind\`: \`music\` | \`sfx\` | \`image\`, \`ref\`, optional display \`label\`).
- **Marks:** \`bold\`, \`italic\`, \`color\`, \`highlight\`. Color/highlight carry a
  named palette id in \`value\` — text colors: \`danger\` · \`emphasis\` · \`arcane\` ·
  \`nature\` · \`whisper\`; highlights: \`read\` · \`pause\` · \`alert\`.

You *can* author \`script\` directly, but \`scriptText\` is the easy path — prefer
it when drafting scenes.

**Legacy scenes:** the old flat \`script\` array (top-level
\`{"type": "text" | "cue"}\` items, no blocks) is still accepted — the loader
migrates it to the tree automatically, and the next in-app save rewrites the
file in the new shape.

### Field defaults
- music \`volume\` 0.7, loops by default
- ambience \`volume\` 0.4, loops by default, \`autoplay\` true (starts on ▶ Go
  live; set \`false\` for beds driven by \`{{amb:...}}\` cues or manual taps)
- sfx \`volume\` 0.9, \`duckMusic\` true (music dips ~8 dB while it plays);
  \`loop: true\` makes it a sustained tap-on/tap-off loop instead of a one-shot
- \`transition.crossfadeMs\` 2500
- \`session\` (optional) — id of a \`notes/\` session note; the scene list groups
  scenes under their session ("Session 3" holding its scenes). Unset = Unfiled.

### Playlist mode (optional)

By default music is a **palette** (tap to switch). A scene can instead play its
\`music\` array as an ordered, auto-advancing queue:

\`\`\`jsonc
{
  "playlist": { "enabled": true, "shuffle": false, "loop": true, "crossfadeMs": 4000 }
}
\`\`\`

- \`loop\` (default true) wraps to the first track after the last; \`false\` stops.
- \`crossfadeMs\` is the fade between consecutive tracks (falls back to
  \`transition.crossfadeMs\`).
- Per-track \`fadeInMs\` / \`fadeOutMs\` on a music entry override the crossfade for
  that track's own start/end (also honored in palette mode).
- The DM can flip palette ↔ playlist live; the toggle persists to the scene.

### Ideas & Cast (\`ideas\`, \`entities\`)

Two optional lists power the side panels the DM checks off during play:

\`\`\`jsonc
{
  "ideas": [
    { "id": "idea-flee", "text": "A goblin flees to raise the alarm", "done": false }
  ],
  "entities": [
    { "id": "ent-krag", "type": "npc",     "name": "Krag the Vile", "note": "Flees at half HP", "status": "present",  "used": false },
    { "id": "ent-worg", "type": "monster", "name": "Worg",          "note": "If fight too easy", "status": "optional", "used": false },
    { "id": "ent-key",  "type": "item",    "name": "Iron key",      "note": "Opens the gate",    "status": "present",  "used": false }
  ]
}
\`\`\`

- \`entities.type\`: \`npc\` | \`monster\` | \`item\` | \`location\` | \`hook\`
- \`status\`: \`present\` (definitely here) or \`optional\` (could be dropped in)
- \`used\`: the DM's live checkbox — false when you author it
- Give every idea/entity a stable \`id\` (any unique string).

When drafting a scene, populate these: likely NPCs/monsters, findable loot, and
2–4 "what might happen here" ideas. It turns the scene into a live checklist.

## characters/ — the party (ONESTOP-PLAN C4)

One JSON per character in \`characters/\`. Choices are the source of truth;
the sheet derives PB/mods/saves/skills/passives/spell slots at render — never
write computed values. Compendium keys come from public/compendium/ (SRD
5.2.1): classKey/subclassKey/speciesKey/backgroundKey/spells.

\`\`\`jsonc
{
  "id": "varen",                    // = filename stem
  "name": "Varen",
  "player": "David",
  "classKey": "wizard", "subclassKey": "evoker", "level": 5,
  "speciesKey": "elf", "backgroundKey": "sage",
  "abilities": { "str": 8, "dex": 14, "con": 13, "int": 17, "wis": 12, "cha": 10 },
  "skillProfs": ["arcana", "history"],  // + optional "expertise": [...]
  "spells": ["fireball", "shield"],     // spell keys from the compendium
  "equipment": ["Quarterstaff", "Spellbook"],
  "ac": 12, "maxHp": 32, "hp": 32       // AC/maxHp are manual (no armor math)
}
\`\`\`

Mutable table state (the app writes these): hp, tempHp, hitDiceSpent,
deathSaves, conditions, slotsUsed, inspiration, notes.

## Scene extras: encounter + map

- \`scene.encounter\` — the ⚔ tracker: \`{ combatants: [...], round, turn }\`;
  a combatant is \`{ id, name, ref?: "<monster key>", side: "foe"|"ally"|"pc",
  maxHp, hp, ac?, initBonus?, initiative?, xp?, conditions: [{name, untilRound?}] }\`.
  When drafting an encounter for the DM, use compendium monster keys in \`ref\`
  so stat blocks are one click away, and copy hp/ac/xp from the monster.
- \`scene.map\` — fog-of-war battle map: \`{ image: "art/dungeon.jpg",
  strokes: [] }\`. Leave strokes empty (fully fogged); the DM paints reveals
  in-app. Any scene image works.

## notes/ — the campaign notebook

One JSON file per note in \`notes/\`. Notes are the DM's campaign-wide knowledge
base — sessions, NPCs, PCs, locations, factions, items, plot threads, scratch —
browsed in-app under the 📓 Notes tab (grouped by \`kind\`, no folders). They
hot-reload from disk like scenes.

\`\`\`jsonc
{
  "id": "barkeep-tobble",          // = filename stem
  "kind": "npc",                    // session|npc|pc|location|faction|item|thread|note
  "title": "Tobble, the Barkeep",
  "bodyText": "Markdown body — same subset as scriptText (# headings, **bold**, > [!dm] callouts), no sound cues.",
  "tags": ["duskhollow"],
  "status": "open",                 // threads only: open|resolved
  "date": "2026-07-12"              // sessions only (display)
}
\`\`\`

Like scenes, \`bodyText\` compiles to a structured \`body\` on load; once the note
is edited in-app it persists as \`body\` and \`bodyText\` is dropped. When drafting
notes for the DM, keep entities light: a line of who/what, a \`> [!dm]\` for
secrets, headings only where they help. Session notes follow a Lazy-DM prep
shape (Recap / Strong start / Possible scenes / Secrets & clues / To-do).

### Checklists (secrets & clues)

\`- [ ] text\` / \`- [x] text\` lines compile to live checklist items (in notes
AND scene scripts). The DM ticks them during play; on creating a new session
note, the previous session's **unchecked** items are appended under a
"Carried forward" heading automatically — write secrets as checklist lines so
unfinished business rolls forward. (Plain \`- text\` bullets are NOT special —
only the checkbox form is.)

### [[wiki-links]]

\`[[note-id]]\` anywhere in a body (or a scene script) becomes a live link to
that note — click to jump; every note shows what links back to it. Use
\`[[note-id|display text]]\` to override the label; a bare link renders the
target's current title, so renames propagate. The ref is the target's \`id\`
(its filename stem), not its title. Link liberally — a ref whose note doesn't
exist yet renders dashed and is a fine "write this later" marker. In the app,
typing \`[[\` opens autocomplete over all notes (with create-on-first-use).

## library.json

Every asset gets an entry with a **category** + descriptive **tags** — this is
what lets a scene description be matched to tracks, and what groups the library
browser and the drag tray. Keep tags concrete (mood, setting, instrument,
creature):

\`\`\`jsonc
{
  "assets": [
    { "file": "music/combat-drums.mp3", "kind": "music", "category": "combat",
      "tags": ["combat", "drums", "urgent", "goblin", "forest"],
      "source": "user-upload", "license": "owned" }
  ]
}
\`\`\`

### Categories

\`category\` is the primary coarse bucket (free-form, but prefer these so grouping
stays tidy). An asset can also carry **multiple categories** via \`categories\`
(an array, primary first — keep \`category\` mirroring \`categories[0]\`):

\`\`\`jsonc
{ "file": "sfx/war-drums.ogg", "kind": "sfx",
  "category": "combat", "categories": ["combat", "tension", "creatures"],
  "tags": ["drums", "anticipation"] }
\`\`\`

The library browser's category filter matches *any* of them; grouping uses the
primary. In the app, the ✎ editor's category field takes a comma-separated
list. Recommended set:

- **SFX:** \`creatures\` · \`combat\` · \`magic\` · \`weather\` · \`water\` · \`fire\` ·
  \`places\` · \`objects\` · \`horror\` · \`ui\`
- **Music / ambience (by mood/setting):** \`exploration\` · \`town\` · \`tavern\` ·
  \`tension\` · \`combat\` · \`boss\` · \`victory\` · \`somber\` · \`mystery\` · \`travel\` ·
  \`seafaring\` · \`places\` · \`horror\`

Assets with no \`category\` still work — they group under "Uncategorized". Put the
mood/setting in \`tags\` too, since scene-matching searches tags.

## Workflow for Claude

1. **Tag new files.** When the DM adds files, listen to the filenames + folder,
   ask about anything ambiguous, and add entries to library.json with good tags.
2. **Draft scenes from a description.** Match assets by tag, note gaps ("no
   dockside ambience — want CC0 options?"), write the scene JSON with a
   \`scriptText\` whose cues are timed for effect — use headings for beats and
   \`> [!dm]\` callouts for stage directions the DM shouldn't read aloud.
3. The app watches this folder and hot-reloads on save, so edits appear live.
`
