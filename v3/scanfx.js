
window.ScanFX = function(mount, opts){
'use strict';
opts = opts || {};

/* =====================================================================
   CONFIG — to use your real code, pass its cells here:
   grid: { cols, rows, colors: ['#rrggbb', ...] }   (row-major, pointy-top
   hexagons, every odd row shifted right by half a cell)
   ===================================================================== */
const CONFIG = { cols: 30, rows: 35, seed: 20261122, grid: opts.grid || null };
const PAL = ['#151515','#ffffff','#e3213b','#2b50f2','#1fa65a','#fbbf0d','#ff8a00','#b5189f','#08b1d8'];

/* Timeline (seconds). Phases deliberately overlap so nothing ever "cuts". */
const TL = {
  lock: 1.30,                       // brackets snap onto the code
  rectStart: 1.85, rectDur: 1.15,   // card straightens + rounds
  irisStart: 2.00, irisDur: 1.25,   // dark camera view dissolves to light
  scanStart: 2.95, scanDur: 1.60,   // read beam sweeps the card
  verify: 4.55,                     // outline completes, turns green
  wave: 4.70,                       // confirmation ripple through the cells
  pulse: 4.95,                      // final soft pulse
  end: 6.10
};
TL.scanEnd = TL.scanStart + TL.scanDur;

/* ---------- helpers ---------- */
const TAU = Math.PI * 2, D2R = Math.PI / 180;
const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerpArr = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
const rgba = c => 'rgba(' + (c[0] + .5 | 0) + ',' + (c[1] + .5 | 0) + ',' + (c[2] + .5 | 0) + ',' + (c[3] === undefined ? 1 : +c[3].toFixed(3)) + ')';
const bump = x => x > 0 ? x * Math.exp(1 - x) : 0;            // 0 → peak 1 at x=1 → soft decay
function springStep(t, w, z) {                                   // 1 → 0 with overshoot
  if (t <= 0) return 1;
  const wd = w * Math.sqrt(1 - z * z);
  return Math.exp(-z * w * t) * (Math.cos(wd * t) + z / Math.sqrt(1 - z * z) * Math.sin(wd * t));
}
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function bezier(x1, y1, x2, y2) {                                // CSS-style cubic-bezier easing
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = t => ((ax * t + bx) * t + cx) * t, sy = t => ((ay * t + by) * t + cy) * t, dx = t => (3 * ax * t + 2 * bx) * t + cx;
  return x => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) { const e = sx(t) - x; if (Math.abs(e) < 1e-6) return sy(t); const d = dx(t); if (Math.abs(d) < 1e-6) break; t -= e / d; }
    let lo = 0, hi = 1; t = x;
    for (let i = 0; i < 24; i++) { const e = sx(t); if (Math.abs(e - x) < 1e-6) break; if (e < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    return sy(t);
  };
}
const E = {
  inOut: bezier(.65, 0, .25, 1),
  out: bezier(.16, 1, .3, 1),
  settle: bezier(.5, 0, .1, 1),
  scan: bezier(.42, 0, .32, 1),
  iris: bezier(.45, 0, .15, 1)
};
function invScan(u) { u = clamp(u); let lo = 0, hi = 1; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (E.scan(m) < u) lo = m; else hi = m; } return (lo + hi) / 2; }

/* ---------- 4×4 matrices (row-major) for real perspective ---------- */
const mul = (a, b) => { const r = new Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[i * 4 + k] * b[k * 4 + j]; r[i * 4 + j] = s; } return r; };
const Tm = (x, y, z) => [1,0,0,x, 0,1,0,y, 0,0,1,z, 0,0,0,1];
const Sm = s => [s,0,0,0, 0,s,0,0, 0,0,s,0, 0,0,0,1];
const Rx = a => { const c = Math.cos(a), s = Math.sin(a); return [1,0,0,0, 0,c,-s,0, 0,s,c,0, 0,0,0,1]; };
const Ry = a => { const c = Math.cos(a), s = Math.sin(a); return [c,0,s,0, 0,1,0,0, -s,0,c,0, 0,0,0,1]; };
const Rz = a => { const c = Math.cos(a), s = Math.sin(a); return [c,-s,0,0, s,c,0,0, 0,0,1,0, 0,0,0,1]; };
const Pm = d => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,-1 / d,1];
const toCSS = m => { const o = []; for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o.push(m[r * 4 + c]); return o; };
const proj = (m, x, y) => { const w = m[12] * x + m[13] * y + m[15]; return [(m[0] * x + m[1] * y + m[3]) / w, (m[4] * x + m[5] * y + m[7]) / w]; };

/* ---------- DOM ---------- */
mount.innerHTML = `
<div id="stage">
  <div id="dark" class="layer"><div id="grain"></div></div>
  <div id="light" class="layer"></div>
  <canvas id="card"></canvas>
  <canvas id="fx"></canvas>
  <div id="curtain" class="layer"></div>
  <div id="pill">
    <svg id="ring" viewBox="0 0 24 24" aria-hidden="true">
      <circle class="track" cx="12" cy="12" r="9"/>
      <circle id="arc" cx="12" cy="12" r="9" pathLength="1" transform="rotate(-90 12 12)"/>
      <path id="check" d="M7.6 12.5l3 3 5.9-6.3" pathLength="1"/>
    </svg>
    <div id="lab"><span id="lab0"></span><span id="lab1"></span></div>
    <span id="pct">0%</span>
  </div>
  <div id="ctrls">
    <button class="btn" id="slow" aria-label="Toggle slow motion">1\u00d7</button>
    <button class="btn" id="replay" aria-label="Replay"><svg viewBox="0 0 24 24"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4.5v4.6h4.6"/></svg></button>
  </div>
</div>`;
if (!document.getElementById('scanfx-css')) {
  const st = document.createElement('style'); st.id = 'scanfx-css';
  st.textContent = ScanFX.CSS; document.head.appendChild(st);
}
document.documentElement.classList.add('scanfx-lock');
const $ = id => mount.querySelector('#'+id);
const grainEl = $('grain'), lightEl = $('light'), darkEl = $('dark'), cardEl = $('card'), fxEl = $('fx'), curtain = $('curtain');
const pill = $('pill'), ctrls = $('ctrls'), arc = $('arc'), checkEl = $('check'), ringEl = $('ring');
const lab0 = $('lab0'), lab1 = $('lab1'), pctEl = $('pct'), slowBtn = $('slow'), replayBtn = $('replay');
if (!opts.controls) ctrls.style.display = 'none';
if (opts.searching) { curtain.style.display = 'none'; darkEl.style.visibility = 'hidden'; cardEl.style.visibility = 'hidden'; }
const cctx = cardEl.getContext('2d'), fctx = fxEl.getContext('2d');

