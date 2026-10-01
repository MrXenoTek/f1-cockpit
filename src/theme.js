// ─── Design tokens ──────────────────────────────────────────────────────────────
// Every text color below meets WCAG AA (≥4.5:1) on bg, panel and raised.
export const C = {
  bg:        "#0D0F12", // page ground
  panel:     "#15181D", // sidebars, header, transport bar
  raised:    "#1C2026", // buttons, cards inside panels
  selected:  "#2A303A", // active tab / segment
  line:      "#262B33", // dividers
  lineStrong:"#2E343D", // control borders
  rowLine:   "#1E2228",
  text:      "#ECEEF1", // 16.5:1
  text2:     "#A9B0BB", // 8.8:1
  text3:     "#838B97", // 5.6:1 — captions, never below 12px
  a:         "#5B9BFF", // driver A (selected)
  aBg:       "#1A2536",
  b:         "#FFB020", // driver B (compared)
  bBg:       "#2B2410",
  bLine:     "#5C4A12",
  action:    "#D10029", // filled red, white label 5.6:1
  red:       "#FF4D6A", // red as text / marks
  green:     "#3DDC84",
  greenBg:   "#12301F",
  purple:    "#C77DFF",
  purpleBg:  "#2A1B3D",
  focus:     "#5B9BFF",
};

export const FONT_UI = "'Archivo', system-ui, -apple-system, 'Segoe UI', sans-serif";
export const FONT_NUM = "'JetBrains Mono', ui-monospace, 'SF Mono', monospace";

// Square icon button, 44px hit target by default
export const iconBtn = (size = 44, active = false) => ({
  width: size, height: size, flexShrink: 0, borderRadius: 10,
  border: `1px solid ${active ? C.a : C.lineStrong}`,
  background: active ? C.aBg : C.raised, color: C.text,
  display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
});

// Labelled button
export const btn = (active = false) => ({
  height: 40, padding: "0 14px", borderRadius: 9,
  border: `1px solid ${active ? C.a : C.lineStrong}`,
  background: active ? C.aBg : C.raised, color: active ? C.text : C.text,
  fontSize: 13, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 8,
});

// Segmented control container + segment
export const segWrap = { display: "flex", padding: 3, background: C.bg, border: `1px solid ${C.line}`, borderRadius: 9, gap: 2 };
export const seg = (on, h = 34) => ({
  height: h, padding: "0 12px", border: "none", borderRadius: 6,
  background: on ? C.selected : "transparent", color: on ? C.text : C.text2,
  fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
});

export const TYRE = {
  SOFT: { l: "S", c: "#FF4D6A" },
  MEDIUM: { l: "M", c: "#FFB020" },
  HARD: { l: "H", c: "#ECEEF1" },
  INTERMEDIATE: { l: "I", c: "#3DDC84" },
  WET: { l: "W", c: "#5B9BFF" },
};
