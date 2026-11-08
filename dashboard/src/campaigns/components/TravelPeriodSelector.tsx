import { useEffect, useId, useState } from "react";
import type { TravelDates } from "../types";
import {validTravelDates} from "../travelDates";
export default function TravelPeriodSelector({value,onChange}: {
  value: TravelDates; onChange: (dates: TravelDates)=>void;
}) {
  const id=useId();
  const [draft,setDraft]=useState(value);
  useEffect(()=>setDraft(value),[value.start,value.end]);
  const invalid=!validTravelDates(draft);
  const change=(field: keyof TravelDates,date:string)=>{
    const next={...draft,[field]:date};setDraft(next);
    if(validTravelDates(next))onChange(next);
  };
  return <fieldset className="cp-travel-dates" aria-describedby={`${id}-help`}>
    <legend>Target travel period</legend>
    <div className="cp-date-fields">
      <label><span>Start</span><input type="date" aria-label="Travel start date" value={draft.start}
        aria-invalid={invalid} onChange={event=>change("start",event.target.value)} required /></label>
      <label><span>End</span><input type="date" aria-label="Travel end date" value={draft.end}
        aria-invalid={invalid} onChange={event=>change("end",event.target.value)} required /></label>
    </div>
    <span id={`${id}-help`} role={invalid?"status":undefined} className={invalid?"cp-date-error":""}>
      {invalid ? !draft.start || !draft.end ? "Choose both dates to update the campaign." : "End date must be on or after start date." : "When guests visit, not when you advertise."}
    </span>
  </fieldset>;
}
