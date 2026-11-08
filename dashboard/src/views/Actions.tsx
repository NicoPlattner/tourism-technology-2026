import { useState } from 'react';
import type { ViewProps } from '../App';
import { PlatformIcon } from '../campaigns/components/SocialPostPreview';
import { SEASONAL_ASSETS } from '../campaigns/seasonalAssets';
import { dayKey, editPost, localDateTime, monthCells, publishingTimestamp, transition, type ManagedPost } from '../campaigns/management/model';
import { storageUnavailable, updateCampaigns, useCampaigns } from '../campaigns/management/store';
import '../campaigns/management/actions.css';
const dateLabel = (date: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
const assetPath = (post: ManagedPost) => SEASONAL_ASSETS.find(asset => asset.id === post.assetId)?.path || post.assetPath;
function PostEditor({ post }: { post: ManagedPost }) {
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(post.caption);
  const [date, setDate] = useState(localDateTime(post.scheduledAt));
  const [error, setError] = useState('');
  return <article className="am-post">
    <div className="am-post-heading"><strong>{dateLabel(dayKey(post.scheduledAt))} · {localDateTime(post.scheduledAt).slice(11)}</strong><span className="am-muted">Europe/Vienna</span></div>
    {editing ? <form onSubmit={event => {
      event.preventDefault(); const timestamp = publishingTimestamp(date);
      if (!timestamp || !caption.trim()) { setError('Enter a caption and a valid Vienna publishing time.'); return; }
      updateCampaigns(state => editPost(state, post.id, caption, timestamp)); setEditing(false); setError('');
    }}><label>Post caption<textarea value={caption} onChange={event => setCaption(event.target.value)} required rows={4}/></label>
      <label>Publishing date & time<input type="datetime-local" value={date} onChange={event => setDate(event.target.value)} required/></label>
      <p className="am-muted">Europe/Vienna. Caption edits return the campaign to Draft for review.</p>
      {error && <p role="alert">{error}</p>}<div className="am-buttons"><button className="btn" type="submit">Save post</button><button className="btn ghost" type="button" onClick={() => setEditing(false)}>Cancel</button></div>
    </form> : <><p className="am-caption">{post.caption}</p><p className="am-hashtags">{post.hashtags.join(' ')}</p><button className="btn ghost" onClick={() => { setCaption(post.caption); setDate(localDateTime(post.scheduledAt)); setEditing(true); }}>Edit post</button></>}
  </article>;
}
export default function Actions(_: ViewProps) {
  const state = useCampaigns();
  const [expanded, setExpanded] = useState<string | null>(state.selectedCampaignId);
  const incomingPost = state.posts.find(p => p.campaignId === state.selectedCampaignId);
  const scheduled = state.posts.filter(post => post.schedulingStatus === 'SCHEDULED');
  const [month, setMonth] = useState(() => dayKey(incomingPost?.scheduledAt || scheduled[0]?.scheduledAt || new Date().toISOString()).slice(0, 7));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const postsOn = (day: string) => scheduled.filter(post => dayKey(post.scheduledAt) === day);
  const navigateMonth = (delta: number) => { const [year, m] = month.split('-').map(Number); const date = new Date(Date.UTC(year, m - 1 + delta, 1)); setMonth(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`); setSelectedDay(null); };
  const exportCsv = () => {
    const rows = [['campaign','platform','country','age','caption','hashtags','assetId','publishingTimestamp','timezone','approvalStatus','schedulingStatus'], ...state.posts.map(post => [state.campaigns.find(c => c.campaign.id === post.campaignId)?.campaign.title,post.platform,post.country,post.ageGroup,post.caption,post.hashtags.join(' '),post.assetId,post.scheduledAt,post.timezone,post.approvalStatus,post.schedulingStatus])];
    const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\n'); const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); Object.assign(document.createElement('a'), { href: url, download: 'campaign-posts.csv' }).click(); URL.revokeObjectURL(url);
  };
  const ordered = [...state.campaigns].sort((a,b) => Number(b.campaign.id === state.selectedCampaignId) - Number(a.campaign.id === state.selectedCampaignId));
  return <div className="view am-view">
    <div className="am-heading"><div><p className="eyebrow">From inspiration to action</p><h1>Campaign management</h1><p className="lead">Review your story. Choose its moment.</p></div><div className="am-tools"><span className="status sample">Mock scheduling</span><button className="btn ghost" onClick={exportCsv}>CSV</button><button className="btn ghost" onClick={() => window.print()}>Print</button></div></div>
    <div className="am-stats" aria-label="Campaign summary"><div><strong>{state.campaigns.length}</strong><span>Upcoming campaigns</span></div><div><strong>{state.campaigns.filter(c => c.status === 'DRAFT').length}</strong><span>Awaiting approval</span></div><div><strong>{scheduled.length}</strong><span>Scheduled posts</span></div></div>
    {storageUnavailable() && <p role="alert">Browser storage is unavailable. Changes last only for this session.</p>}
    <div className="am-layout"><section aria-labelledby="upcoming-heading"><div className="am-section-heading"><h2 id="upcoming-heading">Upcoming campaigns</h2><span>{state.campaigns.length} campaigns</span></div><div className="am-campaigns">
      {ordered.map(({ campaign,status,creativeReason }) => {
        const posts = state.posts.filter(post => post.campaignId === campaign.id); const open = expanded === campaign.id; const imagePost = posts[0];
        return <article className={`am-campaign ${open ? 'is-open' : ''}`} key={campaign.id} data-campaign-id={campaign.id}>
          <button className="am-campaign-toggle" aria-expanded={open} aria-controls={`campaign-${campaign.id}`} onClick={() => setExpanded(open ? null : campaign.id)}>
            <div className="am-campaign-title"><span className="am-country">{campaign.market}</span><span><strong>{campaign.title}</strong><span className="am-muted">{campaign.country} · {campaign.ageGroup} years</span></span><span className={`am-status am-status-${status.toLowerCase()}`}>{status}</span></div>
            <div className="am-campaign-meta"><span className="am-platform"><PlatformIcon platform={campaign.platform}/>{campaign.platform}</span><span>{dateLabel(campaign.campaign.start)} – {dateLabel(campaign.campaign.end)}</span><span>{posts.length} posts</span><span aria-hidden="true">{open ? '−' : '+'}</span></div>
          </button>
          {open && <div className="am-campaign-body" id={`campaign-${campaign.id}`}>
            <div className="am-objective"><span className="eyebrow">Campaign objective</span><h3>Inspire travel to Paznaun-Ischgl</h3><p>{creativeReason || campaign.reasoning}</p><p className="am-muted">Guest travel · {dateLabel(campaign.travel.start)} – {dateLabel(campaign.travel.end)}</p></div>
            <div className="am-creative"><a href={imagePost ? assetPath(imagePost) : campaign.asset.src} target="_blank" rel="noreferrer" aria-label={`Review image for ${campaign.title}`}><img src={imagePost ? assetPath(imagePost) : campaign.asset.src} alt={campaign.asset.alt}/><span>Review image ↗</span></a><div><span className="eyebrow">{campaign.languageLabel} · {campaign.platform}</span><p className="am-caption" lang={campaign.language}>{campaign.caption}</p><p className="am-hashtags">{campaign.hashtags.join(' ')}</p></div></div>
            <h3 className="am-posts-title">Planned posts</h3>{posts.map(post => <PostEditor key={post.id} post={post}/>)}
            <div className="am-workflow"><div className="am-buttons"><button className="btn" disabled={status !== 'DRAFT'} onClick={() => updateCampaigns(s => transition(s,campaign.id,'APPROVED'))}>Approve campaign</button><button className="btn" disabled={status !== 'APPROVED'} onClick={() => { updateCampaigns(s => transition(s,campaign.id,'SCHEDULED')); if (posts[0]) { const day = dayKey(posts[0].scheduledAt); setMonth(day.slice(0,7)); setSelectedDay(day); } }}>Schedule posts</button></div><p className="am-muted" role="status">{status === 'SCHEDULED' ? 'Scheduled locally for this demo. No posts are sent to social media.' : status === 'APPROVED' ? 'Approved. Schedule the posts when you are ready.' : 'Review the image and posts, then approve this campaign.'}</p></div>
          </div>}
        </article>;
      })}
    </div></section>
    <aside className="am-calendar card" aria-labelledby="publishing-calendar"><div className="am-section-heading"><h2 id="publishing-calendar">Publishing calendar</h2><span className="am-muted">Europe/Vienna</span></div>
      <div className="am-month"><button className="btn ghost" aria-label="Previous month" onClick={() => navigateMonth(-1)}>←</button><h3 aria-live="polite">{new Intl.DateTimeFormat('en-GB',{ month:'long',year:'numeric',timeZone:'UTC' }).format(new Date(`${month}-01T12:00:00Z`))}</h3><button className="btn ghost" aria-label="Next month" onClick={() => navigateMonth(1)}>→</button></div>
      <div className="am-weekdays" aria-hidden="true">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day => <span key={day}>{day}</span>)}</div>
      <div className="am-days">{monthCells(month).map((day,index) => day ? <button key={day} className={`am-day am-heat-${Math.min(postsOn(day).length,3)} ${selectedDay === day ? 'is-selected' : ''}`} aria-pressed={selectedDay === day} aria-label={`${day}, ${postsOn(day).length} scheduled posts`} onClick={() => setSelectedDay(day)}><span>{Number(day.slice(-2))}</span>{postsOn(day).length > 0 && <small>{postsOn(day).length} {postsOn(day).length === 1 ? 'post' : 'posts'}</small>}</button> : <span className="am-day-empty" key={`empty-${index}`}/>)}</div>
      <div className="am-legend"><span>Scheduled posts</span>{[0,1,2,3].map(n => <span key={n}><i className={`am-heat-${n}`}/>{n === 3 ? '3+' : n}</span>)}</div>
      <section className="am-day-detail" aria-live="polite"><h3>{selectedDay ? dateLabel(selectedDay) : 'Choose a publishing day'}</h3>{selectedDay ? postsOn(selectedDay).length ? postsOn(selectedDay).map(post => <button className="am-calendar-post" key={post.id} onClick={() => setExpanded(post.campaignId)}><span className="am-platform"><PlatformIcon platform={post.platform}/>{post.platform} · {localDateTime(post.scheduledAt).slice(11)}</span><strong>{state.campaigns.find(c => c.campaign.id === post.campaignId)?.campaign.title}</strong></button>) : <p className="am-muted">No scheduled posts on this day.</p> : <p className="am-muted">Select a date to see its scheduled campaigns.</p>}</section>
      <p className="am-calendar-note">Only scheduled posts appear here. Drafts and approved campaigns stay off the calendar until scheduled.</p>
    </aside></div>
  </div>;
}
