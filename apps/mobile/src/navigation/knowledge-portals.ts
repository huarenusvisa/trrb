export const knowledgePortals = {
  taiwan: { url: 'https://trrb.net/taiwan-strait-2026/', paths: [] },
  immigration: { url: 'https://trrb.net/immigrate/', paths: ['study', 'work', 'employment', 'family', 'humanitarian', 'change-status', 'citizenship'] },
  legal: { url: 'https://trrb.net/legal/', paths: ['SCOTUS', 'US_CIRCUIT', 'BIA', 'WHITE_HOUSE', 'FEDERAL_REGISTER'] },
} as const;
export type KnowledgePortal = keyof typeof knowledgePortals;
export function knowledgePortalUrl(kind: KnowledgePortal, item?: string): string {
  const portal = knowledgePortals[kind];
  if (!item || !(portal.paths as readonly string[]).includes(item)) return portal.url;
  return kind === 'immigration'
    ? `https://trrb.net/immigrate/center?path=${item}`
    : `${portal.url}?source=${item}`;
}
