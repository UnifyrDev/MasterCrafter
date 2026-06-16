export interface HotkeyCombination {
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  code: string;
}

const MODIFIER_CODES = new Set(["ControlLeft", "ControlRight", "AltLeft", "AltRight", "ShiftLeft", "ShiftRight", "MetaLeft", "MetaRight"]);
const MODIFIER_LABELS = new Map<string, keyof Pick<HotkeyCombination, "ctrlKey" | "altKey" | "shiftKey" | "metaKey">>([
  ["ctrl", "ctrlKey"],
  ["control", "ctrlKey"],
  ["alt", "altKey"],
  ["option", "altKey"],
  ["shift", "shiftKey"],
  ["meta", "metaKey"],
  ["cmd", "metaKey"],
  ["command", "metaKey"],
]);

const TOKEN_ALIASES: Record<string, string> = {
  esc: "Escape",
  escape: "Escape",
  space: "Space",
  enter: "Enter",
  return: "Enter",
  tab: "Tab",
  backspace: "Backspace",
  delete: "Delete",
  minus: "Minus",
  equal: "Equal",
  comma: "Comma",
  period: "Period",
  slash: "Slash",
  backquote: "Backquote",
  semicolon: "Semicolon",
  quote: "Quote",
  bracketleft: "BracketLeft",
  bracketright: "BracketRight",
  backslash: "Backslash",
  arrowup: "ArrowUp",
  arrowdown: "ArrowDown",
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
};

const DISPLAY_KEY_LABELS: Record<string, string> = {
  Escape: "Esc",
  Space: "Space",
  Enter: "Enter",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  Minus: "-",
  Equal: "=",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backquote: "`",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
};

export class HotkeyNormalizationService {
  private static instance: HotkeyNormalizationService | null = null;
  private readonly fixedOpenerBinding = this.serializeCombination({
    ctrlKey: true,
    altKey: true,
    shiftKey: false,
    metaKey: false,
    code: "KeyH",
  });

  private constructor() {}

  static getInstance(): HotkeyNormalizationService {
    if (!HotkeyNormalizationService.instance) {
      HotkeyNormalizationService.instance = new HotkeyNormalizationService();
    }

    return HotkeyNormalizationService.instance;
  }

  getFixedOpenerBinding(): string {
    return this.fixedOpenerBinding;
  }

  isFixedOpenerBinding(binding: string | null | undefined): boolean {
    if (!binding) {
      return false;
    }

    return this.normalizeBinding(binding) === this.fixedOpenerBinding;
  }

  isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    return Boolean(target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='plaintext-only']") || target.isContentEditable);
  }

  normalizeEvent(event: KeyboardEvent): string | null {
    if (MODIFIER_CODES.has(event.code)) {
      return null;
    }

    return this.serializeCombination({
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
      code: this.normalizeCode(event.code),
    });
  }

  normalizeBinding(binding: string | null | undefined): string | null {
    if (!binding) {
      return null;
    }

    const tokens = binding
      .split("+")
      .map((token) => token.trim())
      .filter(Boolean);

    if (!tokens.length) {
      return null;
    }

    const combination: HotkeyCombination = {
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      code: "",
    };

    for (const token of tokens) {
      const normalizedToken = token.toLowerCase();
      const modifierKey = MODIFIER_LABELS.get(normalizedToken);
      if (modifierKey) {
        combination[modifierKey] = true;
        continue;
      }

      if (!combination.code) {
        combination.code = this.normalizeKeyToken(token);
      }
    }

    if (!combination.code) {
      return null;
    }

    return this.serializeCombination(combination);
  }

  formatBinding(binding: string | null | undefined): string {
    const normalized = this.normalizeBinding(binding);
    if (!normalized) {
      return "Unassigned";
    }

    const parts = normalized.split("+");
    const labels: string[] = [];

    for (const part of parts) {
      if (part === "Ctrl" || part === "Alt" || part === "Shift" || part === "Meta") {
        labels.push(part);
        continue;
      }

      labels.push(this.formatKeyCode(part));
    }

    return labels.join(" + ");
  }

  private serializeCombination(combination: HotkeyCombination): string {
    const parts: string[] = [];

    if (combination.ctrlKey) {
      parts.push("Ctrl");
    }

    if (combination.altKey) {
      parts.push("Alt");
    }

    if (combination.shiftKey) {
      parts.push("Shift");
    }

    if (combination.metaKey) {
      parts.push("Meta");
    }

    if (!combination.code) {
      return "";
    }

    parts.push(this.normalizeCode(combination.code));
    return parts.join("+");
  }

  private normalizeCode(code: string): string {
    if (!code) {
      return "";
    }

    if (/^Key[A-Z]$/.test(code) || /^Digit[0-9]$/.test(code)) {
      return code;
    }

    return this.normalizeKeyToken(code);
  }

  private normalizeKeyToken(token: string): string {
    const trimmed = token.trim();
    if (!trimmed) {
      return "";
    }

    const lower = trimmed.toLowerCase();
    const aliased = TOKEN_ALIASES[lower];
    if (aliased) {
      return aliased;
    }

    if (/^key[a-z]$/.test(lower)) {
      return `Key${lower.slice(3).toUpperCase()}`;
    }

    if (/^digit[0-9]$/.test(lower)) {
      return `Digit${lower.slice(5)}`;
    }

    if (trimmed.length === 1) {
      if (/[a-z]/i.test(trimmed)) {
        return `Key${trimmed.toUpperCase()}`;
      }

      if (/[0-9]/.test(trimmed)) {
        return `Digit${trimmed}`;
      }
    }

    const normalized = trimmed[0].toUpperCase() + trimmed.slice(1);
    return normalized;
  }

  private formatKeyCode(code: string): string {
    if (/^Key[A-Z]$/.test(code)) {
      return code.slice(3);
    }

    if (/^Digit[0-9]$/.test(code)) {
      return code.slice(5);
    }

    return DISPLAY_KEY_LABELS[code] ?? code;
  }
}

export const hotkeyNormalizationService = HotkeyNormalizationService.getInstance();
