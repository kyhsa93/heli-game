import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const FONTS = join(__dirname, '../../public/assets/fonts');

const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt', 'fpgm',
  'glyf', 'loca', 'prep', 'CFF', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern',
  'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC',
  'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG', 'sbix', 'acnt', 'avar',
  'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty',
  'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat',
  'Gloc', 'Feat', 'Sill',
];

function readBase128(buf: Buffer, pos: number): [number, number] {
  let v = 0;
  for (let i = 0; i < 5; i++) {
    const b = buf[pos++];
    v = (v << 7) | (b & 0x7f);
    if (!(b & 0x80)) return [v, pos];
  }
  throw new Error('bad UIntBase128');
}

function woff2Table(file: string, want: string): Buffer {
  const buf = readFileSync(file);
  expect(buf.toString('latin1', 0, 4)).toBe('wOF2');
  const numTables = buf.readUInt16BE(12);
  const compressed = buf.readUInt32BE(20);
  let pos = 48;
  const dir: { tag: string; length: number }[] = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[pos++];
    const tagIndex = flags & 0x3f;
    let tag = KNOWN_TAGS[tagIndex];
    if (tagIndex === 0x3f) { tag = buf.toString('latin1', pos, pos + 4).trim(); pos += 4; }
    let length;
    [length, pos] = readBase128(buf, pos);
    const version = (flags >> 6) & 3;
    const glyfOrLoca = tag === 'glyf' || tag === 'loca';
    if ((glyfOrLoca && version === 0) || (!glyfOrLoca && version !== 0)) [length, pos] = readBase128(buf, pos);
    dir.push({ tag, length });
  }
  const data = brotliDecompressSync(buf.subarray(pos, pos + compressed));
  let off = 0;
  for (const t of dir) {
    if (t.tag === want) return data.subarray(off, off + t.length);
    off += t.length;
  }
  throw new Error(`${want} not found in ${file}`);
}

function names(file: string): Map<number, Set<string>> {
  const t = woff2Table(file, 'name');
  const count = t.readUInt16BE(2), strings = t.readUInt16BE(4);
  const out = new Map<number, Set<string>>();
  for (let i = 0; i < count; i++) {
    const r = 6 + i * 12;
    const platform = t.readUInt16BE(r), nameId = t.readUInt16BE(r + 6), len = t.readUInt16BE(r + 8), at = strings + t.readUInt16BE(r + 10);
    const raw = t.subarray(at, at + len);
    const text = platform === 1 ? raw.toString('latin1') : Buffer.from(raw).swap16().toString('utf16le');
    if (!out.has(nameId)) out.set(nameId, new Set());
    out.get(nameId)!.add(text);
  }
  return out;
}

function codepoints(file: string): Set<number> {
  const t = woff2Table(file, 'cmap');
  const out = new Set<number>();
  const n = t.readUInt16BE(2);
  for (let i = 0; i < n; i++) {
    const off = t.readUInt32BE(4 + i * 8 + 4);
    const format = t.readUInt16BE(off);
    if (format === 4) {
      const segs = t.readUInt16BE(off + 6) / 2;
      const ends = off + 14, starts = ends + segs * 2 + 2;
      for (let k = 0; k < segs; k++) {
        const end = t.readUInt16BE(ends + k * 2), start = t.readUInt16BE(starts + k * 2);
        if (start === 0xffff) continue;
        for (let c = start; c <= end; c++) out.add(c);
      }
    } else if (format === 12) {
      const groups = t.readUInt32BE(off + 12);
      for (let k = 0; k < groups; k++) {
        const g = off + 16 + k * 12;
        for (let c = t.readUInt32BE(g); c <= t.readUInt32BE(g + 4); c++) out.add(c);
      }
    }
  }
  return out;
}

function contentChars(dir: string): Set<number> {
  const out = new Set<number>();
  for (const e of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!e.isFile() || !e.name.endsWith('.json')) continue;
    for (const ch of readFileSync(join(e.parentPath, e.name), 'utf8')) {
      const c = ch.codePointAt(0)!;
      if (c > 0x7e) out.add(c);
    }
  }
  return out;
}

const NAMING_IDS = [1, 3, 4, 6, 16, 17, 18, 20, 21, 22];

describe('shipped fonts', () => {
  it('renames the Pretendard subsets as its OFL Reserved Font Name requires (#64)', () => {
    for (const f of ['karda-sans-regular.woff2', 'karda-sans-bold.woff2']) {
      const n = names(join(FONTS, f));
      expect([...n.get(1)!]).toEqual(['Karda Sans']);
      for (const id of NAMING_IDS) for (const s of n.get(id) ?? []) expect(s, `${f} name ${id}`).not.toMatch(/pretendard/i);
    }
  });

  it('keeps the original copyright notice, which OFL requires', () => {
    const copyright = [...names(join(FONTS, 'karda-sans-regular.woff2')).get(0)!].join(' ');
    expect(copyright).toMatch(/Kil Hyung-jin/);
  });

  it('covers every non-ASCII character in the content strings (#68)', () => {
    const need = contentChars(join(__dirname, '../content'));
    for (const f of ['karda-sans-regular.woff2', 'karda-sans-bold.woff2']) {
      const have = codepoints(join(FONTS, f));
      const missing = [...need].filter(c => !have.has(c)).map(c => String.fromCodePoint(c));
      expect(missing, `${f} lacks glyphs — rerun scripts/subset-font.mjs --strings`).toEqual([]);
    }
  });

  it('keeps the B612 Mono name, which declares no reserved name', () => {
    expect([...names(join(FONTS, 'b612-mono.woff2')).get(1)!]).toEqual(['B612 Mono']);
  });
});
