export const GOOGLE_CALENDAR_COLORS: Record<string, string> = {
  lavender: "#7986CB",
  sage: "#33B679",
  grape: "#8E24AA",
  flamingo: "#E67C73",
  banana: "#F6BF26",
  tangerine: "#F4511E",
  peacock: "#039BE5",
  graphite: "#616161",
  blueberry: "#3F51B5",
  basil: "#0B8043",
  tomato: "#D50000",
};

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Accepts a Google color name (case-insensitive) or a raw #hex.
// Returns a low-opacity background tint + full-opacity border so colors read
// as a subtle hint rather than a bold fill. Text uses the theme default.
export function resolveColor(
  raw: unknown,
): { backgroundColor: string; borderColor: string } | null {
  if (raw == null) return null;
  const str = String(raw).trim().toLowerCase();
  if (!str) return null;

  let solid: string | undefined;

  if (GOOGLE_CALENDAR_COLORS[str]) {
    solid = GOOGLE_CALENDAR_COLORS[str];
  } else if (/^#[0-9a-f]{6}$/i.test(str)) {
    solid = str.toUpperCase();
  }

  if (!solid) return null;
  return {
    backgroundColor: hexToRgba(solid, 0.18),
    borderColor: solid,
  };
}
