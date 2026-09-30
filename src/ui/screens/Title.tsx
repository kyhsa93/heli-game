import { t } from '../../content/strings';

export function Title({ onSettings, onCredits }: { onSettings: () => void; onCredits: () => void }) {
  return (
    <div className="menu">
      <div className="card">
        <h1 className="game-title">{t('title.name')}<small>{t('title.subtitle')}</small></h1>
        <button className="mode" disabled><b>{t('title.battle')}</b><span>{t('title.soon')}</span></button>
        <button className="mode primary" onClick={onSettings}><b>{t('title.settings')}</b></button>
        <button className="go secondary credits-link" onClick={onCredits}>{t('credits.open')}</button>
      </div>
    </div>
  );
}
