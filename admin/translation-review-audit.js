(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TRRBTranslationAudit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function tokens(value) {
    return [...String(value || '').matchAll(/\d+(?:[.,:/-]\d+)*%?/g)].map((match) => match[0]);
  }
  function paragraphs(value) {
    return String(value || '').trim() ? String(value).trim().split(/\n\s*\n/).filter(Boolean).length : 0;
  }
  function audit(source, translated) {
    const sourceTokens = tokens(source);
    const translatedTokens = new Set(tokens(translated));
    const missingNumbers = [...new Set(sourceTokens.filter((token) => !translatedTokens.has(token)))];
    const sourceParagraphs = paragraphs(source);
    const translatedParagraphs = paragraphs(translated);
    return {
      sourceCharacters: String(source || '').length,
      translatedCharacters: String(translated || '').length,
      sourceParagraphs,
      translatedParagraphs,
      missingNumbers,
      warnings: [
        ...(missingNumbers.length ? [`译文可能遗漏数字：${missingNumbers.slice(0, 12).join('、')}`] : []),
        ...(sourceParagraphs > 1 && translatedParagraphs < Math.ceil(sourceParagraphs * 0.7) ? ['译文段落明显少于原文，请检查是否截断'] : [])
      ]
    };
  }
  return { audit, tokens, paragraphs };
});
