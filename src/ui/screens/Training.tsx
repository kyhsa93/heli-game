import { t } from '../../content/strings';
import { AVAILABLE_MISSIONS, TRAININGS } from '../state';

export function Training({ onPick, onBack, completed }: { onPick: (id: string) => void; onBack: () => void; completed: ReadonlySet<string> }) {
  return (
    <div className="menu">
      <div className="card">
        <h1>{t('training.title')}</h1>
        {TRAININGS.map(id => {
          const available = AVAILABLE_MISSIONS.has(id);
          return (
            <button key={id} className={available ? 'mode primary' : 'mode'} disabled={!available} onClick={() => onPick(id)}>
              <b>{t(`training.${id}.name`)}{completed.has(id) ? ` · ${t('training.done')}` : ''}</b>
              <span>{available ? t(`training.${id}.desc`) : `${t(`training.${id}.desc`)} · ${t('title.soon')}`}</span>
            </button>
          );
        })}
        <button className="go secondary" onClick={onBack}>{t('training.back')}</button>
      </div>
    </div>
  );
}
