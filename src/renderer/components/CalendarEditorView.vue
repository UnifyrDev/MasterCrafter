<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, watch } from "vue";
import type { CalendarMonthDefinitionDto, CampaignCalendarDto } from "@shared/contracts";
import { useMasterCrafter } from "@renderer/composables/useMasterCrafter";
import { cloneCalendar, createCalendarMonth, getCalendarCycleLabel, normalizeCalendarCycleLabel } from "@renderer/utils/calendar";
import { hotkeyDispatcherService } from "@renderer/services/hotkeys";

type CalendarCycleKind = NonNullable<CampaignCalendarDto["cycleLabel"]>;

const store = useMasterCrafter();
const state = store.state;

const calendarDraft = reactive({
  name: "",
  epochLabel: "",
  months: [] as CalendarMonthDefinitionDto[],
  weekdays: [] as string[],
  hoursPerDay: 24,
  minutesPerHour: 60,
  timezoneLabel: "",
  cycleLabel: "months" as CalendarCycleKind,
});

const snapshot = computed(() => state.value.snapshot);
const totalCycleDays = computed(() => calendarDraft.months.reduce((sum, month) => sum + Math.max(1, Math.floor(Number.isFinite(month.days) ? month.days : 1)), 0));
const cycleLabelSingular = computed(() => getCalendarCycleLabel(calendarDraft, false));
const cycleLabelPlural = computed(() => getCalendarCycleLabel(calendarDraft, true));
const isSeasonsMode = computed(() => calendarDraft.cycleLabel === "seasons");
let unregisterHotkeys: (() => void) | null = null;

watch(
  () => snapshot.value?.calendar,
  (calendar) => {
    if (!calendar) {
      return;
    }

    Object.assign(calendarDraft, cloneCalendar(calendar));
  },
  { immediate: true },
);

function toggleCycleLabel(): void {
  calendarDraft.cycleLabel = isSeasonsMode.value ? "months" : "seasons";
}

function addCycleEntry(): void {
  calendarDraft.months = [...calendarDraft.months, createCalendarMonth(`Untitled ${cycleLabelSingular.value}`, 30)];
}

function removeCycleEntry(index: number): void {
  if (calendarDraft.months.length <= 1) {
    return;
  }

  calendarDraft.months = calendarDraft.months.filter((_, currentIndex) => currentIndex !== index);
}

function addWeekday(): void {
  calendarDraft.weekdays = [...calendarDraft.weekdays, `Weekday ${calendarDraft.weekdays.length + 1}`];
}

function removeWeekday(index: number): void {
  calendarDraft.weekdays = calendarDraft.weekdays.filter((_, currentIndex) => currentIndex !== index);
}

function sanitizeCycleEntryName(name: string, index: number): string {
  const trimmed = name.trim();
  return trimmed || `${cycleLabelSingular.value} ${index + 1}`;
}

function sanitizeWeekdayName(name: string, index: number): string {
  const trimmed = name.trim();
  return trimmed || `Weekday ${index + 1}`;
}

async function saveCalendar(): Promise<void> {
  const workspace = snapshot.value?.workspace;
  if (!workspace) {
    return;
  }

  const months = calendarDraft.months.length > 0 ? calendarDraft.months : [createCalendarMonth(`Untitled ${cycleLabelSingular.value}`, 30)];

  await store.saveCalendar({
    name: calendarDraft.name.trim() || "Campaign Calendar",
    epochLabel: calendarDraft.epochLabel.trim() || "Year 1, First Dawn",
    months: months.map((month, index) => ({
      name: sanitizeCycleEntryName(month.name, index),
      days: Math.max(1, Math.floor(Number.isFinite(month.days) ? month.days : 1)),
    })),
    weekdays: calendarDraft.weekdays.map((weekday, index) => sanitizeWeekdayName(weekday, index)),
    hoursPerDay: Math.max(1, Math.floor(Number.isFinite(calendarDraft.hoursPerDay) ? calendarDraft.hoursPerDay : 1)),
    minutesPerHour: Math.max(1, Math.floor(Number.isFinite(calendarDraft.minutesPerHour) ? calendarDraft.minutesPerHour : 1)),
    timezoneLabel: calendarDraft.timezoneLabel.trim() || "Realm Standard Time",
    cycleLabel: normalizeCalendarCycleLabel(calendarDraft.cycleLabel),
  });
}

