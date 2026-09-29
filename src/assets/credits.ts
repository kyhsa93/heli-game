export interface CreditRow { file: string; title: string; author: string; url: string; license: string; modified: string; checked: string }

export function parseCredits(md: string): CreditRow[] {
  const rows: CreditRow[] = [];
  let inBody = false;
  for (const line of md.split('\n')) {
    if (!line.startsWith('|')) { inBody = false; continue; }
    if (/^\|\s*-/.test(line)) { inBody = true; continue; }
    if (!inBody) continue;
    const [file, title, author, url, license, modified, checked] = line.split('|').slice(1, -1).map(c => c.trim());
    rows.push({ file, title, author, url, license, modified, checked });
  }
  return rows;
}

export const CREDIT_CATEGORIES = ['fonts', 'textures', 'models', 'audio', 'other'] as const;
export type CreditCategory = typeof CREDIT_CATEGORIES[number];

export function creditCategory(file: string): CreditCategory {
  const dir = file.split('/')[0];
  return (CREDIT_CATEGORIES as readonly string[]).includes(dir) ? dir as CreditCategory : 'other';
}

export function creditGroups(rows: readonly CreditRow[]): [CreditCategory, CreditRow[]][] {
  return CREDIT_CATEGORIES.map(c => [c, rows.filter(r => creditCategory(r.file) === c)] as [CreditCategory, CreditRow[]]).filter(([, list]) => list.length > 0);
}
