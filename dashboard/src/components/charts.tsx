import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { scaleLinear } from 'd3-scale';
import { area, line, curveMonotoneX, curveStepAfter } from 'd3-shape';
import type { Day, Dataset } from '../data/types';
import { MARKET_NAMES } from '../data/sources';
import { corrected, type Accuracy, type CapacityDay } from '../analysis/insights';
import { approx, dayLabel, n, shortDate, signedPct, weekday, pct } from '../analysis/format';

export const COLORS = { actual: '#bb1c3f', forecast: '#2a78d6', open: '#eb6834', previous: '#9aa3ad', beds: '#2d343e' };

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(800);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const compact = (v: number) => (v >= 10000 ? `${Math.round(v / 1000)}K` : v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}K` : `${v}`);

// --------------------------------------------------------------------- legend
export type SeriesKey = 'actual' | 'forecast' | 'open' | 'previous' | 'beds';
export const SERIES: { key: SeriesKey; label: string; dash?: boolean }[] = [
  { key: 'actual', label: 'Actual stays' },
  { key: 'forecast', label: 'Our forecast' },
  { key: 'open', label: 'Open forecast model', dash: true },
  { key: 'previous', label: 'Last year' },
  { key: 'beds', label: 'Beds available' },
];

export function Legend({ on, toggle }: { on: Record<SeriesKey, boolean>; toggle?: (k: SeriesKey) => void }) {
  return (
    <div className="legend" role="group" aria-label="Series">
      {SERIES.map((s) => (
        <button key={s.key} type="button" className={on[s.key] ? 'on' : 'off'} aria-pressed={on[s.key]} onClick={() => toggle?.(s.key)} disabled={!toggle}>
          <svg width="22" height="10" aria-hidden="true"><line x1="1" y1="5" x2="21" y2="5" stroke={COLORS[s.key]} strokeWidth={s.key === 'beds' ? 2 : 2.5} strokeDasharray={s.dash ? '4 3' : s.key === 'beds' ? '1 0' : undefined} strokeLinecap="round" /></svg>
          {s.label}
        </button>
      ))}
    </div>
  );
}

// --------------------------------------------------------------------- season chart
interface SeasonProps {
  ds: Dataset;
  acc: Accuracy;
  from?: string;
  to?: string;
  height?: number;
  on: Record<SeriesKey, boolean>;
  highlight?: { start: string; end: string; tone: 'above' | 'below' | 'gap' }[];
  strips?: boolean;
  onPick?: (d: Day) => void;
}

export function SeasonChart({ ds, acc, from, to, height = 360, on, highlight = [], strips = true }: SeasonProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const days = useMemo(() => ds.days.filter((d) => (!from || d.date >= from) && (!to || d.date <= to)), [ds, from, to]);
  const m = { l: 46, r: 12, t: 14, b: 26 };
  const W = width, H = height;
  const x = scaleLinear().domain([0, Math.max(1, days.length - 1)]).range([m.l, W - m.r]);
  const maxY = Math.max(1000, ...days.map((d) => Math.max(on.actual ? d.actual ?? 0 : 0, on.forecast ? d.forecast ?? 0 : 0, on.open ? d.openForecast ?? 0 : 0, on.previous ? d.previousYear ?? 0 : 0, on.beds ? d.beds ?? 0 : 0))) * 1.08;
  const y = scaleLinear().domain([0, maxY]).nice(5).range([H - m.b, m.t]);
  const todayIdx = days.findIndex((d) => d.date >= ds.today);
  const unc = Math.max(0.04, acc.mape);

  const mk = (f: (d: Day) => number | null, curve = curveMonotoneX) =>
    line<Day>().defined((d) => f(d) != null).x((_, i) => x(i)).y((d) => y(f(d)!)).curve(curve)(days) ?? '';
  const band = area<Day>().defined((d) => d.date >= ds.today && d.forecast != null).x((_, i) => x(i))
    .y0((d) => y(corrected(d, acc)! * (1 - unc))).y1((d) => y(corrected(d, acc)! * (1 + unc))).curve(curveMonotoneX)(days) ?? '';

  const months = days.map((d, i) => ({ d, i })).filter(({ d }) => d.date.endsWith('-01'));
  const ticks = y.ticks(5);
  const hd = hover != null ? days[hover] : null;

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const i = Math.round(x.invert(e.clientX - r.left + m.l));
    setHover(Math.max(0, Math.min(days.length - 1, i)));
  };

  return (
    <div className="chart" ref={ref}>
      <svg width={W} height={H} role="img" aria-label="Overnight stays per day: actual, forecast, open forecast, last year and beds available">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={m.l - 8} y={y(t) + 4} textAnchor="end" className="axis">{compact(t)}</text>
          </g>
        ))}
        {months.map(({ d, i }) => (
          <g key={d.date}>
            <line x1={x(i)} x2={x(i)} y1={m.t} y2={H - m.b} className="grid faint" />
            <text x={x(i) + 4} y={H - 8} className="axis">{new Date(`${d.date}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: d.date.endsWith('-01-01') ? 'numeric' : undefined, timeZone: 'UTC' })}</text>
          </g>
        ))}
        {highlight.map((h) => {
          const a = days.findIndex((d) => d.date >= h.start), b = days.findIndex((d) => d.date > h.end);
          if (a < 0) return null;
          const x0 = x(a) - 3, x1 = x(b < 0 ? days.length - 1 : b - 1) + 3;
          return <rect key={h.start} x={x0} width={Math.max(6, x1 - x0)} y={m.t} height={H - m.b - m.t} className={`hl ${h.tone}`} rx={4} />;
        })}
        {todayIdx > 0 && <rect x={x(todayIdx)} width={W - m.r - x(todayIdx)} y={m.t} height={H - m.b - m.t} className="future" />}
        {on.forecast && <path d={band} fill={COLORS.forecast} opacity={0.1} />}
        {on.beds && <path d={mk((d) => d.beds, curveStepAfter)} fill="none" stroke={COLORS.beds} strokeWidth={2} />}
        {on.previous && <path d={mk((d) => d.previousYear)} fill="none" stroke={COLORS.previous} strokeWidth={1.5} />}
        {on.open && <path d={mk((d) => d.openForecast)} fill="none" stroke={COLORS.open} strokeWidth={1.5} strokeDasharray="4 3" />}
        {on.forecast && <path d={mk((d) => d.forecast)} fill="none" stroke={COLORS.forecast} strokeWidth={2} strokeLinecap="round" />}
        {on.actual && <path d={mk((d) => (d.actual && d.actual > 0 ? d.actual : null))} fill="none" stroke={COLORS.actual} strokeWidth={2.25} strokeLinecap="round" />}
        {days.map((d, i) => (d.flags.includes('zero-stays') ? <circle key={d.date} cx={x(i)} cy={y(0) - 6} r={4} className="gapdot" /> : null))}
        {todayIdx > 0 && (
          <g>
            <line x1={x(todayIdx)} x2={x(todayIdx)} y1={m.t - 4} y2={H - m.b} className="todayline" />
            <text x={x(todayIdx) + 6} y={m.t + 8} className="todaylabel">Today</text>
          </g>
        )}
        {hd && (
          <g pointerEvents="none">
            <line x1={x(hover!)} x2={x(hover!)} y1={m.t} y2={H - m.b} className="cross" />
            {on.actual && hd.actual != null && hd.actual > 0 && <circle cx={x(hover!)} cy={y(hd.actual)} r={4.5} fill={COLORS.actual} stroke="#fff" strokeWidth={2} />}
            {on.forecast && hd.forecast != null && <circle cx={x(hover!)} cy={y(hd.forecast)} r={4.5} fill={COLORS.forecast} stroke="#fff" strokeWidth={2} />}
          </g>
        )}
        <rect x={m.l} y={m.t} width={W - m.l - m.r} height={H - m.t - m.b} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      {strips && <ContextStrips days={days} x={x} width={W} hover={hover} ml={m.l} mr={m.r} ds={ds} />}
      {hd && <DayTooltip d={hd} acc={acc} left={Math.min(W - 280, Math.max(0, x(hover!) + 14))} today={ds.today} />}
    </div>
  );
}

