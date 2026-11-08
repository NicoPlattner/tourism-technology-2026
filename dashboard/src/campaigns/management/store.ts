import { useSyncExternalStore } from 'react';
import { restoreState, seed, type CampaignState } from './model';
const KEY = 'tourism-campaign-manager-v1';
let state: CampaignState;
let persistenceError = false;
try {
  const saved = localStorage.getItem(KEY);
  state = (saved ? restoreState(JSON.parse(saved)) : null) || seed();
} catch { state = seed(); }
const listeners = new Set<() => void>();
export function updateCampaigns(update: (previous: CampaignState) => CampaignState) {
  state = update(state);
  try { localStorage.setItem(KEY, JSON.stringify(state)); persistenceError = false; } catch { persistenceError = true; }
  listeners.forEach(listener => listener());
}
export const storageUnavailable = () => persistenceError;
export function useCampaigns() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => state);
}