(function makeGrain() {
  const g = document.createElement('canvas'); g.width = g.height = 128;
  const x = g.getContext('2d'), d = x.createImageData(128, 128), r = mulberry32(5);
  for (let i = 0; i < d.data.length; i += 4) { const v = r() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  x.putImageData(d, 0, 0);
  grainEl.style.backgroundImage = 'url(' + g.toDataURL() + ')'; grainEl.style.backgroundSize = '128px 128px';
})();

/* ---------- the code (cells) ---------- */
const hex2rgb = h => { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
function camOf(c) {                                              // what a camera sees: duller, lifted blacks, warm cast
  const L = .3 * c[0] + .59 * c[1] + .11 * c[2];
  let r = lerp(c[0], L, .38), g = lerp(c[1], L, .38), b = lerp(c[2], L, .38);
  r = r * .82 + 28; g = g * .82 + 27; b = b * .82 + 28;
  return [Math.min(255, r * 1.03), Math.min(255, g), Math.min(255, b * .93)];
}
const rgbStr = c => 'rgb(' + (c[0] + .5 | 0) + ',' + (c[1] + .5 | 0) + ',' + (c[2] + .5 | 0) + ')';
let cols, rows, N, cTrue, cCam, sTrue, sCam;
function buildCells() {
  cols = CONFIG.grid ? CONFIG.grid.cols : CONFIG.cols; rows = CONFIG.grid ? CONFIG.grid.rows : CONFIG.rows; N = cols * rows;
  const rnd = mulberry32(CONFIG.seed), pal = PAL.map(hex2rgb);
  cTrue = new Array(N); cCam = new Array(N); sTrue = new Array(N); sCam = new Array(N);
  for (let i = 0; i < N; i++) {
    cTrue[i] = CONFIG.grid ? hex2rgb(CONFIG.grid.colors[i]) : pal[Math.floor(rnd() * pal.length)];
    cCam[i] = camOf(cTrue[i]); sTrue[i] = rgbStr(cTrue[i]); sCam[i] = rgbStr(cCam[i]);
  }
}
buildCells();
const PAPER_CAM = camOf([255, 255, 255]);
const HEX = new Path2D(); for (let k = 0; k < 6; k++) { const a = -Math.PI / 2 + k * Math.PI / 3, x = .80 * Math.cos(a), y = .80 * Math.sin(a); k ? HEX.lineTo(x, y) : HEX.moveTo(x, y); } HEX.closePath();

/* ---------- layout ---------- */
let W, H, dpr, S, cx, cy, PAD, DIST, feather, Rmax, pillPt, ctrlPt;
let hexR, gx0, gy0, gridH, cellX, cellY, cellPass, cellDist, beamY0, beamY1;
function layout() {
  W = innerWidth; H = innerHeight; dpr = Math.min(window.devicePixelRatio || 1, 2);
  S = Math.round(clamp(Math.min(W * .76, H * .5), 190, 520));
  cx = W / 2; cy = H * .45; PAD = Math.round(S * .26); DIST = S * 3.4;
  const cw = Math.round((S + 2 * PAD) * dpr);
  cardEl.width = cardEl.height = cw; cardEl.style.width = cardEl.style.height = (cw / dpr) + 'px';
  fxEl.width = Math.round(W * dpr); fxEl.height = Math.round(H * dpr); fxEl.style.width = W + 'px'; fxEl.style.height = H + 'px';
  const maxD = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
  feather = maxD * .16; Rmax = maxD + feather;
  hexR = S * .70 / ((cols + .5) * Math.sqrt(3));
  const gw = (cols + .5) * Math.sqrt(3) * hexR; gridH = (rows - 1) * 1.5 * hexR + 2 * hexR;
  gx0 = (S - gw) / 2; gy0 = (S - gridH) / 2;
  beamY0 = -.03 * S; beamY1 = 1.10 * S;
  cellX = new Float32Array(N); cellY = new Float32Array(N); cellPass = new Float32Array(N); cellDist = new Float32Array(N);
  const rowPass = [];
  for (let y = 0; y < rows; y++) rowPass[y] = TL.scanStart + TL.scanDur * invScan((gy0 + hexR + 1.5 * hexR * y - beamY0) / (beamY1 - beamY0));
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = y * cols + x;
    cellX[i] = gx0 + Math.sqrt(3) * hexR * (x + .5 + (y & 1) * .5); cellY[i] = gy0 + hexR + 1.5 * hexR * y;
    cellPass[i] = rowPass[y]; cellDist[i] = Math.min(1, Math.hypot(cellX[i] - S / 2, cellY[i] - S / 2) / (S * .5));
  }
  const pr = pill.getBoundingClientRect(), cr = ctrls.getBoundingClientRect();
  pillPt = [pr.left + pr.width / 2, pr.top + pr.height / 2]; ctrlPt = [cr.left + cr.width / 2, cr.top + cr.height / 2];
}

/* ---------- detection-driven state ---------- */
let locked = !opts.searching, swayT = 0, M0 = null;
const lerpM = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

/* ---------- live tracking overlay (real detection while searching) ---------- */
let trackTarget = null, trackQuad = null, trackAlpha = 0, trackConf = 0, trackConfT = 0;
let didVerify = false;   // live-success: green brackets + pill over the LIVE camera view
function resetTrack() { trackTarget = null; trackQuad = null; trackAlpha = 0; trackConf = 0; trackConfT = 0; }
function drawTrackFX(f) {
  if (trackTarget) {
    if (!trackQuad) trackQuad = trackTarget.map(p => [p[0], p[1]]);
    else for (let i = 0; i < 4; i++) { trackQuad[i][0] = lerp(trackQuad[i][0], trackTarget[i][0], .38); trackQuad[i][1] = lerp(trackQuad[i][1], trackTarget[i][1], .38); }
    trackAlpha = Math.min(1, trackAlpha + .09);
  } else {
    trackAlpha = Math.max(0, trackAlpha - .07);
    if (trackAlpha <= 0) trackQuad = null;
  }
  trackConf = lerp(trackConf, trackConfT, .18);
  f.lineCap = 'round'; f.lineJoin = 'round';
  const stroke = (paths, col, a, w) => {
    if (!paths.length || a <= .002) return;
    f.beginPath();
    for (const pts of paths) for (let i = 0; i < pts.length; i++) i ? f.lineTo(pts[i][0], pts[i][1]) : f.moveTo(pts[i][0], pts[i][1]);
    f.strokeStyle = rgba([col[0], col[1], col[2], a * .16]); f.lineWidth = w * 3.4; f.stroke();
    f.strokeStyle = rgba([col[0], col[1], col[2], a]); f.lineWidth = w; f.stroke();
  };
  if (trackQuad) {
    const q = trackQuad, cxq = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, cyq = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
    const el = i => Math.hypot(q[(i + 1) % 4][0] - q[i][0], q[(i + 1) % 4][1] - q[i][1]);
    const minE = Math.min(el(0), el(1), el(2), el(3));
    if (minE > 8) {
      const pad = minE * .075, arm = minE * (.17 + .09 * trackConf), lw = Math.max(2.4, minE * .042);
      const Q = q.map(p => { const d = Math.hypot(p[0] - cxq, p[1] - cyq) || 1; return [cxq + (p[0] - cxq) * (d + pad) / d, cyq + (p[1] - cyq) * (d + pad) / d]; });
      const groups = [];
      for (let i = 0; i < 4; i++) {
        const p = Q[i], pv = Q[(i + 3) % 4], nx = Q[(i + 1) % 4];
        const l1 = Math.hypot(pv[0] - p[0], pv[1] - p[1]) || 1, l2 = Math.hypot(nx[0] - p[0], nx[1] - p[1]) || 1;
        const a1 = Math.min(arm, l1 * .48), a2 = Math.min(arm, l2 * .48);
        groups.push([[p[0] + (pv[0] - p[0]) / l1 * a1, p[1] + (pv[1] - p[1]) / l1 * a1], [p[0], p[1]], [p[0] + (nx[0] - p[0]) / l2 * a2, p[1] + (nx[1] - p[1]) / l2 * a2]]);
      }
      const col = didVerify ? GREEN : CYAN;
      const a = didVerify ? trackAlpha : trackAlpha * (.55 + .45 * trackConf);
      stroke(groups, col, a, lw);
      if (didVerify || trackConf > .5) stroke([[Q[0], Q[1], Q[2], Q[3], Q[0]]], col, didVerify ? a : a * (trackConf - .5) * 1.1, lw * .55);
      return;
    }
  }
  // neutral guide: soft centered frame while no code is in view
  const gs = Math.min(W, H) * .52 * (1 + .012 * Math.sin(swayT * 1.7));
  const gx = W / 2, gy = H * .46, h = gs / 2, arm = gs * .13, lw = Math.max(2.4, gs * .012);
  const groups = [];
  for (const [px, py, sx, sy] of [[gx - h, gy - h, 1, 1], [gx + h, gy - h, -1, 1], [gx + h, gy + h, -1, -1], [gx - h, gy + h, 1, -1]])
    groups.push([[px + sx * arm, py], [px, py], [px, py + sy * arm]]);
  stroke(groups, CYAN, .38 + .05 * Math.sin(swayT * 1.7), lw);
}

/* ---------- camera pose ---------- */
const FLAT = { rx: 0, ry: 0, rz: 0, tx: 0, ty: 0, s: 1 };
const CAM0 = { rx: 27, ry: -21, rz: -10, tx: -.06, ty: .045, s: .80 };
const CAM1 = { rx: 23, ry: -17, rz: -7, tx: -.035, ty: .02, s: .90 };
const mixPose = (a, b, t) => ({ rx: lerp(a.rx, b.rx, t), ry: lerp(a.ry, b.ry, t), rz: lerp(a.rz, b.rz, t), tx: lerp(a.tx, b.tx, t), ty: lerp(a.ty, b.ty, t), s: lerp(a.s, b.s, t) });
const scanU = t => E.scan(clamp((t - TL.scanStart) / TL.scanDur));
const rectE = t => E.settle(clamp((t - TL.rectStart) / TL.rectDur));
const irisE = t => E.iris(clamp((t - TL.irisStart) / TL.irisDur));
const rcard = t => lerp(2.5 * S / 300, .095 * S, E.inOut(clamp((t - TL.rectStart - .10) / (TL.rectDur + .10))));

function pose(t) {
  let p = mixPose(CAM0, CAM1, E.out(clamp(t / TL.lock)));
  const sw = 1 - smooth(.35, TL.lock - .05, t);                  // handheld sway fades out as the phone steadies
  p.rx += sw * (1.8 * Math.sin(swayT * 4.1 + .3) + 1.0 * Math.sin(swayT * 9.7 + 1.2));
  p.ry += sw * (1.6 * Math.sin(swayT * 3.3 + 2.0) + .8 * Math.sin(swayT * 8.1));
  p.rz += sw * (1.6 * Math.sin(swayT * 2.7 + 1.0) + .7 * Math.sin(swayT * 7.3 + .4));
  p.tx += sw * (.010 * Math.sin(swayT * 3.1) + .004 * Math.sin(swayT * 8.3));
  p.ty += sw * (.012 * Math.sin(swayT * 2.6 + .8) + .004 * Math.sin(swayT * 7.9));
  p = mixPose(p, FLAT, rectE(t));
  const u = scanU(t), tilt = Math.sin(Math.PI * u);              // card leans gently into the scan
  p.ry += 1.3 * tilt; p.rx -= .9 * tilt;
  const pop = Math.exp(-7 * Math.max(0, t - TL.lock)) * Math.sin(26 * Math.max(0, t - TL.lock)) * (t > TL.lock ? 1 : 0);
  const pop2 = Math.exp(-7 * Math.max(0, t - TL.pulse)) * Math.sin(26 * Math.max(0, t - TL.pulse)) * (t > TL.pulse ? 1 : 0);
  p.s *= 1 + .05 * pop + .028 * pop2;
  return p;
}
function poseMatrix(p) {
  let m = Tm(-S / 2, -S / 2, 0);
  m = mul(Sm(p.s), m); m = mul(Rx(p.rx * D2R), m); m = mul(Ry(p.ry * D2R), m); m = mul(Rz(p.rz * D2R), m);
  m = mul(Tm(p.tx * S, p.ty * S, 0), m); m = mul(Pm(DIST), m); m = mul(Tm(cx, cy, 0), m);
  return m;
}
const blurPx = t => {                                            // autofocus hunting
  const a = 8 * Math.pow(1 - E.out(clamp(t / 1.15)), 1.4);
  const h = Math.sin(Math.PI * clamp((t - .55) / .6)); const hunt = 2.0 * h * h * (1 - smooth(.55, 1.15, t));
  return (a + hunt) * S / 300;
};

/* ---------- drawing: the card ---------- */
function rrPath(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.arcTo(x + w, y, x + w, y + r, r);
  c.lineTo(x + w, y + h - r); c.arcTo(x + w, y + h, x + w - r, y + h, r); c.lineTo(x + r, y + h); c.arcTo(x, y + h, x, y + h - r, r);
  c.lineTo(x, y + r); c.arcTo(x, y, x + r, y, r); c.closePath();
}
function drawCard(t) {
  const c = cctx, d = dpr, k = S / 300, rc = rcard(t), ie = irisE(t);
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cardEl.width, cardEl.height);
  c.setTransform(d, 0, 0, d, PAD * d, PAD * d);
  const camMix = 1 - rectE(t);
  const u = scanU(t), by = lerp(beamY0, beamY1, u);

  // paper + shadow
  rrPath(c, 0, 0, S, S, rc);
  c.save();
  c.shadowColor = rgba(lerpArr([0, 0, 0, .55], [88, 68, 150, .20], ie));
  c.shadowBlur = S * .13 * d; c.shadowOffsetY = S * .05 * d;
  c.fillStyle = rgbStr(PAPER_CAM); c.fill();
  c.restore();
  if (t > TL.scanStart) {                                        // white balance "develops" just behind the beam
    const soft = .10 * S, g = c.createLinearGradient(0, by - soft, 0, by);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, rgbStr(PAPER_CAM));
    rrPath(c, 0, 0, S, S, rc); c.fillStyle = g; c.fill();
  }

  c.save(); rrPath(c, 0, 0, S, S, rc); c.clip();

  // cells
  c.lineJoin = 'round';
  const waveOn = t > TL.wave, scanOn = t > TL.scanStart;
  for (let i = 0; i < N; i++) {
    let kk = 1, sc = 1, fl = 0;
    if (scanOn) {
      const tau = t - cellPass[i];
      if (tau >= 0) { kk = 1 - smooth(0, .34, tau); sc = 1 + .20 * bump(tau / .15); fl = .26 * bump(tau / .06); }
    }
    if (waveOn) { const tw = t - (TL.wave + .55 * cellDist[i]); if (tw > 0) { sc *= 1 + .12 * bump(tw / .2); fl += .22 * bump(tw / .12); } }
    let col;
    if (fl < .004) col = kk >= .999 ? sCam[i] : kk <= .001 ? sTrue[i] : rgbStr(lerpArr(cCam[i], cTrue[i], 1 - kk));
    else { const b = kk >= .999 ? cCam[i] : kk <= .001 ? cTrue[i] : lerpArr(cCam[i], cTrue[i], 1 - kk); col = rgbStr(lerpArr(b, [255, 255, 255], Math.min(fl, .85))); }
    const s = hexR * sc;
    c.setTransform(d * s, 0, 0, d * s, (PAD + cellX[i]) * d, (PAD + cellY[i]) * d);
    c.fillStyle = col; c.strokeStyle = col; c.lineWidth = .2; c.fill(HEX); c.stroke(HEX);
  }
  c.setTransform(d, 0, 0, d, PAD * d, PAD * d);

  // camera-phase lighting: soft shading + a slow specular sheen
  if (camMix > .003) {
    const sh = c.createLinearGradient(0, 0, S, S);
    sh.addColorStop(0, 'rgba(0,0,0,' + (.13 * camMix) + ')'); sh.addColorStop(.55, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(255,255,255,' + (.06 * camMix) + ')');
    c.fillStyle = sh; c.fillRect(0, 0, S, S);
    const pos = ((t * .32) % 1.4) - .2, sg = c.createLinearGradient(S * (pos - .25), S * (pos - .25) * .6, S * (pos + .25), S * (pos + .25) * .6);
    sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(.5, 'rgba(255,255,255,' + (.16 * camMix) + ')'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = sg; c.fillRect(0, 0, S, S);
  }

  // lock flash
  const lt = t - TL.lock;
  if (lt > 0 && lt < 1) { c.fillStyle = 'rgba(40,200,255,' + (.11 * Math.exp(-lt / .16)) + ')'; c.fillRect(0, 0, S, S); }

  // read beam
  if (u > 0 && u < 1) {
    const env = E.out(clamp((t - TL.scanStart) / .28)) * (1 - smooth(.96 * S, 1.02 * S, by));
    if (env > .002) {
      const T = .09 * S, tg = c.createLinearGradient(0, by - T, 0, by);
      tg.addColorStop(0, 'rgba(34,195,240,0)'); tg.addColorStop(.6, 'rgba(34,195,240,' + (.02 * env) + ')'); tg.addColorStop(1, 'rgba(70,215,255,' + (.10 * env) + ')');
      c.fillStyle = tg; c.fillRect(0, by - T, S, T);
      const ag = c.createLinearGradient(0, by, 0, by + .05 * S); ag.addColorStop(0, 'rgba(70,215,255,' + (.10 * env) + ')'); ag.addColorStop(1, 'rgba(70,215,255,0)');
      c.fillStyle = ag; c.fillRect(0, by, S, .05 * S);
      const half = S / 2 * E.out(clamp((t - TL.scanStart) / .30)), lg = c.createLinearGradient(S / 2 - half, 0, S / 2 + half, 0);
      lg.addColorStop(0, 'rgba(210,248,255,0)'); lg.addColorStop(.14, 'rgba(210,248,255,' + env + ')'); lg.addColorStop(.5, 'rgba(255,255,255,' + env + ')'); lg.addColorStop(.86, 'rgba(210,248,255,' + env + ')'); lg.addColorStop(1, 'rgba(210,248,255,0)');
      c.save(); c.shadowColor = 'rgba(34,195,240,' + (.95 * env) + ')'; c.shadowBlur = 16 * d; c.strokeStyle = lg; c.lineWidth = 2.2 * k; c.beginPath(); c.moveTo(S / 2 - half, by); c.lineTo(S / 2 + half, by); c.stroke(); c.restore();
      c.fillStyle = 'rgba(25,182,230,' + (.9 * env) + ')';
      const e1 = 7 * k, e2 = 16 * k;
      c.beginPath(); c.moveTo(e1, by - 6 * k); c.lineTo(e2, by); c.lineTo(e1, by + 6 * k); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(S - e1, by - 6 * k); c.lineTo(S - e2, by); c.lineTo(S - e1, by + 6 * k); c.closePath(); c.fill();
    }
  }
  c.restore();

  // lock rim glow
  if (lt > 0 && lt < 1) { rrPath(c, 0, 0, S, S, rc); c.strokeStyle = 'rgba(60,215,255,' + (.85 * Math.exp(-lt / .2)) + ')'; c.lineWidth = 3 * k; c.stroke(); }
}

/* ---------- drawing: brackets, outline and rings (screen space, perspective-correct) ---------- */
function makeLoop(pad, rb) {
  const x0 = -pad, y0 = -pad, x1 = S + pad, y1 = S + pad, w = x1 - x0, h = y1 - y0;
  rb = Math.min(rb, w / 2 - .01, h / 2 - .01);
  const lx = w - 2 * rb, ly = h - 2 * rb, la = Math.PI / 2 * rb;
  const segs = [
    { t: 0, len: lx, x: x0 + rb, y: y0, dx: 1, dy: 0 },
    { t: 1, len: la, cx: x1 - rb, cy: y0 + rb, a0: -Math.PI / 2 },
    { t: 0, len: ly, x: x1, y: y0 + rb, dx: 0, dy: 1 },
    { t: 1, len: la, cx: x1 - rb, cy: y1 - rb, a0: 0 },
    { t: 0, len: lx, x: x1 - rb, y: y1, dx: -1, dy: 0 },
    { t: 1, len: la, cx: x0 + rb, cy: y1 - rb, a0: Math.PI / 2 },
    { t: 0, len: ly, x: x0, y: y1 - rb, dx: 0, dy: -1 },
    { t: 1, len: la, cx: x0 + rb, cy: y0 + rb, a0: Math.PI }
  ];
  let total = 0; for (const g of segs) { g.s0 = total; total += g.len; }
  const at = s => {
    s = ((s % total) + total) % total; let i = 0; while (i < 7 && s >= segs[i].s0 + segs[i].len) i++;
    const g = segs[i], d = s - g.s0;
    if (g.t === 0) return [g.x + g.dx * d, g.y + g.dy * d];
    const a = g.a0 + (rb > 0 ? d / rb : 0); return [g.cx + Math.cos(a) * rb, g.cy + Math.sin(a) * rb];
  };
  return { at, total, segs, lx, ly, la, rb };
}
const CYAN = [25, 182, 230], GREEN = [23, 196, 138];

function drawFX(t, M) {
  const f = fctx; f.setTransform(dpr, 0, 0, dpr, 0, 0); f.clearRect(0, 0, W, H);
  if (opts.searching && !locked) { drawTrackFX(f); return; }
  f.lineCap = 'round'; f.lineJoin = 'round';
  const lw = Math.max(2.4, S * .0105), rc = rcard(t), step = 4;
  const strokePts = (paths, col, a, w) => {
    if (!paths.length || a <= .002) return;
    if (typeof paths[0][0] === 'number') paths = [paths];
    f.beginPath();
    for (const pts of paths) for (let i = 0; i < pts.length; i++) i ? f.lineTo(pts[i][0], pts[i][1]) : f.moveTo(pts[i][0], pts[i][1]);
    f.strokeStyle = rgba([col[0], col[1], col[2], a * .16]); f.lineWidth = w * 3.4; f.stroke();
    f.strokeStyle = rgba([col[0], col[1], col[2], a]); f.lineWidth = w; f.stroke();
  };
  const samplePts = (L, s0, s1, off) => { const n = Math.max(2, Math.ceil((s1 - s0) / step)), out = []; for (let i = 0; i <= n; i++) { const p = L.at(s0 + (s1 - s0) * i / n), q = proj(M, p[0], p[1]); out.push(off ? [q[0] + off[0], q[1] + off[1]] : q); } return out; };

  // state
  const lockT = t - TL.lock; let pad, arm, alpha;
  if (t < TL.lock) {
    const p = clamp(t / TL.lock);
    pad = S * (.09 + .17 * (1 - E.inOut(p))) + S * .012 * Math.sin(t * 10.5) * (1 - p);
    arm = S * .10; alpha = .35 + .5 * E.out(p);
  } else {
    pad = S * (.034 + .056 * springStep(lockT, 26, .48));
    arm = S * (.10 + .05 * Math.sin(Math.PI * clamp(lockT / .5))); alpha = 1;
  }
  const lockMix = smooth(TL.lock, TL.lock + .45, t);
  const rb = rc + pad * (.25 + .75 * lockMix);
  const L = makeLoop(pad, rb), armMax = Math.min(L.lx, L.ly) / 2 + .5;
  const vp = E.settle(clamp((t - TL.verify) / .6));
  arm = lerp(arm, armMax, vp);
  const col = lerpArr(CYAN, GREEN, smooth(TL.verify, TL.verify + .35, t));
  alpha *= lerp(1, .55, smooth(TL.pulse, TL.pulse + .9, t));
  const nz = (1 - smooth(TL.lock - .55, TL.lock, t)) * S * .03;

  if (arm >= armMax - .6) {
    strokePts(samplePts(L, 0, L.total + .01, null), col, alpha, lw);
  } else {
    const groups = [];
    for (let i = 0; i < 4; i++) {
      const sc = L.segs[1 + 2 * i].s0 + L.la / 2, span = L.la / 2 + arm;
      const off = nz > .01 ? [nz * Math.sin(t * (3.1 + i * .7) + i * 1.7), nz * Math.cos(t * (2.7 + i * .9) + i * 2.3)] : null;
      groups.push(samplePts(L, sc - span, sc + span, off));
    }
    strokePts(groups, col, alpha, lw);
  }

  // rings: two on lock (cyan), one on success (green)
  const ring = (tau, dur, c, a0, scale) => {
    if (tau <= 0 || tau >= dur) return; const p = tau / dur, pd = pad + S * scale * E.out(p);
    strokePts(samplePts(makeLoop(pd, rc + pd), 0, makeLoop(pd, rc + pd).total + .01, null), c, a0 * Math.pow(1 - p, 1.6), lw * (1.1 - .6 * p));
  };
  ring(lockT, .85, CYAN, .75, .26); ring(lockT - .13, .85, CYAN, .45, .26);
  ring(t - TL.pulse, .9, GREEN, .65, .22);
}

/* ---------- background, iris, HUD ---------- */
const UI = { dark: { bg: [24, 21, 32, .55], fg: [236, 235, 244, 1], bd: [255, 255, 255, .12] }, light: { bg: [255, 255, 255, .78], fg: [58, 53, 80, 1], bd: [92, 72, 150, .12] }, ok: { bg: [226, 250, 240, .92], fg: [10, 110, 78, 1], bd: [23, 196, 138, .35] } };
function applyUI(el, lm, ok) {
  let bg = lerpArr(UI.dark.bg, UI.light.bg, lm), fg = lerpArr(UI.dark.fg, UI.light.fg, lm), bd = lerpArr(UI.dark.bd, UI.light.bd, lm);
  if (ok > 0) { bg = lerpArr(bg, UI.ok.bg, ok); fg = lerpArr(fg, UI.ok.fg, ok); bd = lerpArr(bd, UI.ok.bd, ok); }
  el.style.setProperty('--bg', rgba(bg)); el.style.setProperty('--fg', rgba(fg)); el.style.setProperty('--bd', rgba(bd));
  el.style.setProperty('--acc', rgba(lerpArr(CYAN.concat(1), GREEN.concat(1), ok)));
}
const LBL = [[0, 'Looking for a code…'], [TL.lock, 'Code found'], [TL.rectStart + .1, 'Aligning'], [TL.scanStart - .05, 'Reading cells'], [TL.verify + .05, 'Verified']];
let labIdx = -1;
function updateScene(t) {
  const ie = irisE(t), R = lerp(-feather, Rmax, ie);
  if (ie <= 0) lightEl.style.visibility = 'hidden';
  else {
    lightEl.style.visibility = 'visible';
    const m = ie >= 1 ? 'none' : 'radial-gradient(circle at ' + cx.toFixed(1) + 'px ' + cy.toFixed(1) + 'px,#000 ' + Math.max(0, R - feather).toFixed(1) + 'px,transparent ' + Math.max(0, R + feather).toFixed(1) + 'px)';
    lightEl.style.webkitMaskImage = m; lightEl.style.maskImage = m;
  }
  grainEl.style.opacity = (.07 * (1 - ie)).toFixed(3);
  grainEl.style.transform = 'translate(' + ((Math.floor(t * 24) * 37) % 64) + 'px,' + ((Math.floor(t * 24) * 53) % 64) + 'px)';
  curtain.style.opacity = (1 - E.out(clamp(t / .5))).toFixed(3);
  curtain.style.visibility = t > .55 ? 'hidden' : 'visible';

  if (didVerify) return;   // verified overlay is event-driven, not timeline-driven
  // HUD
  const vis = E.out(clamp((t - .25) / .45));
  pill.style.opacity = vis; pill.style.transform = 'translate(-50%,' + ((1 - vis) * 10) + 'px)'; ctrls.style.opacity = vis;
  const reach = pt => 1 - smooth(R - feather, R + feather, Math.hypot(pt[0] - cx, pt[1] - cy));
  const ok = smooth(TL.verify + .05, TL.verify + .4, t);
  applyUI(pill, reach(pillPt), ok); applyUI(ctrls, reach(ctrlPt), 0);
  let idx = 0; for (let i = 0; i < LBL.length; i++) if (t >= LBL[i][0]) idx = i;
  const p = E.out(clamp((t - LBL[idx][0]) / .32));
  if (idx !== labIdx) { labIdx = idx; lab1.textContent = LBL[idx][1]; lab0.textContent = idx > 0 ? LBL[idx - 1][1] : ''; }
  lab1.style.opacity = smooth(.3, 1, p); lab1.style.transform = 'translateY(' + ((1 - p) * 9) + 'px)';
  lab0.style.opacity = idx > 0 ? 1 - smooth(0, .55, p) : 0; lab0.style.transform = 'translateY(' + (-p * 9) + 'px)';

  // ring icon: searching spinner → found → dim track → progress → green check
  const by = lerp(beamY0, beamY1, scanU(t)), pct = clamp((by - gy0) / gridH);
  let len, rot = -90, a = 1;
  if (t < TL.lock) { len = .28; rot = -90 + swayT * 400; }
  else if (t < TL.scanStart - .05) {
    len = lerp(.28, 1, E.out(clamp((t - TL.lock) / .35))); rot = -90 + 400 * TL.lock + 150 * (1 - Math.exp(-(t - TL.lock) * 8));
    a = 1 - smooth(TL.rectStart + .3, TL.rectStart + .8, t);
  } else if (t < TL.scanEnd) { len = pct; a = smooth(TL.scanStart - .05, TL.scanStart + .1, t); }
  else len = 1;
  arc.setAttribute('transform', 'rotate(' + rot.toFixed(1) + ' 12 12)');
  arc.style.strokeDasharray = Math.max(len, .0001) + ' 1'; arc.style.opacity = len < .004 ? 0 : a;
  checkEl.style.strokeDasharray = '1 1'; checkEl.style.strokeDashoffset = 1 - E.out(clamp((t - TL.verify - .1) / .35));
  ringEl.style.transform = 'scale(' + (1 + .16 * bump((t - TL.verify - .05) / .22)) + ')';
  pctEl.textContent = Math.round(t >= TL.scanEnd ? 100 : pct * 100) + '%';
  pctEl.style.opacity = (.8 * smooth(TL.scanStart - .05, TL.scanStart + .15, t)).toFixed(3);
}

/* ---------- master render: everything is a pure function of time ---------- */
let curT = 0;
function render(t) {
  curT = t;
  const P = pose(t); let M = poseMatrix(P);
  if (M0 && t < TL.rectStart + .30) {
    const w = 1 - E.out(clamp((t - TL.lock) / .55));
    if (w > 0) M = lerpM(M, M0, w);
  }
  if (opts.searching) {
    darkEl.style.visibility = locked ? 'visible' : 'hidden';
    cardEl.style.visibility = locked ? 'visible' : 'hidden';
  }
  cardEl.style.transform = 'matrix3d(' + toCSS(mul(M, Tm(-PAD, -PAD, 0))).join(',') + ')';
  const b = blurPx(t); cardEl.style.filter = b > .05 ? 'blur(' + b.toFixed(2) + 'px)' : 'none';
  drawCard(t); drawFX(t, M); updateScene(t);
}

/* ---------- playback ---------- */
let playing = false, last = 0, speed = 1, fired = {};
const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };
function frame(ts) {
  if (!playing) return;
  const dt = Math.min((ts - last) / 1000, .05); last = ts;
  curT += dt * speed; swayT += dt * speed;
  if (!locked && curT >= TL.lock - .001) { curT = TL.lock - .001; render(curT); requestAnimationFrame(frame); return; }
  if (!fired.lock && curT >= TL.lock + .02) { fired.lock = 1; buzz(14); }
  if (!fired.pulse && curT >= TL.pulse) { fired.pulse = 1; buzz([10, 50, 16]); }
  if (curT >= TL.end) { curT = TL.end; render(curT); playing = false; opts.onDone && opts.onDone(); return; }
  render(curT); requestAnimationFrame(frame);
}
function play() { curT = 0; fired = {}; playing = true; requestAnimationFrame(ts => { last = ts; frame(ts); }); }
replayBtn.addEventListener('click', e => { e.stopPropagation(); play(); });
slowBtn.addEventListener('click', e => { e.stopPropagation(); speed = speed === 1 ? .25 : 1; slowBtn.textContent = speed === 1 ? '1×' : '¼×'; });
$('stage').addEventListener('click', () => { if (!playing) play(); });
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { layout(); render(curT); }, 60); });

