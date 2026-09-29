import { useState } from 'react';
import { t } from '../../content/strings';
import type { ThreatLevel } from '../../sim/mission/instant';
import type { CampaignSave } from '../../save/campaign';

const LEVELS: ThreatLevel[] = ['low', 'medium', 'high'];

export function InstantSetup({ best, onGo, onBack }: { best: CampaignSave['instantBest']; onGo: (threat: ThreatLevel) => void; onBack: () => void }) {
  const [threat, setThreat] = useState<ThreatLevel>('medium');
  return (
    <div className="menu room">
      <div className="room-card narrow">
        <h1>{t('instant.setup')}</h1>
        <p className="sub">{best ? t('instant.best', { score: best.score.toLocaleString('en-US'), grade: best.grade }) : t('instant.noBest')}</p>
        <h2>{t('instant.threat')}</h2>
        <div className="choice">
          {LEVELS.map(l => <button key={l} className={threat === l ? 'on' : ''} onClick={() => setThreat(l)}>{t(`instant.threatLevel.${l}`)}</button>)}
        </div>
        <h2>{t('instant.time')}</h2>
        <div className="choice">
          <button className="on">{t('briefing.time.day')}</button>
          <span className="para">{t('instant.timeSoon')}</span>
        </div>
        <div className="room-buttons">
          <button className="go secondary" onClick={onBack}>{t('instant.back')}</button>
          <button className="go" onClick={() => onGo(threat)}>{t('instant.go')}</button>
        </div>
      </div>
    </div>
  );
}
