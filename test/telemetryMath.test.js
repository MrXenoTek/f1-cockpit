import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../src/telemetryMath.js";
import { passStatus } from "../src/passStatus.js";

// Deterministic PRNG so the suite never flakes
const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

const L = 5000, S1 = 1500, S2 = 3200;
const vAt = (x, k) => k * (300 - 190 * Math.exp(-(((x - 900) / 90) ** 2)) - 150 * Math.exp(-(((x - 2400) / 120) ** 2)) - 200 * Math.exp(-(((x - 4100) / 80) ** 2)));

// Ground truth sampled every ms, then "measured" at ~3.7 Hz with jitter
function simulate(k, t0, seed) {
  const rand = rng(seed);
  let x = 0, t = 0;
  const truth = [];
  while (x < L) { const v = vAt(x, k); truth.push({ t, x, v }); x += (v / 3.6) * 0.001; t++; }
  const tAtX = (xt) => truth.find((p) => p.x >= xt).t;
  const samples = [];
  for (let s = -300 + rand() * 200; s < truth[truth.length - 1].t + 300; s += 270 + (rand() - 0.5) * 120) {
    const p = truth[Math.max(0, Math.min(truth.length - 1, Math.round(s)))];
    samples.push({ date: new Date(t0 + s).toISOString(), speed: Math.round(p.v), throttle: p.v > 200 ? 100 : 40, brake: 0, n_gear: 6 });
  }
  const anchors = [t0, t0 + tAtX(S1), t0 + tAtX(S2), t0 + truth[truth.length - 1].t];
  return { samples, anchors, truth, t0 };
}

test("pchip never overshoots the measured values", () => {
  const f = M.makePchip([0, 1, 2, 3], [0, 10, 10, 0]);
  for (let x = 0; x <= 3; x += 0.05) { const y = f(x); assert.ok(y >= -1e-9 && y <= 10 + 1e-9, `x=${x} y=${y}`); }
  assert.equal(f(1), 10);
});

test("cleanSamples sorts, dedupes timestamps and keeps stopped cars", () => {
  const out = M.cleanSamples([
    { date: "2026-01-01T00:00:02Z", speed: 0, throttle: 0, brake: 100, n_gear: 1 },
    { date: "2026-01-01T00:00:01Z", speed: 100, throttle: 90, brake: 0, n_gear: 4 },
    { date: "2026-01-01T00:00:01Z", speed: 101, throttle: 90, brake: 0, n_gear: 4 },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[1].speed, 0);
});

test("two cars end up on one distance axis with ~metre accuracy", () => {
  const cars = [simulate(1.0, 1e12, 1), simulate(0.93, 1e12 + 5000, 2)];
  // timing loops are only known to ~80 ms
  const profs = cars.map((c) => M.buildProfile(M.cleanSamples(c.samples), c.anchors.map((a, i) => (i && i < 3 ? a + 80 : a))));
  const ref = M.medianSegLens(profs);
  assert.ok(Math.abs(ref[0] - 1500) < 25 && Math.abs(ref[1] - 1700) < 25 && Math.abs(ref[2] - 1800) < 25, `ref ${ref}`);
  const total = ref.reduce((a, b) => a + b, 0);
  cars.forEach((c, ci) => {
    const rs = M.resample(M.normalise(profs[ci], ref), total, 5);
    let maxPos = 0, maxSpd = 0;
    for (const r of rs.rows) {
      if (r.t === null || r.d > L) continue;
      const tr = c.truth.find((p) => p.x >= r.d);
      if (!tr) continue;
      maxPos = Math.max(maxPos, (Math.abs(r.t - (c.t0 + tr.t)) / 1000) * (tr.v / 3.6));
      maxSpd = Math.max(maxSpd, Math.abs(r.speed - tr.v));
    }
    assert.ok(maxPos < 12, `car ${ci} position error ${maxPos} m`);
    assert.ok(maxSpd < 6, `car ${ci} speed error ${maxSpd} km/h`);
  });
});

test("zoneMetrics recovers the corner minimum and the slower car's lower mean", () => {
  const cars = [simulate(1.0, 1e12, 3), simulate(0.93, 1e12, 4)];
  const profs = cars.map((c) => M.buildProfile(M.cleanSamples(c.samples), c.anchors));
  const ref = M.medianSegLens(profs);
  const total = ref.reduce((a, b) => a + b, 0);
  const [a, b] = profs.map((p) => M.zoneMetrics(M.resample(M.normalise(p, ref), total, 5).rows, 2300, 2500));
  assert.ok(Math.abs(a.min - 150) < 4, `min A ${a.min}`);
  assert.ok(Math.abs(b.min - 139.5) < 4, `min B ${b.min}`);
  assert.ok(a.mean > b.mean && a.timeS < b.timeS);
});

test("findSlowZone points at where a driver is slower than his reference", () => {
  const n = 1001, mk = (f) => Array.from({ length: n }, (_, i) => ({ d: i * 5, speed: f(i * 5), throttle: 100, brake: 0, t: i }));
  const ref = mk(() => 300);
  const inc = mk((d) => 300 - 120 * Math.exp(-(((d - 2000) / 100) ** 2)));
  const z = M.findSlowZone([{ inc, ref }], 300, 5);
  assert.ok(z.z0 < 2000 && z.z1 > 2000, JSON.stringify(z));
});

test("passStatus tells before / under / after the flag", () => {
  const evt = { t: 1000, tClear: 2000 };
  assert.equal(passStatus(500, evt), "before");
  assert.equal(passStatus(1500, evt), "yellow");
  assert.equal(passStatus(2500, evt), "after");
  assert.equal(passStatus(2500, { t: 1000, tClear: null }), "yellow");
  assert.equal(passStatus(null, evt), null);
});
