import { t } from '../../content/strings';

export function Loading({ progress }: { progress: number }) {
  return (
    <div className="menu">
      <div className="card loading">
        <p className="sub">{t('loading.text')}</p>
        <div className="bar"><div style={{ width: `${Math.round(progress * 100)}%` }} /></div>
      </div>
    </div>
  );
}
