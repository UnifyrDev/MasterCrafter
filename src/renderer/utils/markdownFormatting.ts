export type MarkdownFormattingKind = "bold" | "italic" | "code" | "bullet";

export interface MarkdownSelectionRange {
  start: number;
  end: number;
}

export interface MarkdownFormattingResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) {
    return 0;
  }

  return Math.max(0, Math.min(Math.floor(index), length));
}

function normalizeSelection(range: MarkdownSelectionRange, length: number): MarkdownSelectionRange {
  const start = clampIndex(Math.min(range.start, range.end), length);
  const end = clampIndex(Math.max(range.start, range.end), length);

  return {
    start,
    end,
  };
}

function wrapSelection(value: string, range: MarkdownSelectionRange, prefix: string, suffix = prefix): MarkdownFormattingResult {
  const selection = normalizeSelection(range, value.length);
  const selectedText = value.slice(selection.start, selection.end);

  if (!selectedText.length) {
    const inserted = `${prefix}${suffix}`;
    const nextValue = `${value.slice(0, selection.start)}${inserted}${value.slice(selection.end)}`;
    const cursor = selection.start + prefix.length;

    return {
      value: nextValue,
      selectionStart: cursor,
      selectionEnd: cursor,
    };
  }

  const inserted = `${prefix}${selectedText}${suffix}`;
  const nextValue = `${value.slice(0, selection.start)}${inserted}${value.slice(selection.end)}`;
  const start = selection.start + prefix.length;
  const end = start + selectedText.length;

  return {
    value: nextValue,
    selectionStart: start,
    selectionEnd: end,
  };
}

function prefixSelectedLines(value: string, range: MarkdownSelectionRange, prefix: string): MarkdownFormattingResult {
  const selection = normalizeSelection(range, value.length);
  const selectedText = value.slice(selection.start, selection.end);

  if (!selectedText.length) {
    const inserted = prefix;
    const nextValue = `${value.slice(0, selection.start)}${inserted}${value.slice(selection.end)}`;

    return {
      value: nextValue,
      selectionStart: selection.start + inserted.length,
      selectionEnd: selection.start + inserted.length,
    };
  }

  const lines = selectedText.split(/\r?\n/);
  const inserted = lines.map((line) => `${prefix}${line}`).join("\n");
  const nextValue = `${value.slice(0, selection.start)}${inserted}${value.slice(selection.end)}`;

  return {
    value: nextValue,
    selectionStart: selection.start,
    selectionEnd: selection.start + inserted.length,
  };
}

export function applyMarkdownFormatting(
  value: string,
  range: MarkdownSelectionRange,
  kind: MarkdownFormattingKind,
): MarkdownFormattingResult {
  switch (kind) {
    case "bold":
      return wrapSelection(value, range, "**");
    case "italic":
      return wrapSelection(value, range, "*");
    case "code":
      return wrapSelection(value, range, "`");
    case "bullet":
      return prefixSelectedLines(value, range, "- ");
    default:
      return {
        value,
        selectionStart: range.start,
        selectionEnd: range.end,
      };
  }
}
