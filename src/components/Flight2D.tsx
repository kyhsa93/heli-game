import { useEffect, useState } from 'react';
import { Game, type BestStore, type Key } from '../game/game';
import { GameCanvas } from './GameCanvas';
import { Overlay } from './Overlay';
import { TouchControls } from './TouchControls';

const KEYMAP: Record<string, Key> = {
  ArrowUp: 'up', KeyW: 'up', Space: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

const bestStore: BestStore = {
  load() {
    try { return Number(localStorage.getItem('heli-best')) || 0; } catch { return 0; }
  },
  save(v) {
    try { localStorage.setItem('heli-best', String(v)); } catch { /* storage unavailable */ }
  },
};

export default function Flight2D({ onExit, touch }: { onExit: () => void; touch: boolean }) {
  const [game] = useState(() => new Game({ store: bestStore }));

  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      const k = KEYMAP[e.code];
      if (k) { game.keys[k] = true; e.preventDefault(); }
      if (e.repeat) return;
      if (e.code === 'Escape') { onExit(); return; }
      if (game.mode === 'play' && e.code === 'KeyE') game.hookPressed = true;
      if (e.code === 'KeyR' && (game.mode === 'play' || game.mode === 'over')) game.start();
      else if ((game.mode === 'title' || game.mode === 'over') && (e.code === 'Enter' || e.code === 'Space')) game.start();
    };
    const keyup = (e: KeyboardEvent) => { const k = KEYMAP[e.code]; if (k) game.keys[k] = false; };
    const blur = () => { for (const k of Object.keys(game.keys) as Key[]) game.keys[k] = false; };
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
    };
  }, [game, onExit]);

  return (
    <>
      <GameCanvas game={game} touch={touch} />
      {touch && <TouchControls game={game} />}
      <Overlay game={game} onExit={onExit} />
    </>
  );
}
