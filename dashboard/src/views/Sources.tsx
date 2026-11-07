import type { Dispatch, SetStateAction } from 'react';
import type { ViewProps } from '../App';
import type { GaState } from '../data/googleAnalytics';
import type { SourceStatus } from '../data/types';
import GoogleAnalyticsCard from './GoogleAnalyticsCard';
import GoogleAnalyticsData from './GoogleAnalyticsData';

const STATUS: Record<SourceStatus, string> = { connected: 'Connected', live: 'Live', snapshot: 'Open data', sample: 'Sample', planned: 'Next' };

export default function Sources({ ds, ga, setGa }: ViewProps & { ga: GaState; setGa: Dispatch<SetStateAction<GaState>> }) {
  const active = ds.sources.filter((s) => s.status !== 'planned');
  const next = ds.sources.filter((s) => s.status === 'planned');

  return (
    <div className="view">
      <section className="grid2">
        <GoogleAnalyticsCard ga={ga} setGa={setGa} />
        <GoogleAnalyticsData connections={ga.connections} />
      </section>

      <section className="card">
        <h2>Sources</h2>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Source</th><th>Provider</th><th>Licence</th><th>Status</th></tr></thead>
            <tbody>
              {active.map((s) => (
                <tr key={s.id}>
                  <td>{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a> : s.name}</td>
                  <td className="muted">{s.provider}</td>
                  <td className="muted">{s.licence}</td>
                  <td><span className={`status ${s.status}`}>{STATUS[s.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="next-src">Next: {next.map((s) => <span key={s.id}>{s.name}</span>)}</p>
      </section>
    </div>
  );
}
