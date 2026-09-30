import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import type { SimEvent } from '../events';
import { squadMembers } from '../units';
import { PLAYER_OWNER } from '../weapons/projectile';
import { ofSide, otherSide, SIDES } from '../testing';
import { STEP, World } from '../world';
import { HEADSHOT, MEMBER_HEIGHT, MEMBER_LOD, memberPos, segmentHitsMember } from './squad';

function shootAt(world: World, from: Vector3, to: Vector3) {
  const dir = to.clone().sub(from).normalize();
  world.projectiles.push({ id: 9000 + world.projectiles.length, weapon: 'rifle', pos: from.clone(), origin: from.clone(), vel: dir.multiplyScalar(850), owner: PLAYER_OWNER, life: 2, drag: 0, tracer: false });
  for (let i = 0; i < 60; i++) world.step(STEP);
}

function scene(dist = 40, side: 'coalition' | 'veros' = 'coalition') {
  const world = new World({ seed: 3, terrain: { features: [{ kind: 'flatten', center: [0, 0], radius: 500 }] } });
  world.active = true;
  world.playerSide = side;
  const events: SimEvent[] = [];
  world.events.onAny(e => events.push(e));
  const squad = world.spawnUnit(ofSide('inf', otherSide(side)), 0, 0);
  squad.yaw = 0;
  world.spawnAvatar({ kind: 'soldier', x: 0, z: dist, headingDeg: 0, cls: 'assault' });
  return { world, events, squad };
}

describe('individual squad members (wiki 12.5, 12.7, 5.9-10)', () => {
  it('lays five members out in a wedge that follows the squad', () => {
    const { squad } = scene();
    expect(squad.members).toHaveLength(5);
    const a = memberPos(squad, squad.members![1]);
    squad.yaw = Math.PI / 2;
    const b = memberPos(squad, squad.members![1]);
    expect(a.distanceTo(b)).toBeGreaterThan(1);
    expect(a.distanceTo(squad.pos)).toBeCloseTo(b.distanceTo(squad.pos), 5);
  });

  it.each(SIDES)('5.9-10, 5.9-12: two members downed by the player leave the squad at 24 HP with three figures (player %s)', side => {
    const { world, events, squad } = scene(40, side);
    const eye = (m: number) => memberPos(squad, squad.members![m]).setY(squad.pos.y + 1.2);
    const from = world.soldier!.pos.clone().setY(world.soldier!.pos.y + 1.65);
    for (const m of [3, 4]) for (let k = 0; k < 4; k++) shootAt(world, from, eye(m));
    expect(squad.hp).toBeCloseTo(24, 5);
    expect(squad.members!.filter(m => m.alive)).toHaveLength(3);
    expect(squadMembers(squad)).toBe(3);
    expect(events.filter(e => e.t === 'memberHit' && e.killed)).toHaveLength(2);
  });

  it('doubles damage on a headshot', () => {
    const { world, squad } = scene();
    const m = squad.members![0];
    const head = memberPos(squad, m).setY(squad.pos.y + MEMBER_HEIGHT - 0.1);
    const from = head.clone().add(new Vector3(0, 0, 30));
    shootAt(world, from, head);
    expect(m.hp).toBeCloseTo(8 - 2 * HEADSHOT, 5);
    const body = memberPos(squad, squad.members![1]).setY(squad.pos.y + 1);
    shootAt(world, body.clone().add(new Vector3(0, 0, 30)), body);
    expect(squad.members![1].hp).toBeCloseTo(6, 5);
  });

  it('misses between members up close, but judges the whole squad beyond 300 m', () => {
    const { world, squad } = scene();
    const gap = memberPos(squad, squad.members![0]).lerp(memberPos(squad, squad.members![1]), 0.5).setY(squad.pos.y + 1);
    const from = gap.clone().add(new Vector3(0, 0, 40));
    expect(segmentHitsMember(from, gap.clone().add(new Vector3(0, 0, -1)), squad)).toBe(null);
    shootAt(world, from, gap.clone().add(new Vector3(0, 0, -1)));
    expect(squad.hp).toBe(40);
    const far = scene(MEMBER_LOD + 100);
    const g2 = memberPos(far.squad, far.squad.members![0]).lerp(memberPos(far.squad, far.squad.members![1]), 0.5).setY(far.squad.pos.y + 1);
    shootAt(far.world, g2.clone().add(new Vector3(0, 0, 40)), g2.clone().add(new Vector3(0, 0, -1)));
    expect(far.squad.hp).toBeLessThan(40);
  });

  it('keeps members in step with statistical damage from bots', () => {
    const { world, squad } = scene();
    world.damageUnit(squad, 16, false);
    expect(squad.members!.filter(m => m.alive)).toHaveLength(3);
    expect(squad.members![4].alive).toBe(false);
    world.damageUnit(squad, 4, false);
    expect(squad.members!.reduce((t, m) => t + m.hp, 0)).toBeCloseTo(squad.hp, 5);
  });
});
