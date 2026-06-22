export function formatDisplayVersion(version: string): string {
  return version.replace(/-([0-9A-Za-z]+)$/u, (_, suffix: string) => suffix.toLowerCase());
}
