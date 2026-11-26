/** The kite body (four panels) in a 0 0 200 200 box, from the logo exports (`public/icons/favicon.svg`). */
const BODY =
  'M61.80,30.31 L61.07,30.56 L60.37,30.87 L60.24,30.95 L114.91,79.82 L172.83,10.05 L172.09,10.00 L171.32,10.03 L170.54,10.13 L62.54,30.13 Z M56.44,35.39 L56.22,36.13 L56.08,36.89 L38.08,164.89 L38.01,165.66 L38.01,166.44 L38.09,167.21 L38.25,167.97 L38.48,168.72 L38.77,169.43 L39.14,170.12 L39.51,170.67 L110.78,84.81 L56.68,34.79 Z M44.00,173.75 L44.76,173.90 L45.54,173.99 L46.31,173.99 L47.09,173.93 L47.85,173.78 L173.85,143.78 L174.40,143.62 L115.63,89.29 L42.72,173.29 L43.26,173.52 Z M179.85,137.52 L179.96,136.76 L180.00,136.00 L180.00,18.00 L179.96,17.22 L179.85,16.45 L179.66,15.69 L179.61,15.57 L119.94,84.32 L179.78,137.82 Z';

/** The tail: three round-capped dashes. */
const TAIL = [
  { x1: 40, y1: 174, x2: 34, y2: 180, width: 4 },
  { x1: 29, y1: 184, x2: 25, y2: 187, width: 2.5 },
  { x1: 21, y1: 190, x2: 19, y2: 191, width: 1.5 },
];

/** The Kite logo mark in the current text color (decorative: the name sits next to it). */
export function KiteMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" aria-hidden="true" focusable="false" className={className}>
      <path d={BODY} fill="currentColor" />
      <g stroke="currentColor" strokeLinecap="round">
        {TAIL.map((d) => (
          <line key={d.x1} x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} strokeWidth={d.width} />
        ))}
      </g>
    </svg>
  );
}
