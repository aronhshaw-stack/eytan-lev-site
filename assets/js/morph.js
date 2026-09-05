// Eytan Lev — the mark opens into the tree.
//
// A particle morph driven by scroll. The source cloud is the brand mark in
// its proportion frame — the six-pointed star with the heartbeat, inside the
// circle and square that Da Vinci's Vitruvian drawing puts a body in. The
// target cloud is the tree. Both are sampled from geometry generated here;
// nothing is traced from an image.
//
// Three.js is fetched only when the section approaches the viewport. Without
// WebGL the static mark stays in the page and nothing is missing.

(function () {
  'use strict';

  // ===================== TUNING =========================================
  // Everything worth iterating on is here. Nothing below this block needs
  // editing to change how the piece feels.
  var TUNING = {
    // --- particle budget. Split three ways; the figure has to dominate or
    // the halo out-masses the subject and you stop reading a shape.
    count: 24000,             // total, before the device cap below
    countMobile: 9000,        // hard cap under 760px
    ratioBody: 0.78,          // sampled along the mark's own outlines
    ratioHalo: 0.14,          // a shell around it, drifting inward
    ratioDust: 0.08,          // ambient field, never part of either shape

    // --- scroll
    scrollSpan: 2.5,          // viewport heights the morph takes to complete
    morphEase: 1.35,          // >1 holds the figure longer, then moves fast

    // --- rotation. The mark is a flat drawing: rotate it continuously on Y
    // and it passes through edge-on twice a turn and reads as a line. So the
    // gyroscope here is an oscillation, not a tumble — it swings, and the
    // swing dies as the morph completes. Amplitudes are in radians.
    spinAmpY: 0.62,           // ~35 degrees each way at the start
    spinAmpX: 0.30,           // ~17 degrees, on a different period
    spinRate: 0.62,           // cycles per second of the Y swing
    spinDecay: 2.6,           // higher = the swing dies sooner in the morph
    spinSizeBoost: 0.55,      // how much fast swing fattens the points

    // --- colour, brand tokens only
    colourFrom: 0xF4F0E6,     // cream
    colourMid: 0xA8B598,      // sage
    colourTo: 0x91A37C,       // the tree's own leaf green
    colourJitter: 0.24,       // per-particle spread so it is not one flat wash

    // --- size and depth
    pointSize: 2.6,           // base, in px at unit depth
    pointSizeDust: 1.5,
    haloRadius: 1.35,         // relative to the mark's own radius
    dustSpread: 3.4,

    // --- framing, in world units. The camera sees about 6.9 of them.
    markSize: 1.8,            // half-height of the mark
    markLift: 0.72,           // pushed up, to clear the copy at the foot
    treeHeight: 3.7,          // the tree is scaled to this, whatever it grew to

    // --- the sequence. Four beats along the scroll: the mark swings, it
    // condenses into a seed, the seed goes into the ground, and the tree
    // comes up out of it. These are the boundaries between them.
    stageSeed: 0.26,          // mark has become the seed by here
    stagePlant: 0.44,         // the seed is in the ground by here
    seedBury: 0.12,           // how far the seed's middle ends up under the
                              // soil line — part of it stays showing, the way
                              // a sown seed does before it is covered
    growStagger: 0.42,        // how much later the crown arrives than the
                              // trunk — this is what reads as growth rather
                              // than as the tree being switched on

    // --- the seed
    seedLength: 1.15,         // world units, tip to base
    seedGirth: 0.40,
    seedFlat: 0.55,           // seeds are flattened, not round
    seedRidges: 8,            // longitudinal stripes
    seedRidgeGrip: 0.22,      // lower = points cling tighter to the stripes
    seedTilt: 0.36,           // radians, so it lies at an angle
    seedColour: 0xC9AE86,     // the Whole Food line's grain

    // --- the soil
    soilColour: 0x2E2419,
    soilDepth: 2.6,

    // --- the tree the figure becomes
    treeSeed: 88472,          // the same growth rule and seed the site's uses
    // A wide stagger is what makes the middle of the morph interesting: some
    // particles are already tree while others are still mark, so you see one
    // becoming the other rather than a ball of dust in between.
    stagger: 0.55,            // 0 = every particle arrives together
    arc: 0.42                 // how far paths bow out; 0 = straight lines,
                              // which all pass through the centre at once
  };
  // =================== END TUNING =======================================

  var THREE_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

  var section = document.querySelector('[data-morph]');
  if (!section) return;
  var stage = section.querySelector('.morph__stage');
  if (!stage) return;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var debugEl = section.querySelector('[data-morph-debug]');
  var showDebug = /(\?|&)morphdebug\b/.test(location.search);

  // ---------------------------------------------------------------------
  // An SVG path sampler.
  //
  // Parses the subset of the path grammar this site actually writes — M, L,
  // H, V, C, S, Q, T, Z, absolute and relative — flattens every segment into
  // short steps, and then walks the flattened polyline at a constant arc
  // length so points come out evenly spaced rather than bunched on curves.
  // ---------------------------------------------------------------------
  function parsePath(d) {
    var tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
    var i = 0, cmd = null, sub = [], out = [];
    var cx = 0, cy = 0, sx = 0, sy = 0;      // current point, subpath start
    var px = 0, py = 0;                       // previous control, for S and T
    function num() { return parseFloat(tokens[i++]); }
    function push(x, y) { sub.push([x, y]); }
    function flushSub() { if (sub.length > 1) out.push(sub); sub = []; }

    // Flatten a cubic into steps. 24 is plenty at the sizes this site draws;
    // the arc-length walk afterwards fixes any unevenness it leaves.
    function cubic(x1, y1, x2, y2, x3, y3, x4, y4) {
      for (var s = 1; s <= 24; s++) {
        var t = s / 24, u = 1 - t;
        push(u * u * u * x1 + 3 * u * u * t * x2 + 3 * u * t * t * x3 + t * t * t * x4,
             u * u * u * y1 + 3 * u * u * t * y2 + 3 * u * t * t * y3 + t * t * t * y4);
      }
    }
    function quad(x1, y1, x2, y2, x3, y3) {
      // Raise to a cubic and reuse the one flattener.
      cubic(x1, y1,
            x1 + 2 / 3 * (x2 - x1), y1 + 2 / 3 * (y2 - y1),
            x3 + 2 / 3 * (x2 - x3), y3 + 2 / 3 * (y2 - y3),
            x3, y3);
    }

    while (i < tokens.length) {
      if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
      var rel = cmd === cmd.toLowerCase();
      var C = cmd.toUpperCase();
      var ox = rel ? cx : 0, oy = rel ? cy : 0;
      var x1, y1, x2, y2, x, y;

      if (C === 'M') {
        flushSub();
        cx = num() + ox; cy = num() + oy;
        sx = cx; sy = cy; px = cx; py = cy;
        push(cx, cy);
        cmd = rel ? 'l' : 'L';           // implicit lineto for extra pairs
      } else if (C === 'L') {
        cx = num() + ox; cy = num() + oy; px = cx; py = cy; push(cx, cy);
      } else if (C === 'H') {
        cx = num() + ox; px = cx; py = cy; push(cx, cy);
      } else if (C === 'V') {
        cy = num() + oy; px = cx; py = cy; push(cx, cy);
      } else if (C === 'C' || C === 'S') {
        if (C === 'C') { x1 = num() + ox; y1 = num() + oy; }
        else { x1 = 2 * cx - px; y1 = 2 * cy - py; }
        x2 = num() + ox; y2 = num() + oy;
        x = num() + ox; y = num() + oy;
        cubic(cx, cy, x1, y1, x2, y2, x, y);
        px = x2; py = y2; cx = x; cy = y;
      } else if (C === 'Q' || C === 'T') {
        if (C === 'Q') { x1 = num() + ox; y1 = num() + oy; }
        else { x1 = 2 * cx - px; y1 = 2 * cy - py; }
        x = num() + ox; y = num() + oy;
        quad(cx, cy, x1, y1, x, y);
        px = x1; py = y1; cx = x; cy = y;
      } else if (C === 'Z') {
        push(sx, sy); flushSub();
        cx = sx; cy = sy; px = cx; py = cy;
      } else {
        i++;                              // a command we do not draw with
      }
    }
    flushSub();
    return out;
  }

  // Walk a flattened polyline at constant arc length.
  function samplePolyline(pts, n, out) {
    var seg = [], total = 0, k;
    for (k = 1; k < pts.length; k++) {
      var dx = pts[k][0] - pts[k - 1][0], dy = pts[k][1] - pts[k - 1][1];
      var len = Math.sqrt(dx * dx + dy * dy);
      total += len;
      seg.push(total);
    }
    if (total <= 0) return;
    for (var j = 0; j < n; j++) {
      var want = (j + 0.5) / n * total, lo = 0;
      while (lo < seg.length - 1 && seg[lo] < want) lo++;
      var prev = lo === 0 ? 0 : seg[lo - 1];
      var f = (want - prev) / Math.max(1e-6, seg[lo] - prev);
      out.push([pts[lo][0] + (pts[lo + 1][0] - pts[lo][0]) * f,
                pts[lo][1] + (pts[lo + 1][1] - pts[lo][1]) * f]);
    }
  }

  function pathLength(pts) {
    var t = 0;
    for (var k = 1; k < pts.length; k++) {
      var dx = pts[k][0] - pts[k - 1][0], dy = pts[k][1] - pts[k - 1][1];
      t += Math.sqrt(dx * dx + dy * dy);
    }
    return t;
  }

  // Sample a set of path strings, sharing n points between them by length so
  // a long outline gets more particles than a short tick.
  function samplePaths(ds, n) {
    var polys = [], i;
    ds.forEach(function (d) {
      parsePath(d).forEach(function (p) { polys.push(p); });
    });
    var lens = polys.map(pathLength);
    var total = lens.reduce(function (a, b) { return a + b; }, 0);
    var out = [];
    for (i = 0; i < polys.length; i++) {
      var share = Math.max(2, Math.round(n * lens[i] / total));
      samplePolyline(polys[i], share, out);
    }
    return out;
  }

  // ---------------------------------------------------------------------
  // The source shape: the mark, in its proportion frame.
  // The circle and the square are the Vitruvian frame the identity already
  // carries; the star and the heartbeat are the mark itself.
  // ---------------------------------------------------------------------
  function markPaths() {
    var K = 68 * 0.5522847498;            // circle as four cubics
    var circle =
      'M0,-68 C' + K + ',-68 68,' + (-K) + ' 68,0 ' +
      'C68,' + K + ' ' + K + ',68 0,68 ' +
      'C' + (-K) + ',68 -68,' + K + ' -68,0 ' +
      'C-68,' + (-K) + ' ' + (-K) + ',-68 0,-68 Z';
    return [
      circle,
      'M-60,-60 H60 V60 H-60 Z',
      // proportion ticks
      'M-60,-30 L-53,-30', 'M-60,0 L-51,0', 'M-60,30 L-53,30',
      'M60,-30 L53,-30', 'M60,0 L51,0', 'M60,30 L53,30',
      'M-30,60 L-30,53', 'M0,60 L0,51', 'M30,60 L30,53',
      // the star
      'M0,-58 L16.8,-29 L50.2,-29 L33.5,0 L50.2,29 L16.8,29 L0,58 ' +
      'L-16.8,29 L-50.2,29 L-33.5,0 L-50.2,-29 L-16.8,-29 Z',
      // the heartbeat through it
      'M-33.5,0 L-18,0 L-12,-15 L-4,17 L4,-7 L10,0 L33.5,0'
    ];
  }

  // ---------------------------------------------------------------------
  // The target shape: the tree.
  // The same growth rule and the same seed the site's tree uses, so this is
  // the same tree in character. It is not a vertex-identical copy of the 3D
  // one — at particle resolution that is a distinction without a difference.
  // ---------------------------------------------------------------------
  function treeCloud(n) {
    var seed = TUNING.treeSeed;
    function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    function rr(a, b) { return a + rnd() * (b - a); }

    var segs = [], tufts = [];
    function grow(x, y, z, dx, dy, dz, len, rad, depth, under) {
      var nx = x + dx * len, ny = y + dy * len, nz = z + dz * len;
      segs.push([x, y, z, nx, ny, nz, rad]);
      if (depth <= 0) {
        if (!under) tufts.push([nx, ny, nz, rr(0.5, 0.95)]);
        return;
      }
      var kids = depth > 2 ? 2 : (rnd() > 0.32 ? 3 : 2);
      for (var i = 0; i < kids; i++) {
        // Rotate away from the parent about a random axis, then let gravity
        // pull the tip down — the droop is what reads as a live oak.
        var ax = rr(-1, 1), ay = rr(-0.35, 0.35), az = rr(-1, 1);
        var al = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
        ax /= al; ay /= al; az /= al;
        var a = rr(0.34, 0.72), c = Math.cos(a), s = Math.sin(a), t = 1 - c;
        var ux = (t * ax * ax + c) * dx + (t * ax * ay - s * az) * dy + (t * ax * az + s * ay) * dz;
        var uy = (t * ax * ay + s * az) * dx + (t * ay * ay + c) * dy + (t * ay * az - s * ax) * dz;
        var uz = (t * ax * az - s * ay) * dx + (t * ay * az + s * ax) * dy + (t * az * az + c) * dz;
        uy -= under ? rr(0.3, 0.62) : rr(0.04, 0.2);
        var ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
        grow(nx, ny, nz, ux / ul, uy / ul, uz / ul,
             len * rr(0.62, 0.78), rad * 0.64, depth - 1, under);
      }
    }

    segs.push([0, -0.55, 0, 0, 0, 0, 1.02]);          // root flare
    var topY = 2.3;
    segs.push([0, 0, 0, 0, topY, 0, 0.72]);           // trunk
    var AZ = [-1.95, -1.15, -0.42, 0.42, 1.15, 1.95];
    var EL = [0.42, 0.86, 0.62, 0.66, 0.9, 0.46];
    AZ.forEach(function (az, i) {
      var dx = Math.sin(az), dy = EL[i], dz = Math.cos(az) * 0.55;
      var l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      grow(0, topY - 0.5 + i * 0.12, 0, dx / l, dy / l, dz / l, rr(2.1, 2.6), 0.36, 4, false);
    });
    [-2.55, -1.55, -0.55, 0.55, 1.55, 2.55].forEach(function (az, i) {
      var dx = Math.sin(az), dy = -rr(0.1, 0.3), dz = Math.cos(az) * 0.72;
      var l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      grow(0, 0.12, 0, dx / l, dy / l, dz / l, rr(1.5, 2.1), i % 2 ? 0.42 : 0.52, 3, true);
    });

    // Just over half the points go into the canopy; the rest walk the wood.
    // Wood is shared out by length times the square root of girth, so the
    // trunk — short, but the thickest thing in the picture — gets enough to
    // read as a body rather than a dotted line.
    var out = [], i, j;
    var nLeaf = Math.round(n * 0.56), nWood = n - nLeaf;
    var wts = segs.map(function (s) {
      var dx = s[3] - s[0], dy = s[4] - s[1], dz = s[5] - s[2];
      return Math.sqrt(dx * dx + dy * dy + dz * dz) * Math.sqrt(s[6]);
    });
    var totalW = wts.reduce(function (a, b) { return a + b; }, 0) || 1;
    for (i = 0; i < segs.length; i++) {
      var share = Math.round(nWood * wts[i] / totalW);
      var s0 = segs[i];
      var ax = s0[3] - s0[0], ay = s0[4] - s0[1], az = s0[5] - s0[2];
      var al = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
      ax /= al; ay /= al; az /= al;
      // a frame across the limb, so the scatter is a disc round the axis
      // and not a cube through it
      var ux = -ay, uy = ax, uz = 0, ul = Math.sqrt(ux * ux + uy * uy) || 1;
      if (ul < 1e-3) { ux = 1; uy = 0; uz = 0; ul = 1; }
      ux /= ul; uy /= ul; uz /= ul;
      var vx = ay * uz - az * uy, vy = az * ux - ax * uz, vz = ax * uy - ay * ux;
      for (j = 0; j < share; j++) {
        var t = (j + 0.5) / Math.max(1, share);
        // Bias to the surface: bark is where the light lands, and a limb
        // drawn as a ring of points reads as round in a way a solid does not.
        var rad = s0[6] * 0.8 * Math.pow(rnd(), 0.35), th = rnd() * Math.PI * 2;
        var cx = Math.cos(th) * rad, sx = Math.sin(th) * rad;
        out.push([s0[0] + ax * al * t + ux * cx + vx * sx,
                  s0[1] + ay * al * t + uy * cx + vy * sx,
                  s0[2] + az * al * t + uz * cx + vz * sx]);
      }
    }
    // Leaves sit on the outside of a tuft, so the points do too: a shell
    // with a soft skin, not a Gaussian that piles up in the middle and
    // burns to white where two tufts overlap.
    for (i = 0; out.length < n && tufts.length; i++) {
      var tf = tufts[i % tufts.length];
      var rr3 = tf[3] * (0.55 + 0.45 * Math.pow(rnd(), 0.5)) * (0.8 + rnd() * 0.4);
      var th2 = rnd() * Math.PI * 2, ph2 = Math.acos(2 * rnd() - 1);
      out.push([tf[0] + Math.sin(ph2) * Math.cos(th2) * rr3 * 1.15,
                tf[1] + Math.cos(ph2) * rr3 * 0.8,
                tf[2] + Math.sin(ph2) * Math.sin(th2) * rr3 * 1.15]);
    }
    return out.slice(0, n);
  }

  // ---------------------------------------------------------------------
  // The seed. An ovoid, flattened, pointed at the tip, with the longitudinal
  // ridges a sunflower seed has — points are pulled part of the way onto the
  // nearest ridge so the stripes read at distance instead of averaging out.
  // ---------------------------------------------------------------------
  function seedCloud(n) {
    var out = [], i;
    var step = Math.PI * 2 / TUNING.seedRidges;
    var ct = Math.cos(TUNING.seedTilt), st = Math.sin(TUNING.seedTilt);
    // An asymmetric profile: widest a third of the way up, rounded at the
    // base, drawn to a point at the tip. A symmetric one reads as an egg.
    var PA = 0.42, PB = 0.85;
    var peak = Math.pow(PA / (PA + PB), PA) * Math.pow(PB / (PA + PB), PB);
    for (i = 0; i < n; i++) {
      var v = Math.random();                       // 0 base, 1 tip
      var th = Math.random() * Math.PI * 2;
      var ridge = Math.round(th / step) * step;
      th = ridge + (th - ridge) * TUNING.seedRidgeGrip;
      var prof = Math.pow(v, PA) * Math.pow(1 - v, PB) / peak;
      var r = prof * TUNING.seedGirth * (0.9 + 0.1 * Math.cos(th * TUNING.seedRidges));
      // A shell, not a solid: most points near the surface.
      r *= 0.82 + 0.18 * Math.random();
      var x = Math.cos(th) * r;
      var y = (v - 0.42) * TUNING.seedLength;
      out.push([x * ct - y * st, x * st + y * ct, Math.sin(th) * r * TUNING.seedFlat]);
    }
    return out;
  }

  // ---------------------------------------------------------------------
  function loadThree(cb) {
    if (window.THREE) return cb();
    var s = document.createElement('script');
    s.src = THREE_SRC;
    s.onload = cb;
    s.onerror = function () { /* the static mark stays */ };
    document.head.appendChild(s);
  }

  function build() {
    if (!window.THREE) return;
    var T = window.THREE;

    var canvas = document.createElement('canvas');
    canvas.className = 'morph__canvas';
    canvas.setAttribute('aria-hidden', 'true');
    stage.insertBefore(canvas, stage.firstChild);

    var renderer;
    try {
      renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    } catch (e) { canvas.remove(); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    var narrow = stage.getBoundingClientRect().width < 760;
    var COUNT = narrow ? TUNING.countMobile : TUNING.count;
    var nBody = Math.round(COUNT * TUNING.ratioBody);
    var nHalo = Math.round(COUNT * TUNING.ratioHalo);
    var nDust = COUNT - nBody - nHalo;

    var scene = new T.Scene();
    var camera = new T.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0, 10);

    // --- source positions
    var mark = samplePaths(markPaths(), nBody);
    var MARK_R = 84;                       // the mark's own viewBox radius
    var tree = treeCloud(nBody);

    // Fit the tree to TUNING.treeHeight whatever the growth produced, and
    // centre it — but never wider than the frame actually is. A tall narrow
    // viewport sees far less width than height, and fitting on height alone
    // is what crops the canopy off both sides of a phone.
    var tlo = Infinity, thi = -Infinity, txlo = Infinity, txhi = -Infinity;
    tree.forEach(function (q) {
      if (q[1] < tlo) tlo = q[1]; if (q[1] > thi) thi = q[1];
      if (q[0] < txlo) txlo = q[0]; if (q[0] > txhi) txhi = q[0];
    });
    var visH = 2 * camera.position.z * Math.tan((narrow ? 48 : 38) * Math.PI / 360);
    // The stage is not yet sticky when this runs, so its measured height is
    // not the height it will have. Once live it is a full viewport tall, and
    // that is the aspect the fit has to be computed against.
    var visW = visH * Math.max(0.3, stage.getBoundingClientRect().width /
                                    Math.max(1, window.innerHeight));
    var tScale = Math.min(TUNING.treeHeight / Math.max(0.001, thi - tlo),
                          visW * 0.92 / Math.max(0.001, txhi - txlo));
    var tMid = (thi + tlo) / 2;
    // The mark is square, so it only ever needs the width check.
    var markSize = Math.min(TUNING.markSize, visW * 0.46);

    // Where the tree's own ground line lands in world space. The soil band,
    // the buried seed and the sprout all key off this one number.
    var groundY = (0 - tMid) * tScale + TUNING.markLift;

    var seed = seedCloud(nBody);
    var pos = new Float32Array(COUNT * 3);       // where a particle starts
    var mid = new Float32Array(COUNT * 3);       // the seed it passes through
    var tgt = new Float32Array(COUNT * 3);       // where it ends
    var rand = new Float32Array(COUNT * 3);      // seed, kind, size jitter
    var i, o;

    // Body: the mark, flat in z with a little thickness so the spin has
    // something to show.
    for (i = 0; i < nBody; i++) {
      o = i * 3;
      var m = mark[i % mark.length];
      pos[o] = m[0] / MARK_R * markSize;
      pos[o + 1] = -m[1] / MARK_R * markSize + TUNING.markLift;
      pos[o + 2] = (Math.random() - 0.5) * 0.12;
      var sd = seed[i % seed.length];
      mid[o] = sd[0]; mid[o + 1] = sd[1] + TUNING.markLift; mid[o + 2] = sd[2];
      var tp = tree[i % tree.length];
      tgt[o] = tp[0] * tScale;
      tgt[o + 1] = (tp[1] - tMid) * tScale + TUNING.markLift;
      tgt[o + 2] = tp[2] * tScale;
      rand[o] = Math.random();
      rand[o + 1] = 0;                            // kind 0 = body
      rand[o + 2] = 0.8 + Math.random() * 0.5;
    }
    // Halo: a shell that falls inward as the morph completes.
    for (; i < nBody + nHalo; i++) {
      o = i * 3;
      var th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      var rr2 = markSize * TUNING.haloRadius * (0.85 + Math.random() * 0.3);
      pos[o] = Math.sin(ph) * Math.cos(th) * rr2;
      pos[o + 1] = Math.sin(ph) * Math.sin(th) * rr2 + TUNING.markLift;
      pos[o + 2] = Math.cos(ph) * rr2 * 0.5;
      var sd2 = seed[Math.floor(Math.random() * seed.length)];
      mid[o] = sd2[0]; mid[o + 1] = sd2[1] + TUNING.markLift; mid[o + 2] = sd2[2];
      var tp2 = tree[Math.floor(Math.random() * tree.length)];
      tgt[o] = tp2[0] * tScale;
      tgt[o + 1] = (tp2[1] - tMid) * tScale + TUNING.markLift;
      tgt[o + 2] = tp2[2] * tScale;
      rand[o] = Math.random();
      rand[o + 1] = 0.5;                          // kind 0.5 = halo
      rand[o + 2] = 0.5 + Math.random() * 0.5;
    }
    // Dust: never part of either shape, just depth.
    for (; i < COUNT; i++) {
      o = i * 3;
      for (var k = 0; k < 3; k++) {
        pos[o + k] = (Math.random() - 0.5) * TUNING.dustSpread * (k === 2 ? 1.4 : 2);
        mid[o + k] = pos[o + k];
        tgt[o + k] = pos[o + k] + (Math.random() - 0.5) * 0.6;
      }
      rand[o] = Math.random();
      rand[o + 1] = 1;                            // kind 1 = dust
      rand[o + 2] = 0.4 + Math.random() * 0.4;
    }

    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new T.BufferAttribute(mid, 3));
    geo.setAttribute('aTarget', new T.BufferAttribute(tgt, 3));
    geo.setAttribute('aRand', new T.BufferAttribute(rand, 3));

    var uniforms = {
      uProgress: { value: 0 },
      uSpinX: { value: 0 },
      uSpinY: { value: 0 },
      uSpinAmt: { value: 0 },
      uSize: { value: TUNING.pointSize },
      uSizeDust: { value: TUNING.pointSizeDust },
      uPixel: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uFrom: { value: new T.Color(TUNING.colourFrom) },
      uMid: { value: new T.Color(TUNING.colourMid) },
      uTo: { value: new T.Color(TUNING.colourTo) },
      uJitter: { value: TUNING.colourJitter },
      uStagger: { value: TUNING.stagger },
      uArc: { value: TUNING.arc },
      // The drop is computed, not guessed: it is exactly the distance from
      // where the mark hangs to where the seed should sit in the soil.
      uStage: { value: new T.Vector4(TUNING.stageSeed, TUNING.stagePlant,
                                     TUNING.markLift - (groundY - TUNING.seedBury),
                                     TUNING.growStagger) },
      uTreeY: { value: new T.Vector2(0, 1) },
      uSeedCol: { value: new T.Color(TUNING.seedColour) },
      uBoost: { value: TUNING.spinSizeBoost }
    };

    var material = new T.ShaderMaterial({
      uniforms: uniforms,
      transparent: true,
      depthWrite: false,
      // Additive. On a dark field, overlapping points build up the way light
      // does rather than painting over each other, so the dense middle of the
      // seed genuinely reads as brighter than its edge — which is the whole
      // difference between a cloud of dots and a luminous body.
      blending: T.AdditiveBlending,
      vertexShader: [
        'attribute vec3 aSeed;',
        'attribute vec3 aTarget;',
        'attribute vec3 aRand;',
        'uniform float uProgress, uSpinX, uSpinY, uSpinAmt;',
        'uniform float uSize, uSizeDust, uPixel, uJitter, uStagger, uBoost, uArc;',
        'uniform vec3 uFrom, uMid, uTo, uSeedCol;',
        'uniform vec4 uStage;',     // seedBy, plantBy, plantDepth, growStagger
        'uniform vec2 uTreeY;',     // lowest and highest target height',
        'varying vec3 vColour;',
        'varying float vFade;',
        'varying float vLum;',
        'mat3 rotX(float a){ float c=cos(a), s=sin(a);',
        '  return mat3(1.0,0.0,0.0, 0.0,c,-s, 0.0,s,c); }',
        'mat3 rotY(float a){ float c=cos(a), s=sin(a);',
        '  return mat3(c,0.0,s, 0.0,1.0,0.0, -s,0.0,c); }',
        'void main() {',
        '  float kind = aRand.y;',
        '  float seedBy = uStage.x, plantBy = uStage.y;',
        '  // The rotation belongs to the mark, not to anything it becomes: it',
        '  // is applied to where the particle came from, so it vanishes as the',
        '  // particle leaves.',
        '  vec3 from = rotY(uSpinY) * (rotX(uSpinX) * position);',
        '',
        '  // Beat one: the mark condenses into the seed. Staggered, so the',
        '  // shape gathers rather than snapping shut.',
        '  float lag = aRand.x * uStagger * seedBy;',
        '  float t1 = clamp((uProgress - lag) / max(0.001, seedBy - lag), 0.0, 1.0);',
        '  t1 = t1 * t1 * (3.0 - 2.0 * t1);',
        '  vec3 p = mix(from, aSeed, t1);',
        '  // Bow each path out along its own direction, so they do not all',
        '  // run through the middle at the same moment.',
        '  vec3 bow = normalize(vec3(sin(aRand.x * 41.0),',
        '                            cos(aRand.x * 29.0),',
        '                            sin(aRand.x * 17.0) + 0.01));',
        '  p += bow * sin(t1 * 3.14159265) * uArc;',
        '',
        '  // Beat two: it goes into the ground. The whole seed drops as one.',
        '  float t2 = smoothstep(seedBy, plantBy, uProgress);',
        '  p.y -= t2 * uStage.z;',
        '',
        '  // Beat three: the tree comes up out of it, low parts first. That',
        '  // ordering is the whole difference between growing and appearing.',
        '  float h = clamp((aTarget.y - uTreeY.x) / (uTreeY.y - uTreeY.x), 0.0, 1.0);',
        '  float glag = h * uStage.w;',
        '  float t3 = clamp((uProgress - plantBy - glag)',
        '                   / max(0.001, 1.0 - plantBy - uStage.w), 0.0, 1.0);',
        '  t3 = t3 * t3 * (3.0 - 2.0 * t3);',
        '  p = mix(p, aTarget, t3);',
        '  float t = t3;',
        '  // Dust never joins any of it; it only drifts.',
        '  if (kind > 0.75) p = from;',
        '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
        '  gl_Position = projectionMatrix * mv;',
        '  float base = kind > 0.75 ? uSizeDust : uSize;',
        '  float spin = 1.0 + uSpinAmt * uBoost;',
        '  gl_PointSize = base * aRand.z * spin * uPixel * (9.0 / -mv.z);',
        '  // Cream while it is the mark, the colour of grain while it is a',
        '  // seed, then sage and leaf green as it grows.',
        '  vec3 c = mix(uFrom, uSeedCol, smoothstep(0.0, seedBy, uProgress));',
        '  c = mix(c, uMid, smoothstep(plantBy, plantBy + 0.28, uProgress));',
        '  c = mix(c, uTo, smoothstep(plantBy + 0.2, 1.0, uProgress));',
        '  c *= 1.0 + (aRand.x - 0.5) * uJitter;',
        '  vColour = c;',
        '  vFade = kind > 0.75 ? 0.34 : (kind > 0.25 ? mix(0.5, 0.85, t) : 1.0);',
        '  // Nothing real is uniformly bright. A spread of per-particle',
        '  // luminosity is what stops a point cloud reading as printed dots.',
        '  vLum = 0.42 + 0.48 * aRand.z;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'precision mediump float;',
        'varying vec3 vColour;',
        'varying float vFade;',
        'varying float vLum;',
        'void main() {',
        '  vec2 d = gl_PointCoord - vec2(0.5);',
        '  float r = dot(d, d);',
        '  if (r > 0.25) discard;',
        '  // A printed dot has a soft edge; an aliased disc reads as pixels.',
        '  // A core with a skirt, not a disc: the falloff is what lets a',
        '  // hundred overlapping points sum into a solid-looking mass.',
        '  float core = smoothstep(0.25, 0.02, r);',
        '  float skirt = smoothstep(0.25, 0.10, r);',
        '  float a = (core * 0.72 + skirt * 0.28) * vFade * vLum * 0.46;',
        '  gl_FragColor = vec4(vColour * (0.55 + 0.45 * vLum), a);',
        '}'
      ].join('\n')
    });

    // The growth order runs bottom to top, so the range of target heights has
    // to be known before the first frame.
    (function () {
      var lo = Infinity, hi = -Infinity;
      for (var q = 0; q < nBody; q++) {
        var y = tgt[q * 3 + 1];
        if (y < lo) lo = y; if (y > hi) hi = y;
      }
      uniforms.uTreeY.value.set(lo, Math.max(lo + 0.001, hi));
    })();

    var points = new T.Points(geo, material);
    scene.add(points);

    // The ground the seed goes into. A band with a crumbled top edge, fading
    // in as the seed comes down and staying for the rest of the sequence.
    var soilMat = (function () {
      // A vertical ramp baked once: nothing at the top, soil at the bottom,
      // with a little tooth along the way so the transition is not a clean
      // wipe. The ground now dissolves into the field instead of being cut
      // out of it.
      var H = 256, c = document.createElement('canvas');
      c.width = 8; c.height = H;
      var x = c.getContext('2d');
      var col = new T.Color(TUNING.soilColour);
      var hex = '#' + col.getHexString();
      var g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0.00, hex + '00');
      g.addColorStop(0.14, hex + '55');
      g.addColorStop(0.34, hex + 'C4');
      g.addColorStop(0.62, hex + 'FF');
      g.addColorStop(1.00, hex + 'FF');
      x.fillStyle = g; x.fillRect(0, 0, 8, H);
      var img = x.getImageData(0, 0, 8, H), d = img.data;
      for (var i = 0; i < d.length; i += 4) {
        d[i + 3] = Math.max(0, Math.min(255, d[i + 3] + (Math.random() - 0.5) * 26));
      }
      x.putImageData(img, 0, 0);
      var t = new T.CanvasTexture(c);
      if (T.sRGBEncoding !== undefined) t.encoding = T.sRGBEncoding;
      return new T.MeshBasicMaterial({ map: t, transparent: true, opacity: 0,
                                       depthWrite: false });
    })();
    (function soil() {
      var w = Math.max(12, visW * 2.4);
      var h = TUNING.soilDepth + 0.35;
      var m = new T.Mesh(new T.PlaneGeometry(w, h), soilMat);
      // the ramp's transparent top sits a little above the ground line, so
      // the seed enters shadow before it enters soil
      m.position.set(0, groundY + 0.18 - h / 2, -0.2);
      scene.add(m);
    })();

    // --- sizing
    function resize() {
      var r = stage.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      renderer.setSize(r.width, r.height, false);
      canvas.style.width = r.width + 'px';
      canvas.style.height = r.height + 'px';
      camera.aspect = r.width / r.height;
      camera.fov = r.width < 700 ? 48 : 38;
      camera.updateProjectionMatrix();
      uniforms.uPixel.value = Math.min(window.devicePixelRatio || 1, 2);
      return true;
    }

    // --- scroll drives everything
    var progress = 0, phase = 0, spinAmt = 1, last = 0, running = false;

    function readScroll() {
      var b = section.getBoundingClientRect();
      var span = b.height - window.innerHeight;
      var p = span > 0 ? -b.top / span : 0;
      progress = Math.max(0, Math.min(1, p));
      // The figure holds, then goes.
      uniforms.uProgress.value = Math.pow(progress, TUNING.morphEase);
      kick();
    }

    function frame(now) {
      running = false;
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
      last = now;
      // Spin fast at the top and die out as the morph completes.
      spinAmt = Math.max(0, 1 - progress * TUNING.spinDecay);
      if (!reduced) phase += dt * TUNING.spinRate * Math.PI * 2;
      // Two periods that do not divide into each other, so the swing never
      // repeats the same attitude twice in a row.
      uniforms.uSpinY.value = Math.sin(phase) * TUNING.spinAmpY * spinAmt;
      uniforms.uSpinX.value = Math.sin(phase * 0.73 + 1.1) * TUNING.spinAmpX * spinAmt;
      uniforms.uSpinAmt.value = spinAmt;
      // The ground appears as the seed reaches it, not before.
      soilMat.opacity = Math.max(0, Math.min(1,
        (progress - TUNING.stageSeed * 0.75) / 0.22));
      renderer.render(scene, camera);

      if (showDebug && debugEl) {
        debugEl.textContent =
          'progress ' + Math.round(progress * 100) + '%  ·  ' +
          COUNT.toLocaleString() + ' particles (' +
          nBody + ' body / ' + nHalo + ' halo / ' + nDust + ' dust)  ·  spin ' +
          spinAmt.toFixed(2);
      }
      // Keep turning while there is spin left; otherwise the picture is
      // static and only scroll needs to wake it.
      if (!reduced && spinAmt > 0.001 && onScreen) kick();
      else last = 0;
    }

    function kick() { if (!running) { running = true; requestAnimationFrame(frame); } }

    var onScreen = true;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        onScreen = es[0].isIntersecting;
        if (onScreen) kick();
      }, { rootMargin: '100px' }).observe(section);
    }

    if (!resize()) {
      if (!('ResizeObserver' in window)) return;
      var wait = new ResizeObserver(function () {
        if (resize()) { wait.disconnect(); section.classList.add('is-live'); readScroll(); }
      });
      wait.observe(stage);
    } else {
      section.classList.add('is-live');
      readScroll();
    }

    var queued = false;
    window.addEventListener('scroll', function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; readScroll(); });
    }, { passive: true });
    window.addEventListener('resize', function () { if (resize()) kick(); });
    if ('ResizeObserver' in window) new ResizeObserver(function () {
      if (resize()) kick();
    }).observe(stage);

    if (showDebug && debugEl) debugEl.hidden = false;
  }

  // Only fetch Three when the piece is close to being seen.
  function arm() {
    if (!('IntersectionObserver' in window)) { loadThree(build); return; }
    var obs = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { obs.disconnect(); loadThree(build); }
    }, { rootMargin: '300px' });
    obs.observe(section);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arm);
  } else arm();
})();