function DayTooltip({ d, acc, left, today }: { d: Day; acc: Accuracy; left: number; today: string }) {
  const future = d.date >= today;
  const exp = corrected(d, acc);
  const lines: ReactNode[] = [];
  if (!future && d.actual != null) {
    if (d.flags.includes('zero-stays')) lines.push(<p key="a" className="warn">No stays reported — probably a data gap.</p>);
    else lines.push(<p key="a"><b>{n(d.actual)}</b> guests stayed overnight{d.forecast ? <> — {signedPct((d.actual - d.forecast) / d.forecast)} vs forecast</> : null}.</p>);
  }
  if (future && exp != null) lines.push(<p key="f">We expect about <b>{approx(exp)}</b> guests{d.beds ? (exp > d.beds ? <> — <b>more than the {n(d.beds)} beds</b> ({pct(exp / d.beds)})</> : <> — <b>{pct(exp / d.beds)}</b> of {n(d.beds)} beds</>) : null}.</p>);
  if (d.previousYear != null) lines.push(<p key="p" className="muted">Last year: {n(d.previousYear)}{d.openForecast ? ` · open model: ${n(d.openForecast)}` : ''}</p>);
  const wx = d.weather;
  return (
    <div className="tooltip" style={{ left }}>
      <p className="tdate">{dayLabel(d.date)}</p>
      {lines}
      {wx && <p className="ctx">{wx.isForecast ? 'Forecast: ' : ''}{wx.snow >= 2 ? `❄ ${wx.snow.toFixed(0)} cm fresh snow` : wx.precip >= 5 ? `☂ ${wx.precip.toFixed(0)} mm rain` : wx.sun >= 6 ? '☀ sunny' : '☁ cloudy'}, {Math.round(wx.tmax)}°C</p>}
      {d.holidays.filter((h) => h.coverage > 0.2).slice(0, 3).map((h) => <p key={h.market} className="ctx">🎒 {MARKET_NAMES[h.market] ?? h.market}: {h.name}{h.coverage < 0.95 ? ` (${Math.round(h.coverage * 100)}% of regions)` : ''}</p>)}
      {d.events.map((e) => <p key={e} className="ctx">★ {e}</p>)}
    </div>
  );
}

