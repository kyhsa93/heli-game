import { t } from '../../content/strings';

export function Title({ onTraining, trainingDone }: { onTraining: () => void; trainingDone: boolean }) {
  return (
    <div className="menu">
      <div className="card">
        <h1 className="game-title">{t('title.name')}<small>{t('title.subtitle')}</small></h1>
        {!trainingDone && <p className="sub first-time">{t('title.firstTime')}</p>}
        <button className="mode" disabled><b>{t('title.campaign')}</b><span>{t('title.soon')}</span></button>
        <button className="mode primary" onClick={onTraining}><b>{t('title.training')}</b></button>
        <button className="mode" disabled><b>{t('title.instant')}</b><span>{t('title.soon')}</span></button>
        <button className="mode" disabled><b>{t('title.settings')}</b><span>{t('title.soon')}</span></button>
      </div>
    </div>
  );
}
