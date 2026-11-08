import type { TravelDates } from "./types";
export const DEFAULT_TRAVEL_DATES: TravelDates = {start:"2027-02-15",end:"2027-02-21"};
export function validTravelDates(value: TravelDates): boolean {
  return [value.start,value.end].every(date => /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date) && value.start <= value.end;
}
export function viennaOffset(date: string): string {
  return new Intl.DateTimeFormat("en",{timeZone:"Europe/Vienna",timeZoneName:"longOffset"})
    .formatToParts(new Date(`${date}T12:00:00Z`)).find(part=>part.type==="timeZoneName")!.value.replace("GMT","") || "+00:00";
}
