import { t } from '../../../content/strings';
import { TADS_FOV_NAMES, tadsFovDeg } from '../../../sim/sensors/tads';
import type { World } from '../../../sim/world';
import { bezel, DIM, GREEN, MONO, screenClip } from './common';

export function drawTadsPage(g: CanvasRenderingContext2D, world: World, image: CanvasImageSource | null, labels: readonly string[], selected: number) {
  bezel(g, labels, selected);
  screenClip(g, () => {
    const x0 = 64, y0 = 64, size = 320;
    if (image) {
      g.shadowBlur = 0;
      g.drawImage(image, x0 + 32, y0 + 8, size, size);
    } else {
      g.fillStyle = DIM; g.font = `bold 18px ${MONO}`; g.textAlign = 'center';
      g.fillText('NO VIDEO', 256, 230);
    }
    g.shadowBlur = 4;
    g.strokeStyle = GREEN; g.lineWidth = 2;
    g.strokeRect(x0 + 32, y0 + 8, size, size);
    const cx = x0 + 32 + size / 2, cy = y0 + 8 + size / 2;
    g.beginPath(); g.moveTo(cx - 18, cy); g.lineTo(cx - 6, cy); g.moveTo(cx + 6, cy); g.lineTo(cx + 18, cy);
    g.moveTo(cx, cy - 18); g.lineTo(cx, cy - 6); g.moveTo(cx, cy + 6); g.lineTo(cx, cy + 18); g.stroke();

    const tads = world.tads, l = world.laser;
    g.fillStyle = GREEN; g.font = `bold 15px ${MONO}`; g.textAlign = 'left';
    g.fillText(`${tads.sensor === 'flir' ? 'FLIR' : 'TV'} ${TADS_FOV_NAMES[tads.fov]} ${tadsFovDeg(tads)}°`, 64, 58 + 0);
    g.fillText(`RNG ${l.range !== null ? Math.round(l.range) : '----'}${l.on ? ' L' : ''}`, 64, 420);
    const idOf = world.identify.unitId ?? l.unitId;
    const u = idOf !== null ? world.unit(idOf) : null;
    g.textAlign = 'right';
    if (u) g.fillText(u.identified ? t('tads.target', { name: t(`units.${u.defId}`), side: t(`sides.${u.side}`) }) : t('tads.unknown'), 448, 420);
  });
}
