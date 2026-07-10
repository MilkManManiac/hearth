// Normalize Open5e `srd-2024` fixtures (SRD 5.2.1, CC-BY-4.0) into the compact
// JSON the app ships in src/renderer/public/compendium/.
//
// Usage:
//   node scripts/build-compendium.mjs <path-to-srd-2024-fixture-dir>
// Fixture source: github.com/open5e/open5e-api → data/v2/wizards-of-the-coast/srd-2024
//
// Design: persist page-ready shapes (joins done here, once) — the app never
// touches the relational fixtures.

import fs from 'node:fs'
import path from 'node:path'

const SRC = process.argv[2]
if (!SRC || !fs.existsSync(path.join(SRC, 'Creature.json'))) {
  console.error('Usage: node scripts/build-compendium.mjs <srd-2024 fixture dir>')
  process.exit(1)
}
const OUT = path.resolve('public/compendium')
fs.mkdirSync(OUT, { recursive: true })

const load = (f) => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'))
const byParent = (rows) => {
  const m = new Map()
  for (const r of rows) {
    const p = r.fields.parent
    if (!m.has(p)) m.set(p, [])
    m.get(p).push(r)
  }
  return m
}
const key = (pk) => pk.replace(/^srd-2024_/, '')
const write = (name, data) => {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data))
  console.log(name.padEnd(18), Array.isArray(data) ? data.length : Object.keys(data).length)
}

// --- monsters ---------------------------------------------------------------
const DIE = { D4: 4, D6: 6, D8: 8, D10: 10, D12: 12, D20: 20 }
function attackLine(a) {
  const f = a.fields
  const kind = f.attack_type === 'SPELL' ? 'Spell' : 'Melee or Ranged'
  const reach = f.reach ? `reach ${f.reach} ft.` : ''
  const range = f.range ? `range ${f.range}${f.long_range ? `/${f.long_range}` : ''} ft.` : ''
  const dmg =
    f.damage_die_count && f.damage_die_type
      ? `${f.damage_die_count}d${DIE[f.damage_die_type] ?? '?'}${f.damage_bonus ? ` + ${f.damage_bonus}` : ''}`
      : null
  const extra =
    f.extra_damage_die_count && f.extra_damage_die_type
      ? ` plus ${f.extra_damage_die_count}d${DIE[f.extra_damage_die_type] ?? '?'}${f.extra_damage_bonus ? ` + ${f.extra_damage_bonus}` : ''} ${f.extra_damage_type ?? ''}`
      : ''
  return [
    `${kind} Attack Roll: ${f.to_hit_mod >= 0 ? '+' : ''}${f.to_hit_mod}`,
    [reach, range].filter(Boolean).join(' or '),
    dmg ? `Hit: ${dmg} ${f.damage_type ?? ''}${extra}` : ''
  ]
    .filter(Boolean)
    .join(', ')
}

const traits = byParent(load('CreatureTrait.json'))
const actions = byParent(load('CreatureAction.json'))
const attacks = byParent(load('CreatureActionAttack.json'))
const SKILLS = ['acrobatics','animal_handling','arcana','athletics','deception','history','insight','intimidation','investigation','medicine','nature','perception','performance','persuasion','religion','sleight_of_hand','stealth','survival']
const ABILITIES = ['strength','dexterity','constitution','intelligence','wisdom','charisma']

const monsters = load('Creature.json').map((c) => {
  const f = c.fields
  const acts = (actions.get(c.pk) ?? [])
    .sort((a, b) => (a.fields.order_in_statblock ?? 99) - (b.fields.order_in_statblock ?? 99))
    .map((a) => {
      const atk = (attacks.get(a.pk) ?? []).map(attackLine)
      let desc = a.fields.desc || ''
      // 2024 fixtures usually embed the roll text; synthesize only when absent.
      if (atk.length && !/Attack Roll/i.test(desc)) desc = `${atk.join(' ')} ${desc}`.trim()
      return {
        name: a.fields.name,
        desc,
        type: a.fields.action_type || 'ACTION',
        uses: a.fields.uses_type ? { type: a.fields.uses_type, param: a.fields.uses_param } : undefined
      }
    })
  const skills = {}
  for (const s of SKILLS) if (f[`skill_bonus_${s}`] != null) skills[s] = f[`skill_bonus_${s}`]
  const saves = {}
  for (const a of ABILITIES) if (f[`saving_throw_${a}`] != null) saves[a] = f[`saving_throw_${a}`]
  const senses = []
  if (f.blindsight_range) senses.push(`Blindsight ${f.blindsight_range} ft.`)
  if (f.darkvision_range) senses.push(`Darkvision ${f.darkvision_range} ft.`)
  if (f.tremorsense_range) senses.push(`Tremorsense ${f.tremorsense_range} ft.`)
  if (f.truesight_range) senses.push(`Truesight ${f.truesight_range} ft.`)
  const speed = { walk: f.walk, fly: f.fly, swim: f.swim, burrow: f.burrow, climb: f.climb, hover: f.hover || undefined }
  for (const k of Object.keys(speed)) if (!speed[k]) delete speed[k]
  return {
    key: key(c.pk),
    name: f.name,
    size: f.size?.replace(/^srd-2024_/, '') ?? '',
    type: f.type?.replace(/^srd-2024_/, '') ?? '',
    subcategory: f.subcategory || undefined,
    alignment: f.alignment,
    ac: f.armor_class,
    acDetail: f.armor_detail || undefined,
    hp: f.hit_points,
    hitDice: f.hit_dice || undefined,
    initiative: f.initiative_bonus ?? undefined,
    speed,
    abilities: {
      str: f.ability_score_strength, dex: f.ability_score_dexterity, con: f.ability_score_constitution,
      int: f.ability_score_intelligence, wis: f.ability_score_wisdom, cha: f.ability_score_charisma
    },
    saves,
    skills,
    senses,
    passivePerception: f.passive_perception ?? undefined,
    immunities: f.damage_immunities_display || undefined,
    resistances: f.damage_resistances_display || undefined,
    vulnerabilities: f.damage_vulnerabilities_display || undefined,
    conditionImmunities: f.condition_immunities_display || undefined,
    languages: f.languages_desc || undefined,
    telepathy: f.telepathy_range ?? undefined,
    cr: parseFloat(f.challenge_rating),
    xp: f.experience_points_integer ?? undefined,
    pb: f.proficiency_bonus ?? undefined,
    environments: f.environments?.length ? f.environments : undefined,
    traits: (traits.get(c.pk) ?? []).map((t) => ({ name: t.fields.name, desc: t.fields.desc })),
    actions: acts
  }
})
write('monsters.json', monsters.sort((a, b) => a.name.localeCompare(b.name)))

