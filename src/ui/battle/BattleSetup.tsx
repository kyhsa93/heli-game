import { t } from '../../content/strings';
import type { Settings } from '../../save/save';
import { DIFFICULTY_LEVELS, type DifficultyLevel } from '../../sim/difficulty';
import type { BattleMode } from '../state';

export interface BattleChoice { mode: BattleMode; map: string; side: 'coalition' | 'veros'; time: 'day' | 'dusk' }

export const DEFAULT_CHOICE: BattleChoice = { mode: 'quick', map: 'harek', side: 'coalition', time: 'day' };
export const READY = { modes: ['quick'], maps: ['harek'], sides: ['coalition', 'veros'] } as const;
const ESTIMATE = { quick: [8, 12, 10, 7] } as const;

function Pick<T extends string>({ value, options, ready, label, onPick }: { value: T; options: readonly T[]; ready: readonly string[]; label: (v: T) => string; onPick: (v: T) => void }) {
  return (
    <div className="choice">
      {options.map(o => {
        const ok = ready.includes(o);
        return (
          <button key={o} className={o === value ? 'on' : ''} disabled={!ok} onClick={() => onPick(o)}>
            {label(o)}{!ok && <small>{t('battle.setup.soon')}</small>}
          </button>
        );
      })}
    </div>
  );
}

export function BattleSetup({ choice, settings, onChoice, onDifficulty, onDeploy, onBack }: {
  choice: BattleChoice; settings: Settings; onChoice: (c: BattleChoice) => void; onDifficulty: (d: DifficultyLevel) => void; onDeploy: () => void; onBack: () => void;
}) {
  const set = (patch: Partial<BattleChoice>) => onChoice({ ...choice, ...patch });
  const [min, max, squads, vehicles] = ESTIMATE.quick;
  const rows: [string, React.ReactElement][] = [
    ['mode', <Pick value={choice.mode} options={['quick', 'conquest', 'breakthrough'] as BattleMode[]} ready={READY.modes} label={v => t(`battle.modes.${v}`)} onPick={mode => set({ mode })} />],
    ['map', <Pick value={choice.map} options={['harek', 'reservoir', 'pass']} ready={READY.maps} label={v => t(`battle.maps.${v}`)} onPick={map => set({ map })} />],
    ['side', <Pick value={choice.side} options={['coalition', 'veros'] as const} ready={READY.sides} label={v => t(`battle.sides.${v}`)} onPick={side => set({ side })} />],
    ['difficulty', <Pick value={settings.difficulty} options={DIFFICULTY_LEVELS} ready={DIFFICULTY_LEVELS} label={v => t(`settings.difficulty.${v}`)} onPick={onDifficulty} />],
    ['time', <Pick value={choice.time} options={['day', 'dusk'] as const} ready={['day', 'dusk']} label={v => t(`battle.times.${v}`)} onPick={time => set({ time })} />],
  ];
  return (
    <div className="menu">
      <div className="card wide battle-setup">
        <h1>{t('battle.setup.title')}</h1>
        <div className="settings">
          {rows.map(([k, el]) => <div className="setting-row" key={k}><span>{t(`battle.setup.${k}`)}</span>{el}</div>)}
        </div>
        <p className="sub">{t('battle.setup.estimate', { min, max, squads, vehicles })}</p>
        <div className="pause-buttons">
          <button className="go secondary" onClick={onBack}>{t('battle.setup.back')}</button>
          <button className="go" onClick={onDeploy}>{t('battle.setup.deploy')} ▶</button>
        </div>
      </div>
    </div>
  );
}
