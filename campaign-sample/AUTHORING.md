# Authoring Hearth scenes

A **campaign folder** holds everything for one game. Structure:

```
<campaign>/
  scenes/        scene JSON files (one per scene)
  music/         background music tracks (loop while a scene is active)
  ambience/      ambient loops (rain, crowd, wind — all play together)
  sfx/           one-shot sound effects
  art/           images / handouts
  library.json   tag index of every asset (used to suggest tracks)
  AUTHORING.md   this file
```

All `file` paths in scenes and in library.json are **relative to the campaign
folder**, e.g. `music/combat-drums.mp3`.

## Scene file

A scene is `scenes/<id>.json`. Music and SFX are **palettes** — a set of options
the DM triggers live. Nothing auto-advances except the one music track marked
`"default": true`, which starts when the scene is loaded.

```jsonc
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
    { "file": "ambience/wind-light.ogg",   "volume": 0.3 }
  ],

  "sfx": [
    { "id": "shriek", "label": "Goblin shriek", "file": "sfx/goblin-shriek.wav", "hotkey": "1", "duckMusic": true },
    { "id": "snare",  "label": "Snare springs", "file": "sfx/rope-snap.wav",     "hotkey": "2" }
  ],

  "images": [
    { "file": "art/forest-road.jpg", "caption": "The Old Forest Road", "playerFacing": true },
    { "file": "art/krag.png",        "caption": "Krag the Vile",       "playerFacing": true }
  ],

  "scriptText": "The road narrows beneath ancient oaks. Birdsong thins, then stops. {{music:combat}} Shapes drop from the branches {{sfx:shriek}} and a snarling voice cries out: \"Take the fat one alive!\" {{image:art/krag.png}}",

  "transition": { "crossfadeMs": 2500 }
}
```

### Read-aloud script

Write `scriptText` as plain prose with inline **cue markers**:

- `{{music:<trackId>}}` — crossfade to that music track
- `{{sfx:<sfxId>}}` — fire that sound effect
- `{{image:<path>}}` — push that image to the presenter/players (use the art path)

On the control board the prose renders with a small tappable button exactly
where each marker sits, so the DM reads and taps mid-sentence. Place cues for
dramatic timing. (You may instead provide a structured `script` array, but
`scriptText` is the easy path.)

### Field defaults
- music `volume` 0.7, loops by default
- ambience `volume` 0.4, always loops
- sfx `volume` 0.9, `duckMusic` true (music dips ~8 dB while it plays)
- `transition.crossfadeMs` 2500

## library.json

Every asset gets an entry with descriptive **tags** — this is what lets a scene
description be matched to tracks. Keep tags concrete (mood, setting, instrument,
creature):

```jsonc
{
  "assets": [
    { "file": "music/combat-drums.mp3", "kind": "music",
      "tags": ["combat", "drums", "urgent", "goblin", "forest"],
      "source": "user-upload", "license": "owned" }
  ]
}
```

## Workflow for Claude

1. **Tag new files.** When the DM adds files, listen to the filenames + folder,
   ask about anything ambiguous, and add entries to library.json with good tags.
2. **Draft scenes from a description.** Match assets by tag, note gaps ("no
   dockside ambience — want CC0 options?"), write the scene JSON with a
   `scriptText` whose cues are timed for effect.
3. The app watches this folder and hot-reloads on save, so edits appear live.
