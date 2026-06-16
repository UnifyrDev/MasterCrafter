export type HotkeyScopeType = "global" | "shell" | "view" | "modal";

export interface HotkeyDefinition {
  id: string;
  label: string;
  description: string;
  defaultBinding: string | null;
  locked?: boolean;
}

export interface HotkeyGroupDefinition {
  id: string;
  label: string;
  contextId: string;
  actions: HotkeyDefinition[];
}

export interface HotkeySectionDefinition {
  id: string;
  label: string;
  description: string;
  groups: HotkeyGroupDefinition[];
}

const HOTKEY_SECTIONS: HotkeySectionDefinition[] = [
  {
    id: "shell",
    label: "Shell",
    description: "Workspace navigation and shell-level actions.",
    groups: [
      {
        id: "navigation",
        label: "Navigation",
        contextId: "shell",
        actions: [
          {
            id: "shell.viewMaps",
            label: "Maps view",
            description: "Switch to the map editor.",
            defaultBinding: "Ctrl+Alt+Digit1",
          },
          {
            id: "shell.viewNotes",
            label: "Notes view",
            description: "Switch to the note editor.",
            defaultBinding: "Ctrl+Alt+Digit2",
          },
          {
            id: "shell.viewTimeline",
            label: "Timeline view",
            description: "Switch to the timeline editor.",
            defaultBinding: "Ctrl+Alt+Digit3",
          },
          {
            id: "shell.viewEncounters",
            label: "Encounters view",
            description: "Switch to the encounter workspace.",
            defaultBinding: "Ctrl+Alt+Digit4",
          },
          {
            id: "shell.viewCalendar",
            label: "Calendar view",
            description: "Switch to the calendar editor.",
            defaultBinding: "Ctrl+Alt+Digit5",
          },
          {
            id: "shell.viewGraphs",
            label: "Graphs view",
            description: "Switch to the graph explorer.",
            defaultBinding: "Ctrl+Alt+Digit6",
          },
          {
            id: "shell.viewTypes",
            label: "Types view",
            description: "Switch to the type builder.",
            defaultBinding: "Ctrl+Alt+Digit7",
          },
          {
            id: "shell.openLauncher",
            label: "Workspaces",
            description: "Return to the workspace launcher.",
            defaultBinding: "Ctrl+Alt+KeyL",
          },
          {
            id: "shell.focusSearch",
            label: "Focus search",
            description: "Jump to the campaign search box.",
            defaultBinding: "Ctrl+Alt+KeyF",
          },
        ],
      },
      {
        id: "workspace",
        label: "Workspace",
        contextId: "shell",
        actions: [
          {
            id: "shell.saveWorkspaceMetadata",
            label: "Save metadata",
            description: "Persist the workspace name and description.",
            defaultBinding: "Ctrl+Alt+KeyS",
          },
          {
            id: "shell.exportBundle",
            label: "Export bundle",
            description: "Export the current workspace bundle.",
            defaultBinding: "Ctrl+Alt+KeyE",
          },
        ],
      },
    ],
  },
  {
    id: "maps",
    label: "Maps",
    description: "Map editor tools, viewport controls, and placement actions.",
    groups: [
      {
        id: "tools",
        label: "Tools",
        contextId: "maps",
        actions: [
          {
            id: "maps.toolSelect",
            label: "Select tool",
            description: "Switch to the select tool.",
            defaultBinding: "Ctrl+Alt+Digit1",
          },
          {
            id: "maps.toolMove",
            label: "Move tool",
            description: "Switch to the move tool.",
            defaultBinding: "Ctrl+Alt+Digit2",
          },
          {
            id: "maps.toolPoint",
            label: "Point tool",
            description: "Switch to point placement mode.",
            defaultBinding: "Ctrl+Alt+Digit3",
          },
          {
            id: "maps.toolRegion",
            label: "Region tool",
            description: "Switch to region placement mode.",
            defaultBinding: "Ctrl+Alt+Digit4",
          },
          {
            id: "maps.toolPath",
            label: "Path tool",
            description: "Switch to path placement mode.",
            defaultBinding: "Ctrl+Alt+Digit5",
          },
        ],
      },
      {
        id: "history",
        label: "History",
        contextId: "maps",
        actions: [
          {
            id: "maps.undoLastChange",
            label: "Undo last change",
            description: "Undo the last map edit or remove the last draft point.",
            defaultBinding: "Ctrl+KeyZ",
          },
        ],
      },
      {
        id: "viewport",
        label: "Viewport",
        contextId: "maps",
        actions: [
          {
            id: "maps.zoomIn",
            label: "Zoom in",
            description: "Increase the map zoom level.",
            defaultBinding: "Ctrl+Alt+Equal",
          },
          {
            id: "maps.zoomOut",
            label: "Zoom out",
            description: "Decrease the map zoom level.",
            defaultBinding: "Ctrl+Alt+Minus",
          },
          {
            id: "maps.resetViewport",
            label: "Reset viewport",
            description: "Restore the default zoom and pan position.",
            defaultBinding: "Ctrl+Alt+Digit0",
          },
        ],
      },
      {
        id: "panels",
        label: "Panels",
        contextId: "maps",
        actions: [
          {
            id: "maps.toggleMapsPanel",
            label: "Toggle maps panel",
            description: "Show or hide the maps drawer.",
            defaultBinding: "Ctrl+Alt+KeyM",
          },
          {
            id: "maps.togglePlacementPanel",
            label: "Toggle placement panel",
            description: "Show or hide the placement drawer.",
            defaultBinding: "Ctrl+Alt+KeyP",
          },
          {
            id: "maps.toggleToolsPanel",
            label: "Toggle tools panel",
            description: "Show or hide the tools drawer.",
            defaultBinding: "Ctrl+Alt+KeyT",
          },
          {
            id: "maps.toggleInspectorPanel",
            label: "Toggle inspector panel",
            description: "Show or hide the placement inspector drawer.",
            defaultBinding: "Ctrl+Alt+KeyI",
          },
        ],
      },
      {
        id: "actions",
        label: "Actions",
        contextId: "maps",
        actions: [
          {
            id: "maps.importImage",
            label: "Import image",
            description: "Import one or more map images.",
            defaultBinding: "Ctrl+Alt+Shift+KeyI",
          },
          {
            id: "maps.savePlacement",
            label: "Save placement",
            description: "Persist the active placement draft.",
            defaultBinding: "Ctrl+Alt+KeyS",
          },
          {
            id: "maps.deletePlacement",
            label: "Delete selected placement",
            description: "Delete the selected placement from the map.",
            defaultBinding: "Ctrl+Alt+Delete",
          },
          {
            id: "maps.finishShape",
            label: "Finish shape",
            description: "Complete the current region or path draft.",
            defaultBinding: "Ctrl+Alt+Enter",
          },
          {
            id: "maps.cancelShape",
            label: "Cancel shape",
            description: "Discard the current region or path draft.",
            defaultBinding: "Ctrl+Alt+Backspace",
          },
        ],
      },
    ],
  },
  {
    id: "timeline",
    label: "Timeline",
    description: "Timeline board controls and timeline editor modal actions.",
    groups: [
      {
        id: "board",
        label: "Board",
        contextId: "timeline-board",
        actions: [
          {
            id: "timeline.createEvent",
            label: "Create event",
            description: "Create a new timeline event.",
            defaultBinding: "Ctrl+Alt+KeyN",
          },
          {
            id: "timeline.createQuestline",
            label: "Create questline",
            description: "Create a new questline.",
            defaultBinding: "Ctrl+Alt+KeyQ",
          },
          {
            id: "timeline.createQuestNode",
            label: "Create quest node",
            description: "Create a new quest node at the current moment.",
            defaultBinding: "Ctrl+Alt+Shift+KeyN",
          },
          {
            id: "timeline.zoomIn",
            label: "Zoom in",
            description: "Increase the timeline zoom level.",
            defaultBinding: "Ctrl+Alt+Equal",
          },
          {
            id: "timeline.zoomOut",
            label: "Zoom out",
            description: "Decrease the timeline zoom level.",
            defaultBinding: "Ctrl+Alt+Minus",
          },
          {
            id: "timeline.resetViewport",
            label: "Reset viewport",
            description: "Restore the default timeline zoom and pan.",
            defaultBinding: "Ctrl+Alt+Digit0",
          },
        ],
      },
      {
        id: "eventEditor",
        label: "Event Editor",
        contextId: "timeline-event-modal",
        actions: [
          {
            id: "timeline.saveEvent",
            label: "Save event",
            description: "Save the active timeline event.",
            defaultBinding: "Ctrl+Alt+KeyS",
          },
          {
            id: "timeline.deleteEvent",
            label: "Delete event",
            description: "Delete the active timeline event.",
            defaultBinding: "Ctrl+Alt+Delete",
          },
        ],
      },
      {
        id: "questNodeEditor",
        label: "Quest Node Editor",
        contextId: "timeline-questnode-modal",
        actions: [
          {
            id: "timeline.saveQuestNode",
            label: "Save quest node",
            description: "Save the active quest node.",
            defaultBinding: "Ctrl+Alt+KeyS",
          },
          {
            id: "timeline.deleteQuestNode",
            label: "Delete quest node",
            description: "Delete the active quest node.",
            defaultBinding: "Ctrl+Alt+Delete",
          },
        ],
      },
    ],
  },
  {
    id: "encounters",
    label: "Encounters",
    description: "Encounter workspace tabs and encounter builder/library actions.",
    groups: [
      {
        id: "workspace",
        label: "Workspace Tabs",
        contextId: "encounters-workspace",
        actions: [
          {
            id: "encounters.openLibrary",
            label: "Open library",
            description: "Switch to the encounter library screen.",
            defaultBinding: "Ctrl+Alt+Digit1",
          },
          {
            id: "encounters.openBuilder",
            label: "Open builder",
            description: "Switch to the encounter builder screen.",
            defaultBinding: "Ctrl+Alt+Digit2",
          },
          {
            id: "encounters.openPlay",
            label: "Open play tracker",
            description: "Switch to the play tracker screen.",
            defaultBinding: "Ctrl+Alt+Digit3",
          },
          {
            id: "encounters.openNpcLibrary",
            label: "Open NPC library",
            description: "Switch to the NPC library screen.",
            defaultBinding: "Ctrl+Alt+Digit4",
          },
          {
            id: "encounters.openPlayerLibrary",
            label: "Open player library",
            description: "Switch to the player library screen.",
            defaultBinding: "Ctrl+Alt+Digit5",
          },
        ],
      },
      {
        id: "library",
        label: "Library",
        contextId: "encounters-library",
        actions: [
          {
            id: "encounters.createEncounter",
            label: "Create encounter",
            description: "Create a new encounter template.",
            defaultBinding: "Ctrl+Alt+KeyN",
          },
          {
            id: "encounters.editEncounter",
            label: "Edit encounter",
            description: "Open the selected encounter in the builder.",
            defaultBinding: "Ctrl+Alt+KeyE",
          },
          {
            id: "encounters.playEncounter",
            label: "Play encounter",
            description: "Start a combat session from the selected encounter.",
            defaultBinding: null,
          },
          {
            id: "encounters.deleteEncounter",
            label: "Delete encounter",
            description: "Delete the selected encounter template.",
            defaultBinding: "Ctrl+Alt+Delete",
          },
        ],
      },
      {
        id: "builder",
        label: "Builder",
        contextId: "encounters-builder",
        actions: [
          {
            id: "encounters.startNewEncounter",
            label: "Start new encounter",
            description: "Create a new encounter draft.",
            defaultBinding: "Ctrl+Alt+KeyN",
          },
          {
            id: "encounters.saveAll",
            label: "Save encounter",
            description: "Persist the active encounter and roster.",
            defaultBinding: "Ctrl+Alt+KeyS",
          },
          {
            id: "encounters.saveAndPlay",
            label: "Save and play",
            description: "Save the encounter and start a session.",
            defaultBinding: null,
          },
          {
            id: "encounters.deleteEncounterBuilder",
            label: "Delete encounter",
            description: "Delete the active encounter draft.",
            defaultBinding: "Ctrl+Alt+Delete",
          },
          {
            id: "encounters.addCustomCombatant",
            label: "Add custom combatant",
            description: "Add a custom combatant to the roster.",
            defaultBinding: "Ctrl+Alt+KeyC",
          },
          {
            id: "encounters.addNpcToRoster",
            label: "Add NPC to roster",
            description: "Add the selected NPC to the active roster.",
            defaultBinding: "Ctrl+Alt+Shift+KeyN",
          },
          {
            id: "encounters.addPlayerToRoster",
            label: "Add player to roster",
            description: "Add the selected player to the active roster.",
            defaultBinding: "Ctrl+Alt+Shift+KeyP",
          },
        ],
      },
      {
        id: "playTracker",
        label: "Play Tracker",
        contextId: "encounters-play-tracker",
        actions: [
          {
            id: "encounters.startOrResumeSession",
            label: "Start or resume session",
            description: "Start a combat session or resume the current one.",
            defaultBinding: null,
          },
          {
            id: "encounters.advanceTurn",
            label: "Advance turn",
            description: "Advance the active session to the next combatant.",
            defaultBinding: null,
          },
          {
            id: "encounters.endRound",
            label: "End round",
            description: "Advance the active session to the next round.",
            defaultBinding: null,
          },
          {
            id: "encounters.previousTurn",
            label: "Previous turn",
            description: "Move the active session back one turn.",
            defaultBinding: null,
          },
          {
            id: "encounters.pauseSession",
            label: "Pause session",
            description: "Pause the active combat session.",
            defaultBinding: null,
          },
          {
            id: "encounters.resumeSession",
            label: "Resume session",
            description: "Resume a paused combat session.",
            defaultBinding: null,
          },
          {
            id: "encounters.completeSession",
            label: "Complete session",
            description: "Mark the active combat session complete.",
            defaultBinding: null,
          },
          {
            id: "encounters.addNpcToSession",
            label: "Add NPC to session",
            description: "Add the first visible NPC to the active session.",
            defaultBinding: null,
          },
        ],
      },
      {
        id: "npcLibrary",
        label: "NPC Library",
        contextId: "encounters-npc-library",
        actions: [
          {
            id: "encounters.createNpcLibraryEntry",
            label: "Create NPC",
            description: "Create a new NPC library entry.",
            defaultBinding: "Ctrl+Alt+KeyN",
          },
          {
            id: "encounters.saveNpcLibraryEntry",
            label: "Save NPC",
            description: "Save the active NPC library entry.",
            defaultBinding: "Ctrl+Alt+KeyS",
          },
          {
            id: "encounters.deleteNpcLibraryEntry",
            label: "Delete NPC",
            description: "Delete the active NPC library entry.",
            defaultBinding: "Ctrl+Alt+Delete",
          },
        ],
      },
      {
        id: "playerLibrary",
        label: "Player Library",
        contextId: "encounters-player-library",
        actions: [
          {
            id: "encounters.createPlayerLibraryEntry",
            label: "Create player",
            description: "Create a new player library entry.",
            defaultBinding: "Ctrl+Alt+KeyN",
          },
          {
            id: "encounters.savePlayerLibraryEntry",
            label: "Save player",
            description: "Save the active player library entry.",
            defaultBinding: "Ctrl+Alt+KeyS",
          },
          {
            id: "encounters.deletePlayerLibraryEntry",
            label: "Delete player",
            description: "Delete the active player library entry.",
            defaultBinding: "Ctrl+Alt+Delete",
          },
        ],
      },
    ],
  },
  {
    id: "calendar",
    label: "Calendar",
    description: "Calendar editor controls.",
    groups: [
      {
        id: "editor",
        label: "Editor",
        contextId: "calendar",
        actions: [
          {
            id: "calendar.toggleCycleLabel",
            label: "Toggle cycle label",
            description: "Toggle the calendar cycle label mode.",
            defaultBinding: "Ctrl+Alt+Shift+KeyM",
          },
          {
            id: "calendar.addWeekday",
            label: "Add weekday",
            description: "Add a weekday row.",
            defaultBinding: null,
          },
          {
            id: "calendar.removeWeekday",
            label: "Remove weekday",
            description: "Remove the selected weekday row.",
            defaultBinding: null,
          },
          {
            id: "calendar.addCycleEntry",
            label: "Add cycle entry",
            description: "Add a cycle entry row.",
            defaultBinding: null,
          },
          {
            id: "calendar.removeCycleEntry",
            label: "Remove cycle entry",
            description: "Remove the selected cycle entry row.",
            defaultBinding: null,
          },
          {
            id: "calendar.saveCalendar",
            label: "Save calendar",
            description: "Persist calendar changes.",
            defaultBinding: "Ctrl+Alt+KeyS",
          },
        ],
      },
    ],
  },
  {
    id: "notes",
    label: "Notes",
    description: "Markdown note editor actions.",
    groups: [
      {
        id: "editor",
        label: "Editor",
        contextId: "notes",
        actions: [
          {
            id: "notes.createNote",
            label: "Create note",
            description: "Create a new note.",
            defaultBinding: "Ctrl+Alt+KeyN",
          },
          {
            id: "notes.saveNote",
            label: "Save note",
            description: "Persist the active note.",
            defaultBinding: "Ctrl+Alt+KeyS",
          },
        ],
      },
    ],
  },
  {
    id: "graphs",
    label: "Graphs",
    description: "Graph explorer mode controls.",
    groups: [
      {
        id: "explorer",
        label: "Explorer",
        contextId: "graphs",
        actions: [
          {
            id: "graphs.graphHome",
            label: "Quest graph home",
            description: "Return to the quest graph and select the current questline.",
            defaultBinding: "Ctrl+Alt+KeyG",
          },
          {
            id: "graphs.selectQuestsMode",
            label: "Quest graph mode",
            description: "Show questline and quest node graph data.",
            defaultBinding: "Ctrl+Alt+KeyQ",
          },
          {
            id: "graphs.selectRelationsMode",
            label: "Relation graph mode",
            description: "Show relation graph data.",
            defaultBinding: "Ctrl+Alt+KeyR",
          },
        ],
      },
    ],
  },
  {
    id: "types",
    label: "Types",
    description: "Entity type builder actions.",
    groups: [
      {
        id: "builder",
        label: "Builder",
        contextId: "types",
        actions: [
          {
            id: "types.createType",
            label: "Create type",
            description: "Create a new entity type.",
            defaultBinding: "Ctrl+Alt+KeyN",
          },
          {
            id: "types.saveType",
            label: "Save type",
            description: "Persist the active type definition.",
            defaultBinding: "Ctrl+Alt+KeyS",
          },
          {
            id: "types.deleteType",
            label: "Delete type",
            description: "Delete the active type definition.",
            defaultBinding: "Ctrl+Alt+Delete",
          },
          {
            id: "types.addField",
            label: "Add field",
            description: "Add a custom field to the type.",
            defaultBinding: "Ctrl+Alt+KeyF",
          },
          {
            id: "types.removeField",
            label: "Remove field",
            description: "Remove the selected custom field.",
            defaultBinding: null,
          },
        ],
      },
    ],
  },
  {
    id: "modals",
    label: "Modals",
    description: "Modal openers and system dialogs.",
    groups: [
      {
        id: "shell",
        label: "Shell",
        contextId: "shell",
        actions: [
          {
            id: "modals.openNpcEditor",
            label: "Open NPC editor",
            description: "Open the NPC editor for a new NPC.",
            defaultBinding: "Ctrl+Alt+Shift+KeyN",
          },
        ],
      },
      {
        id: "timeline",
        label: "Timeline",
        contextId: "timeline-board",
        actions: [
          {
            id: "modals.openTimelineEventEditor",
            label: "Open event editor",
            description: "Open the selected timeline event editor.",
            defaultBinding: "Ctrl+Alt+Shift+KeyE",
          },
          {
            id: "modals.openQuestNodeEditor",
            label: "Open quest node editor",
            description: "Open the selected quest node editor.",
            defaultBinding: "Ctrl+Alt+Shift+KeyQ",
          },
        ],
      },
      {
        id: "system",
        label: "System",
        contextId: "global",
        actions: [
          {
            id: "modals.openHotkeySettings",
            label: "Hotkey settings",
            description: "Open the hotkey settings modal.",
            defaultBinding: "Ctrl+Alt+KeyH",
            locked: true,
          },
          {
            id: "modals.confirmationDialog",
            label: "Confirmation dialog",
            description: "System-managed confirmation dialog.",
            defaultBinding: null,
            locked: true,
          },
        ],
      },
    ],
  },
];

