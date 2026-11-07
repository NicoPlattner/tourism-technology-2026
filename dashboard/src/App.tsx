import { useEffect, useMemo, useState } from 'react';
import { buildDataset, refreshOpenData, SAMPLE } from './data/sources';
import type { GaState } from './data/googleAnalytics';
import type { Dataset } from './data/types';
import { accuracy, actions, capacityOutlook, episodes, quality, seasons, weeksVsLastYear } from './analysis/insights';
import { longDate } from './analysis/format';
import Overview from './views/Overview';
import Season from './views/Season';
import Why from './views/Why';
import Capacity from './views/Capacity';
import Actions from './views/Actions';
import Sources from './views/Sources';

export type Tab = 'overview' | 'season' | 'why' | 'capacity' | 'actions' | 'data';
const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: 'overview', label: 'Overview', hint: 'Overview' },
  { id: 'season', label: 'Season', hint: 'Day by day' },
  { id: 'why', label: 'Deviations', hint: 'Gaps to the forecast' },
  { id: 'capacity', label: 'Beds', hint: 'Bed occupancy per month' },
  { id: 'actions', label: 'Actions', hint: 'Ranked next steps' },
  { id: 'data', label: 'Data', hint: 'Sources and Google Analytics' },
];

// Official Ischgl logo, loaded from ischgl.com (the asset stays with its owner).
const LOGO = 'https://www.ischgl.com/007_BERGBAHNEN/001_SSAG/shopski/ischgl_ohne_r.png';

const readTab = (): Tab => (TABS.find((t) => `#${t.id}` === location.hash)?.id ?? 'overview');

export default function App() {
  const [tab, setTab] = useState<Tab>(readTab);
  const [ga, setGa] = useState<GaState>({ status: 'idle' });
  const [live, setLive] = useState<Awaited<ReturnType<typeof refreshOpenData>> | null>(null);
  const [logoOk, setLogoOk] = useState(true);

  useEffect(() => {
    const onHash = () => setTab(readTab());
    addEventListener('hashchange', onHash);
    refreshOpenData().then(setLive).catch(() => setLive(null));
    return () => removeEventListener('hashchange', onHash);
  }, []);

  const ds = useMemo(() => buildDataset(SAMPLE, { openForecast: live?.openForecast, weather: live?.weather, retrieved: live?.retrieved }), [live]);
  const model = useMemo(() => computeModel(ds), [ds]);

  const go = (t: Tab) => { location.hash = t; setTab(t); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const props = { ds, model, go };

  return (
    <div className="app">
      <div className="metabar">
        <span className="meta-l">Demand Radar · TVB Paznaun-Ischgl</span>
        <span className="meta-r">
          {ds.sampleData && <button className="sample" onClick={() => go('data')} title="Stays and beds are sample data; forecast, weather, holidays and events are open data">Sample data</button>}
          <span>{longDate(ds.today)}</span>
        </span>
      </div>
      <header className="top">
        <a className="brand" href="#overview" onClick={(e) => { e.preventDefault(); go('overview'); }} aria-label="Ischgl — Demand Radar, overview">
          {logoOk ? (
            <img src={LOGO} alt="Ischgl" className="logo" onError={() => setLogoOk(false)} />
          ) : (
            <span className="wordmark">Ischgl</span>
          )}
          <span className="product">Demand<br />Radar</span>
        </a>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <a key={t.id} href={`#${t.id}`} className={tab === t.id ? 'active' : ''} aria-current={tab === t.id ? 'page' : undefined} title={t.hint}
              onClick={(e) => { e.preventDefault(); go(t.id); }}>{t.label}{t.id === 'actions' && <b className="count">{model.actions.length}</b>}</a>
          ))}
        </nav>
      </header>

      <main>
        {tab === 'overview' && <Overview {...props} />}
        {tab === 'season' && <Season {...props} />}
        {tab === 'why' && <Why {...props} />}
        {tab === 'capacity' && <Capacity {...props} />}
        {tab === 'actions' && <Actions {...props} />}
        {tab === 'data' && <Sources {...props} ga={ga} setGa={setGa} />}
      </main>

      <footer>
        <p>Prototype · TTF Hackathon 2026 · not an official TVB product · Logo © TVB Paznaun-Ischgl · Open data: JOANNEUM RESEARCH / Austria Tourism, Open-Meteo (CC BY 4.0), OpenHolidays (ODbL)</p>
      </footer>
    </div>
  );
}

export function computeModel(ds: Dataset) {
  const acc = accuracy(ds);
  const eps = episodes(ds, acc);
  const cap = capacityOutlook(ds, acc);
  const weeks = weeksVsLastYear(ds, acc);
  return { acc, eps, cap, weeks, quality: quality(ds, acc), actions: actions(ds, acc, cap, weeks, eps), seasons: seasons(ds) };
}
export type Model = ReturnType<typeof computeModel>;
export interface ViewProps { ds: Dataset; model: Model; go: (t: Tab) => void }
