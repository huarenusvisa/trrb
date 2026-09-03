import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const html = await readFile(new URL('../admin/index.html', import.meta.url), 'utf8');
const client = await readFile(new URL('../admin/article-translations.js', import.meta.url), 'utf8');
test('admin exposes human review and explicit publication', () => { assert.match(html, /data-page="article-translations"/); assert.match(html, /id="translation-publish"/); assert.match(html, /AI 仅生成草稿/); });
test('browser uses authenticated workflow without an AI secret', () => { assert.match(client, /window\.getAdminAccessToken/); assert.match(client, /admin-article-translations/); assert.doesNotMatch(client, /OPENAI_API_KEY|sk-[A-Za-z0-9]/); });
