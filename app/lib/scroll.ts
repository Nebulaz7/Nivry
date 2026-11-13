export function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function smoothstep(from: number, to: number, value: number) {
  const t = clamp01((value - from) / (to - from));
  return t * t * (3 - 2 * t);
}

/**
 * Progress through a scroll track: 0 when its top hits the viewport top, 1 when
 * its bottom reaches the viewport bottom. Used by every pinned section.
 */
export function readTrackProgress(track: HTMLElement | null) {
  if (!track) return 0;

  const rect = track.getBoundingClientRect();
  const scrollable = rect.height - window.innerHeight;
  if (scrollable <= 0) return 0;

  return clamp01(-rect.top / scrollable);
}
