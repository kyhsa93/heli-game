import { MS_TO_FPM, MS_TO_KT } from '../core/units';
import type { CrashReason, SimEvent } from '../sim/events';

export interface Message { text: string; color: string; life: number }

const CRASH: Record<CrashReason, (v?: number) => string> = {
  rotorStrike: () => '로터 블레이드가 지형에 부딪혔습니다',
  terrain: () => '기체가 지형에 충돌했습니다',
  water: () => '물에 추락했습니다',
  tree: () => '나무에 부딪혔습니다',
  building: () => '건물에 부딪혔습니다',
  ditched: () => '물 위에 내려앉아 기체가 가라앉았습니다',
  hardLanding: v => `착륙 충격이 너무 큽니다 (${Math.round((v ?? 0) * MS_TO_FPM)} fpm)`,
  slideLanding: v => `미끄러지며 접지해 전복됐습니다 (${Math.round((v ?? 0) * MS_TO_KT)} kt)`,
  tiltLanding: () => '기울어진 채로 접지해 전복됐습니다',
  slope: () => '경사가 너무 급한 곳에 내려앉았습니다',
};

export function crashText(reason: CrashReason, value?: number) {
  return CRASH[reason](value);
}

export function eventMessage(e: SimEvent): Omit<Message, 'life'> | null {
  switch (e.t) {
    case 'engine':
      if (e.cause === 'fuel') return { text: '연료 고갈 — 엔진 정지! 콜렉티브를 내려 로터를 살리세요', color: '#ef476f' };
      return e.on ? { text: '시동 — 로터 회전수가 오를 때까지 기다리세요', color: '#ffd166' } : { text: '엔진 정지', color: '#ef476f' };
    case 'landed':
      if (e.descent < 1) return { text: '부드러운 착륙', color: '#06d6a0' };
      if (e.descent > 2.2) return { text: '거친 착륙', color: '#ffd166' };
      return { text: '착륙', color: '#ffd166' };
    case 'refuel': return { text: '연료 보급 중', color: '#4cc9f0' };
    case 'boundary': return { text: '작전 구역 경계입니다', color: '#ef476f' };
    case 'crash': return null;
  }
}