export class HotkeyDefinitionCatalogService {
  private static instance: HotkeyDefinitionCatalogService | null = null;

  private constructor() {}

  static getInstance(): HotkeyDefinitionCatalogService {
    if (!HotkeyDefinitionCatalogService.instance) {
      HotkeyDefinitionCatalogService.instance = new HotkeyDefinitionCatalogService();
    }

    return HotkeyDefinitionCatalogService.instance;
  }

  getSections(): HotkeySectionDefinition[] {
    return HOTKEY_SECTIONS.map((section) => ({
      ...section,
      groups: section.groups.map((group) => ({
        ...group,
        actions: [...group.actions],
      })),
    }));
  }

  getSection(sectionId: string): HotkeySectionDefinition | null {
    const section = HOTKEY_SECTIONS.find((entry) => entry.id === sectionId);
    if (!section) {
      return null;
    }

    return {
      ...section,
      groups: section.groups.map((group) => ({
        ...group,
        actions: [...group.actions],
      })),
    };
  }

  getDefinitionsForContext(contextId: string): HotkeyDefinition[] {
    return HOTKEY_SECTIONS.flatMap((section) =>
      section.groups
        .filter((group) => group.contextId === contextId)
        .flatMap((group) => group.actions),
    );
  }

  getAction(actionId: string): HotkeyDefinition | null {
    for (const section of HOTKEY_SECTIONS) {
      for (const group of section.groups) {
        const definition = group.actions.find((action) => action.id === actionId);
        if (definition) {
          return { ...definition };
        }
      }
    }

    return null;
  }

  getActionLocation(actionId: string): {
    sectionId: string;
    sectionLabel: string;
    groupId: string;
    groupLabel: string;
    contextId: string;
    action: HotkeyDefinition;
  } | null {
    for (const section of HOTKEY_SECTIONS) {
      for (const group of section.groups) {
        const action = group.actions.find((entry) => entry.id === actionId);
        if (!action) {
          continue;
        }

        return {
          sectionId: section.id,
          sectionLabel: section.label,
          groupId: group.id,
          groupLabel: group.label,
          contextId: group.contextId,
          action: { ...action },
        };
      }
    }

    return null;
  }

  getAllActions(): HotkeyDefinition[] {
    return HOTKEY_SECTIONS.flatMap((section) => section.groups.flatMap((group) => group.actions.map((action) => ({ ...action }))));
  }
}

export const hotkeyDefinitionCatalogService = HotkeyDefinitionCatalogService.getInstance();
