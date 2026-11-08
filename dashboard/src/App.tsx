import { useCampaigns } from "./campaigns/management/store";
import { useEffect, useMemo, useState } from 'react';
import { buildDataset, refreshOpenData, SAMPLE } from './data/sources';
import { gaApi, type GaState } from './data/googleAnalytics';
import type { Dataset } from './data/types';
import { accuracy, actions, capacityOutlook, episodes, quality, seasons, weeksVsLastYear } from './analysis/insights';
import Overview from './views/Overview';
import Data from './views/Data';
import Actions from './views/Actions';
import Sources from './views/Sources';

export type Tab = 'overview' | 'data' | 'actions' | 'integrations';
const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: 'overview', label: 'Overview', hint: 'Overview' },
  { id: 'data', label: 'Data', hint: 'Season, deviations and beds' },
  { id: 'actions', label: 'Actions', hint: 'Campaigns & publishing' },
  { id: 'integrations', label: 'Integrations', hint: 'Google Analytics and data sources' },
];

// Official Ischgl logo, loaded from ischgl.com (the asset stays with its owner).
const LOGO = 'https://www.ischgl.com/007_BERGBAHNEN/001_SSAG/shopski/ischgl_ohne_r.png';

// Existing analytics links now open their section on the combined Data page.
const readTab = (): Tab => (['#season', '#why', '#capacity', '#markets', '#performance'].includes(location.hash) ? 'data' : TABS.find((t) => `#${t.id}` === location.hash)?.id ?? 'overview');

export default function App() {
  const campaignState = useCampaigns();
  const [tab, setTab] = useState<Tab>(readTab);
  useEffect(() => {
    if (tab === 'data' && ['#season', '#why', '#capacity', '#markets', '#performance'].includes(location.hash)) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }, [tab]);
  const [ga, setGa] = useState<GaState | null>(null);
  const [gaError, setGaError] = useState<string | undefined>();
  const [live, setLive] = useState<Awaited<ReturnType<typeof refreshOpenData>> | null>(null);
  const [logoOk, setLogoOk] = useState(true);

  useEffect(() => {
    const onHash = () => setTab(readTab());
    addEventListener('hashchange', onHash);
    refreshOpenData().then(setLive).catch(() => setLive(null));
    return () => removeEventListener('hashchange', onHash);
  }, []);

  // The Google Analytics connection lives on the server; reload it when the
  // tab comes back so changes made on another device show up.
  useEffect(() => {
    const load = () => gaApi.state().then((s) => { setGa(s); setGaError(undefined); }).catch((e: Error) => setGaError(e.message));
    load();
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const ds = useMemo(() => buildDataset(SAMPLE, { openForecast: live?.openForecast, weather: live?.weather, retrieved: live?.retrieved }), [live]);
  const model = useMemo(() => computeModel(ds), [ds]);

  const go = (t: Tab) => { location.hash = t; setTab(t); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const props = { ds, model, go };

  return (
    <div className="app">
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
              onClick={(e) => { e.preventDefault(); go(t.id); }}>{t.label}{t.id === 'actions' && <b className="count">{campaignState.campaigns.length}</b>}</a>
          ))}
        </nav>
      </header>

      <main>
        {tab === 'overview' && <Overview {...props} />}
        {tab === 'data' && <Data {...props} />}
        {tab === 'actions' && <Actions {...props} />}
        {tab === 'integrations' && <Sources {...props} ga={ga} setGa={setGa} gaError={gaError} />}
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
