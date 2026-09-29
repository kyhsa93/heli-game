import { describe, expect, it } from 'vitest';
import { hoverCollective as hoverFor } from '../testing';
import { STEP, World } from '../world';
import { airborneAt } from '../testing';
import { CLEAN_LOADOUT, count, createLoadout, grossWeight, hoverCollective, REFERENCE_WEIGHT, STANDARD_LOADOUT, type LoadoutDef } from './loadout';

const HEAVY: LoadoutDef = { pylons: { L2: 'agm114k', L1: 'agm114k', R1: 'agm114k', R2: 'agm114k' }, stingers: false, gunRounds: 1200, fuel: 100 };

describe('loadout weight (03-helicopter-and-flight.md 3.2)', () => {
  it('matches the design example: 16 Hellfires, full fuel and gun hover at about 0.79 collective', () => {
    const lo = createLoadout(HEAVY);
    const w = grossWeight(lo, 100, 1200);
    expect(w).toBeCloseTo(7690, -1);
    expect(hoverCollective(w)).toBeCloseTo(0.79, 1);
    expect(Math.abs(hoverCollective(w) - 0.787)).toBeLessThan(0.02);
    expect(count(lo, 'agm114k')).toBe(16);
  });

  it('uses the reference weight (empty, half fuel) as the 1.7 g baseline', () => {
    expect(REFERENCE_WEIGHT).toBe(5750);
    expect(hoverCollective(REFERENCE_WEIGHT)).toBeCloseTo(1 / 1.7, 6);
  });

  it('really needs more collective to hover when heavy', () => {
    const heavy = new World({ seed: 7 }), light = new World({ seed: 7 });
    heavy.loadoutDef = HEAVY; light.loadoutDef = CLEAN_LOADOUT;
    for (const w of [heavy, light]) { w.resetPlayer(); w.active = true; const p = w.pads[0]; airborneAt(w, p.x, p.z, p.y + 80); }
    const hover = (w: World) => { for (let i = 0; i < 480; i++) { w.controls.collective = hoverFor(w); w.step(STEP); } return w.player.vel.y; };
    expect(Math.abs(hover(heavy))).toBeLessThan(0.5);
    expect(Math.abs(hover(light))).toBeLessThan(0.5);
    expect(hoverFor(heavy)).toBeGreaterThan(hoverFor(light) + 0.15);
  });

  it('gets lighter as fuel burns and rounds are fired', () => {
    const w = new World({ seed: 7 });
    w.active = true;
    const p = w.pads[0];
    airborneAt(w, p.x, p.z, p.y + 60);
    const before = w.grossWeight;
    w.commands.fire = true;
    for (let i = 0; i < 240; i++) { w.controls.collective = hoverFor(w); w.step(STEP); }
    expect(w.grossWeight).toBeLessThan(before - 5);
    expect(w.player.thrustScale).toBeGreaterThan(REFERENCE_WEIGHT / before);
  });

  it('applies loadout ammunition and fuel', () => {
    const w = new World({ seed: 7 });
    w.applyLoadout({ ...STANDARD_LOADOUT, gunRounds: 300, fuel: 40 });
    expect(w.arms.gunAmmo).toBe(300);
    expect(w.player.fuel).toBe(40);
    expect(count(w.loadout, 'hydra70')).toBe(38);
  });
});
