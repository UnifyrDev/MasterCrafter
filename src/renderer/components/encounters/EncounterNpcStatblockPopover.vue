<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { EntityDto, EncounterCombatantTeam, EncounterNpcLibraryEntryDto, NpcStatblockFeatureDto } from "@shared/contracts";
import { formatCombatantTeamLabel } from "@renderer/components/encounters/encounterDrafts";
import { renderMarkdown } from "@renderer/utils/markdown";

const props = defineProps<{
  visible: boolean;
  x: number;
  y: number;
  npc: EncounterNpcLibraryEntryDto | null;
  entity: EntityDto | null;
  team: EncounterCombatantTeam | null;
}>();

const fallbackViewport = { width: 1280, height: 800 };
const viewport = ref(readViewport());
const popoverRef = ref<HTMLElement | null>(null);
const wheelListenerOptions: AddEventListenerOptions = { capture: true, passive: false };

const statblock = computed(() => props.entity?.npcStatblock ?? null);

const displayName = computed(() => props.npc?.name.trim() || props.entity?.title.trim() || "Untitled NPC");

const teamLabel = computed(() => formatCombatantTeamLabel(props.team ?? props.npc?.team ?? "neutral"));

const sourceLabel = computed(() => {
  if (props.entity) {
    return props.entity.title.trim() || "Linked entity";
  }

  if (props.npc?.sourceEntityId) {
    return "Linked entity unavailable";
  }

  return "Library entry";
});

const creatureLine = computed(() => {
  const block = statblock.value;
  if (!block) {
    return "";
  }

  const identity = [block.size.trim(), block.creatureType.trim()].filter(Boolean).join(" ");
  const alignment = block.alignment.trim();

  if (!identity) {
    return alignment;
  }

  return alignment ? `${identity}, ${alignment}` : identity;
});

const summaryMetrics = computed(() => [
  {
    label: "AC",
    value: statblock.value?.armorClass.trim() || (props.npc ? String(props.npc.armorClass) : "—"),
  },
  {
    label: "HP",
    value: statblock.value?.hitPoints.trim() || (props.npc ? String(props.npc.hitPoints) : "—"),
  },
  {
    label: "Speed",
    value: statblock.value?.speed.trim() || (props.npc?.speed.trim() || "—"),
  },
  {
    label: "Challenge",
    value: statblock.value?.challenge.trim() || (props.npc?.challengeRating.trim() || "—"),
  },
  {
    label: "Initiative",
    value: props.npc ? formatSignedNumber(props.npc.initiativeBonus) : "—",
  },
]);

const abilityRows = computed(() => {
  const block = statblock.value;
  if (!block) {
    return [];
  }

  return [
    { key: "str", label: "STR", score: block.abilities.str },
    { key: "dex", label: "DEX", score: block.abilities.dex },
    { key: "con", label: "CON", score: block.abilities.con },
    { key: "int", label: "INT", score: block.abilities.int },
    { key: "wis", label: "WIS", score: block.abilities.wis },
    { key: "cha", label: "CHA", score: block.abilities.cha },
  ];
});

const propertyRows = computed(() => {
  const block = statblock.value;
  if (!block) {
    return [];
  }

  return [
    { label: "Saving Throws", value: block.savingThrows },
    { label: "Skills", value: block.skills },
    { label: "Damage Vulnerabilities", value: block.damageVulnerabilities },
    { label: "Damage Resistances", value: block.damageResistances },
    { label: "Damage Immunities", value: block.damageImmunities },
    { label: "Condition Immunities", value: block.conditionImmunities },
    { label: "Senses", value: block.senses },
    { label: "Languages", value: block.languages },
  ].filter((row) => hasValue(row.value));
});

const traits = computed(() => statblock.value?.traits.filter(hasFeature) ?? []);
const actions = computed(() => statblock.value?.actions.filter(hasFeature) ?? []);
const reactions = computed(() => statblock.value?.reactions.filter(hasFeature) ?? []);
const legendaryActions = computed(() => statblock.value?.legendaryActions.filter(hasFeature) ?? []);

