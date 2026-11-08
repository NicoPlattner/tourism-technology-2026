import {useEffect,useId,useRef,useState} from "react";
import type {TravelDates} from "../types";
import {validTravelDates} from "../travelDates";
const format=(date:string)=>/^\d{4}-\d{2}-\d{2}$/.test(date)?date.split("-").reverse().join("."):date;
const parse=(text:string)=>/^\d{2}\.\d{2}\.\d{4}$/.test(text)?text.split(".").reverse().join("-"):text;
const iso=(date:Date)=>date.toISOString().slice(0,10);
const dateOf=(date:string)=>new Date(`${date}T12:00:00Z`);
const monthOf=(date:string)=>date.slice(0,7)+"-01";
const dateLabel=(date:string)=>new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(dateOf(date));
const months=Array.from({length:12},(_,month)=>new Intl.DateTimeFormat("en-GB",{month:"long",timeZone:"UTC"}).format(new Date(Date.UTC(2027,month,1))));
export default function TravelPeriodSelector({value,onChange}: {value:TravelDates;onChange:(dates:TravelDates)=>void}) {
  const id=useId();const root=useRef<HTMLFieldSetElement>(null);
  const triggers=useRef<Partial<Record<keyof TravelDates,HTMLButtonElement|null>>>({});
  const [text,setText]=useState({start:format(value.start),end:format(value.end)});
  const [active,setActive]=useState<keyof TravelDates>("start");const [open,setOpen]=useState(false);
  const [month,setMonth]=useState(monthOf(value.start));const [yearText,setYearText]=useState(value.start.slice(0,4));const [focusDate,setFocusDate]=useState(value.start);
  useEffect(()=>setYearText(month.slice(0,4)),[month]);
  useEffect(()=>setText({start:format(value.start),end:format(value.end)}),[value.start,value.end]);
  useEffect(()=>{
    if(!open)return;
    const dismiss=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
    document.addEventListener("pointerdown",dismiss);return()=>document.removeEventListener("pointerdown",dismiss);
  },[open]);
  useEffect(()=>{if(open)root.current?.querySelector<HTMLButtonElement>(`[data-calendar-date="${focusDate}"]`)?.focus();},[open,focusDate]);
  const draft={start:parse(text.start),end:parse(text.end)};const invalid=!validTravelDates(draft);
  const update=(next:TravelDates)=>{setText(next);const dates={start:parse(next.start),end:parse(next.end)};if(validTravelDates(dates))onChange(dates);};
  const close=()=>{setOpen(false);triggers.current[active]?.focus();};
  const show=(field:keyof TravelDates)=>{
    if(open&&active===field){close();return;}
    const date=validTravelDates({start:draft[field],end:draft[field]})?draft[field]:field==="end"&&validTravelDates({start:draft.start,end:draft.start})?draft.start:value[field];
    setActive(field);setMonth(monthOf(date));setFocusDate(date);setOpen(true);
  };
  const choose=(date:string)=>{
    if(active==="start"){
      update({start:format(date),end:draft.end>=date?text.end:""});setActive("end");setFocusDate(date);
    }else if(!draft.start||date<draft.start){update({start:format(date),end:""});setActive("end");setFocusDate(date);}
    else{update({...text,end:format(date)});close();}
  };
  const shiftMonth=(delta:number)=>{const next=dateOf(month);next.setUTCMonth(next.getUTCMonth()+delta);setMonth(iso(next));};
  const first=dateOf(month);const start=new Date(first);start.setUTCDate(1-(first.getUTCDay()+6)%7);
  const days=Array.from({length:42},(_,index)=>{const day=new Date(start);day.setUTCDate(day.getUTCDate()+index);return iso(day);});
  const calendarIcon=<svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="3" y="4" width="14" height="13" rx="1" stroke="currentColor" strokeWidth="1.5"/><path d="M6 2v4m8-4v4M3 8h14" stroke="currentColor" strokeWidth="1.5"/></svg>;
  return <fieldset className="cp-travel-dates cp-calendar-control" ref={root} aria-describedby={invalid?`${id}-help`:undefined}
    onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setOpen(false);}}
    onKeyDown={event=>{if(event.key==="Escape"&&open){event.preventDefault();event.stopPropagation();close();}}}>
    <legend>Analysis period</legend>
    <div className="cp-date-fields">
      {(["start","end"] as const).map(field=><label key={field}>
        <span>{field==="start"?"Start":"End"}</span>
        <input type="text" aria-label={`Travel ${field} date`} placeholder="DD.MM.YYYY" value={text[field]} aria-invalid={invalid}
          onChange={event=>update({...text,[field]:event.target.value})} autoComplete="off" inputMode="numeric"
          onKeyDown={event=>{if(event.key==="ArrowDown"){event.preventDefault();show(field);}}}/>
        <button type="button" className="cp-calendar-trigger" aria-label={`Open ${field} date calendar`} aria-haspopup="dialog" aria-expanded={open&&active===field}
          ref={node=>{triggers.current[field]=node;}} onClick={()=>show(field)}>{calendarIcon}</button>
      </label>)}
    </div>
    {invalid&&<span id={`${id}-help`} role="status" className="cp-date-error">
      {!draft.start||!draft.end?"Choose both dates to update the campaign.":"End date must be on or after start date."}
    </span>}
    {open&&<div className="cp-calendar" role="dialog" aria-label="Choose travel dates">
      <div className="cp-calendar-heading">
        <button type="button" aria-label="Previous month" onClick={()=>shiftMonth(-1)}>‹</button>
        <select aria-label="Calendar month" value={first.getUTCMonth()} onChange={event=>{const date=dateOf(month);date.setUTCMonth(Number(event.target.value));setMonth(iso(date));}}>
          {months.map((label,index)=><option value={index} key={label}>{label}</option>)}
        </select>
        <input type="number" aria-label="Calendar year" value={yearText} min="1900" max="9999" onBlur={()=>setYearText(String(first.getUTCFullYear()))} onChange={event=>{setYearText(event.target.value);const year=Number(event.target.value);if(year>=1900&&year<=9999){const date=dateOf(month);date.setUTCFullYear(year);setMonth(iso(date));}}}/>
        <button type="button" aria-label="Next month" onClick={()=>shiftMonth(1)}>›</button>
      </div>
      <div role="grid" aria-label={`${months[first.getUTCMonth()]} ${first.getUTCFullYear()}`} className="cp-calendar-grid">
        <div role="row" className="cp-calendar-weekdays">{["Mo","Tu","We","Th","Fr","Sa","Su"].map(day=><span role="columnheader" key={day}>{day}</span>)}</div>
        {Array.from({length:6},(_,week)=><div role="row" key={week}>{days.slice(week*7,week*7+7).map(date=>{
          const selected=date===draft.start||date===draft.end;const inRange=draft.start&&draft.end&&date>draft.start&&date<draft.end;
          return <button key={date} type="button" role="gridcell" aria-label={dateLabel(date)} aria-selected={selected} data-calendar-date={date}
            tabIndex={date===(days.includes(focusDate)?focusDate:month)?0:-1} className={`cp-calendar-day ${selected?"selected":""} ${inRange?"in-range":""} ${date.slice(0,7)!==month.slice(0,7)?"outside":""}`}
            onClick={()=>choose(date)} onKeyDown={event=>{
              const offsets:Record<string,number>={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};
              const next=dateOf(date);
              if(event.key in offsets)next.setUTCDate(next.getUTCDate()+offsets[event.key]);
              else if(event.key==="Home")next.setUTCDate(next.getUTCDate()-(next.getUTCDay()+6)%7);
              else if(event.key==="End")next.setUTCDate(next.getUTCDate()+6-(next.getUTCDay()+6)%7);
              else if(event.key==="PageUp"||event.key==="PageDown")next.setUTCMonth(next.getUTCMonth()+(event.key==="PageUp"?-1:1)*(event.shiftKey?12:1));else return;
              event.preventDefault();const target=iso(next);setFocusDate(target);setMonth(monthOf(target));
            }}>{Number(date.slice(8))}</button>;
        })}</div>)}
      </div>
      <div className="cp-calendar-footer"><span>{active==="start"?"Choose your arrival date":"Choose your departure date"}</span><button type="button" onClick={close}>Done</button></div>
    </div>}
  </fieldset>;
}
