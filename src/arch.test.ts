import { describe, expect, it } from 'vitest';

const all = import.meta.glob(['./**/*.ts', './**/*.tsx', '!./**/*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const inDir = (dir: string) => Object.entries(all).filter(([f]) => f.startsWith(`./${dir}/`));

const SIM_FORBIDDEN: [RegExp, string][] = [
  [/from ['"](\.\.\/)+(render|ui|audio|input)\//, 'imports render/ui/audio/input'],
  [/from ['"]react/, 'imports react'],
  [/\bdocument\./, 'touches document'],
  [/\bwindow\./, 'touches window'],
  [/\blocalStorage\b/, 'touches localStorage'],
  [/Math\.random\(/, 'uses Math.random instead of the world RNG'],
];

function resolve(from: string, spec: string) {
  const parts = from.split('/').slice(0, -1);
  for (const seg of spec.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

const THREE_MATH = new Set(['Vector3', 'Vector2', 'Quaternion', 'Euler', 'Matrix4', 'MathUtils']);

describe('architecture rules (08-technical-architecture.md 8.3)', () => {
  const sim = inDir('sim');

  it('finds the simulation sources', () => {
    expect(sim.length).toBeGreaterThan(8);
  });

  it('keeps the simulation free of rendering, DOM, React and nondeterminism', () => {
    for (const [file, code] of sim) {
      for (const [re, why] of SIM_FORBIDDEN) {
        expect(re.test(code), `${file} ${why}`).toBe(false);
      }
    }
  });

  it('lets the simulation use only math types from three', () => {
    for (const [file, code] of sim) {
      for (const m of code.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+['"]three['"]/g)) {
        for (const name of m[2].split(',').map(s => s.trim().replace(/^type\s+/, '')).filter(Boolean)) {
          expect(THREE_MATH.has(name), `${file} imports ${name} from three`).toBe(true);
        }
      }
      expect(/import\s+\*\s+as\s+\w+\s+from\s+['"]three['"]/.test(code), `${file} imports all of three`).toBe(false);
    }
  });

  it('keeps Node built-ins out of browser code', () => {
    for (const [file, code] of Object.entries(all)) {
      expect(/from ['"]node:/.test(code), `${file} imports a Node built-in`).toBe(false);
    }
  });

  it('keeps core free of every other layer', () => {
    for (const [file, code] of inDir('core')) {
      expect(/from ['"]\.\.\/(sim|render|ui|audio|input|content)\//.test(code), `${file} depends on another layer`).toBe(false);
    }
  });

  it('keeps the world loop from importing the battle code (wiki 9.1)', () => {
    const world = all['./sim/world.ts'];
    expect(world).toBeDefined();
    expect(/from ['"]\.\/battle(\/|['"])/.test(world), 'sim/world.ts imports ./battle').toBe(false);
  });

  it('loads the battle code only as a lazy chunk (wiki 9.10)', () => {
    const offenders: string[] = [];
    for (const [file, code] of Object.entries(all)) {
      if (file.startsWith('./sim/battle/')) continue;
      for (const m of code.matchAll(/^import\s+(type\s+)?[^;]*?from\s+['"](\.[^'"]+)['"]/gm)) {
        if (!m[1] && resolve(file, m[2]).startsWith('./sim/battle')) offenders.push(`${file} -> ${m[2]}`);
      }
    }
    expect(offenders).toEqual([]);
    expect(resolve('./ui/battle/loadBattle.ts', '../../sim/battle')).toBe('./sim/battle');
  });

  it('keeps render from writing simulation state', () => {
    for (const [file, code] of inDir('render')) {
      const writes = [...code.matchAll(/\b(world|session|sim)\.(\w+)(\.\w+)*\s*(\+|-|\*)?=(?!=)/g)].map(m => m[0]);
      expect(writes, `${file} writes sim state`).toEqual([]);
    }
  });
});
