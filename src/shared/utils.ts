export function createId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, innerValue) => {
    if (innerValue instanceof Set) {
      return Array.from(innerValue).sort();
    }

    if (innerValue && typeof innerValue === "object" && !Array.isArray(innerValue)) {
      return Object.keys(innerValue as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((accumulator, key) => {
          accumulator[key] = (innerValue as Record<string, unknown>)[key];
          return accumulator;
        }, {});
    }

    return innerValue;
  });
}
