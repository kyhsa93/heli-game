import { describe, expect, it } from 'vitest';
import { G, LAND_VY, STEP } from './constants';
import { Game } from './game';
import { rng } from './math';

function setup() {
  const game = new Game({ random: rng(42) });
  game.start();
  return game;
}

function run(game: Game, seconds: number, each?: () => void) {
  for (let i = 0; i < seconds * 120; i++) { each?.(); game.step(STEP); }
}

function holdVy(game: Game, target: number) {
  return () => {
    game.keys.up = game.heli.vy > target + 10;
    game.keys.down = game.heli.vy < target - 10;
  };
}

describe('Game', () => {
  it('takes off only once thrust exceeds gravity', () => {
    const game = setup();
    run(game, 1);
    expect(game.heli.landed).toBe(true);
    game.keys.up = true;
    run(game, 1.5);
    expect(game.heli.landed).toBe(false);
    expect(game.heli.vy).toBeLessThan(0);
    expect(game.heli.T / G).toBeGreaterThan(1.7);
  });

  it('lands softly on a pad and refuels at base', () => {
    const game = setup();
    const base = game.world.pads[0];
    Object.assign(game.heli, { fuel: 30, landed: false, x: base.x, y: base.y - 200, T: G });
    run(game, 6, holdVy(game, 70));
    expect(game.heli.alive).toBe(true);
    expect(game.heli.landed).toBe(true);
    const fuel = game.heli.fuel;
    game.keys.up = game.keys.down = false;
    run(game, 1);
    expect(game.heli.fuel).toBeGreaterThan(fuel);
  });

  it('crashes when touching down too fast', () => {
    const game = setup();
    const base = game.world.pads[0];
    Object.assign(game.heli, { landed: false, x: base.x, y: base.y - 60, vy: 300, T: 0 });
    run(game, 0.5);
    expect(game.heli.alive).toBe(false);
    expect(game.crashReason).toContain(String(LAND_VY));
    run(game, 2);
    expect(game.mode).toBe('over');
  });

  it('hooks the crate, carries it and scores on delivery', () => {
    const game = setup();
    const { heli, crate } = game;
    Object.assign(heli, { landed: false, x: crate.x, y: crate.y - 35, vx: 0, vy: 0, T: G });
    game.hookPressed = true;
    run(game, 0.02);
    expect(crate.attached).toBe(true);
    run(game, 3, holdVy(game, -60));
    expect(crate.onGround).toBe(false);

    const tp = game.world.pads[game.mission.to];
    Object.assign(heli, { x: tp.x, y: tp.y - 220, vx: 0, vy: 0 });
    Object.assign(crate, { x: tp.x, y: tp.y - 120, vx: 0, vy: 0 });
    run(game, 4, holdVy(game, 50));
    expect(crate.onGround).toBe(true);
    expect(crate.dead).toBe(false);
    game.hookPressed = true;
    run(game, 0.5);
    expect(game.delivered).toBe(1);
    expect(game.score).toBeGreaterThan(0);
    run(game, 2);
    expect(game.crate.dead).toBe(false);
  });

  it('breaks a crate dropped from height', () => {
    const game = setup();
    const crate = game.crate;
    crate.y = game.ground(crate.x) - 400;
    run(game, 3);
    expect(crate.dead).toBe(true);
  });

  it('notifies subscribers on mode change', () => {
    const game = new Game({ random: rng(1) });
    const modes: string[] = [];
    game.subscribe(() => modes.push(game.getSnapshot().mode));
    game.start();
    expect(modes).toEqual(['play']);
  });
});
