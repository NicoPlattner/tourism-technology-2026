import { useEffect, useMemo, useState } from 'react';
import { buildDataset, parsePartnerCsv, refreshOpenData, SAMPLE, type PartnerFile } from './data/sources';
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
  { id: 'overview', label: 'Overview', hint: 'The situation in one minute' },
  { id: 'season', label: 'Season', hint: 'Actual, forecast and last year, day by day' },
  { id: 'why', label: 'Why?', hint: 'What explains the gaps to the forecast' },
  { id: 'capacity', label: 'Beds', hint: 'Which days run full, which stay empty' },
  { id: 'actions', label: 'What to do', hint: 'Ranked next steps' },
  { id: 'data', label: 'Data', hint: 'Sources, quality and upload' },
];

const readTab = (): Tab => (TABS.find((t) => `#${t.id}` === location.hash)?.id ?? 'overview');

export default function App() {
  const [tab, setTab] = useState<Tab>(readTab);
  const [partner, setPartner] = useState<PartnerFile>(SAMPLE);
  const [uploaded, setUploaded] = useState<string | undefined>();
  const [live, setLive] = useState<Awaited<ReturnType<typeof refreshOpenData>> | null>(null);

  useEffect(() => {
    const onHash = () => setTab(readTab());
    addEventListener('hashchange', onHash);
    refreshOpenData().then(setLive).catch(() => setLive(null));
    return () => removeEventListener('hashchange', onHash);
  }, []);

  const ds = useMemo(() => buildDataset(partner, { openForecast: live?.openForecast, weather: live?.weather, retrieved: live?.retrieved, uploaded }), [partner, live, uploaded]);
  const model = useMemo(() => computeModel(ds), [ds]);

  const go = (t: Tab) => { location.hash = t; setTab(t); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const onUpload = async (file: File) => {
    const text = await file.text();
    setPartner(parsePartnerCsv(text, SAMPLE));
    setUploaded(file.name);
  };
  const props = { ds, model, go };

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="mark" aria-hidden="true">
            <svg viewBox="0 0 40 40"><path d="M4 32 L16 12 L23 22 L28 16 L36 32 Z" /></svg>
          </span>
          <div>
            <p className="wordmark">Paznaun <span>·</span> Ischgl</p>
            <p className="product">Demand Radar</p>
          </div>
        </div>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <a key={t.id} href={`#${t.id}`} className={tab === t.id ? 'active' : ''} aria-current={tab === t.id ? 'page' : undefined} title={t.hint}
              onClick={(e) => { e.preventDefault(); go(t.id); }}>{t.label}{t.id === 'actions' && <b className="count">{model.actions.length}</b>}</a>
          ))}
        </nav>
        <div className="today">
          <span className="label">Today</span>
          <strong>{longDate(ds.today)}</strong>
        </div>
      </header>

      {ds.sampleData && (
        <div className="banner" role="note">
          <strong>Sample partner data.</strong> Overnight stays and beds are shaped like the TVB/Feratel export and calibrated to official monthly totals; forecast, weather, holidays and events are real open data.
          <button className="link" onClick={() => go('data')}>Load the real export →</button>
        </div>
      )}

      <main>
        {tab === 'overview' && <Overview {...props} />}
        {tab === 'season' && <Season {...props} />}
        {tab === 'why' && <Why {...props} />}
        {tab === 'capacity' && <Capacity {...props} />}
        {tab === 'actions' && <Actions {...props} />}
        {tab === 'data' && <Sources {...props} onUpload={onUpload} uploaded={uploaded} />}
      </main>

      <footer>
        <p>Prototype for TVB Paznaun-Ischgl · TTF Hackathon 2026, challenge 04 “Overnight data without explanation”. Not an official TVB product.</p>
        <p>Open data: overnight-stay forecast © JOANNEUM RESEARCH / TU Wien / Uni Klagenfurt / Austria Tourism · weather © Open-Meteo (CC BY 4.0) · holidays © OpenHolidays (ODbL).</p>
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
