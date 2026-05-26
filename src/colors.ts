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

// Returns white or black text based on background luminance.
export function contrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Relative luminance (sRGB)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#000000" : "#ffffff";
}

// Accepts a Google color name (case-insensitive), a raw #hex, or null/undefined.
// Returns { backgroundColor, borderColor, textColor } or null.
export function resolveColor(
  raw: unknown,
): { backgroundColor: string; borderColor: string; textColor: string } | null {
  if (raw == null) return null;
  const str = String(raw).trim().toLowerCase();
  if (!str) return null;

  let bg: string | undefined;

  if (GOOGLE_CALENDAR_COLORS[str]) {
    bg = GOOGLE_CALENDAR_COLORS[str];
  } else if (/^#[0-9a-f]{6}$/i.test(str)) {
    bg = str.toUpperCase();
  }

  if (!bg) return null;
  return {
    backgroundColor: bg,
    borderColor: bg,
    textColor: contrastColor(bg),
  };
}
