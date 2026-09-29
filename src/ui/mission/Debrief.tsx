import { t } from '../../content/strings';
import type { MissionDef } from '../../sim/mission/schema';
import type { MissionReport } from '../report';

const WEAPONS = ['gun30', 'hydra70', 'agm114k', 'agm114l'] as const;

function mmss(sec: number) {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}

export function Debrief({ mission, report, onRetry, onDone }: { mission: MissionDef; report: MissionReport; onRetry: () => void; onDone: () => void }) {
  const s = report.stats;
  const kills = Object.entries(s.kills);
  return (
    <div className="menu room">
      <div className="room-card">
        <p className="kicker">{mission.title}</p>
        <h1 className={report.success ? 'ok' : 'bad'}>{t(report.success ? 'debrief.success' : 'debrief.fail')}</h1>
        {report.reason && report.reason !== 'aborted' && <p className="sub">{report.reason}</p>}
        {!report.reason && report.failure && report.failure !== 'mission' && <p className="sub">{t(`fail.${report.failure}`)}</p>}
        <div className="grade-row"><span className={`grade g${report.score.grade}`}>{report.score.grade}</span><span className="score-total">{t('debrief.score', { n: report.score.total.toLocaleString('en-US') })}<small>{t('debrief.par', { n: mission.par.toLocaleString('en-US') })}</small></span></div>
        {report.reason === 'aborted' && <p className="sub">{t('debrief.aborted')}</p>}
        <div className="room-grid">
          <div className="room-text">
            <h2>{t('debrief.objectives')}</h2>
            <ul className="objs">
              {report.objectives.filter(o => o.state !== 'pending').map(o => <li key={o.label} className={`${o.primary ? 'primary' : ''} ${o.state}`}>{o.state === 'done' ? '✓' : o.state === 'failed' ? '✗' : '·'} {o.label}</li>)}
            </ul>
            <h2>{t('debrief.flight')}</h2>
            <p className="para">{t('debrief.time', { t: mmss(report.timeSec) })} · {t(report.landed ? 'debrief.landed' : 'debrief.notLanded')} · {t('debrief.hitsTaken', { n: s.hitsTaken })}</p>
            {Object.keys(s.damaged).length > 0 && <p className="para">{t('debrief.damaged')}: {Object.entries(s.damaged).map(([k, v]) => `${t(`systems.${k}`)}${v === 'destroyed' ? ` (${t('debrief.lost')})` : ''}`).join(', ')}</p>}
          </div>
          <div className="room-text">
            <h2>{t('debrief.kills')}</h2>
            <p className="para">{kills.length ? kills.map(([k, n]) => `${t(`units.${k}`)} ${n}`).join(' · ') : t('debrief.none')}</p>
            {(s.friendly > 0 || s.civilian > 0) && <p className="para bad">{t('debrief.fratricide', { f: s.friendly, c: s.civilian })}</p>}
            <h2>{t('debrief.scoreLines')}</h2>
            <table className="stats"><tbody>
              {report.score.lines.map(l => <tr key={l.key}><td>{t(`debrief.line.${l.key}`)}</td><td className={l.points < 0 ? 'neg' : ''}>{l.points > 0 ? '+' : ''}{l.points}</td></tr>)}
            </tbody></table>
            <h2>{t('debrief.weapons')}</h2>
            <table className="stats"><tbody>
              {WEAPONS.filter(w => s.shots[w]).map(w => <tr key={w}><td>{t(`debrief.weapon.${w}`)}</td><td>{s.shots[w]}</td><td>{s.hits[w] ?? 0}</td></tr>)}
            </tbody></table>
          </div>
        </div>
        <div className="room-buttons">
          <button className="go secondary" onClick={onRetry}>{t('debrief.retry')}</button>
          <button className="go" onClick={onDone}>{t('debrief.done')}</button>
        </div>
      </div>
    </div>
  );
}
