import { t } from '../../content/strings';

export function Title({ onCampaign, onTraining, onInstant, onCredits, trainingDone }: { onCampaign?: () => void; onTraining: () => void; onInstant: () => void; onCredits: () => void; trainingDone: boolean }) {
  return (
    <div className="menu">
      <div className="card">
        <h1 className="game-title">{t('title.name')}<small>{t('title.subtitle')}</small></h1>
        {!trainingDone && <p className="sub first-time">{t('title.firstTime')}</p>}
        <button className={onCampaign ? 'mode primary' : 'mode'} disabled={!onCampaign} onClick={onCampaign}><b>{t('title.campaign')}</b><span>{onCampaign ? t('title.campaignFirst') : t('title.soon')}</span></button>
        <button className="mode primary" onClick={onTraining}><b>{t('title.training')}</b></button>
        <button className="mode primary" onClick={onInstant}><b>{t('title.instant')}</b></button>
        <button className="mode" disabled><b>{t('title.settings')}</b><span>{t('title.soon')}</span></button>
        <button className="go secondary credits-link" onClick={onCredits}>{t('credits.open')}</button>
      </div>
    </div>
  );
}
