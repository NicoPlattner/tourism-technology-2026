// Google Analytics connection via Google Identity Services (OAuth 2.0 token
// model). Runs fully in the browser: the user signs in with Google in a popup,
// grants read-only Analytics access and we receive a short-lived access token.
// No client secret and no backend are involved.
//
// The OAuth client ID is public and set at build time: VITE_GOOGLE_CLIENT_ID.

export const GA_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
export const GA_CLIENT_ID: string = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim();

const GIS_SRC = 'https://accounts.google.com/gsi/client';

interface TokenResponse { access_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string }
interface TokenClient { requestAccessToken: (o?: { prompt?: string }) => void }
interface GoogleOAuth2 {
  initTokenClient: (c: {
    client_id: string; scope: string; prompt?: string;
    callback: (r: TokenResponse) => void;
    error_callback?: (e: { type: string; message?: string }) => void;
  }) => TokenClient;
  hasGrantedAllScopes: (r: TokenResponse, ...scopes: string[]) => boolean;
  revoke: (token: string, done?: () => void) => void;
}
declare global { interface Window { google?: { accounts?: { oauth2?: GoogleOAuth2 } } } }

let loading: Promise<GoogleOAuth2> | null = null;

/** Loads the Google Identity Services script once. Call early (e.g. when the
 * Data tab opens) so the popup can open directly from the click. */
export function loadGis(): Promise<GoogleOAuth2> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google.accounts.oauth2);
  loading ??= new Promise<GoogleOAuth2>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => (window.google?.accounts?.oauth2 ? resolve(window.google.accounts.oauth2) : reject(new Error('Google sign-in did not load.')));
    s.onerror = () => { loading = null; reject(new Error('Google sign-in could not be loaded.')); };
    document.head.appendChild(s);
  });
  return loading;
}

export interface GaToken { accessToken: string; expiresAt: number }

/** Opens the Google login / consent popup asking for read-only Analytics access. */
export function connectGoogleAnalytics(oauth2: GoogleOAuth2): Promise<GaToken> {
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: GA_CLIENT_ID,
      scope: GA_SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) return reject(new Error(r.error_description || r.error || 'Google did not return an access token.'));
        if (!oauth2.hasGrantedAllScopes(r, GA_SCOPE)) return reject(new Error('Read access to Google Analytics was not granted.'));
        resolve({ accessToken: r.access_token, expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000 });
      },
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'The Google window was closed.' : e.type === 'popup_failed_to_open' ? 'The Google window was blocked — allow pop-ups and try again.' : e.message || 'Google sign-in failed.')),
    });
    // Always show the account chooser so another Google account can be added.
    client.requestAccessToken({ prompt: 'select_account consent' });
  });
}

export function disconnectGoogleAnalytics(token: GaToken) {
  window.google?.accounts?.oauth2?.revoke(token.accessToken);
}

export interface GaProperty { id: string; name: string; account: string }

/** Lists the GA4 properties the signed-in user can read (Analytics Admin API). */
export async function listProperties(token: GaToken): Promise<GaProperty[]> {
  const out: GaProperty[] = [];
  let pageToken = '';
  do {
    const url = `https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token.accessToken}` } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error?.message || `Google Analytics returned ${res.status}.`);
    for (const a of body.accountSummaries ?? []) {
      for (const p of a.propertySummaries ?? []) out.push({ id: String(p.property).replace('properties/', ''), name: p.displayName, account: a.displayName });
    }
    pageToken = body.nextPageToken ?? '';
  } while (pageToken);
  return out;
}

type Row = { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] };

async function runReport(token: GaToken, propertyId: string, method: 'runReport' | 'runRealtimeReport', body: object): Promise<Row[]> {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('Google access has expired — remove the property and add it again.');
  if (!res.ok) throw new Error(json?.error?.message || `Google Analytics returned ${res.status}.`);
  return json.rows ?? [];
}
const num = (r: Row | undefined, i = 0) => Number(r?.metricValues?.[i]?.value ?? 0);
const top = (rows: Row[]) => rows.map((r) => ({ name: r.dimensionValues?.[0]?.value || '(not set)', value: num(r) }));

export interface GaRealtime { activeUsers: number; countries: { name: string; value: number }[]; pages: { name: string; value: number }[] }

/** Realtime report: users active in the last 30 minutes. Works on a brand-new
 * property, before the standard (processed) reports have any data. */
export async function realtime(token: GaToken, propertyId: string): Promise<GaRealtime> {
  const [total, countries, pages] = await Promise.all([
    runReport(token, propertyId, 'runRealtimeReport', { metrics: [{ name: 'activeUsers' }] }),
    runReport(token, propertyId, 'runRealtimeReport', { dimensions: [{ name: 'country' }], metrics: [{ name: 'activeUsers' }], limit: 5 }),
    runReport(token, propertyId, 'runRealtimeReport', { dimensions: [{ name: 'unifiedScreenName' }], metrics: [{ name: 'activeUsers' }], limit: 5 }),
  ]);
  return { activeUsers: num(total[0]), countries: top(countries), pages: top(pages) };
}

export interface GaSummary { sessions: number; activeUsers: number; views: number }

/** Standard report for the last 28 days including today. Processed data can
 * lag 24–48 hours, so a new property shows zeros here at first. */
export async function summary(token: GaToken, propertyId: string): Promise<GaSummary> {
  const rows = await runReport(token, propertyId, 'runReport', {
    dateRanges: [{ startDate: '28daysAgo', endDate: 'today' }],
    metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'screenPageViews' }],
  });
  return { sessions: num(rows[0], 0), activeUsers: num(rows[0], 1), views: num(rows[0], 2) };
}

export interface GaConnection { property: GaProperty; token: GaToken }

/** Connected properties, plus a login waiting for the user to pick a property. */
export interface GaState {
  connections: GaConnection[];
  connecting?: boolean;
  picking?: { token: GaToken; properties?: GaProperty[] };
  error?: string;
}
export const GA_INITIAL: GaState = { connections: [] };
