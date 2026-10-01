// ─── Telemetry reconstruction ──────────────────────────────────────────────────
// OpenF1 car_data arrives at ~3.7 Hz (one sample every ~270 ms). Nothing here adds
// information that is not in those samples: it only puts every driver on the same
// *distance* axis and interpolates smoothly between the measured points, so two
// cars can be compared at the same place on track instead of at the same lap fraction.

const lerp = (a, b, u) => a + (b - a) * u;

// Monotone cubic (Fritsch–Carlson / PCHIP) interpolation: smooth, never overshoots
// between samples (a plain spline would invent speeds above/below the measurements).
export function makePchip(xs, ys) {
  const n = xs.length;
  if (n === 0) return () => NaN;
  if (n === 1) return () => ys[0];
  const h = new Array(n - 1), del = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) { h[i] = xs[i + 1] - xs[i]; del[i] = (ys[i + 1] - ys[i]) / h[i]; }
  const m = new Array(n);
  m[0] = del[0]; m[n - 1] = del[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (del[i - 1] * del[i] <= 0) { m[i] = 0; continue; }
    const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
    m[i] = (w1 + w2) / (w1 / del[i - 1] + w2 / del[i]);
  }
  for (const i of [0, n - 1]) {
    const d = del[Math.min(i, n - 2)];
    if (m[i] * d <= 0) m[i] = 0; else if (Math.abs(m[i]) > 3 * Math.abs(d)) m[i] = 3 * d;
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
    const t = (x - xs[lo]) / h[lo], t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[lo] + (t3 - 2 * t2 + t) * h[lo] * m[lo]
         + (-2 * t3 + 3 * t2) * ys[lo + 1] + (t3 - t2) * h[lo] * m[lo + 1];
  };
}

// Raw API rows → clean, strictly time-increasing samples. Keeps every sample
// (no 100 ms thinning, no speed filter) so stopped cars stay visible.
export function cleanSamples(rows) {
  const out = [];
  let last = -Infinity;
  [...rows]
    .map((r) => ({ t: new Date(r.date).getTime(), speed: r.speed, throttle: r.throttle, brake: r.brake, gear: r.n_gear, drs: r.drs }))
    .filter((r) => Number.isFinite(r.t) && Number.isFinite(r.speed))
    .sort((a, b) => a.t - b.t)
    .forEach((r) => { if (r.t > last) { out.push(r); last = r.t; } });
  return out;
}

function sampleAt(s, t) {
  if (t < s[0].t || t > s[s.length - 1].t) return null;
  let lo = 0, hi = s.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (s[mid].t <= t) lo = mid; else hi = mid; }
  const a = s[lo], b = s[hi], u = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  return { t, speed: lerp(a.speed, b.speed, u), throttle: lerp(a.throttle, b.throttle, u), brake: lerp(a.brake, b.brake, u), gear: u < 0.5 ? a.gear : b.gear };
}

// Integrate speed over time to get a distance for every sample. `anchorTimes` are
// instants where the car is at a known place (start/finish line and the two timing
// loops), as [lapStart, endS1, endS2, lapEnd]. Returns the raw distance of every
// point and the raw length of every anchor-to-anchor segment.
export function buildProfile(samples, anchorTimes) {
  if (samples.length < 3 || anchorTimes.length < 2) return null;
  const cov0 = samples[0].t, cov1 = samples[samples.length - 1].t;
  const anchors = anchorTimes.map((t) => Math.min(Math.max(t, cov0), cov1));
  const pts = [];
  const anchorIdx = [];
  anchors.forEach((ta, k) => {
    if (k > 0) {
      const prev = anchors[k - 1];
      for (const s of samples) if (s.t > prev && s.t < ta) pts.push(s);
    }
    pts.push(sampleAt(samples, ta));
    anchorIdx.push(pts.length - 1);
  });
  const raw = [0];
  for (let i = 1; i < pts.length; i++) {
    const dt = (pts[i].t - pts[i - 1].t) / 1000;
    raw.push(raw[i - 1] + ((pts[i].speed + pts[i - 1].speed) / 2 / 3.6) * dt);
  }
  const anchorRaw = anchorIdx.map((i) => raw[i]);
  const segLens = anchorRaw.slice(1).map((r, k) => r - anchorRaw[k]);
  const gaps = samples.slice(1).map((s, i) => s.t - samples[i].t);
  return {
    pts: pts.map((p, i) => ({ ...p, raw: raw[i] })),
    anchors, anchorRaw, segLens,
    quality: {
      n: samples.length,
      hz: samples.length > 1 ? (samples.length - 1) / ((cov1 - cov0) / 1000) : 0,
      maxGapMs: Math.max(...gaps),
      startGapMs: Math.max(0, cov0 - anchorTimes[0]),
      endGapMs: Math.max(0, anchorTimes[anchorTimes.length - 1] - cov1),
    },
  };
}

