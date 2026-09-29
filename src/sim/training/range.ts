import { Vector3 } from 'three';
import { GEAR_Y } from '../heli/airframe';
import { hoverCollective } from '../heli/loadout';
import { updateQ } from '../heli/state';
import type { World } from '../world';

export function startAirborne(world: World, target: Vector3, distance: number, agl: number, from?: Vector3) {
  const base = from ?? new Vector3(world.pads[0].x, 0, world.pads[0].z);
  const dir = new Vector3(base.x - target.x, 0, base.z - target.z);
  if (dir.lengthSq() < 1) dir.set(0, 0, 1);
  dir.normalize();
  const x = target.x + dir.x * distance, z = target.z + dir.z * distance;
  let clear = Math.max(world.terrain.surfaceAt(x, z), target.y);
  for (let k = 0; k <= 20; k++) clear = Math.max(clear, world.terrain.surfaceAt(x + (target.x - x) * k / 20, z + (target.z - z) * k / 20));
  const h = world.player;
  h.pos.set(x, clear - GEAR_Y + agl, z);
  h.vel.set(0, 0, 0);
  h.yaw = Math.atan2(-(target.x - x), -(target.z - z));
  h.pitch = h.roll = h.pRate = h.rRate = h.yRate = 0;
  h.engineOn = true; h.rpm = 1; h.landed = false;
  updateQ(h);
  world.controls.collective = hoverCollective(world.grossWeight);
}