function ContextStrips({ days, x, width, hover, ml, mr, ds }: { days: Day[]; x: (i: number) => number; width: number; hover: number | null; ml: number; mr: number; ds: Dataset }) {
  const markets = Object.entries(ds.marketMix).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([m]) => m);
  const bw = Math.max(1, (width - ml - mr) / days.length);
  const rowH = 9, gap = 3;
  const wxH = 26;
  const H = markets.length * (rowH + gap) + wxH + 26;
  const maxP = Math.max(20, ...days.map((d) => d.weather?.precip ?? 0));
  return (
    <svg width={width} height={H} className="strips" aria-label="Context: school holidays in source markets, weather and events">
      {markets.map((mk, r) => (
        <g key={mk} transform={`translate(0, ${r * (rowH + gap)})`}>
          <text x={ml - 8} y={rowH - 1} textAnchor="end" className="axis small">{mk}</text>
          <rect x={ml} y={0} width={width - ml - mr} height={rowH} className="stripbg" rx={2} />
          {days.map((d, i) => {
            const h = d.holidays.find((x) => x.market === mk);
            return h ? <rect key={d.date} x={x(i) - bw / 2} y={0} width={bw + 0.5} height={rowH} fill="#235275" opacity={0.25 + 0.65 * h.coverage} /> : null;
          })}
        </g>
      ))}
      <g transform={`translate(0, ${markets.length * (rowH + gap) + 4})`}>
        <text x={ml - 8} y={wxH - 4} textAnchor="end" className="axis small">Wx</text>
        {days.map((d, i) => {
          const w = d.weather; if (!w) return null;
          if (w.snow >= 1) { const h = Math.min(wxH, 4 + w.snow * 0.8); return <rect key={d.date} x={x(i) - bw / 2} y={wxH - h} width={Math.max(1, bw - 0.5)} height={h} fill="#6da7ec" rx={1} />; }
          const h = (w.precip / maxP) * wxH; return h > 0.5 ? <rect key={d.date} x={x(i) - bw / 2} y={wxH - h} width={Math.max(1, bw - 0.5)} height={h} fill="#9aa3ad" rx={1} /> : null;
        })}
      </g>
      <g transform={`translate(0, ${markets.length * (rowH + gap) + wxH + 10})`}>
        {days.map((d, i) => (d.events.length ? <g key={d.date}><path d={`M${x(i)} 0 l5 9 h-10 z`} fill="#bb1c3f" /><text x={x(i) + 8} y={9} className="axis small">{d.events[0]}</text></g> : null))}
      </g>
      {hover != null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} className="cross" />}
    </svg>
  );
}

