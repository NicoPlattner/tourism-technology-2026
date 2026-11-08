import { campaignDataProvider } from '../mockCampaignData';
import type { CampaignRecommendation } from '../types';
export type Status = 'DRAFT' | 'APPROVED' | 'SCHEDULED';
export interface ManagedCampaign { campaign: CampaignRecommendation; status: Status; fingerprint: string; creativeReason?: string }
export interface ManagedPost {
  id: string; campaignId: string; platform: CampaignRecommendation['platform']; caption: string; hashtags: string[];
  assetId: string; assetPath: string; country: string; ageGroup: string;
  scheduledAt: string; timezone: 'Europe/Vienna'; approvalStatus: 'DRAFT' | 'APPROVED'; schedulingStatus: 'UNSCHEDULED' | 'SCHEDULED';
}
export interface CampaignState { campaigns: ManagedCampaign[]; posts: ManagedPost[]; selectedCampaignId: string | null }
export function receive(state: CampaignState, campaign: CampaignRecommendation, creativeReason?: string): CampaignState {
  const fingerprint = JSON.stringify(campaign);
  const existing = state.campaigns.find(c => c.campaign.id === campaign.id);
  if (existing?.fingerprint === fingerprint) return { ...state, selectedCampaignId: campaign.id };
  const entry: ManagedCampaign = { campaign, fingerprint, status: 'DRAFT', ...(creativeReason ? { creativeReason } : {}) };
  return { selectedCampaignId: campaign.id, campaigns: [entry, ...state.campaigns.filter(c => c.campaign.id !== campaign.id)],
    posts: [...state.posts.filter(p => p.campaignId !== campaign.id), ...campaign.publishingDates.map((date, index): ManagedPost => ({
      id: `${campaign.id}:post:${index}`, campaignId: campaign.id, platform: campaign.platform, caption: campaign.caption,
      hashtags: [...campaign.hashtags], assetId: campaign.asset.id, assetPath: campaign.asset.src, country: campaign.country,
      ageGroup: campaign.ageGroup, scheduledAt: date, timezone: 'Europe/Vienna', approvalStatus: 'DRAFT', schedulingStatus: 'UNSCHEDULED',
    }))] };
}
export function transition(state: CampaignState, id: string, status: 'APPROVED' | 'SCHEDULED'): CampaignState {
  const campaign = state.campaigns.find(c => c.campaign.id === id);
  if (!campaign || (status === 'APPROVED' ? campaign.status !== 'DRAFT' : campaign.status !== 'APPROVED')) return state;
  return { ...state, campaigns: state.campaigns.map(c => c.campaign.id === id ? { ...c, status } : c),
    posts: state.posts.map(p => p.campaignId === id ? { ...p, approvalStatus: 'APPROVED', schedulingStatus: status === 'SCHEDULED' ? 'SCHEDULED' : 'UNSCHEDULED' } : p) };
}
export function editPost(state: CampaignState, id: string, caption: string, scheduledAt: string): CampaignState {
  const post = state.posts.find(p => p.id === id);
  if (!post || !caption.trim() || !Number.isFinite(Date.parse(scheduledAt))) return state;
  const changedCopy = caption.trim() !== post.caption;
  return { ...state, campaigns: state.campaigns.map(c => changedCopy && c.campaign.id === post.campaignId ? { ...c, status: 'DRAFT' } : c),
    posts: state.posts.map(p => ({ ...p, ...(p.id === id ? { caption: caption.trim(), scheduledAt } : {}),
      ...(changedCopy && p.campaignId === post.campaignId ? { approvalStatus: 'DRAFT', schedulingStatus: 'UNSCHEDULED' } : {}) })) };
}
export function seed(): CampaignState {
  let state: CampaignState = { campaigns: [], posts: [], selectedCampaignId: null };
  const scenarios = [ ['DE',18,24,'2027-02-15','2027-02-21'], ['NL',25,34,'2027-04-23','2027-04-29'], ['BE',35,44,'2027-07-12','2027-07-18'], ['AT',45,60,'2027-10-11','2027-10-17'] ] as const;
  scenarios.forEach(([market, ageMin, ageMax, start, end], index) => {
    const c = campaignDataProvider.getImmediateRecommendation!(market, 'custom', { ageMin, ageMax }, { start, end });
    state = receive(state, c);
    if (index > 0) state = transition(state, c.id, 'APPROVED');
    if (index > 1) state = transition(state, c.id, 'SCHEDULED');
  });
  return { ...state, campaigns: state.campaigns.reverse(), selectedCampaignId: null };
}
const dateFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Vienna', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const dayKey = (timestamp: string) => dateFormat.format(new Date(timestamp));
export const localDateTime = (timestamp: string) => `${dayKey(timestamp)}T${timeFormat.format(new Date(timestamp))}`;
export function publishingTimestamp(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  for (const offset of ['+01:00', '+02:00']) {
    const timestamp = `${local}:00${offset}`;
    if (Number.isFinite(Date.parse(timestamp)) && localDateTime(timestamp) === local) return timestamp;
  }
  return null;
}
export function monthCells(month: string): (string | null)[] {
  const [year, m] = month.split('-').map(Number);
  const offset = (new Date(Date.UTC(year, m - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
}

// Reject corrupt or outdated browser data before it reaches the rendering path.
export function restoreState(value: unknown): CampaignState | null {
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(item => typeof item === 'string');
  if (!object(value) || !Array.isArray(value.campaigns) || !Array.isArray(value.posts)) return null;
  const ids = new Set<string>();
  for (const entry of value.campaigns) {
    if (!object(entry) || !object(entry.campaign) || !['DRAFT','APPROVED','SCHEDULED'].includes(String(entry.status)) || typeof entry.fingerprint !== 'string' || (entry.creativeReason !== undefined && typeof entry.creativeReason !== 'string')) return null;
    const c = entry.campaign;
    if (['id','title','country','market','ageGroup','caption','language','languageLabel','reasoning'].some(key => typeof c[key] !== 'string') || !strings(c.hashtags) || !['TikTok','Instagram','Facebook'].includes(String(c.platform)) || !object(c.asset) || typeof c.asset.src !== 'string' || typeof c.asset.alt !== 'string' || !object(c.travel) || !object(c.campaign)) return null;
    for (const range of [c.travel,c.campaign]) {
      if (![range.start,range.end].every(date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)))) return null;
    }
    if (ids.has(c.id as string)) return null;
    ids.add(c.id as string);
  }
  const postIds = new Set<string>();
  for (const post of value.posts) {
    if (!object(post) || ['id','campaignId','caption','assetId','assetPath','country','ageGroup','scheduledAt'].some(key => typeof post[key] !== 'string') || !ids.has(post.campaignId as string) || !strings(post.hashtags) || !['TikTok','Instagram','Facebook'].includes(String(post.platform)) || post.timezone !== 'Europe/Vienna' || !Number.isFinite(Date.parse(String(post.scheduledAt))) || !['DRAFT','APPROVED'].includes(String(post.approvalStatus)) || !['UNSCHEDULED','SCHEDULED'].includes(String(post.schedulingStatus)) || postIds.has(post.id as string)) return null;
    postIds.add(post.id as string);
  }
  if (value.selectedCampaignId !== null && (typeof value.selectedCampaignId !== 'string' || !ids.has(value.selectedCampaignId))) return null;
  return value as unknown as CampaignState;
}