layout();
/* M0: real-detection initial pose. quad in capture px, capW/capH capture size,
   lw/lh code layout in cell units. Returns a 4x4 row-major matrix mapping
   card-local px (paper 0..S, after the internal -PAD shift) to stage px. */
function M0FromQuad(quad, capW, capH, lw, lh) {
  if (!window.Prism || !Prism.homography) return null;
  const gw = (cols + .5) * Math.sqrt(3) * hexR;           // grid pixel width on card
  // card-local -> cell units
  const cu = x => (x - gx0) / gw * lw, cv = y => (y - gy0) / gridH * lh;
  // cell units -> capture px (Prism homography, cell space -> quad)
  const Hc = Prism.homography([[0, 0], [lw, 0], [lw, lh], [0, lh]], quad);
  // capture px -> stage px (object-fit: cover)
  const sc = Math.max(W / capW, H / capH), ox = (W - capW * sc) / 2, oy = (H - capH * sc) / 2;
  const P = [[0, 0], [S, 0], [S, S], [0, S]].map(p => {
    const q = Prism.map(Hc, cu(p[0]), cv(p[1]));
    return [q[0] * sc + ox, q[1] * sc + oy];
  });
  // homography card-local -> stage from 4 point pairs (Prism returns flat [h0..h7], h8=1)
  const h = Prism.homography([[0, 0], [S, 0], [S, S], [0, S]], P);
  return [h[0],h[1],0,h[2], h[3],h[4],0,h[5], 0,0,1,0, h[6],h[7],0,1];
}
const api = {
  render: t => { render(t); }, play, TL,
  relayout: () => { layout(); },
  probe: t => { const M = poseMatrix(pose(t)); return { c: [proj(M, 0, 0), proj(M, S, 0), proj(M, S, S), proj(M, 0, S)], rc: rcard(t), blur: blurPx(t), ie: irisE(t), S, feather, Rmax, cx, cy }; },
  time: () => curT,
  setGrid: g => { CONFIG.grid = g; buildCells(); layout(); },
  setBackdrop: cv => {
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:brightness(.46) saturate(.85);z-index:-1';
    darkEl.style.background = 'radial-gradient(120% 95% at 50% 44%,rgba(0,0,0,0) 36%,rgba(8,6,14,.66) 100%)';
    darkEl.insertBefore(cv, grainEl);
  },
  lock: (grid, backdrop, m0) => {
    if (grid) api.setGrid(grid);
    if (backdrop) api.setBackdrop(backdrop);
    M0 = m0 || null;
    resetTrack();
    if (!locked) { locked = true; curT = Math.max(curT, TL.lock - .35); }
  },
  track: (q, conf) => { trackTarget = q || null; trackConfT = conf || 0; },
  revoke: () => { didVerify = false; labIdx = -1; },   // labIdx=-1 makes the timeline rewrite the searching label next frame
  verified: label => {
    didVerify = true;
    lab1.textContent = label || 'Verified'; lab1.style.opacity = 1; lab1.style.transform = 'none';
    lab0.textContent = ''; lab0.style.opacity = 0;
    pill.style.opacity = 1; pill.style.transform = 'translate(-50%,0)';
    applyUI(pill, 0, 1);
    arc.style.opacity = 0;
    checkEl.style.strokeDasharray = '1 1'; checkEl.style.strokeDashoffset = 0;
    pctEl.style.opacity = 0;
    try { navigator.vibrate && navigator.vibrate([10, 50, 16]); } catch (e) {}
  },
  trackProbe: () => trackQuad ? trackQuad.map(p => [p[0], p[1]]) : null,
  M0FromQuad,
  stop: () => { playing = false; resetTrack(); document.documentElement.classList.remove('scanfx-lock'); const _sx=document.getElementById('scanfx-css'); if(_sx)_sx.remove(); }
};
render(0); play();
return api;
};

