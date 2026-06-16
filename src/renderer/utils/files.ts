export function toFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.startsWith("//")) {
    return `file:${normalized}`;
  }

  if (/^[a-zA-Z]:\//.test(normalized)) {
    return `file:///${encodeURI(normalized)}`;
  }

  return `file://${encodeURI(normalized)}`;
}
