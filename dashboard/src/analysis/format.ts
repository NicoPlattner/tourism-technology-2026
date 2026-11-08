const nf = new Intl.NumberFormat('en-GB');
export const n = (v: number | null | undefined) => (v == null ? '–' : nf.format(Math.round(v)));
export const round50 = (v: number) => (v < 1000 ? Math.round(v / 10) * 10 : Math.round(v / 50) * 50);
export const approx = (v: number | null | undefined) => (v == null ? '–' : nf.format(round50(v)));
export const pct = (v: number | null | undefined, digits = 0) => (v == null || !Number.isFinite(v) ? '–' : `${(v * 100).toFixed(digits)}%`);
export const signedPct = (v: number) => (Math.abs(v) < 0.005 ? '±0%' : `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(0)}%`);
export const signedN = (v: number) => `${v >= 0 ? '+' : '−'}${nf.format(Math.abs(Math.round(v)))}`;

const d = (iso: string) => new Date(`${iso}T12:00:00Z`);
export const dayLabel = (iso: string) => d(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
export const shortDate = (iso: string) => d(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const longDate = (iso: string) => d(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export const weekday = (iso: string) => d(iso).getUTCDay();
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const range = (a: string, b: string) => (a === b ? dayLabel(a) : `${shortDate(a)} – ${shortDate(b)}`);
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
