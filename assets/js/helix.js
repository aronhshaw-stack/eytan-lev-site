// Eytan Lev — the double helix, rendered rather than drawn.
//
// The old version was a polyline: two coloured strokes crossing over each
// other. It read as a diagram of a helix, not as a helix. This one is a lit
// object — cylindrical backbones, spherical nodes, one key light, a cool
// bounce, depth fog and a bloom pass — sitting on a dark studio field so the
// shading has somewhere to go. On cream, every shade of olive is a mid-tone
// and nothing can look solid.
//
// Canvas 2D only. No library, no asset, no WebGL requirement.
//
// The geometry is real B-DNA, not a cartoon:
//   rise 3.4 Å per base pair, 10.5 base pairs per turn, radius 10 Å, and the
//   two strands offset by ~135° rather than 180°. That offset is the whole
//   reason DNA has a narrow minor groove and a wide major one. Drawing the
//   strands opposite each other — which almost every decorative helix does —
//   produces two identical grooves and a molecule that does not exist.

(function () {
  'use strict';

  var TAU = Math.PI * 2;

  // ===================== TUNING =========================================
  var T = {
    bp: 17,             // base pairs in shot. A true-proportion helix is long
                        // and thin; seventeen fills a plate without lying
                        // about the pitch.
    tilt: 0.20,         // rad, in the picture plane. A specimen stands upright;
                        // a photograph almost never does.
    bpPerTurn: 10.5,    // B-DNA
    rise: 3.4,          // Å between base pairs, along the axis
    radiusA: 10.0,      // Å, helix radius to the backbone
    minorPhase: 2.356,  // rad (135°) — the groove asymmetry. Not Math.PI.
    focal: 62,          // Å. Short enough to read as depth, long enough that
                        // the rungs stay rungs instead of scratches.

    tube: 0.092,        // backbone radius as a fraction of helix radius
    rung: 0.050,        // base-pair rod radius, same units
    node: 0.118,        // sugar/phosphate node radius, same units
    pairNode: 0.092,    // the node where the two bases meet

    segsPerBp: 7,       // backbone tessellation
    runLen: 6,          // segments per depth-sorted run (see drawTube)

    light: [-0.55, -0.72],   // key light direction in screen space, normalised
    fogPower: 0.85,
    fogDepth: 0.92,     // how far a fully-receded surface fades into the field
    dof: 1.25,          // px of blur on the far half
    dofSplit: 0.30,     // fraction of the radius behind which the blur starts
    grain: 0.085,       // film grain over the finished frame
    spin: 0.0032,       // rad per frame at rest
    ease: 0.085,        // how fast the helix swings to a picked rung
    glow: 0.22          // bloom strength — enough to soften a highlight, not
                        // enough to turn the pale strand into a lamp
  };

  // Ramps run shadow → body → light → specular. The range is the point: a
  // material needs somewhere near black and somewhere near white or it stays
  // flat however carefully it is shaded.
  var RAMPS = {
    trad: { shadow: '#0C1207', deep: '#22301A', body: '#4C5B39', light: '#8AA45F', spec: '#C2D79A' },
    evid: { shadow: '#0D1310', deep: '#2F3C35', body: '#6B8076', light: '#A8B598', spec: '#D2DECB' },
    base: { shadow: '#100F0B', deep: '#33322A', body: '#6A6555', light: '#9A9280', spec: '#C6BDA6' },
    live: { shadow: '#150E04', deep: '#4A320D', body: '#9C7B45', light: '#D8B67C', spec: '#F4E0B4' }
  };
  var FIELD = [17, 21, 16];   // the studio field, for fogging into

  function hex(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function rgb(c, a) {
    return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a === undefined ? 1 : a) + ')';
  }
  // Pre-resolve every ramp to numbers once, and pre-fog it at eleven depths so
  // the draw loop never parses a colour string.
  var FOG_STEPS = 12;
  function bake(ramp) {
    var keys = Object.keys(ramp), out = { steps: [] };
    for (var s = 0; s < FOG_STEPS; s++) {
      var t = s / (FOG_STEPS - 1), row = {};
      for (var i = 0; i < keys.length; i++) {
        row[keys[i]] = rgb(mix(hex(ramp[keys[i]]), FIELD, t * T.fogDepth));
      }
      out.steps.push(row);
    }
    return out;
  }
  var BAKED = {};
  Object.keys(RAMPS).forEach(function (k) { BAKED[k] = bake(RAMPS[k]); });
  function shade(key, fog) {
    var i = Math.round(Math.max(0, Math.min(1, fog)) * (FOG_STEPS - 1));
    return BAKED[key].steps[i];
  }

  // ---------------------------------------------------------------- sprites
  // Nodes are spheres, and a sphere is one image. Pre-render each material
  // once at 128px and scale it — cheaper than building a radial gradient per
  // node per frame, and it lets the sprite carry a rim light and a terminator
  // that a two-stop gradient cannot.
  var SPRITES = {};
  function sphere(key) {
    if (SPRITES[key]) return SPRITES[key];
    var S = 128, r = S / 2, ramp = RAMPS[key];
    var c = document.createElement('canvas');
    c.width = c.height = S;
    var x = c.getContext('2d');
    var lx = r + T.light[0] * r * 0.46, ly = r + T.light[1] * r * 0.46;

    var g = x.createRadialGradient(lx, ly, r * 0.03, r, r, r);
    g.addColorStop(0.00, ramp.spec);
    g.addColorStop(0.10, ramp.light);
    g.addColorStop(0.38, ramp.body);
    g.addColorStop(0.72, ramp.deep);
    g.addColorStop(0.94, ramp.shadow);
    g.addColorStop(1.00, ramp.shadow);
    x.beginPath(); x.arc(r, r, r * 0.97, 0, TAU); x.fillStyle = g; x.fill();

    // Rim: a crescent of bounce on the side away from the key. This is what
    // separates a sphere from a disc when it sits against a dark field.
    x.globalCompositeOperation = 'lighter';
    var rg = x.createRadialGradient(
      r - T.light[0] * r * 0.92, r - T.light[1] * r * 0.92, r * 0.30,
      r - T.light[0] * r * 0.55, r - T.light[1] * r * 0.55, r * 1.05);
    rg.addColorStop(0, 'rgba(150,175,150,0.42)');
    rg.addColorStop(1, 'rgba(150,175,150,0)');
    x.beginPath(); x.arc(r, r, r * 0.97, 0, TAU); x.fillStyle = rg; x.fill();

    // Specular pip, tight and offset — the highlight that says "wet".
    var sg = x.createRadialGradient(lx, ly, 0, lx, ly, r * 0.22);
    sg.addColorStop(0, 'rgba(255,255,255,0.85)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    x.beginPath(); x.arc(lx, ly, r * 0.22, 0, TAU); x.fillStyle = sg; x.fill();
    x.globalCompositeOperation = 'source-over';

    SPRITES[key] = c;
    return c;
  }

  // A frame with no grain in it is a render; a frame with grain in it is a
  // photograph. One 128px tile, tiled and composited at a few percent.
  var GRAIN = null;
  function grainTile() {
    if (GRAIN) return GRAIN;
    var S = 128, c = document.createElement('canvas');
    c.width = c.height = S;
    var x = c.getContext('2d');
    var img = x.createImageData(S, S), d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var v = 118 + (Math.random() - 0.5) * 74;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    GRAIN = c;
    return c;
  }

  // ===================== the piece =======================================
  function init() {
    var canvas = document.querySelector('[data-helix]');
    if (!canvas) return;
    // helix3d.js renders the same molecule with real light. It claims the
    // canvas synchronously if WebGL is available, and hands it back here if
    // the library never arrives.
    window.__eylHelixFallback = init;
    if (window.__eylHelix3D) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var stage = canvas.closest('.helix__stage') || canvas.parentNode;

    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Which base pairs carry a written pairing. Six of twenty-one — the rest
    // are ordinary rungs, and their being ordinary is what makes the six read
    // as picked out of a molecule rather than as a six-runged ladder.
    var MARKED = [2, 5, 8, 11, 14, 17];
    var LABELS = [];   // filled from the DOM below

    var CT = Math.cos(T.tilt), ST = Math.sin(T.tilt);
    var field = null, fieldW = 0, fieldH = 0;
    var w = 0, h = 0, dpr = 1, scale = 1;
    var rot = 0, target = null, spinPaused = false;
    var active = 0, hover = -1, shown = [true, true];
    var raf = null, running = false;

    var glowCanvas = document.createElement('canvas');
    var glowCtx = glowCanvas.getContext('2d');
    var farCanvas = document.createElement('canvas');
    var farCtx = farCanvas.getContext('2d');

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      var rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      if (!w || !h) return false;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      glowCanvas.width = Math.max(1, Math.round(w * dpr * 0.5));
      glowCanvas.height = Math.max(1, Math.round(h * dpr * 0.5));
      farCanvas.width = canvas.width;
      farCanvas.height = canvas.height;
      farCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Fit the true proportions into whatever box the layout gives us. DNA
      // is long and narrow; the frame should not argue with that.
      var bulge = T.focal / (T.focal - T.radiusA);   // near side is magnified
      var hh = ((T.bp - 1) * T.rise / 2 + T.radiusA * T.node * 2) * bulge;
      var hw = (T.radiusA + T.radiusA * T.node * 2) * bulge;
      var ca = Math.abs(CT), sa = Math.abs(ST);
      scale = Math.min((h * 0.495) / (hw * sa + hh * ca),
                       (w * 0.495) / (hw * ca + hh * sa));
      return true;
    }

    // ---- projection: a point on strand `phase` at base-pair index i
    function project(i, phase, rOverride) {
      var a = (i / T.bpPerTurn) * TAU + rot + phase;
      var R = rOverride === undefined ? T.radiusA : rOverride;
      var x = Math.cos(a) * R;
      var z = Math.sin(a) * R;
      var y = (i - (T.bp - 1) / 2) * T.rise;
      var p = T.focal / (T.focal + z);
      var sx = x * scale * p, sy = y * scale * p;
      return {
        x: w / 2 + sx * CT - sy * ST,
        y: h / 2 + sx * ST + sy * CT,
        z: z, p: p
      };
    }

    // ---- tube: a run of segments stroked five times, each pass narrower and
    // lighter and nudged toward the lit side. Five flat strokes add up to a
    // cylinder far more cheaply than a gradient per segment.
    //
    // The nudge is not simply "toward the light". On a cylinder the highlight
    // sits along the component of the light that runs ACROSS the axis; the
    // component along the axis contributes nothing. So a tube pointing at the
    // lamp has no stripe at all, and one lying across it has the brightest.
    // Offsetting every tube by the same screen vector — which is what the
    // first pass of this did — is exactly what made them read as painted
    // pipes: every tube carried an identical highlight whatever its angle.
    var PASSES = [
      // [width factor, ramp key, offset across the axis, alpha]
      [2.00, 'shadow', -0.12, 1],
      [1.80, 'deep', 0.00, 1],
      [1.42, 'body', 0.20, 1],
      [0.92, 'light', 0.38, 0.72],
      [0.30, 'spec', 0.50, 0.42]
    ];

    function drawTube(pts, radiusPx, sh, dim, fade) {
      var i, k;
      var n = pts.length;

      // mean axis of the run, and the light's component across it
      var dx = pts[n - 1].x - pts[0].x, dy = pts[n - 1].y - pts[0].y;
      var dl = Math.hypot(dx, dy) || 1;
      dx /= dl; dy /= dl;
      var along = T.light[0] * dx + T.light[1] * dy;
      var px = T.light[0] - along * dx, py = T.light[1] - along * dy;
      var pl = Math.hypot(px, py);
      if (pl > 1e-4) { px /= pl; py /= pl; } else { px = 0; py = 0; }
      // pl is 0 when the tube points at the lamp and 1 when it lies across it
      var across = pl;

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      function run(ox, oy) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x + ox, pts[0].y + oy);
        for (i = 1; i < n; i++) ctx.lineTo(pts[i].x + ox, pts[i].y + oy);
        ctx.stroke();
      }

      // occlusion halo first, at full width, so the later passes cut it back
      // to a sliver and crossing tubes read as one in front of the other
      ctx.lineWidth = radiusPx * 2.5;
      ctx.strokeStyle = sh.shadow;
      ctx.globalAlpha = 0.72 * dim * fade;
      run(0, 0);

      for (k = 0; k < PASSES.length; k++) {
        var pass = PASSES[k];
        var amt = radiusPx * pass[2] * across;
        ctx.lineWidth = radiusPx * pass[0];
        ctx.strokeStyle = sh[pass[1]];
        // A tube seen end-on keeps its body but loses its stripe: fade the
        // two brightest passes out with `across` rather than letting them
        // collapse into a hot line down the middle.
        ctx.globalAlpha = pass[3] * dim * fade *
          (k >= 3 ? 0.25 + 0.75 * across : 1);
        run(px * amt, py * amt);
      }
      ctx.globalAlpha = 1;
    }

    function drawNode(p, radiusPx, key, dim) {
      var img = sphere(key);
      var d = radiusPx * 2;
      ctx.globalAlpha = dim;
      ctx.drawImage(img, p.x - radiusPx, p.y - radiusPx, d, d);
      ctx.globalAlpha = 1;
    }

    // ---- one frame
    var hits = [];

    function draw() {
      if (!w || !h) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (!field || fieldW !== w || fieldH !== h) {
        field = ctx.createRadialGradient(w * 0.42, h * 0.34, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.78);
        field.addColorStop(0, '#242E20');
        field.addColorStop(0.55, '#161C14');
        field.addColorStop(1, '#0C100B');
        fieldW = w; fieldH = h;
      }
      ctx.fillStyle = field;
      ctx.fillRect(0, 0, w, h);

      var prims = [];
      var s, i, j;

      // backbones, chopped into overlapping runs and sorted by mean depth
      for (s = 0; s < 2; s++) {
        if (!shown[s]) continue;
        var phase = s * T.minorPhase;
        var key = s === 0 ? 'trad' : 'evid';
        var total = (T.bp - 1) * T.segsPerBp;
        for (var start = 0; start < total; start += T.runLen) {
          var end = Math.min(total, start + T.runLen);
          var pts = [], zsum = 0, psum = 0;
          for (j = start; j <= end; j++) {
            var pt = project(j / T.segsPerBp, phase);
            pts.push(pt); zsum += pt.z; psum += pt.p;
          }
          if (pts.length < 2) continue;
          var mid01 = (start + end) / 2 / total;          // 0 at one end, 1 at the other
          var fade = Math.min(1, Math.min(mid01, 1 - mid01) / 0.07);
          prims.push({
            z: zsum / pts.length, kind: 'tube', pts: pts, key: key,
            r: T.radiusA * T.tube * scale * (psum / pts.length),
            dim: 1, fade: 0.12 + 0.88 * fade
          });
        }
      }

      // base pairs
      hits.length = 0;
      for (i = 0; i < T.bp; i++) {
        var m = MARKED.indexOf(i);
        var isMarked = m >= 0;
        var isOn = isMarked && m === active;
        var isHot = isMarked && m === hover;
        var a = project(i, 0), b = project(i, T.minorPhase);
        var mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, p: (a.p + b.p) / 2 };

        // A base pair is two bases meeting, not one rod: give each half its
        // own strand's material and put the hydrogen bond in the middle.
        var dim = isOn ? 1 : (isHot ? 0.94 : (isMarked ? 0.7 : 0.5));
        var rodKey = isOn || isHot ? 'live' : (isMarked ? 'base' : 'base');
        var rr = T.radiusA * T.rung * scale * mid.p * (isOn ? 1.5 : isMarked ? 1.15 : 0.85);

        if (shown[0] && shown[1]) {
          prims.push({ z: (a.z + mid.z) / 2, kind: 'tube', pts: [a, mid], key: rodKey, r: rr, dim: dim, fade: 1 });
          prims.push({ z: (b.z + mid.z) / 2, kind: 'tube', pts: [b, mid], key: rodKey, r: rr, dim: dim, fade: 1 });
          prims.push({
            z: mid.z, kind: 'node', p: mid, key: rodKey, dim: dim,
            r: T.radiusA * T.pairNode * scale * mid.p * (isOn ? 1.45 : isMarked ? 1.05 : 0.7)
          });
        }

        // sugar–phosphate nodes on each backbone
        var endFade = Math.min(1, Math.min(i, T.bp - 1 - i) / 1.4) * 0.85 + 0.15;
        if (shown[0]) prims.push({ z: a.z, kind: 'node', p: a, key: 'trad', dim: endFade, r: T.radiusA * T.node * scale * a.p });
        if (shown[1]) prims.push({ z: b.z, kind: 'node', p: b, key: 'evid', dim: endFade, r: T.radiusA * T.node * scale * b.p });

        if (isOn || isHot) {
          prims.push({ z: mid.z + 0.01, kind: 'halo', p: mid, dim: isOn ? 1 : 0.5,
                       r: T.radiusA * 0.46 * scale * mid.p });
        }
        if (isMarked) hits.push({ k: m, x: mid.x, y: mid.y, z: mid.z, on: isOn });
      }

      // painter's algorithm — far first, so the near half genuinely occludes
      prims.sort(function (p, q) { return q.z - p.z; });

      // Split at the axis. A lens focused on the near face throws the far
      // face soft, and that one cue does more for depth than any amount of
      // extra shading.
      var target0 = ctx, drawn = ctx;
      farCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      farCtx.clearRect(0, 0, w, h);
      var onFar = T.dof > 0;
      if (onFar) drawn = farCtx;
      var flipped = false;

      for (i = 0; i < prims.length; i++) {
        var g = prims[i];
        if (onFar && !flipped && g.z < T.radiusA * T.dofSplit) {
          // hand the far buffer over, blurred, before starting the near half
          target0.save();
          target0.setTransform(1, 0, 0, 1, 0, 0);
          target0.filter = 'blur(' + (T.dof * dpr).toFixed(2) + 'px)';
          target0.drawImage(farCanvas, 0, 0);
          target0.filter = 'none';
          target0.restore();
          drawn = target0;
          flipped = true;
        }
        ctx = drawn;
        var fog = Math.pow(Math.max(0, Math.min(1, (g.z / T.radiusA + 1) / 2)), T.fogPower);
        if (g.kind === 'halo') {
          var hg = ctx.createRadialGradient(g.p.x, g.p.y, 0, g.p.x, g.p.y, g.r);
          hg.addColorStop(0, 'rgba(226,183,116,' + (0.30 * g.dim).toFixed(3) + ')');
          hg.addColorStop(0.45, 'rgba(200,155,88,' + (0.13 * g.dim).toFixed(3) + ')');
          hg.addColorStop(1, 'rgba(180,140,80,0)');
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = hg;
          ctx.beginPath(); ctx.arc(g.p.x, g.p.y, g.r, 0, TAU); ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        } else if (g.kind === 'tube') {
          drawTube(g.pts, Math.max(0.5, g.r), shade(g.key, fog), g.dim, g.fade);
        } else {
          ctx.globalAlpha = 1;
          drawNode(g.p, Math.max(0.8, g.r), g.key, g.dim * (1 - fog * 0.55));
          if (fog > 0.02) {
            ctx.globalAlpha = fog * 0.5 * g.dim;
            ctx.beginPath();
            ctx.arc(g.p.x, g.p.y, Math.max(0.8, g.r), 0, TAU);
            ctx.fillStyle = rgb(FIELD);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
        }
      }
      ctx = target0;
      if (onFar && !flipped) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.filter = 'blur(' + (T.dof * dpr).toFixed(2) + 'px)';
        ctx.drawImage(farCanvas, 0, 0);
        ctx.filter = 'none';
        ctx.restore();
      }

      // ---- bloom. Half-resolution blur composited back with 'lighter'. It
      // is what makes a render look photographed rather than plotted: real
      // lenses do not deliver a hard edge on a bright highlight.
      if (T.glow > 0) {
        glowCtx.setTransform(1, 0, 0, 1, 0, 0);
        glowCtx.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
        glowCtx.filter = 'blur(' + Math.max(2, 3 * dpr) + 'px)';
        glowCtx.drawImage(canvas, 0, 0, glowCanvas.width, glowCanvas.height);
        glowCtx.filter = 'none';
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = T.glow;
        ctx.drawImage(glowCanvas, 0, 0, w, h);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }

      if (T.grain > 0) {
        var tile = grainTile();
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'soft-light';
        ctx.globalAlpha = T.grain;
        var pat = ctx.createPattern(tile, 'repeat');
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
      }

      drawLabel();
    }

    // The active pairing names itself in the scene, tracking the rung it
    // belongs to. A legend off to the side makes you look away; a label on
    // the object makes you look at the object.
    function drawLabel() {
      var hit = null, i, which = active;
      if (hover >= 0 && hover !== active) {
        for (i = 0; i < hits.length; i++) if (hits[i].k === hover) { hit = hits[i]; which = hover; }
      }
      if (!hit) for (i = 0; i < hits.length; i++) if (hits[i].on) hit = hits[i];
      if (!hit || !LABELS[which]) return;
      var text = LABELS[which];
      var front = (hit.z / T.radiusA + 1) / 2;      // 1 = at the back
      var alpha = 0.35 + 0.65 * (1 - front);

      ctx.font = '500 12.5px Assistant, system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      var tw = ctx.measureText(text).width;
      var flip = hit.x + 30 + tw > w - 8;
      var lead = flip ? -30 : 30;
      var lx = hit.x + lead, ly = hit.y - 14;

      ctx.globalAlpha = alpha;
      // a hairline elbow, the way a plate is annotated — no box, no chrome
      ctx.beginPath();
      ctx.moveTo(hit.x + (flip ? -6 : 6), hit.y);
      ctx.lineTo(lx, ly);
      ctx.lineTo(lx + (flip ? -10 : 10), ly);
      ctx.strokeStyle = 'rgba(216,182,124,0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.textAlign = flip ? 'right' : 'left';
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 6;
      ctx.fillStyle = 'rgba(232,206,156,0.96)';
      ctx.fillText(text, lx + (flip ? -14 : 14), ly);
      ctx.shadowBlur = 0;
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }

    // ---- the turn. At rest it drifts. Pick a pairing and it swings that
    // rung round to face you, which is the difference between a picker and a
    // control: the object answers.
    function tick() {
      if (target !== null) {
        var d = target - rot;
        while (d > Math.PI) d -= TAU;
        while (d < -Math.PI) d += TAU;
        if (Math.abs(d) < 0.002) { rot = target; target = null; }
        else rot += d * T.ease;
      } else if (!spinPaused && !reduced) {
        rot += T.spin;
      }
      draw();
      raf = requestAnimationFrame(tick);
    }

    // Bring base pair `i` to the front: its strand-0 point should sit at
    // angle -90° (nearest the camera is sin(a) = -1).
    function faceTo(i) {
      var bp = MARKED[i];
      var base = (bp / T.bpPerTurn) * TAU;
      target = -Math.PI / 2 - base;
      var d = target - rot;
      while (d > Math.PI) { target -= TAU; d -= TAU; }
      while (d < -Math.PI) { target += TAU; d += TAU; }
    }

    // ---- wiring to the copy panels
    var dots = Array.prototype.slice.call(document.querySelectorAll('.helix__dot'));
    var panels = Array.prototype.slice.call(document.querySelectorAll('.helix__pair'));

    panels.forEach(function (pn, i) {
      var h3 = pn.querySelector('h3 [data-lang="en"]');
      LABELS[i] = h3 ? h3.textContent.trim() : String(i + 1);
    });

    function setPair(i, turn) {
      active = i;
      dots.forEach(function (d) { d.classList.toggle('is-active', +d.getAttribute('data-pair') === i); });
      panels.forEach(function (pn) { pn.classList.toggle('is-active', +pn.getAttribute('data-pair') === i); });
      if (turn !== false) faceTo(i);
      if (!running) draw();
    }

    dots.forEach(function (d) {
      d.addEventListener('click', function () { setPair(+d.getAttribute('data-pair')); });
    });

    Array.prototype.forEach.call(document.querySelectorAll('.helix__strand'), function (btn) {
      btn.addEventListener('click', function () {
        var s = +btn.getAttribute('data-strand');
        if (shown[s] && shown.filter(Boolean).length === 1) return;
        shown[s] = !shown[s];
        btn.setAttribute('aria-pressed', shown[s] ? 'true' : 'false');
        draw();
      });
    });

    // ---- pointer: drag turns it, hover lights a rung, a click picks one
    var down = false, moved = false, lastX = 0;

    function nearest(mx, my) {
      var best = -1, bestD = 30 * 30;
      for (var i = 0; i < hits.length; i++) {
        var dx = hits[i].x - mx, dy = hits[i].y - my;
        // bias toward rungs facing the camera, so a click never picks the one
        // hiding behind the one you meant
        var d2 = dx * dx + dy * dy + (hits[i].z + T.radiusA) * 6;
        if (d2 < bestD) { bestD = d2; best = hits[i].k; }
      }
      return best;
    }

    canvas.addEventListener('pointerdown', function (e) {
      down = true; moved = false; lastX = e.clientX;
      spinPaused = true; target = null;
      canvas.classList.add('is-dragging');
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', function (e) {
      var r = canvas.getBoundingClientRect();
      if (down) {
        var dx = e.clientX - lastX;
        if (Math.abs(dx) > 2) moved = true;
        rot += dx * 0.009;
        lastX = e.clientX;
        if (!running) draw();
        return;
      }
      var wasHover = hover;
      hover = nearest(e.clientX - r.left, e.clientY - r.top);
      canvas.style.cursor = hover >= 0 ? 'pointer' : 'grab';
      if (hover !== wasHover && !running) draw();
    });

    canvas.addEventListener('pointerleave', function () {
      if (hover !== -1) { hover = -1; if (!running) draw(); }
    });

    canvas.addEventListener('pointerup', function (e) {
      canvas.classList.remove('is-dragging');
      if (down && !moved) {
        var r = canvas.getBoundingClientRect();
        var best = nearest(e.clientX - r.left, e.clientY - r.top);
        if (best >= 0) setPair(best);
      }
      down = false;
      spinPaused = false;
    });

    canvas.addEventListener('pointercancel', function () {
      down = false; spinPaused = false; canvas.classList.remove('is-dragging');
    });

    function start() { if (running || reduced) return; running = true; raf = requestAnimationFrame(tick); }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = null; }

    if (stage) stage.classList.add('is-live');
    resize();
    setPair(0, false);
    faceTo(0);
    rot = target; target = null;
    draw();

    if ('ResizeObserver' in window) {
      new ResizeObserver(function () { if (resize()) draw(); }).observe(canvas);
    } else {
      window.addEventListener('resize', function () { if (resize()) draw(); });
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries[0].isIntersecting ? start() : stop();
      }, { threshold: 0.05 }).observe(canvas);
    } else {
      start();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
