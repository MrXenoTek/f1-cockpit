// ─── Meeting / session helpers ─────────────────────────────────────────────────
// A race can be cancelled, moved or renamed after the calendar was published
// (2026: the Bahrain GP moved from Sakhir to Sepang). OpenF1 keeps the scheduled
// entries, so two meetings can share a name: labels must say *where* and *when*.

const loc = (lang) => (lang === "fr" ? "fr-FR" : "en-GB");

export function dateRange(m, lang = "fr") {
  if (!m?.date_start) return "";
  const s = new Date(m.date_start), e = m.date_end ? new Date(m.date_end) : null;
  const month = s.toLocaleDateString(loc(lang), { month: "short" });
  if (!e || e.toDateString() === s.toDateString()) return `${s.getDate()} ${month}`;
  const endMonth = e.toLocaleDateString(loc(lang), { month: "short" });
  return endMonth === month ? `${s.getDate()}–${e.getDate()} ${month}` : `${s.getDate()} ${month} – ${e.getDate()} ${endMonth}`;
}

export function meetingLabel(m, lang = "fr") {
  const place = m.location || m.circuit_short_name;
  const range = dateRange(m, lang);
  return [m.meeting_name, place && `${place}`, range].filter(Boolean).join(" · ");
}

export function sessionLabel(s, lang = "fr") {
  if (!s.date_start) return s.session_name;
  const day = new Date(s.date_start).toLocaleDateString(loc(lang), { weekday: "short", day: "numeric", month: "short" });
  return `${s.session_name} · ${day}`;
}

// "Bahrain Grand Prix" → "bahrain"
const baseName = (m) => (m?.meeting_name || "").toLowerCase().replace(/grand prix/g, "").trim();

// Other meetings that look like the same event (same GP name, or an official name that
// mentions it) — typically the relocated/rescheduled edition. Newest first.
export function findAlternatives(sel, meetings) {
  const key = baseName(sel);
  if (!key) return [];
  return meetings
    .filter((m) => m.meeting_key !== sel.meeting_key)
    .filter((m) => baseName(m) === key || (m.meeting_official_name || "").toLowerCase().includes(key) || (m.meeting_name || "").toLowerCase().includes(key))
    .sort((a, b) => new Date(b.date_start) - new Date(a.date_start));
}
