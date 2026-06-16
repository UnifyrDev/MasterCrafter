<script setup lang="ts">
import { computed } from "vue";
import type { NpcStatblockDto, NpcStatblockFeatureDto } from "@shared/contracts";
import { renderMarkdown } from "@renderer/utils/markdown";

const props = defineProps<{
  entityName: string;
  enabled: boolean;
  statblock: NpcStatblockDto;
}>();

const displayName = computed(() => props.entityName.trim() || "Untitled NPC");

const creatureLine = computed(() => {
  const identity = [props.statblock.size.trim(), props.statblock.creatureType.trim()].filter(Boolean).join(" ");
  const alignment = props.statblock.alignment.trim();

  if (!identity) {
    return alignment;
  }

  return alignment ? `${identity}, ${alignment}` : identity;
});

const abilities = computed(() => [
  { key: "str", label: "STR", score: props.statblock.abilities.str },
  { key: "dex", label: "DEX", score: props.statblock.abilities.dex },
  { key: "con", label: "CON", score: props.statblock.abilities.con },
  { key: "int", label: "INT", score: props.statblock.abilities.int },
  { key: "wis", label: "WIS", score: props.statblock.abilities.wis },
  { key: "cha", label: "CHA", score: props.statblock.abilities.cha },
]);

const traits = computed(() => props.statblock.traits.filter(hasFeature));
const actions = computed(() => props.statblock.actions.filter(hasFeature));
const reactions = computed(() => props.statblock.reactions.filter(hasFeature));
const legendaryActions = computed(() => props.statblock.legendaryActions.filter(hasFeature));

function hasValue(value: string): boolean {
  return value.trim().length > 0;
}

function hasFeature(feature: NpcStatblockFeatureDto): boolean {
  return hasValue(feature.name) || hasValue(feature.text);
}

function abilityModifier(score: number): string {
  const modifier = Math.floor((Number.isFinite(score) ? score : 0) / 2) - 5;
  return modifier >= 0 ? `+${modifier}` : String(modifier);
}

function featureHeading(feature: NpcStatblockFeatureDto, fallback: string): string {
  const name = feature.name.trim();
  return name ? `${name}.` : `${fallback}.`;
}

function renderFeatureText(text: string): string {
  return renderMarkdown(text);
}
</script>

