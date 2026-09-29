import { useEffect, useRef, useState } from 'react';
import { CAMPAIGN, frontLine } from '../../content/campaign';
import { MISSIONS } from '../../content/missions';
import { t } from '../../content/strings';
import { campaignProgress, missionAvailable, unlockedFor, type CampaignSave } from '../../save/campaign';
import { Terrain } from '../../sim/terrain';
import { drawRelief } from '../mission/MissionMap';

function drawCampaign(cv: HTMLCanvasElement, completed: number) {
  const size = cv.width, g = cv.getContext('2d')!;
  drawRelief(g, size, new Terrain(CAMPAIGN.seed));
  const line = frontLine(completed).map(([x, y]) => [x * size, y * size] as const);
  const side = (edge: number, color: string) => {
    g.beginPath(); g.moveTo(0, edge); line.forEach(([x, y]) => g.lineTo(x, y)); g.lineTo(size, edge); g.closePath();
    g.fillStyle = color; g.fill();
  };
  side(0, 'rgba(239, 71, 111, .22)');
  side(size, 'rgba(76, 201, 240, .12)');
  g.beginPath(); line.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.setLineDash([10, 6]); g.lineWidth = 3; g.strokeStyle = '#ffd166'; g.stroke(); g.setLineDash([]);
  g.lineWidth = 2; g.strokeStyle = 'rgba(232, 238, 247, .5)';
  g.beginPath(); CAMPAIGN.missions.forEach((m, i) => (i ? g.lineTo(m.node[0] * size, m.node[1] * size) : g.moveTo(m.node[0] * size, m.node[1] * size))); g.stroke();
}

export function Campaign({ save, selected, onSelect, onBriefing, onBack }: { save: CampaignSave; selected?: string; onSelect: (id: string) => void; onBriefing: (id: string) => void; onBack: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const progress = campaignProgress(save);
  const pick = CAMPAIGN.missions.find(m => m.id === (selected ?? progress.next)) ?? CAMPAIGN.missions[0];
  const record = save.missions[pick.id];
  const open = missionAvailable(save, pick.id);
  const built = !!MISSIONS[pick.id];
  const def = MISSIONS[pick.id];
  const unlocked = unlockedFor(save);
  const next = CAMPAIGN.unlocks.find(u => !unlocked.has(u.id) && u.after);
  const act = CAMPAIGN.acts.find(a => a.act === pick.act);

  useEffect(() => {
    let alive = true;
    const id = setTimeout(() => {
      if (!alive || !ref.current) return;
      drawCampaign(ref.current, progress.completed);
      setReady(true);
    }, 30);
    return () => { alive = false; clearTimeout(id); };
  }, [progress.completed]);

  return (
    <div className="menu room">
      <div className="room-card">
        <p className="kicker">{t('campaign.rank', { rank: progress.rank.name, score: save.totalScore })}</p>
        <h1>{t('campaign.title')}</h1>
        <div className="room-grid">
          <div className="mission-map campaign-map">
            <canvas ref={ref} width={360} height={360} />
            {!ready && <span className="map-wait">{t('briefing.mapLoading')}</span>}
            <span className="side enemy">{t('campaign.enemy')}</span>
            <span className="side allied">{t('campaign.allied')}</span>
            {CAMPAIGN.missions.map((m, i) => {
              const r = save.missions[m.id];
              const state = r?.completed ? 'done' : missionAvailable(save, m.id) ? 'open' : 'locked';
              return (
                <button key={m.id} className={`node ${state}${m.id === pick.id ? ' on' : ''}`} style={{ left: `${m.node[0] * 100}%`, top: `${m.node[1] * 100}%` }}
                  aria-label={m.title} onClick={() => onSelect(m.id)}>
                  <b>{i + 1}</b>{r?.bestGrade && <small className={`g${r.bestGrade}`}>{r.bestGrade}</small>}
                </button>
              );
            })}
          </div>
          <div className="room-text">
            <p className="kicker">{t('campaign.missionNo', { n: CAMPAIGN.missions.indexOf(pick) + 1 })} · {t('briefing.act', { act: pick.act })} {act?.name} · {t(`briefing.kind.${pick.kind}`)}</p>
            <h2 className="pick-title">{pick.title}</h2>
            <p className="para">{def ? def.briefing.summary : pick.summary}</p>
            <h2>{t('briefing.threats')}</h2>
            <p className="para">{(def ? def.briefing.threats : pick.threats).join(' · ')}</p>
            <h2>{t('campaign.best')}</h2>
            <p className="para">{record?.bestGrade ? t('campaign.bestValue', { score: record.bestScore, grade: record.bestGrade }) : t('campaign.noBest')}</p>
            {!open && <p className="para bad">{t('campaign.locked')}</p>}
            {open && !built && <p className="para bad">{t('campaign.notBuilt')}</p>}
            <h2>{t('campaign.unlocks')}</h2>
            <p className="para">{unlocked.size ? CAMPAIGN.unlocks.filter(u => unlocked.has(u.id)).map(u => u.name).join(' · ') : t('campaign.noUnlocks')}</p>
            {next && <p className="para">{t('campaign.nextUnlock', { name: next.name, n: CAMPAIGN.missions.findIndex(m => m.id === next.after) + 1 })}</p>}
          </div>
        </div>
        <div className="room-buttons">
          <button className="go secondary" onClick={onBack}>{t('briefing.back')}</button>
          <button className="go" disabled={!open || !built} onClick={() => onBriefing(pick.id)}>{t('campaign.toBriefing')}</button>
        </div>
      </div>
    </div>
  );
}
