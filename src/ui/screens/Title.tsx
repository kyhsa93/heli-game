import { t } from '../../content/strings';
import type { campaignProgress } from '../../save/campaign';

export function Title({ onCampaign, onTraining, onInstant, onCredits, onFirstFlight, trainingDone, progress }: { onFirstFlight: () => void; progress: ReturnType<typeof campaignProgress>; onCampaign: () => void; onTraining: () => void; onInstant: () => void; onCredits: () => void; trainingDone: boolean }) {
  return (
    <div className="menu">
      <div className="card">
        <h1 className="game-title">{t('title.name')}<small>{t('title.subtitle')}</small></h1>
        {!trainingDone && <button className="first-time" onClick={onFirstFlight}><b>{t('title.firstTime')}</b><span>{t('title.firstTimeGo')}</span></button>}
        <button className="mode primary" onClick={onCampaign}><b>{t('title.campaign')}</b><span>{t('title.progress', { act: progress.act, done: progress.completed, total: progress.total, rank: progress.rank.name })}</span></button>
        <button className="mode primary" onClick={onTraining}><b>{t('title.training')}</b></button>
        <button className="mode primary" onClick={onInstant}><b>{t('title.instant')}</b></button>
        <button className="mode" disabled><b>{t('title.settings')}</b><span>{t('title.soon')}</span></button>
        <button className="go secondary credits-link" onClick={onCredits}>{t('credits.open')}</button>
      </div>
    </div>
  );
}