function registerHotkeys(): void {
  unregisterHotkeys?.();
  unregisterHotkeys = hotkeyDispatcherService.registerScope({
    scopeId: "calendar-editor",
    scopeType: "view",
    contextId: "calendar",
    handlers: {
      "calendar.toggleCycleLabel": () => toggleCycleLabel(),
      "calendar.addWeekday": () => addWeekday(),
      "calendar.removeWeekday": () => {
        if (calendarDraft.weekdays.length > 0) {
          removeWeekday(calendarDraft.weekdays.length - 1);
        }
      },
      "calendar.addCycleEntry": () => addCycleEntry(),
      "calendar.removeCycleEntry": () => {
        if (calendarDraft.months.length > 1) {
          removeCycleEntry(calendarDraft.months.length - 1);
        }
      },
      "calendar.saveCalendar": () => void saveCalendar(),
    },
  });
}

onMounted(() => {
  registerHotkeys();
});

onBeforeUnmount(() => {
  unregisterHotkeys?.();
  unregisterHotkeys = null;
});
</script>

<template>
  <section class="calendar-layout">
    <div class="calendar-workspace glass-panel scroll-shell">
      <div class="calendar-header">
        <div class="calendar-copy">
          <p class="section-title">Campaign calendar</p>
          <h2>Months, seasons, and settings</h2>
          <p class="muted">Edit the cycle entries, weekdays, and timing rules used by the timeline.</p>
        </div>

        <div class="calendar-actions">
          <button type="button" class="board-action alt" @click="toggleCycleLabel()">
            {{ isSeasonsMode ? "Use Months" : "Use Seasons" }}
          </button>
          <button type="button" class="board-action" @click="saveCalendar()">Save Calendar</button>
        </div>
      </div>

      <div class="calendar-summary">
        <span class="chip">{{ calendarDraft.months.length }} {{ cycleLabelPlural }}</span>
        <span class="chip">{{ totalCycleDays }} days per year</span>
        <span class="chip">{{ calendarDraft.weekdays.length }} weekdays</span>
        <span class="chip">{{ calendarDraft.hoursPerDay }}h days</span>
        <span class="chip">{{ calendarDraft.minutesPerHour }}m hours</span>
      </div>

      <div class="calendar-grid">
        <section class="calendar-card settings-card">
          <div class="card-header">
            <div>
              <p class="section-title">Calendar settings</p>
              <strong>Core timing rules</strong>
            </div>
          </div>

          <div class="settings-grid">
            <label>
              <span class="field-label">Calendar Name</span>
              <input v-model="calendarDraft.name" type="text" />
            </label>

            <label>
              <span class="field-label">Epoch Label</span>
              <input v-model="calendarDraft.epochLabel" type="text" />
            </label>

            <label>
              <span class="field-label">Timezone Label</span>
              <input v-model="calendarDraft.timezoneLabel" type="text" />
            </label>

            <label>
              <span class="field-label">Hours Per Day</span>
              <input v-model.number="calendarDraft.hoursPerDay" type="number" min="1" />
            </label>

            <label>
              <span class="field-label">Minutes Per Hour</span>
              <input v-model.number="calendarDraft.minutesPerHour" type="number" min="1" />
            </label>
          </div>

          <div class="card-header compact">
            <div>
              <p class="section-title">Weekdays</p>
              <strong>{{ calendarDraft.weekdays.length }} configured</strong>
            </div>
            <button type="button" @click="addWeekday()">Add Weekday</button>
          </div>

          <div class="weekday-list">
            <div v-for="(weekday, index) in calendarDraft.weekdays" :key="`weekday-${index}`" class="weekday-row">
              <label>
                <span class="field-label">Weekday {{ index + 1 }}</span>
                <input v-model="calendarDraft.weekdays[index]" type="text" />
              </label>
              <button type="button" class="danger" @click="removeWeekday(index)">Delete</button>
            </div>

            <p v-if="!calendarDraft.weekdays.length" class="muted">No weekdays configured yet.</p>
          </div>
        </section>

        <section class="calendar-card cycle-card">
          <div class="card-header">
            <div>
              <p class="section-title">{{ cycleLabelPlural }}</p>
              <strong>Timeline cycle entries</strong>
            </div>
            <button type="button" @click="addCycleEntry()">Add {{ cycleLabelSingular }}</button>
          </div>

          <p class="muted cycle-note">
            The timeline uses these entries for stamping events. Keep at least one {{ cycleLabelSingular.toLowerCase() }} configured.
          </p>

          <div class="cycle-list">
            <div v-for="(month, index) in calendarDraft.months" :key="`month-${index}`" class="cycle-row">
              <div class="cycle-row-copy">
                <span class="card-kicker">{{ cycleLabelSingular }}</span>
                <strong>{{ cycleLabelSingular }} {{ index + 1 }}</strong>
              </div>

              <label>
                <span class="field-label">Name</span>
                <input v-model="calendarDraft.months[index].name" type="text" />
              </label>

              <label>
                <span class="field-label">Days</span>
                <input v-model.number="calendarDraft.months[index].days" type="number" min="1" />
              </label>

              <button type="button" class="danger" :disabled="calendarDraft.months.length === 1" @click="removeCycleEntry(index)">Delete</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  </section>
