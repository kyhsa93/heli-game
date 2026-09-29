import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCredits } from './credits';
import { ASSETS, BOOT_BUDGET_BYTES, BOOT_GROUP } from './manifest';

const ROOT = join(__dirname, '../../public/assets');
const LICENSES = new Set(['CC0', 'Public Domain', 'CC-BY-3.0', 'CC-BY-4.0', 'OFL-1.1', 'MIT', 'Apache-2.0', 'ISC']);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(f => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('external asset credits (10-external-assets.md 10.8)', () => {
  const rows = parseCredits(readFileSync(join(ROOT, 'CREDITS.md'), 'utf8'));
  const files = walk(ROOT).map(f => relative(ROOT, f)).filter(f => f !== 'CREDITS.md');

  it('credits every shipped asset file', () => {
    for (const f of files) expect(rows.some(r => r.file === f), `${f} missing from CREDITS.md`).toBe(true);
  });

  it('gives every credit a URL, an allowed licence and a check date', () => {
    for (const r of rows) {
      expect(r.url, r.file).toMatch(/^https?:\/\//);
      expect(LICENSES.has(r.license), `${r.file}: ${r.license}`).toBe(true);
      expect(r.checked, r.file).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.title && r.author, r.file).toBeTruthy();
      expect(existsSync(join(ROOT, r.file)), `${r.file} listed but missing`).toBe(true);
    }
  });

  it('points every manifest entry at a real file', () => {
    for (const a of ASSETS) expect(existsSync(join(ROOT, a.path)), a.path).toBe(true);
  });

  it(`keeps the boot assets within ${BOOT_BUDGET_BYTES / 1024} KB`, () => {
    const total = ASSETS.filter(a => a.group === BOOT_GROUP).reduce((n, a) => n + statSync(join(ROOT, a.path)).size, 0);
    expect(total).toBeLessThanOrEqual(BOOT_BUDGET_BYTES);
  });

  it('parses the credits table format', () => {
    const md = '| 파일 | 제목 | 작가 | 원본 URL | 라이선스 | 수정 | 확인 날짜 |\n| --- |\n| a.mp3 | T | A | https://x | CC0 | 잘라냄 | 2026-09-29 |\n';
    expect(parseCredits(md)).toEqual([{ file: 'a.mp3', title: 'T', author: 'A', url: 'https://x', license: 'CC0', modified: '잘라냄', checked: '2026-09-29' }]);
  });
});
