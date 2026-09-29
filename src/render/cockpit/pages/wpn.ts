import { PYLON_X, PYLONS, type PylonId, type Store } from '../../../sim/heli/loadout';
import { hellfireSolution, longbowSolution, type HellfireStatus } from '../../../sim/weapons/hellfire';
import type { World } from '../../../sim/world';
import { stingerStatus } from '../../tadsHud';
import { AMBER, bezel, DIM, GREEN, MONO, screenClip } from './common';

const STORE_TEXT: Record<Store, string> = { empty: '---', agm114k: 'K', agm114l: 'L', hydra70: 'RKT' };
const MODE_TEXT: Record<HellfireStatus, string> = { lobl: 'LOBL', loal: 'LOAL', rf: 'RF', range: 'RNG', align: 'ALN', empty: 'EMPTY', noTarget: '----' };

export interface PylonLine { id: PylonId; store: Store; label: string; rounds: number; selected: boolean }

export function wpnPylons(world: World): PylonLine[] {
  const sel = world.arms.selected;
  return PYLONS.map(id => {
    const store = world.loadout.def.pylons[id];
    const selected = (sel === 'hydra70' && store === 'hydra70') || (sel === 'agm114k' && store === 'agm114k') || (sel === 'agm114l' && store === 'agm114l');
    return { id, store, label: STORE_TEXT[store], rounds: store === 'empty' ? 0 : world.loadout.rounds[id], selected };
  });
}

export function wpnSelected(world: World) {
  const a = world.arms;
  if (a.selected === 'hydra70') return `RKT x${a.salvo}`;
  if (a.selected === 'agm114k') return `MSL ${MODE_TEXT[hellfireSolution(world).status]}`;
  if (a.selected === 'agm114l') return `MSL L ${MODE_TEXT[longbowSolution(world).status]}`;
  if (a.selected === 'stinger') return `STG ${stingerStatus(world)}`;
  return 'GUN';
}

export function drawWpn(g: CanvasRenderingContext2D, world: World, labels: readonly string[], selected: number) {
  bezel(g, labels, selected);
  screenClip(g, () => {
    const cx = 256, wingY = 230;
    g.lineWidth = 3; g.strokeStyle = DIM;
    g.beginPath();
    g.moveTo(cx, 96); g.lineTo(cx + 18, 130); g.lineTo(cx + 18, 330); g.lineTo(cx + 6, 400);
    g.lineTo(cx - 6, 400); g.lineTo(cx - 18, 330); g.lineTo(cx - 18, 130); g.closePath();
    g.moveTo(cx - 170, wingY); g.lineTo(cx + 170, wingY);
    g.stroke();

    const gunSel = world.arms.selected === 'gun30';
    g.font = `bold 16px ${MONO}`; g.textAlign = 'center';
    g.fillStyle = gunSel ? GREEN : DIM;
    g.fillText(`GUN ${world.arms.gunAmmo}`, cx, 84);
    if (gunSel) { g.strokeStyle = GREEN; g.lineWidth = 2; g.strokeRect(cx - 58, 66, 116, 26); }

    for (const p of wpnPylons(world)) {
      const x = cx + PYLON_X[p.id] * 72, y = wingY + 18;
      g.strokeStyle = p.selected ? GREEN : DIM; g.lineWidth = p.selected ? 3 : 2;
      g.strokeRect(x - 28, y, 56, 62);
      g.fillStyle = p.store === 'empty' ? DIM : GREEN;
      g.font = `bold 15px ${MONO}`;
      g.fillText(p.label, x, y + 24);
      if (p.store !== 'empty') { g.font = `bold 20px ${MONO}`; g.fillStyle = p.rounds ? GREEN : AMBER; g.fillText(`${p.rounds}`, x, y + 50); }
      g.font = `12px ${MONO}`; g.fillStyle = DIM; g.fillText(p.id, x, y + 78);
    }
    if (world.loadout.def.stingers) {
      g.font = `bold 14px ${MONO}`; g.fillStyle = GREEN;
      const n = world.loadout.stingerRounds;
      for (const s of [-1, 1]) g.fillText(`STG ${s < 0 ? (n >= 2 ? 1 : 0) : (n >= 1 ? 1 : 0)}`, cx + s * 160, wingY - 12);
    }

    g.textAlign = 'left'; g.font = `bold 17px ${MONO}`; g.fillStyle = GREEN;
    g.fillText(`SEL  ${wpnSelected(world)}`, 64, 368);
    g.fillText('CODE A 1688', 64, 396);
    g.fillStyle = GREEN;
    g.fillText(`FLR ${world.cm.flares}  CHF ${world.cm.chaffUnlocked ? world.cm.chaff : '--'}`, 64, 424);
    g.textAlign = 'right'; g.fillStyle = world.player.alive ? GREEN : AMBER;
    g.fillText(world.player.alive ? 'ARM' : 'SAFE', 448, 368);
  });
}