const popoverStyle = computed(() => {
  if (!props.visible || !props.npc) {
    return {};
  }

  const offset = 18;
  const padding = 12;
  const estimatedWidth = Math.min(448, Math.max(320, viewport.value.width - padding * 2));
  const estimatedHeight = 560;
  const canFitRight = props.x + offset + estimatedWidth <= viewport.value.width - padding;
  const canFitBelow = props.y + offset + estimatedHeight <= viewport.value.height - padding;

  let left = canFitRight ? props.x + offset : props.x - estimatedWidth - offset;
  let top = canFitBelow ? props.y + offset : props.y - estimatedHeight - offset;

  left = Math.max(padding, Math.min(left, viewport.value.width - estimatedWidth - padding));
  top = Math.max(padding, Math.min(top, viewport.value.height - estimatedHeight - padding));

  return {
    left: `${left}px`,
    top: `${top}px`,
  };
});

const tipStyle = computed(() => popoverStyle.value);

function readViewport(): { width: number; height: number } {
  if (typeof window === "undefined") {
    return fallbackViewport;
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function updateViewport(): void {
  viewport.value = readViewport();
}

function hasValue(value: string): boolean {
  return value.trim().length > 0;
}

function hasFeature(feature: NpcStatblockFeatureDto): boolean {
  return hasValue(feature.name) || hasValue(feature.text);
}

function formatSignedNumber(value: number): string {
  const normalized = Math.floor(value);
  return `${normalized >= 0 ? "+" : ""}${normalized}`;
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

function handleWindowWheel(event: WheelEvent): void {
  if (!props.visible || !props.npc || !event.ctrlKey) {
    return;
  }

  const popover = popoverRef.value;
  if (!popover || popover.scrollHeight <= popover.clientHeight) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const nextScrollTop = Math.max(0, Math.min(popover.scrollTop + event.deltaY, popover.scrollHeight - popover.clientHeight));
  popover.scrollTop = nextScrollTop;
}

onMounted(() => {
  updateViewport();
  window.addEventListener("resize", updateViewport);
  window.addEventListener("wheel", handleWindowWheel, wheelListenerOptions);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateViewport);
  window.removeEventListener("wheel", handleWindowWheel, wheelListenerOptions);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="npc-hover-popover">
      <div v-if="visible && npc">
        <div class="npc-hover-tip" :style="tipStyle">
          Tip: Hold Ctrl and scroll to move through the statblock.
        </div>

        <section
          ref="popoverRef"
          class="glass-panel npc-hover-popover"
          :style="popoverStyle"
          role="tooltip"
          aria-hidden="true"
        >
          <div class="npc-hover-header">
            <div class="npc-hover-title">
              <p class="section-title">NPC Preview</p>
              <strong>{{ displayName }}</strong>
              <span class="muted">{{ sourceLabel }}</span>
              <span v-if="creatureLine" class="npc-hover-creature-line">{{ creatureLine }}</span>
            </div>

            <div class="npc-hover-meta">
              <span class="chip">{{ teamLabel }}</span>
              <span class="chip">AC {{ npc.armorClass }}</span>
              <span class="chip">HP {{ npc.hitPoints }}</span>
            </div>
          </div>

          <div class="npc-hover-summary-grid">
            <article v-for="metric in summaryMetrics" :key="metric.label" class="npc-hover-summary-card">
              <span>{{ metric.label }}</span>
              <strong>{{ metric.value }}</strong>
            </article>
          </div>

          <template v-if="statblock">
            <div class="npc-hover-abilities">
              <article v-for="ability in abilityRows" :key="ability.key" class="npc-hover-ability-card">
                <span>{{ ability.label }}</span>
                <strong>{{ ability.score }}</strong>
                <em>{{ abilityModifier(ability.score) }}</em>
              </article>
            </div>

            <div class="npc-hover-properties">
              <article v-for="row in propertyRows" :key="row.label" class="npc-hover-property-row">
                <span>{{ row.label }}</span>
                <strong>{{ row.value }}</strong>
              </article>
            </div>

            <template v-if="traits.length">
              <section class="npc-hover-section">
                <p class="section-title">Traits</p>
                <article v-for="(feature, index) in traits" :key="`trait-${index}-${feature.name}-${feature.text}`" class="npc-hover-feature">
                  <h4>{{ featureHeading(feature, "Trait") }}</h4>
                  <div class="feature-body" v-html="renderFeatureText(feature.text)"></div>
                </article>
              </section>
            </template>

            <template v-if="actions.length">
              <section class="npc-hover-section">
                <p class="section-title">Actions</p>
                <article v-for="(feature, index) in actions" :key="`action-${index}-${feature.name}-${feature.text}`" class="npc-hover-feature">
                  <h4>{{ featureHeading(feature, "Action") }}</h4>
                  <div class="feature-body" v-html="renderFeatureText(feature.text)"></div>
                </article>
              </section>
            </template>

            <template v-if="reactions.length">
              <section class="npc-hover-section">
                <p class="section-title">Reactions</p>
                <article v-for="(feature, index) in reactions" :key="`reaction-${index}-${feature.name}-${feature.text}`" class="npc-hover-feature">
                  <h4>{{ featureHeading(feature, "Reaction") }}</h4>
                  <div class="feature-body" v-html="renderFeatureText(feature.text)"></div>
                </article>
              </section>
            </template>

            <template v-if="legendaryActions.length">
              <section class="npc-hover-section">
                <p class="section-title">Legendary Actions</p>
                <article
                  v-for="(feature, index) in legendaryActions"
                  :key="`legendary-${index}-${feature.name}-${feature.text}`"
                  class="npc-hover-feature"
                >
                  <h4>{{ featureHeading(feature, "Legendary Action") }}</h4>
                  <div class="feature-body" v-html="renderFeatureText(feature.text)"></div>
                </article>
              </section>
            </template>

            <template v-if="hasValue(npc.notes)">
              <section class="npc-hover-section">
                <p class="section-title">Notes</p>
                <div class="npc-hover-notes feature-body" v-html="renderMarkdown(npc.notes)"></div>
              </section>
            </template>
          </template>

          <template v-else>
            <div class="npc-hover-empty">
              <span class="muted">No linked statblock found for this NPC yet.</span>
              <p v-if="hasValue(npc.notes)" class="npc-hover-notes-label">Notes</p>
              <div v-if="hasValue(npc.notes)" class="npc-hover-notes feature-body" v-html="renderMarkdown(npc.notes)"></div>
            </div>
          </template>

          <div v-if="npc.tags.length" class="npc-hover-tags">
            <span v-for="tag in npc.tags" :key="tag" class="chip">{{ tag }}</span>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.npc-hover-popover {
  position: fixed;
  z-index: 420;
  width: min(28rem, calc(100vw - 1.5rem));
  max-height: min(42rem, calc(100vh - 1.5rem));
  overflow: auto;
  padding: 0.85rem;
  display: grid;
  gap: 0.7rem;
  pointer-events: none;
  overscroll-behavior: contain;
  border-color: rgba(119, 200, 255, 0.22);
  background:
    radial-gradient(circle at 100% 0%, rgba(64, 177, 255, 0.16), transparent 34%),
    radial-gradient(circle at 0% 0%, rgba(111, 244, 201, 0.1), transparent 28%),
    linear-gradient(180deg, rgba(20, 30, 44, 0.98), rgba(11, 16, 24, 0.98));
  box-shadow:
    0 24px 70px rgba(0, 0, 0, 0.52),
    0 0 0 1px rgba(119, 200, 255, 0.08),
    0 0 48px rgba(64, 177, 255, 0.08);
}

.npc-hover-tip {
  position: fixed;
  z-index: 421;
  display: inline-flex;
  align-items: center;
  width: fit-content;
  max-width: 100%;
  padding: 0.22rem 0.48rem;
  border-radius: 999px;
  border: 1px solid rgba(119, 200, 255, 0.14);
  background: rgba(64, 177, 255, 0.08);
  color: var(--fg-muted);
  font-size: 0.66rem;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  line-height: 1.2;
  pointer-events: none;
  transform: translateY(calc(-100% - 0.35rem));
}

.npc-hover-popover::-webkit-scrollbar {
  width: 0.55rem;
}

.npc-hover-popover::-webkit-scrollbar-thumb {
  background: rgba(119, 200, 255, 0.18);
  border-radius: 999px;
}

.npc-hover-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.npc-hover-title {
  min-width: 0;
  display: grid;
  gap: 0.1rem;
}

.npc-hover-title strong {
  font-size: 1.05rem;
}

.npc-hover-title .muted,
.npc-hover-creature-line {
  color: var(--fg-muted);
  font-size: 0.78rem;
  line-height: 1.35;
}

.npc-hover-creature-line {
  font-style: italic;
}

.npc-hover-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.08rem;
}

.npc-hover-summary-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.08rem;
}

.npc-hover-summary-card,
.npc-hover-ability-card,
.npc-hover-property-row {
  display: grid;
  gap: 0.05rem;
  padding: 0.28rem 0.34rem;
  border-radius: var(--radius-md);
  border: 1px solid rgba(119, 200, 255, 0.12);
  background: rgba(12, 18, 28, 0.62);
}

.npc-hover-summary-card span,
.npc-hover-ability-card span,
.npc-hover-property-row span {
  color: var(--fg-muted);
  font-size: 0.68rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.npc-hover-summary-card strong,
.npc-hover-ability-card strong,
.npc-hover-property-row strong {
  font-size: 0.82rem;
  line-height: 1.3;
  word-break: break-word;
}

.npc-hover-ability-card {
  justify-items: center;
  text-align: center;
  gap: 0.08rem;
}

.npc-hover-ability-card em {
  color: var(--accent);
  font-style: normal;
  font-size: 0.68rem;
}

.npc-hover-abilities {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 0.08rem;
}

.npc-hover-properties {
  display: grid;
  gap: 0.08rem;
}

.npc-hover-section {
  display: grid;
  gap: 0.16rem;
}

.npc-hover-feature {
  display: grid;
  gap: 0.08rem;
  padding: 0.28rem 0.34rem;
  border-radius: var(--radius-md);
  border: 1px solid rgba(119, 200, 255, 0.1);
  background: rgba(8, 14, 22, 0.56);
}

.npc-hover-feature h4 {
  margin: 0;
  font-size: 0.8rem;
}

.feature-body {
  color: var(--fg);
  font-size: 0.76rem;
  line-height: 1.45;
}

.feature-body :deep(p) {
  margin: 0 0 0.3rem;
}

.feature-body :deep(p:last-child) {
  margin-bottom: 0;
}

.feature-body :deep(ul),
.feature-body :deep(ol) {
  margin: 0.22rem 0 0.3rem 1rem;
  padding: 0;
}

.feature-body :deep(li + li) {
  margin-top: 0.15rem;
}

.feature-body :deep(code) {
  padding: 0.04rem 0.25rem;
  border-radius: 0.24rem;
  background: rgba(119, 200, 255, 0.12);
  color: #d9f0ff;
}

.feature-body :deep(strong) {
  color: #eef8ff;
}

.feature-body :deep(a) {
  color: var(--accent);
}

.npc-hover-empty {
  display: grid;
  gap: 0.16rem;
  padding: 0.3rem 0;
}

.npc-hover-notes-label {
  margin: 0;
  font-size: 0.68rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--fg-muted);
}

.npc-hover-notes {
  padding: 0.34rem;
  border-radius: var(--radius-md);
  border: 1px solid rgba(119, 200, 255, 0.1);
  background: rgba(8, 14, 22, 0.56);
}

.npc-hover-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.08rem;
}

.npc-hover-popover-enter-active,
.npc-hover-popover-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.npc-hover-popover-enter-from,
.npc-hover-popover-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.985);
}

@media (max-width: 840px) {
  .npc-hover-popover {
    width: min(24rem, calc(100vw - 1rem));
    padding: 0.75rem;
  }

  .npc-hover-summary-grid,
  .npc-hover-abilities {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