<template>
  <section class="preview-panel">
    <div class="section-header preview-header">
      <div>
        <p class="section-title">Live preview</p>
        <p class="muted">Statblock5e-inspired layout</p>
      </div>
      <span class="chip">{{ enabled ? "Statblock enabled" : "Statblock disabled" }}</span>
    </div>

    <div class="preview-shell">
      <div v-if="enabled" class="preview-paper">
        <stat-block class="statblock-card">
          <creature-heading>
            <h1>{{ displayName }}</h1>
            <h2>{{ creatureLine }}</h2>
          </creature-heading>

          <top-stats>
            <property-line v-if="hasValue(statblock.armorClass)">
              <h4>Armor Class</h4>
              <p>{{ statblock.armorClass }}</p>
            </property-line>
            <property-line v-if="hasValue(statblock.hitPoints)">
              <h4>Hit Points</h4>
              <p>{{ statblock.hitPoints }}</p>
            </property-line>
            <property-line v-if="hasValue(statblock.speed)">
              <h4>Speed</h4>
              <p>{{ statblock.speed }}</p>
            </property-line>

            <abilities-block class="abilities-block">
              <div v-for="ability in abilities" :key="ability.key" class="ability-card">
                <span>{{ ability.label }}</span>
                <strong>{{ ability.score }}</strong>
                <small>{{ abilityModifier(ability.score) }}</small>
              </div>
            </abilities-block>

            <property-line v-if="hasValue(statblock.savingThrows)">
              <h4>Saving Throws</h4>
              <p>{{ statblock.savingThrows }}</p>
            </property-line>
            <property-line v-if="hasValue(statblock.skills)">
              <h4>Skills</h4>
              <p>{{ statblock.skills }}</p>
            </property-line>
            <property-line v-if="hasValue(statblock.damageVulnerabilities)">
              <h4>Damage Vulnerabilities</h4>
              <p>{{ statblock.damageVulnerabilities }}</p>
            </property-line>
            <property-line v-if="hasValue(statblock.damageResistances)">
              <h4>Damage Resistances</h4>
              <p>{{ statblock.damageResistances }}</p>
            </property-line>
            <property-line v-if="hasValue(statblock.damageImmunities)">
              <h4>Damage Immunities</h4>
              <p>{{ statblock.damageImmunities }}</p>
            </property-line>
            <property-line v-if="hasValue(statblock.conditionImmunities)">
              <h4>Condition Immunities</h4>
              <p>{{ statblock.conditionImmunities }}</p>
            </property-line>
            <property-line v-if="hasValue(statblock.senses)">
              <h4>Senses</h4>
              <p>{{ statblock.senses }}</p>
            </property-line>
            <property-line v-if="hasValue(statblock.languages)">
              <h4>Languages</h4>
              <p>{{ statblock.languages }}</p>
            </property-line>
            <property-line v-if="hasValue(statblock.challenge)">
              <h4>Challenge</h4>
              <p>{{ statblock.challenge }}</p>
            </property-line>
          </top-stats>

          <template v-if="traits.length">
            <property-block v-for="feature in traits" :key="`trait-${feature.name}-${feature.text}`">
              <h4>{{ featureHeading(feature, "Trait") }}</h4>
              <div class="feature-body" v-html="renderFeatureText(feature.text)"></div>
            </property-block>
          </template>

          <template v-if="actions.length">
            <h3>Actions</h3>
            <property-block v-for="feature in actions" :key="`action-${feature.name}-${feature.text}`">
              <h4>{{ featureHeading(feature, "Action") }}</h4>
              <div class="feature-body" v-html="renderFeatureText(feature.text)"></div>
            </property-block>
          </template>

          <template v-if="reactions.length">
            <h3>Reactions</h3>
            <property-block v-for="feature in reactions" :key="`reaction-${feature.name}-${feature.text}`">
              <h4>{{ featureHeading(feature, "Reaction") }}</h4>
              <div class="feature-body" v-html="renderFeatureText(feature.text)"></div>
            </property-block>
          </template>

          <template v-if="legendaryActions.length">
            <h3>Legendary Actions</h3>
            <property-block v-for="feature in legendaryActions" :key="`legendary-${feature.name}-${feature.text}`">
              <h4>{{ featureHeading(feature, "Legendary Action") }}</h4>
              <div class="feature-body" v-html="renderFeatureText(feature.text)"></div>
            </property-block>
          </template>

          <p v-if="!traits.length && !actions.length && !reactions.length && !legendaryActions.length" class="statblock-empty muted">
            Add traits or actions to extend this statblock.
          </p>
        </stat-block>
      </div>

      <div v-else class="preview-disabled">
        <div class="preview-disabled-copy">
          <strong>{{ displayName }}</strong>
          <p class="muted">Enable the statblock toggle to render a Monster Manual style preview here.</p>
        </div>
        <div class="preview-disabled-shell">
          <div class="preview-disabled-title">{{ displayName }}</div>
          <div class="preview-disabled-line">{{ creatureLine || "Medium humanoid, unaligned" }}</div>
          <div class="preview-disabled-divider"></div>
          <div class="preview-disabled-note">Statblock disabled</div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.preview-panel {
  display: grid;
  gap: 0.65rem;
}

.preview-shell {
  min-height: 0;
  border-radius: 14px;
  border: 1px solid rgba(164, 132, 72, 0.28);
  background:
    radial-gradient(circle at 12% 0%, rgba(255, 255, 255, 0.6), transparent 24%),
    radial-gradient(circle at 100% 0%, rgba(216, 188, 126, 0.34), transparent 22%),
    linear-gradient(180deg, rgba(245, 228, 191, 0.98), rgba(229, 205, 158, 0.98));
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.28),
    0 20px 44px rgba(0, 0, 0, 0.22);
  overflow: auto;
}

