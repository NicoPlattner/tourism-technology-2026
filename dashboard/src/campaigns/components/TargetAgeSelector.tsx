import { useEffect, useId, useRef, useState } from "react";
import { TARGET_AGES, type TargetAudience } from "../types";

export default function TargetAgeSelector({ value, onChange }: {
  value: TargetAudience;
  onChange: (value: TargetAudience) => void;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const selected = TARGET_AGES.findIndex(age => age.ageMin === value.ageMin);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>(`[data-age-index="${selected}"]`)?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open, selected]);
  return <div className="cp-period-label cp-age-selector" ref={root}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}
    onKeyDown={event => {
      if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); close(); }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        if (!open) { setOpen(true); return; }
        const active = Number((document.activeElement as HTMLElement)?.dataset.ageIndex ?? selected);
        const next = event.key === "Home" ? 0 : event.key === "End" ? TARGET_AGES.length - 1 :
          (active + (event.key === "ArrowDown" ? 1 : -1) + TARGET_AGES.length) % TARGET_AGES.length;
        root.current?.querySelector<HTMLButtonElement>(`[data-age-index="${next}"]`)?.focus();
      }
    }}>
    <span className="cp-age-label" id={`${id}-label`}>Target audience age</span>
    <div className="cp-age-control">
    <button type="button" className="cp-age-trigger" ref={trigger}
      aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="listbox" aria-expanded={open}
      aria-controls={open ? `${id}-options` : undefined} onClick={() => setOpen(previous => !previous)}>
      <span id={`${id}-value`}>{value.ageMin}–{value.ageMax}</span>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" /></svg>
    </button>
    {open && <div className="cp-age-options" id={`${id}-options`} role="listbox" aria-labelledby={`${id}-label`}>
      {TARGET_AGES.map((age, index) => <button type="button" role="option" key={age.ageMin}
        aria-selected={index === selected} tabIndex={-1} data-age-index={index}
        onClick={() => { onChange(age); close(); }}>
        <span>{age.ageMin}–{age.ageMax}</span>
        {index === selected && <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3 8 3 3 7-7" stroke="currentColor" strokeWidth="1.7" /></svg>}
      </button>)}
    </div>}
    </div>
  </div>;
}
