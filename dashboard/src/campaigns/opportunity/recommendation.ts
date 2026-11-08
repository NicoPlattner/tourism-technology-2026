import { campaignDataProvider,displayRange } from '../mockCampaignData';
import { withDemand } from '../demand/recommendation';
import type { DemandQuery } from '../demand/contracts';
import type { CampaignRecommendation } from '../types';
import { viennaOffset } from '../travelDates';
import type { OpportunityState } from './useTravelOpportunity';
import { campaignSchedule,type WindowEvidence } from './ranking';
export function withTravelWindow(base:CampaignRecommendation,analysisQuery:DemandQuery|undefined,dataStatus:'loading'|'ready'|'empty'|'error',opportunity:OpportunityState,today:string,awarenessDays:number):CampaignRecommendation {
  const initial=withDemand(base,analysisQuery,dataStatus);
  const {opportunityEvidence:_previousWindow,...captionMetadata}=initial.captionMetadata;
  const fallback={...initial,captionMetadata};
  const analysisPeriod={...base.travel,label:'Selected analysis period'};
  const status=opportunity.status;
  if(status!=='ready'||!opportunity.window||!opportunity.query||dataStatus!=='ready')return {...fallback,analysisPeriod,
    windowRecommendation:{status:dataStatus==='error'||dataStatus==='empty'?'unavailable':status==='ready'?'unavailable':status,message:dataStatus==='error'||dataStatus==='empty'?'Country demand evidence is required before recommending travel dates.':opportunity.message||'Insufficient country demand for a recommended window.',explanation:''}};
  const window=opportunity.window,query=opportunity.query;
  if(query.nights.value<=0||query.guests.value<=0)return {...fallback,analysisPeriod,windowRecommendation:{status:'unavailable',message:'Insufficient country demand in the selected opportunity window.',explanation:''}};
  const template=campaignDataProvider.getImmediateRecommendation!(base.market,base.period,base.marketingPreferences.targetAudience,{start:window.start,end:window.end});
  const campaign=withDemand(template,query,'ready');
  const schedule=campaignSchedule(window.start,query.booking_lead_time.value.median_days_ahead,awarenessDays,today);
  const explanation=`This ${window.days}-day window has ${Math.round(window.occupancy*100)}% forecast occupancy and an estimated ${Math.round(window.spareBedNights).toLocaleString('en-GB')} spare bed-nights across Paznaun-Ischgl.`;
  const evidence:WindowEvidence={analysisStart:analysisPeriod.start,analysisEnd:analysisPeriod.end,start:window.start,end:window.end,days:window.days,estimatedOccupancy:window.occupancy,spareBedNights:Math.round(window.spareBedNights),marketEvidence:window.marketEvidence,awarenessBufferDays:awarenessDays,leadOpportunityPassed:schedule.leadOpportunityPassed};
  const context=campaign.captionMetadata.tourismContext!;
  const calendar=context.reasons.filter(reason=>reason.startsWith('Origin holiday:'));
  const calendarEvidence=calendar.length?calendar:['Selected-window origin calendar: no qualifying holiday overlap was returned by the API.'];
  const enrichedContext={...context,reasons:[...calendarEvidence,...(window.marketReasons||[]),...context.reasons.filter(reason=>!reason.startsWith('Origin holiday:'))].slice(0,5)};
  return {...campaign,tourismContext:enrichedContext,id:`${base.id}-recommended-${window.start}-${window.end}`,analysisPeriod,
    marketingPreferences:base.marketingPreferences,
    windowRecommendation:{status:'ready',window,message:'',explanation,leadOpportunityPassed:schedule.leadOpportunityPassed,awarenessStarted:schedule.awarenessStarted},
    campaign:{start:schedule.start,end:schedule.end,label:'Awareness window before the median booking date'},
    publishingDates:schedule.postDates.map(date=>`${date}T18:00:00${viennaOffset(date)}`),
    captionMetadata:{...campaign.captionMetadata,tourismContext:enrichedContext,opportunityEvidence:evidence},
    reasoning:`For ages ${campaign.ageGroup} from ${campaign.country}, the API estimates an average ${query.length_of_stay.value?.toFixed(1)??'unknown'}-night stay in this window. Promotion runs ${displayRange({...schedule,label:''})}, with a ${awarenessDays}-day awareness buffer before the ${campaign.assumedLeadDays}-day booking-lead proxy.`,
    detailedReasoning:[...campaign.detailedReasoning.filter(reason=>!reason.startsWith('Promotion dates are an illustrative')),
      'Daily occupancy is destination-wide, not an origin-country occupancy estimate. Capacity is estimated from prior-year stays plus free beds; confirm open accommodation before spending.',
      `Capacity basis: ${window.capacityBasis.join('; ')||'prior-year estimate'}.`,
      window.marketEvidence?'Ranking includes the selected country/region’s backend marketing-opportunity scores.':'No matching country action scores are available; ranking uses the regional forecast and selected origin’s average-stay preference.',
      `Analysis period: ${analysisPeriod.start}–${analysisPeriod.end}. Rolling ${window.days}-day opportunity span includes both dates; this is not a quoted reservation duration.`,
      `Awareness buffer: ${awarenessDays} calendar days before the median booking date.`,
      ...(schedule.leadOpportunityPassed?['The median booking lead-time opportunity has already passed. These timing dates are historical guidance; review a shorter-lead strategy before scheduling.']:schedule.awarenessStarted?['The awareness period has already started; review the remaining promotion dates.']:[]),
      ...(window.referenceGap>0?["A positive gap to the API’s official reference forecast is a secondary ranking signal, not a measured booking shortfall."]:[]),
      ...calendarEvidence,
      ...(window.marketReasons||[]),
      ...window.notes],
  };
}