// --- spells -------------------------------------------------------------------
const spells = load('Spell.json').map((s) => {
  const f = s.fields
  const comps = []
  if (f.verbal) comps.push('V')
  if (f.somatic) comps.push('S')
  if (f.material) comps.push('M')
  return {
    key: key(s.pk),
    name: f.name,
    level: f.level,
    school: key(String(f.school ?? '')).replace(/^.*_/, '') || String(f.school ?? ''),
    castingTime: f.casting_time?.toLowerCase().replace(/_/g, ' '),
    reaction: f.reaction_condition || undefined,
    range: f.range_text || (f.range != null ? `${f.range} ${f.range_unit ?? 'feet'}` : ''),
    components: comps.join(', '),
    material: f.material_specified || undefined,
    duration: f.duration,
    concentration: !!f.concentration,
    ritual: !!f.ritual,
    desc: f.desc,
    higherLevel: f.higher_level || undefined,
    classes: (f.classes ?? []).map((c) => key(c))
  }
})
write('spells.json', spells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)))

// --- species --------------------------------------------------------------------
const spTraits = byParent(load('SpeciesTrait.json'))
const species = load('Species.json').map((s) => ({
  key: key(s.pk),
  name: s.fields.name,
  desc: s.fields.desc || undefined,
  subspeciesOf: s.fields.subspecies_of ? key(s.fields.subspecies_of) : undefined,
  traits: (spTraits.get(s.pk) ?? [])
    .sort((a, b) => (a.fields.order ?? 99) - (b.fields.order ?? 99))
    .map((t) => ({ name: t.fields.name, desc: t.fields.desc }))
}))
write('species.json', species.sort((a, b) => a.name.localeCompare(b.name)))

// --- classes --------------------------------------------------------------------
const features = load('ClassFeature.json')
const featureLevels = byParent(load('ClassFeatureItem.json'))
const featsByClass = byParent(features)
const classes = load('CharacterClass.json').map((c) => ({
  key: key(c.pk),
  name: c.fields.name,
  subclassOf: c.fields.subclass_of ? key(c.fields.subclass_of) : undefined,
  hitDice: c.fields.hit_dice || undefined,
  casterType: c.fields.caster_type && c.fields.caster_type !== 'NONE' ? c.fields.caster_type : undefined,
  primaryAbilities: c.fields.primary_abilities?.map((a) => key(a)) ?? [],
  savingThrows: c.fields.saving_throws?.map((a) => key(a)) ?? [],
  features: (featsByClass.get(c.pk) ?? []).map((ft) => ({
    name: ft.fields.name,
    desc: ft.fields.desc,
    levels: (featureLevels.get(ft.pk) ?? []).map((l) => l.fields.level).sort((a, b) => a - b)
  }))
}))
write('classes.json', classes.sort((a, b) => (a.subclassOf ? 1 : 0) - (b.subclassOf ? 1 : 0) || a.name.localeCompare(b.name)))

// --- items (magic + mundane) ------------------------------------------------------
const magicItems = load('MagicItem.json').map((m) => ({
  key: key(m.pk),
  name: m.fields.name,
  category: m.fields.category || undefined,
  rarity: m.fields.rarity ? key(String(m.fields.rarity)) : undefined,
  requiresAttunement: m.fields.requires_attunement || undefined,
  desc: m.fields.desc
}))
write('magic-items.json', magicItems.sort((a, b) => a.name.localeCompare(b.name)))