// --------------------------------------------------------------------- small multiples
export function MiniChart({ days, height = 90 }: { days: Day[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const x = scaleLinear().domain([0, Math.max(1, days.length - 1)]).range([4, width - 4]);
  const maxY = Math.max(10, ...days.map((d) => Math.max(d.actual ?? 0, d.forecast ?? 0))) * 1.1;
  const y = scaleLinear().domain([0, maxY]).range([height - 4, 6]);
  const mk = (f: (d: Day) => number | null) => line<Day>().defined((d) => f(d) != null).x((_, i) => x(i)).y((d) => y(f(d)!)).curve(curveMonotoneX)(days) ?? '';
  return (
    <div ref={ref} className="mini">
      <svg width={width} height={height} aria-hidden="true">
        <line x1={0} x2={width} y1={y(0)} y2={y(0)} className="grid" />
        <path d={mk((d) => d.forecast)} fill="none" stroke={COLORS.forecast} strokeWidth={2} />
        <path d={mk((d) => d.actual)} fill="none" stroke={COLORS.actual} strokeWidth={2} />
        {days.map((d, i) => (d.weather && d.weather.precip >= 15 ? <text key={d.date} x={x(i)} y={12} textAnchor="middle" fontSize="10">☂</text> : null))}
      </svg>
    </div>
  );
}

export function WeekdayBias({ acc }: { acc: Accuracy }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const H = 190, m = { l: 92, r: 54, t: 8, b: 8 };
  const max = Math.max(0.06, ...acc.byWeekday.map((w) => Math.abs(w.bias))) * 1.1;
  const x = scaleLinear().domain([-max, max]).range([m.l, width - m.r]);
  const bh = Math.min(18, (H - m.t - m.b) / 7 - 6);
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return (
    <div ref={ref}>
      <svg width={width} height={H} role="img" aria-label="Average gap between actual stays and forecast, by weekday">
        <line x1={x(0)} x2={x(0)} y1={m.t} y2={H - m.b} className="axisline" />
        {acc.byWeekday.map((w, i) => {
          const y0 = m.t + i * ((H - m.t - m.b) / 7) + 4;
          const x0 = x(Math.min(0, w.bias)), x1 = x(Math.max(0, w.bias));
          const strong = Math.abs(w.bias) > 0.03;
          return (
            <g key={w.dow}>
              <text x={m.l - 10} y={y0 + bh / 2 + 4} textAnchor="end" className={`axis ${strong ? 'strong' : ''}`}>{names[i]}</text>
              <rect x={x0} y={y0} width={Math.max(2, x1 - x0)} height={bh} rx={4} fill={w.bias >= 0 ? COLORS.actual : COLORS.forecast} opacity={strong ? 1 : 0.45} />
              <text x={w.bias >= 0 ? x1 + 6 : x0 - 6} y={y0 + bh / 2 + 4} textAnchor={w.bias >= 0 ? 'start' : 'end'} className="axis">{signedPct(w.bias)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// --------------------------------------------------------------------- capacity
const occColor = (o: number) => {
  if (o >= 1) return '#4a0816';
  if (o >= 0.95) return '#7d1029';
  if (o >= 0.85) return '#bb1c3f';
  if (o >= 0.7) return '#e46a85';
  if (o >= 0.5) return '#f2b3c1';
  if (o >= 0.3) return '#f8dbe2';
  return '#eef0f3';
};
export const OCC_LEGEND = [
  { label: 'under 30%', c: '#eef0f3' }, { label: '30–50%', c: '#f8dbe2' }, { label: '50–70%', c: '#f2b3c1' },
  { label: '70–85%', c: '#e46a85' }, { label: '85–95% close to full', c: '#bb1c3f' }, { label: '95–100% full', c: '#7d1029' }, { label: 'over 100% turning guests away', c: '#4a0816' },
];

export function CapacityCalendar({ cap, onPick, picked }: { cap: CapacityDay[]; onPick: (d: CapacityDay) => void; picked?: string }) {
  if (!cap.length) return <p className="muted">No bed capacity data for the days ahead.</p>;
  // weeks starting Monday
  const first = cap[0].date;
  const offset = (weekday(first) + 6) % 7;
  const cells: (CapacityDay | null)[] = [...Array(offset).fill(null), ...cap];
  const weeks: (CapacityDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return (
    <div className="calendar" role="grid" aria-label="Expected share of beds booked, per day">
      <div className="cal-row head" role="row">
        <span />{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <span key={d} role="columnheader" className={d === 'Sat' || d === 'Fri' ? 'we' : ''}>{d}</span>)}
      </div>
      {weeks.map((w, i) => (
        <div className="cal-row" role="row" key={i}>
          <span className="wk">{w.find(Boolean) ? shortDate(w.find(Boolean)!.date) : ''}</span>
          {Array.from({ length: 7 }, (_, j) => w[j] ?? null).map((c, j) => c ? (
            <button key={c.date} role="gridcell" className={`cell ${picked === c.date ? 'picked' : ''} ${c.flags.length ? 'flag' : ''}`} style={{ background: occColor(c.occupancy) }}
              onClick={() => onPick(c)} title={`${dayLabel(c.date)}: ${Math.round(c.occupancy * 100)}% of beds`}>
              <span className={c.occupancy >= 0.7 ? 'light' : ''}>{new Date(`${c.date}T12:00:00Z`).getUTCDate()}</span>
              <small className={c.occupancy >= 0.7 ? 'light' : ''}>{Math.round(c.occupancy * 100)}%</small>
            </button>
          ) : <span key={j} />)}
        </div>
      ))}
    </div>
  );
}

export function ScoreBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="scorebar" title={`${label}: ${Math.round(value * 100)}/100`}>
      <span className="sb-label">{label}</span>
      <span className="sb-track"><span className="sb-fill" style={{ width: `${Math.round(value * 100)}%` }} /></span>
    </div>
  );
}
