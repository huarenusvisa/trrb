export function normalizeProfilePostTags(caption: string, tags: string[] = []) {
  const inline = Array.from(String(caption || '').matchAll(/(?:^|\s)#([^#\s，,]{1,24})/gu)).map(match => match[1]);
  return Array.from(new Set([...tags, ...inline].map(tag => tag.replace(/^#+/, '').trim()).filter(Boolean)))
    .filter(tag => tag.length <= 24).slice(0, 5);
}