// Reference segment lengths shared by every profile of the session (median of the
// integrated lengths), so all cars end up on exactly the same distance axis.
export function medianSegLens(profiles) {
  const valid = profiles.filter(Boolean);
  if (!valid.length) return null;
  const byLen = new Map();
  valid.forEach((p) => byLen.set(p.segLens.length, (byLen.get(p.segLens.length) || 0) + 1));
  const n = [...byLen.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const same = valid.filter((p) => p.segLens.length === n);
  return Array.from({ length: n }, (_, k) => {
    const v = same.map((p) => p.segLens[k]).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  });
}

// Stretch/squeeze every segment so its length equals the reference one.
export function normalise(profile, refSegLens) {
  const own = profile.segLens;
  const useSeg = refSegLens && refSegLens.length === own.length;
  const ref = useSeg ? refSegLens : [refSegLens ? refSegLens.reduce((a, b) => a + b, 0) : own.reduce((a, b) => a + b, 0)];
  const ownSeg = useSeg ? own : [own.reduce((a, b) => a + b, 0)];
  const anchorD = [0];
  ref.forEach((l, k) => anchorD.push(anchorD[k] + l));
  const anchorRaw = useSeg ? profile.anchorRaw : [profile.anchorRaw[0], profile.anchorRaw[profile.anchorRaw.length - 1]];
  const anchorT = useSeg ? profile.anchors : [profile.anchors[0], profile.anchors[profile.anchors.length - 1]];
  const pts = profile.pts.map((p) => {
    let k = 0;
    while (k < ref.length - 1 && p.t >= anchorT[k + 1]) k++;
    const scale = ownSeg[k] > 0 ? ref[k] / ownSeg[k] : 1;
    return { ...p, d: anchorD[k] + (p.raw - anchorRaw[k]) * scale };
  });
  return { ...profile, pts, total: anchorD[anchorD.length - 1] };
}

// Resample on a fixed distance grid (default 5 m). Rows outside the measured
// coverage are null so a half-covered lap never shows invented data.
export function resample(profile, total, step = 5) {
  const src = [];
  for (const p of profile.pts) if (!src.length || p.d > src[src.length - 1].d + 0.01) src.push(p);
  if (src.length < 2) return null;
  const xs = src.map((p) => p.d);
  const fSpeed = makePchip(xs, src.map((p) => p.speed));
  const fThr = makePchip(xs, src.map((p) => p.throttle));
  const fTime = makePchip(xs, src.map((p) => p.t));
  const fBrake = makePchip(xs, src.map((p) => p.brake));
  const rows = [];
  for (let d = 0; d <= total; d += step) {
    if (d < xs[0] - step || d > xs[xs.length - 1] + step) { rows.push({ d, speed: null, throttle: null, brake: null, t: null, gear: null }); continue; }
    let lo = 0;
    while (lo < xs.length - 1 && xs[lo + 1] <= d) lo++;
    rows.push({
      d,
      speed: Math.max(0, fSpeed(d)),
      throttle: Math.min(100, Math.max(0, fThr(d))),
      brake: Math.min(100, Math.max(0, fBrake(d))),
      t: fTime(d),
      gear: src[lo].gear,
    });
  }
  // nearest grid row of every genuinely measured sample (to draw them as dots)
  const measured = src.map((p) => Math.round(p.d / step)).filter((i) => i >= 0 && i < rows.length);
  return { rows, measured };
}

// Where was the car (metres) at a given instant?
export function distanceAtTime(profile, t) {
  const p = profile.pts;
  if (!p.length || t < p[0].t || t > p[p.length - 1].t) return null;
  let lo = 0, hi = p.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (p[mid].t <= t) lo = mid; else hi = mid; }
  const u = p[hi].t === p[lo].t ? 0 : (t - p[lo].t) / (p[hi].t - p[lo].t);
  return lerp(p[lo].d, p[hi].d, u);
}

const rowAt = (rows, d) => rows[Math.max(0, Math.min(rows.length - 1, Math.round(d / (rows[1].d - rows[0].d))))];

// Numbers for a stretch of track [z0, z1] metres.
export function zoneMetrics(rows, z0, z1, lookback = 300) {
  if (!rows?.length || !(z1 > z0)) return null;
  const step = rows[1].d - rows[0].d;
  const i0 = Math.round(z0 / step), i1 = Math.round(z1 / step);
  const zone = rows.slice(i0, i1 + 1);
  if (zone.length < 2 || zone.some((r) => r.speed === null)) return null;
  const min = zone.reduce((m, r) => (r.speed < m.speed ? r : m), zone[0]);
  const dtS = (zone[zone.length - 1].t - zone[0].t) / 1000;
  const before = rows.slice(Math.max(0, i0 - Math.round(lookback / step)), i1 + 1).filter((r) => r.speed !== null);
  const lift = before.find((r) => r.throttle < 50);
  const brk = before.find((r) => r.brake > 5);
  return {
    entry: zone[0].speed,
    exit: zone[zone.length - 1].speed,
    min: min.speed, minAt: min.d,
    mean: dtS > 0 ? ((z1 - z0) / dtS) * 3.6 : null,
    timeS: dtS,
    liftRel: lift ? lift.d - z0 : null,
    brakeRel: brk ? brk.d - z0 : null,
    maxBrake: Math.max(...zone.map((r) => r.brake)),
  };
}

// Where do drivers slow down the most compared to their own clean lap?
// Returns the centre (m) of the `windowM` stretch with the largest average deficit.
export function findSlowZone(pairs, windowM = 300, step = 5) {
  const usable = pairs.filter((p) => p.inc && p.ref);
  if (!usable.length) return null;
  const n = Math.min(...usable.map((p) => Math.min(p.inc.length, p.ref.length)));
  const deficit = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const v = usable.map((p) => (p.inc[i].speed !== null && p.ref[i].speed !== null ? p.ref[i].speed - p.inc[i].speed : null)).filter((x) => x !== null);
    if (v.length) deficit[i] = v.reduce((a, b) => a + b, 0) / v.length;
  }
  const w = Math.round(windowM / step);
  let best = -Infinity, at = null;
  for (let i = 0; i + w < n; i++) {
    let s = 0, c = 0;
    for (let j = i; j <= i + w; j++) if (deficit[j] !== null) { s += deficit[j]; c++; }
    if (c > w * 0.8 && s / c > best) { best = s / c; at = i; }
  }
  return at === null ? null : { z0: at * step, z1: (at + w) * step, meanDeficit: best };
}

export { rowAt };
