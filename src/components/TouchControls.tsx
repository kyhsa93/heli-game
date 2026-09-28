import { useState, type PointerEvent } from 'react';
import type { Game, Key } from '../game/game';

type Control = Key | 'hook';

const BUTTONS: { id: string; control: Control; label: string }[] = [
  { id: 'bl', control: 'left', label: '◀' },
  { id: 'br', control: 'right', label: '▶' },
  { id: 'bu', control: 'up', label: '▲' },
  { id: 'bd', control: 'down', label: '▼' },
  { id: 'bh', control: 'hook', label: '고리' },
];

export function TouchControls({ game }: { game: Game }) {
  const [held, setHeld] = useState<Set<Control>>(new Set());

  const set = (control: Control, on: boolean) => {
    setHeld(prev => {
      const next = new Set(prev);
      if (on) next.add(control); else next.delete(control);
      return next;
    });
    if (control === 'hook') { if (on && game.mode === 'play') game.hookPressed = true; }
    else game.keys[control] = on;
  };

  return (
    <div className="touch">
      {BUTTONS.map(b => {
        const down = (e: PointerEvent) => { e.preventDefault(); set(b.control, true); };
        const up = (e: PointerEvent) => { e.preventDefault(); set(b.control, false); };
        return (
          <div
            key={b.id}
            id={b.id}
            className={held.has(b.control) ? 'btn on' : 'btn'}
            onPointerDown={down}
            onPointerUp={up}
            onPointerCancel={up}
            onPointerLeave={up}
            onContextMenu={e => e.preventDefault()}
          >
            {b.label}
          </div>
        );
      })}
    </div>
  );
}
