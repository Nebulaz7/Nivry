/**
 * 16x16 pixel portrait, authored by hand and rendered from code.
 *
 * `f` = fur, `d` = feature (eyes, mouth), `.` = transparent.
 * Hand-authored on purpose: at this resolution generated noise reads as dirt,
 * while a fixed silhouette stays legible at any size.
 */
const GRID = [
  "................",
  "...ffffffffff...",
  "..ffffffffffff..",
  ".fff.ffffff.fff.",
  ".fff.ffffff.fff.",
  ".ffffffffffffff.",
  ".ffffffffffffff.",
  ".ff.dd....dd.ff.",
  ".ff.dd....dd.ff.",
  ".ffffffffffffff.",
  ".fffff.dd.fffff.",
  ".fffff.dd.fffff.",
  "..ffffffffffff..",
  "...ffffffffff...",
  "....ffffffff....",
  "................",
] as const;

export const PFP_SIZE = 16;

export type PfpTone = "fur" | "mark";

export type PfpCell = {
  x: number;
  y: number;
  tone: PfpTone;
};

/** Cells that carry ink, in grid coordinates. */
export function pfpCells(): PfpCell[] {
  const cells: PfpCell[] = [];

  for (let y = 0; y < GRID.length; y += 1) {
    const row = GRID[y];

    for (let x = 0; x < row.length; x += 1) {
      const char = row[x];
      if (char === "f") cells.push({ x, y, tone: "fur" });
      else if (char === "d") cells.push({ x, y, tone: "mark" });
    }
  }

  return cells;
}