const weapons = new Map(load('Weapon.json').map((w) => [w.pk, w.fields]))
const armor = new Map(load('Armor.json').map((a) => [a.pk, a.fields]))
const propNames = new Map(load('WeaponProperty.json').map((p) => [p.pk, p.fields.name]))
const propAssign = byParent(load('WeaponPropertyAssignment.json'))
const equipment = load('Item.json').map((i) => {
  const f = i.fields
  const w = f.weapon ? weapons.get(f.weapon) : null
  const ar = f.armor ? armor.get(f.armor) : null
  const props = f.weapon
    ? (propAssign.get(f.weapon) ?? []).map((p) => propNames.get(p.fields.property)).filter(Boolean)
    : []
  return {
    key: key(i.pk),
    name: f.name,
    category: f.category ? key(String(f.category)) : undefined,
    cost: f.cost && f.cost !== '0.00' ? `${parseFloat(f.cost)} gp` : undefined,
    weight: f.weight && f.weight !== '0.000' ? `${parseFloat(f.weight)} lb.` : undefined,
    damage:
      w?.damage_dice != null
        ? `${w.damage_dice}${w.damage_type ? ` ${key(String(w.damage_type))}` : ''}`
        : undefined,
    range: w?.range ? `${w.range}/${w.long_range ?? w.range} ft.` : undefined,
    properties: props.length ? props : undefined,
    ac: ar?.ac_display || undefined,
    desc: f.desc || undefined
  }
})
write('equipment.json', equipment.sort((a, b) => a.name.localeCompare(b.name)))

// --- rules + glossary ----------------------------------------------------------
const ruleSets = new Map(load('RuleSet.json').map((r) => [r.pk, r.fields.name]))
const rules = load('Rule.json')
  .sort((a, b) => String(a.fields.ruleset).localeCompare(String(b.fields.ruleset)) || (a.fields.index ?? 0) - (b.fields.index ?? 0))
  .map((r) => ({
    key: key(r.pk),
    name: r.fields.name,
    section: ruleSets.get(r.fields.ruleset) ?? key(String(r.fields.ruleset ?? '')),
    desc: r.fields.desc
  }))
write('rules.json', rules)

const ABILITY_NAMES = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' }
const titleCase = (k) => ABILITY_NAMES[k] ?? k.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
const glossary = []
const gl = (file, section) => {
  try {
    // These fixtures carry only `describes` (a key ref) — the display name is
    // the prettified key ("chaotic-evil" → "Chaotic Evil", "cha" → "Charisma").
    for (const r of load(file)) {
      glossary.push({ key: key(r.pk), name: titleCase(key(r.pk)), section, desc: r.fields.desc })
    }
  } catch {
    console.warn('glossary skip:', file)
  }
}
gl('ConditionDescription.json', 'Conditions')
gl('AbilityDescription.json', 'Abilities')
gl('SkillDescription.json', 'Skills')
gl('DamageTypeDescription.json', 'Damage Types')
gl('CreatureTypeDescription.json', 'Creature Types')
gl('AlignmentDescription.json', 'Alignments')
write('glossary.json', glossary.sort((a, b) => a.section.localeCompare(b.section) || a.name.localeCompare(b.name)))

// --- feats + backgrounds ---------------------------------------------------------
const featBenefits = byParent(load('FeatBenefit.json'))
const feats = load('Feat.json').map((f) => ({
  key: key(f.pk),
  name: f.fields.name,
  desc: f.fields.desc,
  benefits: (featBenefits.get(f.pk) ?? []).map((b) => ({ name: b.fields.name, desc: b.fields.desc }))
}))
write('feats.json', feats.sort((a, b) => a.name.localeCompare(b.name)))

const bgBenefits = byParent(load('BackgroundBenefit.json'))
const backgrounds = load('Background.json').map((b) => ({
  key: key(b.pk),
  name: b.fields.name,
  desc: b.fields.desc || undefined,
  benefits: (bgBenefits.get(b.pk) ?? []).map((x) => ({ name: x.fields.name, desc: x.fields.desc }))
}))
write('backgrounds.json', backgrounds.sort((a, b) => a.name.localeCompare(b.name)))

// --- search index + meta ----------------------------------------------------------
const index = []
const add = (kind, arr) => arr.forEach((e) => index.push({ k: kind, key: e.key, name: e.name }))
add('monster', monsters)
add('spell', spells)
add('species', species)
add('class', classes)
add('magic-item', magicItems)
add('equipment', equipment)
add('feat', feats)
add('background', backgrounds)
add('rule', rules)
add('glossary', glossary)
write('index.json', index)

write('meta.json', {
  source: 'SRD 5.2.1 via Open5e (github.com/open5e/open5e-api, srd-2024 fixtures)',
  license: 'CC-BY-4.0',
  attribution:
    'This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.',
  builtAt: new Date().toISOString(),
  counts: {
    monsters: monsters.length, spells: spells.length, species: species.length, classes: classes.length,
    magicItems: magicItems.length, equipment: equipment.length, rules: rules.length,
    glossary: glossary.length, feats: feats.length, backgrounds: backgrounds.length
  }
})
console.log('\ndone → ' + OUT)
