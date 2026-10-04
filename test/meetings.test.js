import test from "node:test";
import assert from "node:assert/strict";
import { meetingLabel, sessionLabel, findAlternatives, dateRange } from "../src/meetings.js";
import { outlineFromLocation } from "../src/telemetryMath.js";

const sakhir = { meeting_key: 1, meeting_name: "Bahrain Grand Prix", location: "Sakhir", date_start: "2026-04-10T10:00:00", date_end: "2026-04-12T16:00:00", meeting_official_name: "FORMULA 1 GULF AIR BAHRAIN GRAND PRIX 2026" };
const sepang = { meeting_key: 2, meeting_name: "Bahrain Grand Prix", location: "Sepang", date_start: "2026-10-02T04:00:00", date_end: "2026-10-04T09:00:00", meeting_official_name: "FORMULA 1 GULF AIR BAHRAIN GRAND PRIX IN MALAYSIA 2026" };
const baku = { meeting_key: 3, meeting_name: "Azerbaijan Grand Prix", location: "Baku", date_start: "2026-09-24T08:00:00", date_end: "2026-09-26T16:00:00" };

test("two meetings with the same name get different labels", () => {
  const a = meetingLabel(sakhir, "en"), b = meetingLabel(sepang, "en");
  assert.notEqual(a, b);
  assert.match(a, /Sakhir/); assert.match(b, /Sepang/);
  assert.match(b, /2–4 Oct/);
});

test("dateRange handles one day, same month and cross-month events", () => {
  assert.match(dateRange({ date_start: "2026-10-04T10:00:00" }, "en"), /^4 Oct/);
  assert.match(dateRange({ date_start: "2026-09-30T10:00:00", date_end: "2026-10-02T10:00:00" }, "en"), /30 Sept?.* – 2 Oct/);
});

test("sessionLabel adds the day so sessions are told apart", () => {
  assert.match(sessionLabel({ session_name: "Race", date_start: "2026-10-04T07:00:00" }, "en"), /^Race · .*4 Oct/);
  assert.equal(sessionLabel({ session_name: "Race" }, "en"), "Race");
});

test("findAlternatives finds the relocated edition and ignores other GPs", () => {
  const alts = findAlternatives(sakhir, [sakhir, sepang, baku]);
  assert.deepEqual(alts.map((m) => m.meeting_key), [2]);
  assert.deepEqual(findAlternatives(baku, [sakhir, sepang, baku]), []);
});

test("findAlternatives matches a differently named edition through the official name", () => {
  const renamed = { meeting_key: 9, meeting_name: "Malaysian Grand Prix", location: "Sepang", date_start: "2026-10-02T04:00:00", meeting_official_name: "FORMULA 1 GULF AIR BAHRAIN GRAND PRIX IN MALAYSIA 2026" };
  assert.deepEqual(findAlternatives(sakhir, [sakhir, renamed]).map((m) => m.meeting_key), [9]);
});

test("outlineFromLocation keeps a thinned ring and rejects a parked car", () => {
  const lap = Array.from({ length: 2000 }, (_, i) => ({ date: new Date(1e12 + i * 100).toISOString(), x: 1000 * Math.cos(i / 318), y: 600 * Math.sin(i / 318) }));
  const o = outlineFromLocation(lap, 400);
  assert.ok(o.x.length <= 400 && o.x.length > 300 && o.x.length === o.y.length);
  const parked = Array.from({ length: 300 }, (_, i) => ({ date: new Date(1e12 + i * 100).toISOString(), x: 5, y: 5 }));
  assert.equal(outlineFromLocation(parked), null);
  assert.equal(outlineFromLocation([]), null);
});
