import { useEffect, useRef } from 'react';
import { STEP } from '../game/constants';
import type { Game } from '../game/game';
import { render } from '../game/render';

export function GameCanvas({ game, touch }: { game: Game; touch: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const touchRef = useRef(touch);
  touchRef.current = touch;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const view = { w: 0, h: 0, dpr: 1, touch: false };
    const resize = () => {
      view.dpr = Math.min(2, window.devicePixelRatio || 1);
      view.w = window.innerWidth; view.h = window.innerHeight;
      canvas.width = view.w * view.dpr | 0; canvas.height = view.h * view.dpr | 0;
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0, last = performance.now(), acc = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (game.mode === 'title') game.idle(dt);
      else {
        acc += dt;
        while (acc >= STEP) { game.step(STEP); acc -= STEP; }
      }
      view.touch = touchRef.current;
      render(game, ctx, view);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [game]);

  return <canvas ref={canvasRef} />;
}
