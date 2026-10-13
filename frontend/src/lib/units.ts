/**
 * Unit conventions used across the UI.
 *
 * The backend reports flow as litres per 15-minute interval (L/interval).
 * Conversion to litres per hour (L/h) is explicit here and documented in
 * tooltips so the same number is never shown with two different meanings.
 */
export const INTERVAL_MINUTES = 15;
export const INTERVALS_PER_HOUR = 60 / INTERVAL_MINUTES;

export function intervalToLph(v: number | null | undefined): number | null {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  return v * INTERVALS_PER_HOUR;
}

export function lphToInterval(v: number | null | undefined): number | null {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  return v / INTERVALS_PER_HOUR;
}

export const UNIT_INTERVAL = "L / 15 min";
export const UNIT_LPH = "L/h";
