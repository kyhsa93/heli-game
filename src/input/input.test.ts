import { describe, expect, it } from 'vitest';
import { World } from '../sim/world';
import { commandForKey, FLIGHT_KEYS, KEY_COMMANDS } from './bindings';
import { FlightInput } from './input';

describe('key bindings (07-ui-ux.md 7.6)', () => {
  it.each([
    ['KeyI', 'engine'], ['KeyV', 'view'], ['KeyC', 'centerView'], ['KeyU', 'toggleHud'], ['KeyH', 'help'], ['KeyM', 'mute'],
    ['Escape', 'pause'], ['Space', 'fire'], ['Digit1', 'weapon1'], ['Digit4', 'weapon4'], ['KeyQ', 'weaponNext'],
    ['KeyT', 'tads'], ['KeyL', 'laser'], ['Equal', 'zoomIn'], ['Minus', 'zoomOut'], ['KeyR', 'fcr'], ['Tab', 'targetNext'],
    ['KeyF', 'flare'], ['KeyX', 'chaff'], ['KeyB', 'bobUp'], ['KeyN', 'pnvs'], ['BracketLeft', 'mpdLeftNext'],
    ['BracketRight', 'mpdRightNext'], ['KeyG', 'radioMenu'],
  ])('%s → %s', (code, cmd) => {
    expect(commandForKey(code)).toBe(cmd);
  });

  it('keeps flight keys free of command bindings', () => {
    for (const keys of Object.values(FLIGHT_KEYS)) for (const k of keys) expect(KEY_COMMANDS[k]).toBeUndefined();
  });

  it('no longer uses Q/E as pedals', () => {
    expect([...FLIGHT_KEYS.pedalLeft, ...FLIGHT_KEYS.pedalRight]).toEqual(['KeyA', 'KeyD']);
  });
});

describe('FlightInput', () => {
  function frame(input: FlightInput, world: World, keys: string[], seconds = 1) {
    input.keys.clear();
    for (const k of keys) input.keys.add(k);
    for (let i = 0; i < seconds * 60; i++) input.update(world, 1 / 60);
  }

  it('maps held keys to controls', () => {
    const world = new World({ seed: 1 }), input = new FlightInput();
    frame(input, world, ['KeyW'], 1);
    expect(world.controls.collective).toBeCloseTo(0.45, 2);
    frame(input, world, ['ArrowUp', 'ArrowRight', 'KeyD'], 2);
    expect(world.controls.cyclicY).toBeGreaterThan(0.99);
    expect(world.controls.cyclicX).toBeGreaterThan(0.99);
    expect(world.controls.pedal).toBe(1);
    frame(input, world, ['KeyQ', 'KeyE'], 1);
    expect(world.controls.pedal).toBe(0);
  });

  it('holds the collective where it was left and makes Shift fine', () => {
    const world = new World({ seed: 1 }), input = new FlightInput();
    frame(input, world, ['KeyW'], 1);
    frame(input, world, [], 2);
    expect(world.controls.collective).toBeCloseTo(0.45, 2);
    frame(input, world, ['KeyW', 'ShiftLeft'], 1);
    expect(world.controls.collective).toBeCloseTo(0.45 + 0.135, 2);
  });
});
