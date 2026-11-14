const GRID = 5;

function seedOf(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

interface Cell {
  x: number;
  y: number;
}

/**
 * Deterministic 5×5 mirrored mark, derived from the token id.
 *
 * Stand-in art until agents publish real images: it is derived, stable, and
 * unique per token without shipping any asset.
 */
function cellsFor(seed: string): Cell[] {
  let state = seedOf(seed);
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0xffffffff;
  };

  const cells: Cell[] = [];

  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < 3; x += 1) {
      if (next() <= 0.45) continue;
      cells.push({ x, y });
      if (x !== GRID - 1 - x) cells.push({ x: GRID - 1 - x, y });
    }
  }

  if (cells.length === 0) cells.push({ x: 2, y: 2 });
  return cells;
}

export function Sigil({ seed, size = 40 }: { seed: string; size?: number }) {
  const cells = cellsFor(seed);

  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center border border-mint/15 text-accent/70"
      style={{ width: size, height: size }}
    >
      <svg
        width={size * 0.68}
        height={size * 0.68}
        viewBox={`0 0 ${GRID} ${GRID}`}
        shapeRendering="crispEdges"
      >
        {cells.map((cell) => (
          <rect
            key={`${cell.x}-${cell.y}`}
            x={cell.x + 0.06}
            y={cell.y + 0.06}
            width={0.88}
            height={0.88}
            fill="currentColor"
          />
        ))}
      </svg>
    </span>
  );
}