.preview-paper,
.preview-disabled {
  display: grid;
  gap: 0.7rem;
  padding: 0.95rem;
  color: #2d2415;
  font-family: Georgia, "Times New Roman", serif;
}

.preview-disabled {
  min-height: 100%;
  align-content: center;
}

.preview-disabled-copy {
  display: grid;
  gap: 0.15rem;
  color: #3d301b;
}

.preview-disabled-copy strong {
  font-size: 1.05rem;
}

.preview-disabled-shell {
  display: grid;
  gap: 0.3rem;
  padding: 0.85rem 0.95rem 0.95rem;
  border-radius: 12px;
  border: 1px solid rgba(68, 49, 24, 0.18);
  background: rgba(255, 248, 232, 0.7);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.24);
}

.preview-disabled-title {
  font-size: 1.14rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.preview-disabled-line {
  font-size: 0.9rem;
  font-style: italic;
}

.preview-disabled-divider {
  height: 1px;
  background: rgba(68, 49, 24, 0.22);
  margin: 0.18rem 0 0.12rem;
}

.preview-disabled-note {
  color: #61491f;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.statblock-card {
  display: grid;
  gap: 0.55rem;
}

creature-heading {
  display: grid;
  gap: 0.12rem;
  padding-bottom: 0.34rem;
  border-bottom: 3px solid rgba(68, 49, 24, 0.62);
}

creature-heading h1 {
  margin: 0;
  color: #1f170d;
  font-size: 1.58rem;
  font-weight: 700;
  line-height: 1;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

creature-heading h2 {
  margin: 0;
  color: #5d4723;
  font-size: 0.92rem;
  font-weight: 700;
  font-style: italic;
}

top-stats {
  display: grid;
  gap: 0.45rem;
}

property-line {
  display: grid;
  gap: 0.08rem;
}

property-line h4,
property-block h4,
.statblock-empty {
  margin: 0;
}

property-line h4 {
  color: #2f2414;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

property-line p,
property-block p {
  margin: 0;
  color: #3a2f20;
  font-size: 0.92rem;
  line-height: 1.42;
  white-space: pre-line;
}

abilities-block {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 0.35rem;
  padding: 0.4rem 0;
  margin: 0.1rem 0 0.2rem;
}

.ability-card {
  display: grid;
  justify-items: center;
  gap: 0.1rem;
  padding: 0.45rem 0.15rem 0.35rem;
  border-radius: 9px;
  border: 1px solid rgba(68, 49, 24, 0.16);
  background: rgba(255, 248, 232, 0.58);
  text-align: center;
}

.ability-card span {
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.09em;
}

.ability-card strong {
  font-size: 1.18rem;
  line-height: 1;
}

.ability-card small {
  font-size: 0.72rem;
  color: #5d4723;
}

property-block {
  display: grid;
  gap: 0.1rem;
  padding-top: 0.16rem;
}

property-block h4 {
  color: #2e2112;
  font-size: 0.9rem;
  font-weight: 700;
  font-style: italic;
}

h3 {
  margin: 0.25rem 0 0.05rem;
  color: #2a1e10;
  font-size: 1rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
}

.statblock-empty {
  padding-top: 0.25rem;
  color: #5b4727;
  font-style: italic;
}

.feature-body {
  line-height: 1.5;
}

.feature-body :deep(p) {
  margin: 0;
}

.feature-body :deep(p + p) {
  margin-top: 0.35rem;
}

.feature-body :deep(ul),
.feature-body :deep(ol) {
  margin: 0.2rem 0 0.2rem 1.15rem;
  padding-left: 1rem;
}

.feature-body :deep(li + li) {
  margin-top: 0.12rem;
}

.feature-body :deep(code) {
  font-family: "Cascadia Code", "SFMono-Regular", Consolas, monospace;
  font-size: 0.9em;
}

@media (max-width: 960px) {
  abilities-block {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  abilities-block {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
