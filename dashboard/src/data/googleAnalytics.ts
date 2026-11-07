// Google Analytics connection. The connection lives on the Demand Radar API
// (separate service at ./api), which keeps a refresh token per Google account,
// so it stays connected around the clock and on every device.
//
// The browser only runs the Google sign-in popup (authorization code, popup
// mode via Google Identity Services) and hands the one-time code to the API.
// The OAuth client ID is public and set at build time: VITE_GOOGLE_CLIENT_ID.

export const GA_SCOPE = 'openid email https://www.googleapis.com/auth/analytics.readonly';
export const GA_CLIENT_ID: string = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim();

const GIS_SRC = 'https://accounts.google.com/gsi/client';

interface CodeResponse { code?: string; error?: string; error_description?: string }
interface CodeClient { requestCode: () => void }
interface GoogleOAuth2 {
  initCodeClient: (c: {
    client_id: string; scope: string; ux_mode: 'popup'; select_account?: boolean; login_hint?: string;
    callback: (r: CodeResponse) => void;
    error_callback?: (e: { type: string; message?: string }) => void;
  }) => CodeClient;
}
declare global { interface Window { google?: { accounts?: { oauth2?: GoogleOAuth2 } } } }

let loading: Promise<GoogleOAuth2> | null = null;

/** Loads Google Identity Services once. Call early so the popup can open
 * directly from the click (otherwise browsers may block it). */
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

/** Opens the Google sign-in popup and resolves with a one-time code. */
export function googleSignIn(oauth2: GoogleOAuth2, opts: { selectAccount?: boolean; loginHint?: string } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    oauth2.initCodeClient({
      client_id: GA_CLIENT_ID,
      scope: GA_SCOPE,
      ux_mode: 'popup',
      select_account: opts.selectAccount,
      login_hint: opts.loginHint,
      callback: (r) => (r.code ? resolve(r.code) : reject(new Error(r.error_description || r.error || 'Google sign-in failed.'))),
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'The Google window was closed.' : e.type === 'popup_failed_to_open' ? 'The Google window was blocked — allow pop-ups and try again.' : e.message || 'Google sign-in failed.')),
    }).requestCode();
  });
}

// ---------- API

export interface GaProperty { id: string; name: string; account: string }
export interface GaAccount { id: string; email: string; error?: string }
export interface GaConnection { property: GaProperty; accountId: string }
export interface GaState { configured: boolean; persistent?: boolean; storageError?: string; accounts: GaAccount[]; connections: GaConnection[] }
export interface GaRealtime { activeUsers: number; countries: { name: string; value: number }[]; pages: { name: string; value: number }[]; updated: string }

// Relative, so it resolves under the deployment path (e.g. /my-branch/api/…).
async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`api/${path}`, {
      method: init.method ?? 'GET',
      headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch { throw new Error('The Demand Radar server cannot be reached.'); }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) throw new Error(json?.error || 'The Demand Radar server cannot be reached.');
  return json as T;
}

export const gaApi = {
  state: () => api<GaState>('ga'),
  connectAccount: (code: string) => api<{ account: GaAccount; properties: GaProperty[] }>('ga/accounts', { method: 'POST', body: { code } }),
  properties: (accountId: string) => api<GaProperty[]>(`ga/accounts/${encodeURIComponent(accountId)}/properties`),
  addConnections: (accountId: string, propertyIds: string[]) => api<GaState>('ga/connections', { method: 'POST', body: { accountId, propertyIds } }),
  removeConnection: (propertyId: string) => api<GaState>(`ga/connections/${encodeURIComponent(propertyId)}`, { method: 'DELETE' }),
  disconnectAccount: (accountId: string) => api<GaState>(`ga/accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE' }),
  disconnectAll: () => api<GaState>('ga', { method: 'DELETE' }),
  realtime: (propertyId: string) => api<GaRealtime>(`ga/realtime/${encodeURIComponent(propertyId)}`),
};
