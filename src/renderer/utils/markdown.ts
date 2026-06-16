import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

export function extractWikiLinks(markdown: string): string[] {
  const matches = [...markdown.matchAll(/\[\[([^\]|#]+)(?:#[^\]]+)?(?:\|[^\]]+)?\]\]/g)];
  return [...new Set(matches.map((match) => match[1].trim()).filter(Boolean))];
}

export function renderMarkdown(markdown: string): string {
  const transformed = markdown.replace(/\[\[([^\]|#]+)(?:#[^\]]+)?(?:\|([^\]]+))?\]\]/g, (_match, target, label) => {
    const text = (label ?? target).trim();
    const key = target.trim();
    return `[${text}](app://wiki/${encodeURIComponent(key)})`;
  });

  const rendered = marked.parse(transformed, {
    breaks: true,
    gfm: true,
  });

  return sanitizeHtml(String(rendered), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "h1", "h2", "h3", "h4", "h5", "h6"]),
    allowedAttributes: {
      a: ["href", "title"],
      img: ["src", "alt", "title"],
      "*": ["class"],
    },
    allowedSchemes: ["http", "https", "mailto", "app"],
  });
}
