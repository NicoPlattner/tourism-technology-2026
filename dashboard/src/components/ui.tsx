import type { Action, Confidence as C } from '../analysis/insights';

const CONF: Record<C, { label: string; dots: number; tip: string }> = {
  high: { label: 'Sure', dots: 3, tip: 'Several independent sources point the same way' },
  medium: { label: 'Likely', dots: 2, tip: 'One good source, or sources that partly agree' },
  low: { label: 'Unsure', dots: 1, tip: 'Weak or conflicting evidence — check before acting' },
};

export function Confidence({ c }: { c: C }) {
  const v = CONF[c];
  return (
    <span className={`conf ${c}`} title={v.tip}>
      <span className="dots" aria-hidden="true">{[1, 2, 3].map((i) => <i key={i} className={i <= v.dots ? 'on' : ''} />)}</span>
      {v.label}
    </span>
  );
}

const TYPES: Record<Action['type'], string> = { fill: 'Fill gaps', steer: 'Steer demand', forecast: 'Fix forecast', data: 'Fix data' };
export function TypeTag({ type }: { type: Action['type'] }) {
  return <span className={`tag ${type}`}>{TYPES[type]}</span>;
}
export const TYPE_LABELS = TYPES;
