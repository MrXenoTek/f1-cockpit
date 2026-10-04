import test from "node:test";
import assert from "node:assert/strict";
import { loadCircuitInfo, circuitInfoUrl } from "../src/api.js";

const ring = { x: Array.from({ length: 20 }, (_, i) => i), y: Array.from({ length: 20 }, (_, i) => i) };
const stubFetch = (available) => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    const year = +url.match(/\/(\d{4})$/)[1];
    return { ok: available.includes(year), json: async () => (available.includes(year) ? ring : { error: "not found" }) };
  };
  return calls;
};

test("loadCircuitInfo falls back to the newest year that has a layout", async () => {
  stubFetch([2017, 2016]);
  const res = await loadCircuitInfo("https://api.multiviewer.app/api/v1/circuits/12/2026");
  assert.equal(res.year, 2017);
  assert.equal(res.info.x.length, 20);
});

test("loadCircuitInfo returns the requested year when it exists, and null when nothing does", async () => {
  stubFetch([2026]);
  assert.equal((await loadCircuitInfo("https://api.multiviewer.app/api/v1/circuits/12/2026")).year, null);
  stubFetch([]);
  assert.equal(await loadCircuitInfo("https://api.multiviewer.app/api/v1/circuits/99/2026"), null);
});

test("circuitInfoUrl prefers circuit_key over a stale URL of another venue", () => {
  const meet = { circuit_key: 12, year: 2026, circuit_info_url: "https://api.multiviewer.app/api/v1/circuits/63/2026" };
  assert.match(circuitInfoUrl(meet), /circuits\/12\/2026$/);
  assert.equal(circuitInfoUrl({ circuit_key: 12, year: 2026, circuit_info_url: "https://api.multiviewer.app/api/v1/circuits/12/2026" }), "https://api.multiviewer.app/api/v1/circuits/12/2026");
  assert.equal(circuitInfoUrl({ circuit_info_url: "https://x/circuits/5/2026" }), "https://x/circuits/5/2026");
});

// Regression: MultiViewer answers a missing layout with a plain-text 404. That used to
// reject out of fetchJ and silently abort the whole session load (blank app).
test("a plain-text 404 neither throws nor blocks the circuit fallback", async () => {
  globalThis.fetch = async (url) => {
    const year = +url.match(/\/(\d{4})$/)[1];
    return year === 2017
      ? { ok: true, json: async () => ring }
      : { ok: false, status: 404, json: async () => { throw new SyntaxError("Unexpected token N in JSON"); } };
  };
  const { fetchJ } = await import("../src/api.js");
  assert.equal(await fetchJ("https://api.multiviewer.app/api/v1/circuits/12/2026"), null);
  const res = await loadCircuitInfo("https://api.multiviewer.app/api/v1/circuits/12/2026");
  assert.equal(res.year, 2017);
});

test("loadCircuitInfo never throws, even if fetch itself blows up", async () => {
  globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
  assert.equal(await loadCircuitInfo("https://api.multiviewer.app/api/v1/circuits/12/2026"), null);
});
