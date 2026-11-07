import { useState } from 'react';
import type { ViewProps } from '../App';
import { SeasonChart, Legend, type SeriesKey } from '../components/charts';

const PERIODS = [
  { id: 'all', label: 'All', from: undefined, to: undefined },
  { id: 'summer', label: 'Summer', from: '2026-06-01', to: '2026-09-30' },
  { id: 'autumn', label: 'Autumn', from: '2026-09-15', to: '2026-11-30' },
  { id: 'winter', label: 'Winter', from: '2026-11-01', to: '2027-01-30' },
] as const;

export default function Season({ ds, model }: ViewProps) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['id']>('all');
  const [on, setOn] = useState<Record<SeriesKey, boolean>>({ actual: true, forecast: true, previous: true, beds: true, open: false });
  const p = PERIODS.find((x) => x.id === period)!;

  return (
    <div className="view">
      <section className="card">
        <div className="toolbar">
          <div className="seg" role="radiogroup" aria-label="Period">
            {PERIODS.map((x) => <button key={x.id} role="radio" aria-checked={period === x.id} className={period === x.id ? 'on' : ''} onClick={() => setPeriod(x.id)}>{x.label}</button>)}
          </div>
          <Legend on={on} toggle={(k) => setOn({ ...on, [k]: !on[k] })} />
        </div>
        <SeasonChart ds={ds} acc={model.acc} on={on} from={p.from} to={p.to} height={440} />
      </section>
    </div>
  );
}
