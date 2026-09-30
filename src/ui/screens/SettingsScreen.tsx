import type { ReactElement } from 'react';
import { t } from '../../content/strings';
import { RANGES, type Quality, type Settings, type StickSize } from '../../save/save';
import { DIFFICULTY_LEVELS } from '../../sim/difficulty';

type Update = (s: Settings) => void;

export function Choice<T extends string>({ value, options, label, onPick }: { value: T; options: readonly T[]; label: (v: T) => string; onPick: (v: T) => void }) {
  return <div className="choice">{options.map(o => <button key={o} className={o === value ? 'on' : ''} onClick={() => onPick(o)}>{label(o)}</button>)}</div>;
}

function Slider({ value, range, step, format, onChange }: { value: number; range: readonly [number, number]; step: number; format: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label className="slider">
      <input type="range" min={range[0]} max={range[1]} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />
      <b>{format(value)}</b>
    </label>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <div className="choice"><button className={on ? 'on' : ''} onClick={() => onChange(!on)}>{t(on ? 'settings.on' : 'settings.off')}</button></div>;
}

export function SettingsPanel({ settings: s, onChange, onCredits }: { settings: Settings; onChange: Update; onCredits?: () => void }) {
  const set = (patch: Partial<Settings>) => onChange({ ...s, ...patch });
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const rows: [string, ReactElement][] = [
    ['difficulty', <Choice value={s.difficulty} options={DIFFICULTY_LEVELS} label={v => t(`settings.difficulty.${v}`)} onPick={difficulty => set({ difficulty })} />],
    ['autoIdentify', <Toggle on={s.assists.autoIdentify} onChange={v => set({ assists: { ...s.assists, autoIdentify: v } })} />],
    ['autoCountermeasures', <Toggle on={s.assists.autoCountermeasures} onChange={v => set({ assists: { ...s.assists, autoCountermeasures: v } })} />],
    ['lookSensitivity', <Slider value={s.controls.lookSensitivity} range={RANGES.lookSensitivity} step={0.1} format={pct} onChange={v => set({ controls: { ...s.controls, lookSensitivity: v } })} />],
    ['invertLookY', <Toggle on={s.controls.invertLookY} onChange={v => set({ controls: { ...s.controls, invertLookY: v } })} />],
    ['tadsSensitivity', <Slider value={s.controls.tadsSensitivity} range={RANGES.tadsSensitivity} step={0.1} format={pct} onChange={v => set({ controls: { ...s.controls, tadsSensitivity: v } })} />],
    ['touchStickSize', <Choice value={s.controls.touchStickSize} options={['S', 'M', 'L'] as StickSize[]} label={v => t(`settings.stick.${v}`)} onPick={v => set({ controls: { ...s.controls, touchStickSize: v } })} />],
    ['fov', <Slider value={s.display.fov} range={RANGES.fov} step={1} format={v => `${v}°`} onChange={v => set({ display: { ...s.display, fov: v } })} />],
    ['ihadssBrightness', <Slider value={s.display.ihadssBrightness} range={RANGES.ihadssBrightness} step={0.05} format={pct} onChange={v => set({ display: { ...s.display, ihadssBrightness: v } })} />],
    ['quality', <Choice value={s.display.quality} options={['low', 'medium', 'high'] as Quality[]} label={v => t(`settings.quality.${v}`)} onPick={v => set({ display: { ...s.display, quality: v } })} />],
    ['showFps', <Toggle on={s.display.showFps} onChange={v => set({ display: { ...s.display, showFps: v } })} />],
    ['master', <Slider value={s.audio.master} range={RANGES.master} step={0.05} format={pct} onChange={v => set({ audio: { ...s.audio, master: v } })} />],
    ['voiceWarnings', <Toggle on={s.voiceWarnings} onChange={voiceWarnings => set({ voiceWarnings })} />],
  ];
  const sections: [string, string[]][] = [
    ['game', ['difficulty', 'autoIdentify', 'autoCountermeasures']],
    ['controls', ['lookSensitivity', 'invertLookY', 'tadsSensitivity', 'touchStickSize']],
    ['display', ['fov', 'ihadssBrightness', 'quality', 'showFps']],
    ['audio', ['master', 'voiceWarnings']],
  ];
  const byKey = new Map(rows);
  return (
    <div className="settings">
      {sections.map(([sec, keys]) => (
        <section key={sec}>
          <h2>{t(`settings.section.${sec}`)}</h2>
          {keys.map(k => <div key={k} className="setting-row"><span>{t(`settings.item.${k}`)}</span>{byKey.get(k)}</div>)}
        </section>
      ))}
      <p className="para dim">{t('settings.subtitlesAlways')}</p>
      {onCredits && <button className="go secondary" onClick={onCredits}>{t('credits.open')}</button>}
    </div>
  );
}

export function SettingsScreen({ settings, onChange, onCredits, onBack }: { settings: Settings; onChange: Update; onCredits: () => void; onBack: () => void }) {
  return (
    <div className="menu room">
      <div className="room-card narrow">
        <h1>{t('settings.title')}</h1>
        <SettingsPanel settings={settings} onChange={onChange} onCredits={onCredits} />
        <div className="room-buttons"><button className="go" onClick={onBack}>{t('briefing.back')}</button></div>
      </div>
    </div>
  );
}
