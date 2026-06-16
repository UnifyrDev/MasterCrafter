import type {
  NpcStatblockAbilityScoresDto,
  NpcStatblockDto,
  NpcStatblockFeatureDto,
} from "@shared/contracts";

const DEFAULT_ABILITIES: NpcStatblockAbilityScoresDto = {
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10,
};

function normalizeText(value: string): string {
  return value.trim();
}

function normalizeScore(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function cloneFeature(feature: NpcStatblockFeatureDto): NpcStatblockFeatureDto {
  return {
    name: feature.name,
    text: feature.text,
  };
}

function normalizeFeature(feature: NpcStatblockFeatureDto): NpcStatblockFeatureDto | null {
  const name = normalizeText(feature.name);
  const text = normalizeText(feature.text);

  if (!name && !text) {
    return null;
  }

  return {
    name,
    text,
  };
}

function normalizeFeatures(features: NpcStatblockFeatureDto[]): NpcStatblockFeatureDto[] {
  return features
    .map((feature) => normalizeFeature(feature))
    .filter((feature): feature is NpcStatblockFeatureDto => feature !== null);
}

function collectFeatureText(features: NpcStatblockFeatureDto[]): string[] {
  return features.flatMap((feature) => [feature.name, feature.text].map((part) => part.trim()).filter(Boolean));
}

export function createNpcStatblockFeature(name = "", text = ""): NpcStatblockFeatureDto {
  return {
    name,
    text,
  };
}

export function createDefaultNpcStatblock(): NpcStatblockDto {
  return {
    size: "Medium",
    creatureType: "humanoid",
    alignment: "unaligned",
    armorClass: "10",
    hitPoints: "1 (1d8)",
    speed: "30 ft.",
    abilities: { ...DEFAULT_ABILITIES },
    savingThrows: "",
    skills: "",
    damageVulnerabilities: "",
    damageResistances: "",
    damageImmunities: "",
    conditionImmunities: "",
    senses: "",
    languages: "",
    challenge: "0 (10 XP)",
    traits: [],
    actions: [],
    reactions: [],
    legendaryActions: [],
  };
}

export function cloneNpcStatblock(statblock: NpcStatblockDto | null | undefined): NpcStatblockDto | null {
  if (!statblock) {
    return null;
  }

  return {
    size: statblock.size,
    creatureType: statblock.creatureType,
    alignment: statblock.alignment,
    armorClass: statblock.armorClass,
    hitPoints: statblock.hitPoints,
    speed: statblock.speed,
    abilities: { ...statblock.abilities },
    savingThrows: statblock.savingThrows,
    skills: statblock.skills,
    damageVulnerabilities: statblock.damageVulnerabilities,
    damageResistances: statblock.damageResistances,
    damageImmunities: statblock.damageImmunities,
    conditionImmunities: statblock.conditionImmunities,
    senses: statblock.senses,
    languages: statblock.languages,
    challenge: statblock.challenge,
    traits: statblock.traits.map((feature) => cloneFeature(feature)),
    actions: statblock.actions.map((feature) => cloneFeature(feature)),
    reactions: statblock.reactions.map((feature) => cloneFeature(feature)),
    legendaryActions: statblock.legendaryActions.map((feature) => cloneFeature(feature)),
  };
}

export function normalizeNpcStatblock(statblock: NpcStatblockDto): NpcStatblockDto {
  return {
    size: normalizeText(statblock.size),
    creatureType: normalizeText(statblock.creatureType),
    alignment: normalizeText(statblock.alignment),
    armorClass: normalizeText(statblock.armorClass),
    hitPoints: normalizeText(statblock.hitPoints),
    speed: normalizeText(statblock.speed),
    abilities: {
      str: normalizeScore(statblock.abilities.str),
      dex: normalizeScore(statblock.abilities.dex),
      con: normalizeScore(statblock.abilities.con),
      int: normalizeScore(statblock.abilities.int),
      wis: normalizeScore(statblock.abilities.wis),
      cha: normalizeScore(statblock.abilities.cha),
    },
    savingThrows: normalizeText(statblock.savingThrows),
    skills: normalizeText(statblock.skills),
    damageVulnerabilities: normalizeText(statblock.damageVulnerabilities),
    damageResistances: normalizeText(statblock.damageResistances),
    damageImmunities: normalizeText(statblock.damageImmunities),
    conditionImmunities: normalizeText(statblock.conditionImmunities),
    senses: normalizeText(statblock.senses),
    languages: normalizeText(statblock.languages),
    challenge: normalizeText(statblock.challenge),
    traits: normalizeFeatures(statblock.traits),
    actions: normalizeFeatures(statblock.actions),
    reactions: normalizeFeatures(statblock.reactions),
    legendaryActions: normalizeFeatures(statblock.legendaryActions),
  };
}

export function npcStatblockSearchText(statblock: NpcStatblockDto | null | undefined): string {
  if (!statblock) {
    return "";
  }

  return [
    statblock.size,
    statblock.creatureType,
    statblock.alignment,
    statblock.armorClass,
    statblock.hitPoints,
    statblock.speed,
    String(statblock.abilities.str),
    String(statblock.abilities.dex),
    String(statblock.abilities.con),
    String(statblock.abilities.int),
    String(statblock.abilities.wis),
    String(statblock.abilities.cha),
    statblock.savingThrows,
    statblock.skills,
    statblock.damageVulnerabilities,
    statblock.damageResistances,
    statblock.damageImmunities,
    statblock.conditionImmunities,
    statblock.senses,
    statblock.languages,
    statblock.challenge,
    ...collectFeatureText(statblock.traits),
    ...collectFeatureText(statblock.actions),
    ...collectFeatureText(statblock.reactions),
    ...collectFeatureText(statblock.legendaryActions),
  ]
    .map((value) => value.trim())
    .filter(Boolean)
    .join("\n");
}
