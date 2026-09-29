import { t } from '../../content/strings';
import type { MissionDef } from '../../sim/mission/schema';
import { MissionMap } from './MissionMap';

export function Briefing({ mission, onNext, onBack }: { mission: MissionDef; onNext: () => void; onBack: () => void }) {
  const env = mission.environment;
  const initial = mission.initialObjectives ? new Set(mission.initialObjectives) : null;
  return (
    <div className="menu room">
      <div className="room-card">
        <p className="kicker">{t('briefing.act', { act: mission.act })} · {t(`briefing.kind.${mission.kind}`)}</p>
        <h1>{mission.title}</h1>
        <div className="room-grid">
          <MissionMap mission={mission} />
          <div className="room-text">
            <p className="sub">{mission.briefing.summary}</p>
            {mission.briefing.situation.map(p => <p key={p} className="para">{p}</p>)}
            <h2>{t('briefing.objectives')}</h2>
            <ul className="objs">
              {mission.objectives.filter(o => !initial || initial.has(o.id)).map(o => <li key={o.id} className={o.primary ? 'primary' : ''}>{o.primary ? '◆' : '◇'} {o.label}</li>)}
            </ul>
            <h2>{t('briefing.threats')}</h2>
            <p className="para">{mission.briefing.threats.join(' · ')}</p>
            <h2>{t('briefing.weather')}</h2>
            <p className="para">{t(`briefing.time.${env.time}`)}{env.fog ? ` · ${t('briefing.fog')}` : ''} · {t('briefing.wind', { dir: Math.round(env.wind.dirDeg), kt: Math.round(env.wind.speed * 1.94) })}</p>
          </div>
        </div>
        <div className="room-buttons">
          <button className="go secondary" onClick={onBack}>{t('briefing.back')}</button>
          <button className="go" onClick={onNext}>{t('briefing.toLoadout')}</button>
        </div>
      </div>
    </div>
  );
}
