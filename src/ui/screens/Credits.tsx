import { useEffect, useState } from 'react';
import { parseCredits, type CreditRow } from '../../assets/credits';
import { assetUrl } from '../../assets/manifest';
import { t } from '../../content/strings';

export function Credits({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<CreditRow[] | null>(null);
  useEffect(() => {
    fetch(assetUrl('CREDITS.md')).then(r => r.text()).then(md => setRows(parseCredits(md))).catch(() => setRows([]));
  }, []);
  return (
    <div className="menu">
      <div className="card wide credits">
        <h1>{t('credits.title')}</h1>
        <p className="sub">{t('credits.intro')}</p>
        {rows === null ? <p className="sub">{t('loading.text')}</p> : (
          <ul>
            {rows.map(r => (
              <li key={r.file}>
                <b>{r.title}</b> — {r.author} · <a href={r.url.split(/\s*,\s*/)[0]} target="_blank" rel="noreferrer">{t('credits.source')}</a> · {r.license}
                {r.modified && <small>{r.modified}</small>}
              </li>
            ))}
          </ul>
        )}
        <button className="go secondary" onClick={onBack}>{t('training.back')}</button>
      </div>
    </div>
  );
}
