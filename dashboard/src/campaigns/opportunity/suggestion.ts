import type {TravelDates} from '../types';
import {shiftDate} from '../mockCampaignData';
export function suggestTravelDates(analysis:TravelDates,averageStay:number|null,today:string):TravelDates|undefined {
  const start=analysis.start>today?analysis.start:today;
  if(start>analysis.end)return;
  const days=Math.max(3,Math.min(7,Math.round(averageStay||5)));
  const end=shiftDate(start,days-1);
  return {start,end:end<analysis.end?end:analysis.end};
}
export interface WindowSuggestion extends TravelDates {analysisStart:string;analysisEnd:string;basis:'heuristic-not-extracted'}
