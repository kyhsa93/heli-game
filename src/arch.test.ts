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

  it('keeps core free of every other layer', () => {
    for (const [file, code] of inDir('core')) {
      expect(/from ['"]\.\.\/(sim|render|ui|audio|input|content)\//.test(code), `${file} depends on another layer`).toBe(false);
    }
  });

  it('keeps render from writing simulation state', () => {
    for (const [file, code] of inDir('render')) {
      const writes = [...code.matchAll(/\b(world|session|sim)\.(\w+)(\.\w+)*\s*(\+|-|\*)?=(?!=)/g)].map(m => m[0]);
      expect(writes, `${file} writes sim state`).toEqual([]);
    }
  });
});
