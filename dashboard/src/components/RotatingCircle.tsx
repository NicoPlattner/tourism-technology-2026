import { useId, type ReactNode } from 'react';

/** Text running around a slowly rotating circle (Ischgl brand element). */
export default function RotatingCircle({ text, size = 220, children, tone = 'light' }: { text: string; size?: number; children?: ReactNode; tone?: 'light' | 'dark' }) {
  const id = useId().replace(/:/g, '');
  const r = 86;
  const circumference = 2 * Math.PI * r;
  // repeat the phrase so it fills the ring evenly
  const unit = text.trim().endsWith('•') || text.trim().endsWith('♥') ? `${text.trim()} ` : `${text.trim()} • `;
  const reps = Math.max(2, Math.round(circumference / (unit.length * 7.2)));
  return (
    <div className={`rotcircle ${tone}`} style={{ width: size, height: size }} aria-label={text}>
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <defs>
          <path id={`c${id}`} d={`M100,100 m-${r},0 a${r},${r} 0 1,1 ${2 * r},0 a${r},${r} 0 1,1 -${2 * r},0`} />
        </defs>
        <g className="rotcircle-spin">
          <text>
            <textPath href={`#c${id}`} textLength={circumference - 2} lengthAdjust="spacing">{unit.repeat(reps)}</textPath>
          </text>
        </g>
      </svg>
      <div className="rotcircle-inner">{children}</div>
    </div>
  );
}
