export type EncounterConditionIconShapeKind = "path" | "circle" | "ellipse" | "line" | "rect" | "polygon" | "polyline";

export interface EncounterConditionIconShape {
  kind: EncounterConditionIconShapeKind;
  attrs: Record<string, string | number>;
}

export interface EncounterConditionIconDefinition {
  viewBox: string;
  shapes: EncounterConditionIconShape[];
}

function icon(viewBox: string, shapes: EncounterConditionIconShape[]): EncounterConditionIconDefinition {
  return { viewBox, shapes };
}

const defaultIcon = icon("0 0 24 24", [
  { kind: "circle", attrs: { cx: 12, cy: 12, r: 8.5 } },
  { kind: "line", attrs: { x1: 6.5, y1: 17.5, x2: 17.5, y2: 6.5 } },
]);

export const encounterConditionIconDefinitions: Record<string, EncounterConditionIconDefinition> = {
  blinded: icon("0 0 24 24", [
    { kind: "ellipse", attrs: { cx: 12, cy: 12, rx: 8.8, ry: 5.8 } },
    { kind: "circle", attrs: { cx: 12, cy: 12, r: 2.4, fill: "currentColor", stroke: "none" } },
    { kind: "line", attrs: { x1: 4.5, y1: 18.5, x2: 19.5, y2: 5.5 } },
  ]),
  charmed: icon("0 0 24 24", [
    {
      kind: "path",
      attrs: {
        d: "M12 20.6S4.4 16.3 2.2 11.9C.7 8.9 2.6 5 6.4 5c2 0 3.2 1.2 3.9 2.3C11 6.2 12.2 5 14.2 5c3.8 0 5.7 3.9 4.2 6.9C19.6 16.3 12 20.6 12 20.6Z",
      },
    },
    { kind: "path", attrs: { d: "M18.4 4.4l.8 1.8 1.8.8-1.8.8-.8 1.8-.8-1.8-1.8-.8 1.8-.8.8-1.8Z" } },
  ]),
  deafened: icon("0 0 24 24", [
    {
      kind: "path",
      attrs: {
        d: "M12 3c-3.9 0-7 3.1-7 7 0 2.5 1.3 4.7 3.3 6v2.6c0 .8.7 1.4 1.4 1.4h2.4v-2.1c0-.8.4-1.6 1.1-2 .9-.5 1.8-1.1 2.4-2 .7-1 .9-2.1.9-3.2 0-2-1.6-3.6-3.6-3.6S9.5 9 9.5 11c0 1.1.5 2.1 1.4 2.8.4.3.6.8.6 1.2 0 .8-.6 1.4-1.4 1.4h-.2C8.1 16.4 7 14.8 7 12.8V10c0-2.8 2.2-5 5-5s5 2.2 5 5c0 2.2-1.3 4-3.2 4.9l-1.3 2.8h-1.5V15c2.9-.7 5-3.2 5-6.3C17 5.7 14.8 3 12 3Z",
      },
    },
    { kind: "line", attrs: { x1: 4.5, y1: 18.5, x2: 19.5, y2: 5.5 } },
  ]),
  exhaustion: icon("0 0 24 24", [
    { kind: "rect", attrs: { x: 4.5, y: 6.5, width: 14, height: 11, rx: 2 } },
    { kind: "rect", attrs: { x: 18.5, y: 10, width: 1.4, height: 4, rx: 0.7, fill: "currentColor", stroke: "none" } },
    { kind: "rect", attrs: { x: 7, y: 9, width: 2.4, height: 6.8, rx: 1.2, fill: "currentColor", stroke: "none" } },
    { kind: "rect", attrs: { x: 10.3, y: 9, width: 2.4, height: 4.2, rx: 1.2, fill: "currentColor", stroke: "none" } },
    {
      kind: "polygon",
      attrs: {
        points: "13 4 9.2 11.2 12.2 11.2 11 18 15.4 10.6 12.5 10.6 13 4",
        fill: "currentColor",
        stroke: "none",
      },
    },
  ]),
  frightened: icon("0 0 24 24", [
    {
      kind: "polygon",
      attrs: {
        points: "12 4 21 19 3 19",
      },
    },
    { kind: "line", attrs: { x1: 12, y1: 9, x2: 12, y2: 13 } },
    { kind: "circle", attrs: { cx: 12, cy: 16.2, r: 0.9, fill: "currentColor", stroke: "none" } },
  ]),
  grappled: icon("0 0 24 24", [
    {
      kind: "path",
      attrs: {
        d: "M8 9.5V7.8c0-1.2.9-2.1 2-2.1.9 0 1.6.6 1.9 1.4.2-1 .9-1.8 2.1-1.8 1 0 1.9.7 2.2 1.7.3-.7 1-1.2 1.9-1.2 1.2 0 2.1.9 2.1 2.1v6.4c0 2.8-2.2 5-5 5h-2.8c-3 0-5.4-2.4-5.4-5.4V11h1z",
      },
    },
    { kind: "line", attrs: { x1: 8.5, y1: 13.5, x2: 14.8, y2: 13.5 } },
    { kind: "line", attrs: { x1: 8.5, y1: 11.7, x2: 13.9, y2: 11.7 } },
  ]),
  incapacitated: icon("0 0 24 24", [
    { kind: "circle", attrs: { cx: 12, cy: 12, r: 8.5 } },
    { kind: "line", attrs: { x1: 10, y1: 8.8, x2: 10, y2: 15.2 } },
    { kind: "line", attrs: { x1: 14, y1: 8.8, x2: 14, y2: 15.2 } },
  ]),
  invisible: icon("0 0 24 24", [
    { kind: "ellipse", attrs: { cx: 12, cy: 12, rx: 8.7, ry: 5.7, "stroke-dasharray": "1.8 1.6" } },
    { kind: "circle", attrs: { cx: 12, cy: 12, r: 2.3 } },
    { kind: "line", attrs: { x1: 4.5, y1: 18.5, x2: 19.5, y2: 5.5 } },
  ]),
  paralyzed: icon("0 0 24 24", [
    { kind: "polygon", attrs: { points: "13 2 5 13 11 13 10 22 19 10 13.5 10 13 2" } },
  ]),
  petrified: icon("0 0 24 24", [
    { kind: "polygon", attrs: { points: "12 3.5 19 7.5 19 16.5 12 20.5 5 16.5 5 7.5" } },
    { kind: "line", attrs: { x1: 11.5, y1: 7.5, x2: 13, y2: 11.2 } },
    { kind: "line", attrs: { x1: 10.6, y1: 12.5, x2: 12.2, y2: 16.2 } },
  ]),
  poisoned: icon("0 0 24 24", [
    { kind: "circle", attrs: { cx: 12, cy: 11, r: 7 } },
    { kind: "circle", attrs: { cx: 9.5, cy: 10.2, r: 0.9, fill: "currentColor", stroke: "none" } },
    { kind: "circle", attrs: { cx: 14.5, cy: 10.2, r: 0.9, fill: "currentColor", stroke: "none" } },
    { kind: "line", attrs: { x1: 9.2, y1: 14.5, x2: 14.8, y2: 14.5 } },
    { kind: "line", attrs: { x1: 8.2, y1: 18.7, x2: 15.8, y2: 14.9 } },
    { kind: "line", attrs: { x1: 8.2, y1: 14.9, x2: 15.8, y2: 18.7 } },
  ]),
  prone: icon("0 0 24 24", [
    { kind: "line", attrs: { x1: 4, y1: 18, x2: 20, y2: 18 } },
    { kind: "circle", attrs: { cx: 8, cy: 11, r: 2 } },
    { kind: "line", attrs: { x1: 10, y1: 11, x2: 15.5, y2: 13.5 } },
    { kind: "line", attrs: { x1: 12, y1: 13.2, x2: 17.2, y2: 13.2 } },
  ]),
  restrained: icon("0 0 24 24", [
    { kind: "circle", attrs: { cx: 9, cy: 12, r: 3.4 } },
    { kind: "circle", attrs: { cx: 15, cy: 12, r: 3.4 } },
    { kind: "line", attrs: { x1: 11.1, y1: 12, x2: 12.9, y2: 12 } },
    { kind: "line", attrs: { x1: 7.1, y1: 10.6, x2: 5.8, y2: 9.3 } },
    { kind: "line", attrs: { x1: 16.9, y1: 13.4, x2: 18.2, y2: 14.7 } },
  ]),
  stunned: icon("0 0 24 24", [
    { kind: "path", attrs: { d: "M12 3.5l1.7 4.8 4.9 1.7-4.9 1.7L12 16.5l-1.7-4.8-4.9-1.7 4.9-1.7L12 3.5Z" } },
    { kind: "circle", attrs: { cx: 6.5, cy: 6.5, r: 0.8, fill: "currentColor", stroke: "none" } },
    { kind: "circle", attrs: { cx: 17.5, cy: 6.5, r: 0.8, fill: "currentColor", stroke: "none" } },
    { kind: "circle", attrs: { cx: 6.5, cy: 17.5, r: 0.8, fill: "currentColor", stroke: "none" } },
    { kind: "circle", attrs: { cx: 17.5, cy: 17.5, r: 0.8, fill: "currentColor", stroke: "none" } },
  ]),
  unconscious: icon("0 0 24 24", [
    { kind: "path", attrs: { d: "M14.6 4.2a7.7 7.7 0 1 0 5.2 14.1 8.8 8.8 0 1 1-5.2-14.1Z" } },
    { kind: "path", attrs: { d: "M6.2 7.2h3.8L6.2 11h3.8" } },
    { kind: "line", attrs: { x1: 14.2, y1: 8.2, x2: 16.8, y2: 8.2 } },
    { kind: "line", attrs: { x1: 14.2, y1: 11, x2: 16.1, y2: 11 } },
  ]),
  default: defaultIcon,
};