ScanFX.CSS = "#stage, #stage *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}\n.scanfx-lock, .scanfx-lock body{overflow:hidden}\n#stage{position:fixed;inset:0;overflow:hidden;background:#24212b;font-family:system-ui,-apple-system,\"Segoe UI\",Roboto,\"Helvetica Neue\",sans-serif;-webkit-font-smoothing:antialiased;user-select:none;-webkit-user-select:none}\n#stage .layer{position:absolute;inset:0;pointer-events:none}\n#stage #dark{background:\n  radial-gradient(120% 95% at 50% 44%,rgba(0,0,0,0) 36%,rgba(8,6,14,.66) 100%),\n  radial-gradient(110% 90% at 28% 16%,#4b4654 0%,#34313c 52%,#25222d 100%)}\n#stage #grain{position:absolute;inset:-64px;opacity:.07}\n#stage #light{background:radial-gradient(95% 75% at 50% 38%,#fcfaff 0%,#f4f1fc 58%,#e9e5f6 100%);visibility:hidden}\n#stage #card{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform,filter;pointer-events:none}\n#stage #fx{position:absolute;left:0;top:0;pointer-events:none}\n#stage #curtain{background:#000}\n#stage #pill{position:absolute;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + max(30px,7.5vh));\n  width:min(272px,86vw);height:48px;display:flex;align-items:center;gap:12px;padding:0 18px 0 13px;\n  border-radius:999px;background:var(--bg);color:var(--fg);border:1px solid var(--bd);\n  -webkit-backdrop-filter:blur(16px) saturate(1.2);backdrop-filter:blur(16px) saturate(1.2);\n  box-shadow:0 10px 28px rgba(30,20,60,.20);font-size:14.5px;font-weight:600;letter-spacing:.005em;\n  opacity:0;transform:translate(-50%,10px)}\n#stage #ring{width:24px;height:24px;flex:none;overflow:visible}\n#stage #ring circle, #stage #ring path{fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}\n#stage #ring .track{stroke:currentColor;opacity:.2}\n#stage #arc, #stage #check{stroke:var(--acc)}\n#stage #lab{position:relative;flex:1;height:20px}\n#stage #lab span{position:absolute;left:0;top:0;line-height:20px;white-space:nowrap;will-change:transform,opacity}\n#stage #pct{min-width:40px;text-align:right;font-variant-numeric:tabular-nums;opacity:0;font-weight:600}\n#stage #ctrls{position:absolute;top:calc(env(safe-area-inset-top,0px) + 14px);right:14px;display:flex;gap:10px;opacity:0}\n#stage .btn{height:40px;min-width:40px;padding:0 13px;border-radius:20px;border:1px solid var(--bd);background:var(--bg);color:var(--fg);\n  -webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);display:grid;place-items:center;font:600 13px/1 system-ui,sans-serif;cursor:pointer}\n#stage .btn:active{transform:scale(.94)}\n#stage .btn svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}";
