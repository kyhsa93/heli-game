import { useRef, useState, type PointerEvent } from 'react';

const RADIUS = 56;

export function VirtualStick({ className, label, onMove }: { className: string; label: string; onMove: (x: number, y: number) => void }) {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const origin = useRef<{ id: number; x: number; y: number } | null>(null);

  const move = (e: PointerEvent) => {
    const o = origin.current;
    if (!o || o.id !== e.pointerId) return;
    let dx = e.clientX - o.x, dy = e.clientY - o.y;
    const d = Math.hypot(dx, dy);
    if (d > RADIUS) { dx *= RADIUS / d; dy *= RADIUS / d; }
    setKnob({ x: dx, y: dy });
    onMove(dx / RADIUS, dy / RADIUS);
  };
  const end = (e: PointerEvent) => {
    if (origin.current?.id !== e.pointerId) return;
    origin.current = null;
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  };

  return (
    <div
      className={className}
      onPointerDown={e => {
        e.preventDefault();
        e.stopPropagation();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        origin.current = { id: e.pointerId, x: r.left + r.width / 2, y: r.top + r.height / 2 };
        move(e);
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      <span>{label}</span>
    </div>
  );
}
