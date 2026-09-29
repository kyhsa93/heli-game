import { describe, expect, it } from 'vitest';
import { STEP } from '../sim/world';
import { eventMessage, MessageLog } from './messages';

describe('MessageLog', () => {
  it('expires messages after three seconds of simulation time regardless of frame rate', () => {
    const log = new MessageLog();
    log.push(eventMessage({ t: 'refuel' })!);
    for (let i = 0; i < 359; i++) log.tick(STEP);
    expect(log.items).toHaveLength(1);
    log.tick(STEP * 2);
    expect(log.items).toHaveLength(0);
  });

  it('keeps a message alive when the frame rate is low but little simulation time passed', () => {
    const log = new MessageLog();
    log.push(eventMessage({ t: 'boundary' })!);
    for (let frame = 0; frame < 60; frame++) log.tick(0);
    expect(log.items).toHaveLength(1);
  });

  it('drops duplicates and keeps at most four', () => {
    const log = new MessageLog();
    log.push({ text: 'a', color: '' }); log.push({ text: 'a', color: '' });
    for (const t of ['b', 'c', 'd', 'e']) log.push({ text: t, color: '' });
    expect(log.items.map(m => m.text)).toEqual(['b', 'c', 'd', 'e']);
  });
});
