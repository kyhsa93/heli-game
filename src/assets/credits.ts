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
