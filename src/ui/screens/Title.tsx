import { t } from '../../content/strings';

export function Title({ onBattle, onSettings, onCredits }: { onBattle: () => void; onSettings: () => void; onCredits: () => void }) {
  return (
    <div className="menu">
      <div className="card">
        <h1 className="game-title">{t('title.name')}<small>{t('title.subtitle')}</small></h1>
        <button className="mode primary" onClick={onBattle}><b>{t('title.battle')}</b><span>{t('title.battleSub')}</span></button>
        <button className="mode" onClick={onSettings}><b>{t('title.settings')}</b></button>
        <button className="go secondary credits-link" onClick={onCredits}>{t('credits.open')}</button>
      </div>
    </div>
  );
}
