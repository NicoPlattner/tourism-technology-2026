import type { CampaignRecommendation } from '../types';
import { shiftDate, displayRange } from '../mockCampaignData';
import { viennaOffset } from '../travelDates';
import { tourismContext, type DemandQuery } from './contracts';
export function withDemand(campaign:CampaignRecommendation, query:DemandQuery|undefined, status:'loading'|'error'|'empty'|'ready'):CampaignRecommendation {
  if (!query || status !== 'ready') return {...campaign,dataStatus:status,reasoning:status === 'loading' ? 'Loading demand evidence for the selected market and travel dates.' : status === 'empty' ? 'No guest nights are available for this market and period. Choose another period to plan a data-informed campaign.' : 'Demand evidence is unavailable. The image and caption remain an illustrative preview; timing recommendations are unavailable.',detailedReasoning:[]};
  const context = tourismContext(query);
  const start = shiftDate(campaign.travel.start,-context.leadTimeDays);
  const end = shiftDate(start,7);
  const holiday = query.reasons.push.value[0];
  const reason = `For ages ${campaign.ageGroup} from ${campaign.country}, the API estimates ${context.guestNights.toLocaleString('en-GB')} guest nights in the selected period${context.averageStayNights === null ? '' : ` and an average ${context.averageStayNights.toFixed(1)}-night stay`}. Its ${context.leadTimeDays}-day lead-time proxy places promotion around ${displayRange({start,end,label:''})}.${holiday ? ' Origin holiday dates overlap this travel window.' : ' Timing follows the selected arrival dates.'}`;
  return {...campaign,dataStatus:'ready',reasoningSource:'data',tourismContext:context,fictional:false,assumedLeadDays:context.leadTimeDays,
    campaign:{start,end,label:'Data-informed promotion window'},
    publishingDates:[0,3,6].map(offset => { const day = shiftDate(start,offset); return `${day}T18:00:00${viennaOffset(day)}`; }),
    captionMetadata:{...campaign.captionMetadata,tourismContext:context},reasoning:reason,
    detailedReasoning:[`Demand: ${query.nights.method} (grade ${query.nights.grade}${query.nights.is_estimate ? ', estimate' : ''}).`,
      `Lead time: ${query.booking_lead_time.method} (grade ${query.booking_lead_time.grade}); weighted to the selected arrival period, not a measured age preference.`,
      `Average stay: ${query.length_of_stay.method} (grade ${query.length_of_stay.grade}). The API does not expose the most common booking duration or a booking-duration distribution.`,
      ...context.reasons,`Promotion dates are an illustrative 8-day window anchored to the API lead-time median. A past window is historical guidance, not a future launch promise.`,
      ...query.sources.map(source=>`Source: ${source}`)],
    assumptions:['Demand and lead-time figures retain the API’s estimate/proxy status.','Age/platform choices are creative preferences, not demographic findings.','Approval and scheduling are local demo actions.']};
}