</template>

<style scoped>
.calendar-layout {
  position: relative;
  display: grid;
  height: 100%;
  min-height: 0;
}

.calendar-workspace {
  display: grid;
  gap: 0.55rem;
  height: 100%;
  min-height: 0;
  min-width: 0;
  padding: 0.92rem;
  overflow: auto;
  overflow-x: hidden;
}

.calendar-header {
  display: flex;
  justify-content: space-between;
  gap: 0.8rem;
  align-items: center;
}

.calendar-copy {
  display: grid;
  gap: 0.04rem;
}

.calendar-copy h2 {
  margin: 0;
  line-height: 1.08;
}

.calendar-copy .muted {
  margin: 0;
}

.calendar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.28rem;
  justify-content: flex-end;
}

.board-action {
  padding: 0.24rem 0.5rem;
  border-radius: 999px;
  font-size: 0.72rem;
}

.board-action.alt {
  background: rgba(244, 197, 111, 0.14);
}

.calendar-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0.26rem;
}

.calendar-grid {
  display: grid;
  gap: 0.55rem;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  align-items: start;
}

.calendar-card {
  display: grid;
  gap: 0.42rem;
  min-width: 0;
  padding: 0.72rem;
  border-radius: 12px;
  background: rgba(11, 18, 27, 0.72);
  border: 1px solid rgba(144, 163, 191, 0.18);
  box-shadow: 0 14px 24px rgba(0, 0, 0, 0.22);
}

.card-header {
  display: flex;
  justify-content: space-between;
  gap: 0.55rem;
  align-items: center;
}

.card-header.compact {
  align-items: end;
}

.card-header strong {
  display: block;
}

.settings-grid {
  display: grid;
  gap: 0.28rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.settings-grid label,
.weekday-row label,
.cycle-row label {
  display: grid;
  gap: 0.08rem;
}

.field-label {
  margin-bottom: 0;
  display: block;
  font-size: 0.64rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--fg-muted);
}

.weekday-list,
.cycle-list {
  display: grid;
  gap: 0.24rem;
}

.weekday-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.28rem;
  align-items: end;
}

.cycle-note {
  margin: -0.06rem 0 0;
}

.cycle-row {
  display: grid;
  grid-template-columns: 112px minmax(0, 1.1fr) 110px auto;
  gap: 0.28rem;
  align-items: end;
  padding: 0.52rem 0.56rem;
  border-radius: 12px;
  background: rgba(11, 18, 27, 0.92);
  border: 1px solid rgba(244, 197, 111, 0.18);
  box-shadow: 0 0 0 1px rgba(244, 197, 111, 0.06), 0 14px 24px rgba(0, 0, 0, 0.18);
}

.cycle-row-copy {
  display: grid;
  gap: 0.02rem;
}

.card-kicker {
  color: var(--warning);
  font-size: 0.66rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.cycle-row-copy strong {
  display: block;
  font-size: 0.88rem;
  line-height: 1.14;
}

.cycle-row input {
  min-width: 0;
}

.danger {
  background: rgba(255, 109, 122, 0.14);
}

.danger:hover {
  background: rgba(255, 109, 122, 0.24);
}

.danger:disabled {
  background: rgba(255, 109, 122, 0.08);
  opacity: 0.5;
  transform: none;
}

.muted {
  margin: 0;
  color: var(--fg-muted);
}

@media (max-width: 1200px) {
  .calendar-grid {
    grid-template-columns: 1fr;
  }

  .settings-grid {
    grid-template-columns: 1fr;
  }

  .cycle-row {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 720px) {
  .calendar-workspace {
    padding: 0.72rem;
  }

  .calendar-header {
    align-items: start;
    flex-direction: column;
  }

  .calendar-actions {
    justify-content: flex-start;
  }

  .weekday-row,
  .cycle-row {
    grid-template-columns: 1fr;
  }
}
</style>
