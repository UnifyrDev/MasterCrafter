import type { EncounterCombatantTeam } from "@shared/contracts";

export type EncounterDifficultyLabel = "trivial" | "easy" | "medium" | "hard" | "deadly" | "unknown";

export interface EncounterThreatParticipant {
  team: EncounterCombatantTeam;
  quantity: number;
  level: number | null;
  challengeRating: string;
}

export interface EncounterDifficultySummary {
  partySize: number;
  partyBudget: number;
  enemyUnits: number;
  enemyBaseThreat: number;
  enemyAdjustedThreat: number;
  difficulty: EncounterDifficultyLabel;
  threatRatio: number;
}

const CHALLENGE_RATING_XP: Record<string, number> = {
  "0": 10,
  "1/8": 25,
  "1/4": 50,
  "1/2": 100,
  "1": 200,
  "2": 450,
  "3": 700,
  "4": 1100,
  "5": 1800,
  "6": 2300,
  "7": 2900,
  "8": 3900,
  "9": 5000,
  "10": 5900,
  "11": 7200,
  "12": 8400,
  "13": 10000,
  "14": 11500,
  "15": 13000,
  "16": 15000,
  "17": 18000,
  "18": 20000,
  "19": 22000,
  "20": 25000,
  "21": 33000,
  "22": 41000,
  "23": 50000,
  "24": 62000,
  "25": 75000,
  "26": 90000,
  "27": 105000,
  "28": 120000,
  "29": 135000,
  "30": 155000,
};

function normalizeQuantity(quantity: number): number {
  return Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1;
}

function parseFraction(value: string): number | null {
  const [numeratorRaw, denominatorRaw] = value.split("/", 2);
  const numerator = Number.parseInt(numeratorRaw, 10);
  const denominator = Number.parseInt(denominatorRaw, 10);

  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }

  return numerator / denominator;
}

export function parseChallengeRating(challengeRating: string): number | null {
  const value = challengeRating.trim();
  if (!value) {
    return null;
  }

  const xpMatch = value.match(/\((\d+)\s*XP\)/i);
  if (xpMatch) {
    return Number.parseInt(xpMatch[1], 10);
  }

  const crKey = value.split(/\s+/)[0].trim();
  const tableHit = CHALLENGE_RATING_XP[crKey];
  if (tableHit !== undefined) {
    return tableHit;
  }

  if (crKey.includes("/")) {
    const fraction = parseFraction(crKey);
    if (fraction !== null) {
      const fractionalKey = Object.entries(CHALLENGE_RATING_XP).find(([key]) => {
        if (!key.includes("/")) {
          return false;
        }

        return parseFraction(key) === fraction;
      });

      if (fractionalKey) {
        return CHALLENGE_RATING_XP[fractionalKey[0]];
      }

      return Math.max(1, Math.round(fraction * 100));
    }
  }

  const numeric = Number.parseFloat(crKey);
  if (Number.isFinite(numeric)) {
    const exactKey = Object.entries(CHALLENGE_RATING_XP).find(([key]) => Number.parseFloat(key) === numeric);
    if (exactKey) {
      return CHALLENGE_RATING_XP[exactKey[0]];
    }

    return Math.max(1, Math.round(numeric * 100));
  }

  return null;
}

export function calculateEncounterMultiplier(enemyUnits: number): number {
  const units = Math.max(1, Math.floor(enemyUnits));

  if (units === 1) {
    return 1;
  }

  if (units === 2) {
    return 1.5;
  }

  if (units <= 6) {
    return 2;
  }

  if (units <= 10) {
    return 2.5;
  }

  if (units <= 14) {
    return 3;
  }

  return 4;
}

export function calculatePartyBudget(participants: EncounterThreatParticipant[]): { partySize: number; partyBudget: number } {
  const relevant = participants.filter((participant) => participant.team === "party");
  const partySize = relevant.reduce((sum, participant) => sum + normalizeQuantity(participant.quantity), 0);
  const partyBudget = relevant.reduce((sum, participant) => {
    const level = Number.isFinite(participant.level ?? Number.NaN) ? Math.max(0, Math.floor(participant.level ?? 0)) : 0;
    return sum + (level * 100 * normalizeQuantity(participant.quantity));
  }, 0);

  return {
    partySize,
    partyBudget,
  };
}

export function calculateEnemyThreat(participants: EncounterThreatParticipant[]): { enemyUnits: number; enemyBaseThreat: number; enemyAdjustedThreat: number } {
  const relevant = participants.filter((participant) => participant.team === "enemy");
  const enemyUnits = relevant.reduce((sum, participant) => sum + normalizeQuantity(participant.quantity), 0);
  const enemyBaseThreat = relevant.reduce((sum, participant) => {
    const xp = parseChallengeRating(participant.challengeRating) ?? 0;
    return sum + (xp * normalizeQuantity(participant.quantity));
  }, 0);
  const enemyAdjustedThreat = Math.round(enemyBaseThreat * calculateEncounterMultiplier(enemyUnits));

  return {
    enemyUnits,
    enemyBaseThreat,
    enemyAdjustedThreat,
  };
}

export function calculateEncounterDifficulty(participants: EncounterThreatParticipant[]): EncounterDifficultySummary {
  const { partySize, partyBudget } = calculatePartyBudget(participants);
  const { enemyUnits, enemyBaseThreat, enemyAdjustedThreat } = calculateEnemyThreat(participants);

  if (partyBudget <= 0 || enemyAdjustedThreat <= 0) {
    return {
      partySize,
      partyBudget,
      enemyUnits,
      enemyBaseThreat,
      enemyAdjustedThreat,
      difficulty: "unknown",
      threatRatio: 0,
    };
  }

  const threatRatio = enemyAdjustedThreat / partyBudget;
  let difficulty: EncounterDifficultyLabel = "deadly";

  if (threatRatio < 0.5) {
    difficulty = "trivial";
  } else if (threatRatio < 0.85) {
    difficulty = "easy";
  } else if (threatRatio < 1.15) {
    difficulty = "medium";
  } else if (threatRatio < 1.5) {
    difficulty = "hard";
  }

  return {
    partySize,
    partyBudget,
    enemyUnits,
    enemyBaseThreat,
    enemyAdjustedThreat,
    difficulty,
    threatRatio,
  };
}

export function formatEncounterDifficulty(value: EncounterDifficultyLabel): string {
  switch (value) {
    case "trivial":
      return "Trivial";
    case "easy":
      return "Easy";
    case "medium":
      return "Medium";
    case "hard":
      return "Hard";
    case "deadly":
      return "Deadly";
    default:
      return "Unknown";
  }
}
