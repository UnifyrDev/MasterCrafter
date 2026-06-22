export function formatDisplayVersion(version) {
  return version.replace(/-([0-9A-Za-z]+)$/u, (_, suffix) => suffix.toLowerCase());
}
