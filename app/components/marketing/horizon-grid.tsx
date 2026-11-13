const HORIZONTALS = Array.from({ length: 11 }, (_, i) => i);
const VERTICALS = Array.from({ length: 25 }, (_, i) => i);

/**
 * Flat perspective grid, drawn as individual strokes so each row can carry its
 * own opacity. Solid lines only — no gradient fills anywhere.
 */
export function HorizonGrid() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[44%] w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      {HORIZONTALS.map((i) => {
        const t = i / (HORIZONTALS.length - 1);
        const y = 100 - 100 * Math.pow(t, 1.7);
        const opacity = 0.03 + t * 0.1;

        return (
          <line
            key={`h-${i}`}
            x1={0}
            x2={100}
            y1={y}
            y2={y}
            stroke="#34d399"
            strokeOpacity={opacity}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}

      {VERTICALS.map((i) => {
        const x = (i / (VERTICALS.length - 1)) * 100;

        return (
          <line
            key={`v-${i}`}
            x1={x}
            x2={x}
            y1={100}
            y2={28}
            stroke="#34d399"
            strokeOpacity={0.045}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}
