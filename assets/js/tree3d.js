// Eytan Lev — 3D tree navigator.
//
// Procedural geometry, generated here rather than loaded as a model: a short
// heavy trunk with long low limbs, in the manner of a live oak. Branches and
// leaf clusters are instanced, so the whole tree is two draw calls.
//
// Three.js is fetched only when the section approaches the viewport, so the
// rest of the site never pays for it. If WebGL or the library is unavailable
// the SVG tree already in the page stays put — the labels are real links
// either way, so navigation never depends on any of this.
(function () {
  'use strict';

  var THREE_SRC = 'assets/vendor/three.min.js';   // self-hosted: no visitor touches a CDN
  // Same release on a public CDN. Reached only if the self-hosted copy fails
  // to load (a preview host that carries the page but not the assets folder,
  // a blocked path); the SVG drawing is the fallback of last resort, not the
  // first.
  var THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  var BARK = 0x46433A, LEAF_A = 0x2B3626, LEAF_B = 0x7E9268;
  // the tone the crown takes when the low sun catches it — warmer and paler
  // than anything in the mass below, and the reason a canopy reads as lit
  var LEAF_SUN = 0xC2C089;

  var frame = document.querySelector('.treenav__frame');
  if (!frame) return;

  var canvas = document.createElement('canvas');
  canvas.className = 'treenav__canvas';
  canvas.setAttribute('aria-hidden', 'true');
  frame.insertBefore(canvas, frame.firstChild);

  var svg = frame.querySelector('.treenav__svg');
  var labels = Array.prototype.slice.call(frame.querySelectorAll('.treenav__label'));
  var lineLabels = Array.prototype.slice.call(frame.querySelectorAll('.rootlab'));
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function loadThree(cb) {
    if (window.THREE) return cb();
    var tried = 0;
    function attempt(src) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = cb;
      s.onerror = function () {
        if (++tried === 1 && src !== THREE_CDN) attempt(THREE_CDN);
        /* else: the SVG drawing stays */
      };
      document.head.appendChild(s);
    }
    attempt(THREE_SRC);
  }

  // ---- deterministic noise, so the tree is the same every visit
  var seed = 93703;   // re-chosen by search after the canopy was rebuilt in
                      // flat two-tone clumps: the crown's mass sits almost
                      // exactly on the trunk (centroid 0.01 off axis, clumps
                      // split 49/51) and the six limb tips land clear
  function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  function rr(a, b) { return a + rnd() * (b - a); }

  function build() {
    if (!window.THREE) return;
    var T = window.THREE;

    var renderer;
    try {
      renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    } catch (e) { return; }               // no WebGL — keep the SVG
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    // Filmic, not linear. ACES is what makes a bright sky roll off into
    // highlight instead of clipping to white, and it is the single biggest
    // difference between a WebGL render and a frame of film. sRGB output goes
    // with it: without the encoding the grade lands in the wrong gamma and
    // everything reads chalky.
    if (T.ACESFilmicToneMapping !== undefined) {
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.84;
    }
    if (T.sRGBEncoding !== undefined) renderer.outputEncoding = T.sRGBEncoding;
    // Shadows carry the tree's weight onto the ground. Off on small screens,
    // where they cost more than they show.
    var SHADOWS = window.innerWidth >= 760;
    // Leaf clumps per terminal branch. The canopy is the one part of this
    // scene with serious overdraw, so it is the one part worth tiering: a
    // phone gets a thinner crown rather than a slideshow, and at that size
    // nobody can count clumps anyway.
    var LEAF_N = window.innerWidth >= 1100 ? 60 : (window.innerWidth >= 760 ? 44 : 28);
    if (SHADOWS) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFSoftShadowMap;
    }

    var scene = new T.Scene();
    var camera = new T.PerspectiveCamera(42, 1, 0.1, 200);

    // ---- the line, without the bands.
    //
    // Light used to be quantised into a few flat steps here, which is what
    // made the scene read as a drawing. It now falls off smoothly, on a
    // surface with real roughness, so the wood turns the way wood turns and
    // the light rolls round the trunk instead of stepping. The contour line
    // around the limbs stays: it is the one drawn thing left, and it is what
    // keeps the tree legible against the hills.
    //
    // toon() is a misnomer now, kept only because every call site uses it and
    // the ramps it took are ignored. The second argument is dead.
    var RAMP_WOOD = null, RAMP_LEAF = null, RAMP_EARTH = null;
    var SRGB = T.sRGBEncoding !== undefined;
    function lin(hex) {
      var c = new T.Color(hex);
      if (SRGB && c.convertSRGBToLinear) c.convertSRGBToLinear();
      return c;
    }
    function toon(colour, ramp, extra) {
      var o = { color: lin(colour), roughness: 0.86, metalness: 0 };
      if (extra) for (var k in extra) o[k] = extra[k];
      return new T.MeshStandardMaterial(o);
    }

    // A three-light dusk, lit the way a scene is lit rather than the way a
    // page is: a low warm key from the sun's side, a cool sky fill well under
    // it, and a strong cool rim behind to cut the tree off the hills. The rim
    // is deliberately close to the key in strength — separation is what the
    // eye reads as depth, and it is the cheapest cinematic thing there is.
    // Night. The key is the moon — high, cool, from the same side the
    // headline sits on, so the lit flank of the tree faces the open sky and
    // the words. The sky fill is the blue of the field, the ground bounce
    // almost nothing, and the rim is the faint airglow behind the ridge.
    var hemi = new T.HemisphereLight(0x4A5A78, 0x1E2418, 0.42);
    scene.add(hemi);
    var key = new T.DirectionalLight(0xFFD3A0, 0.55);
    key.position.set(7, 8, 9);
    if (SHADOWS) {
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      var sc2 = key.shadow.camera;
      sc2.near = 1; sc2.far = 60;
      sc2.left = -14; sc2.right = 14; sc2.top = 16; sc2.bottom = -6;
      key.shadow.bias = -0.0012;
      key.shadow.normalBias = 0.045;
      key.shadow.radius = 2.4;
    }
    scene.add(key);
    var rim = new T.DirectionalLight(0xFFB870, 0.95);
    rim.position.set(3, 2.5, -10);
    scene.add(rim);

    // ---- shamayim.
    //
    // The sky is a photograph now, or is built the way one is. Three things
    // the earlier versions got structurally wrong, none of them fixable by
    // tuning:
    //
    //   It was a square texture stretched over a wide frame, so every star
    //   was an ellipse 1.4 times wider than tall. It is 16:9 now, and
    //   resize() crops rather than stretches, so a texel is always square.
    //
    //   It was 1536 wide under a 2560-pixel frame: a star could not be a
    //   point. It is 3072 on a desktop, and a star's core is a texel or two.
    //
    //   The galaxy was soft blobs. A real one is grain: star clouds and dust
    //   at every scale, which is fractal noise, not gradients. The band is
    //   built from value noise in octaves — brightness where the noise is
    //   high, dust where a second noise is high — masked to the band, and
    //   the field of faint stars follows the same mask.
    var SW = (window.innerWidth * (window.devicePixelRatio || 1) > 1700) ? 3072 : 2048;
    var SH = Math.round(SW * 9 / 16);
    var S = SW / 1536;                               // texel scale relative to the old sky
    var sc = document.createElement('canvas');
    sc.width = SW; sc.height = SH;
    var sctx = sc.getContext('2d');

    // The gradient. Blue-black at the zenith, lifting to a green-gold airglow
    // above the horizon; the last band is the land's own scatter.
    // Evening, not night: the zenith is a deep slate blue, and the last hour
    // of light is still in the sky at the horizon as a broad amber band —
    // which is what a long exposure shows an hour after sunset, and what
    // lets the land below keep its green.
    var SKY_TOP = '#121827', SKY_LOW = '#7E6238';
    var g = sctx.createLinearGradient(0, 0, 0, SH);
    // The ridge line sits a little under halfway down the frame, so the
    // warm band has to live just above that or it is behind the hills.
    [[0, SKY_TOP], [0.14, '#171E31'], [0.28, '#1F2638'], [0.38, '#2B3040'],
     [0.44, '#3D3B42'], [0.49, '#5A4C3E'], [0.53, '#83653E'],
     [0.57, '#AC7F45'], [0.61, '#C4964F'], [0.68, '#B4874A'], [0.80, '#8C6A3C'], [1, SKY_LOW]
    ].forEach(function (st) { g.addColorStop(st[0], st[1]); });
    sctx.fillStyle = g; sctx.fillRect(0, 0, SW, SH);

    // Deterministic noise for everything below.
    var starSeed = 20260901;
    function srnd() {
      starSeed = (starSeed * 1103515245 + 12345) & 0x7fffffff;
      return starSeed / 0x7fffffff;
    }

    // ---- the galaxy, as noise.
    var MW = { x0: 0.64, y0: 0.96, x1: 0.36, y1: -0.08 };          // bottom → top, in unit coords
    var mwdx = (MW.x1 - MW.x0) * SW, mwdy = (MW.y1 - MW.y0) * SH;
    var mwl = Math.hypot(mwdx, mwdy);
    var mwux = mwdx / mwl, mwuy = mwdy / mwl;                    // along the band
    var mwnx = -mwuy, mwny = mwux;                                // across it
    // band-space coordinates for a texel: u along (0 at the bulge), w across (texels)
    function bandCoords(px, py) {
      var rx = px - MW.x0 * SW, ry = py - MW.y0 * SH;
      return [ (rx * mwux + ry * mwuy) / mwl, rx * mwnx + ry * mwny ];
    }
    // value noise with a smooth lattice, octaved
    function makeNoise(seed) {
      var N = 64, lat = new Float32Array(N * N), ls = seed, i;
      function lr() { ls = (ls * 1103515245 + 12345) & 0x7fffffff; return ls / 0x7fffffff; }
      for (i = 0; i < N * N; i++) lat[i] = lr();
      function at(x, y) {
        var xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
        fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
        var x0 = ((xi % N) + N) % N, y0 = ((yi % N) + N) % N, x1 = (x0 + 1) % N, y1 = (y0 + 1) % N;
        var a = lat[y0 * N + x0], b = lat[y0 * N + x1], c = lat[y1 * N + x0], d = lat[y1 * N + x1];
        return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
      }
      return function fbm(x, y, oct) {
        var v = 0, amp = 0.5, f = 1, sum = 0;
        for (var o = 0; o < oct; o++) { v += at(x * f, y * f) * amp; sum += amp; amp *= 0.5; f *= 2.03; }
        return v / sum;
      };
    }
    var cloud = makeNoise(4111), dust = makeNoise(9377), fine = makeNoise(2718);

    // Painted at a quarter of the sky's width and scaled up — noise this soft
    // has nothing to lose, and it keeps the loop short.
    var GW = Math.round(SW / 3), GH = Math.round(SH / 3);   // a third: enough for grain, cheap enough to paint at load
    var gc = document.createElement('canvas'); gc.width = GW; gc.height = GH;
    var gx = gc.getContext('2d');
    var img = gx.createImageData(GW, GH), d = img.data;
    var HALF = 0.075 * SW;                                        // half-width of the band, texels
    for (var py = 0; py < GH; py++) {
      for (var px = 0; px < GW; px++) {
        var bc = bandCoords(px * 3, py * 3), u = bc[0], w = bc[1];
        // the band's own width wanders and thickens toward the bulge
        var wob = (cloud(u * 3.0 + 7, 0.3, 2) - 0.5) * HALF * 1.2;
        var halfHere = HALF * (1.25 - u * 0.5);
        var prof = Math.exp(-((w - wob) * (w - wob)) / (2 * halfHere * halfHere));
        if (prof < 0.01) continue;
        var nx = px / GW * 6, ny = py / GH * 3.4;
        // three scales: the big star clouds, the mid-scale knots, and a fine
        // grain that is the unresolved stars themselves
        var c1 = cloud(nx, ny, 4), c2 = fine(nx * 3.1, ny * 3.1, 3), c3 = fine(nx * 11 + 3, ny * 11, 1);
        var bright = prof * (0.30 + 0.70 * Math.pow(c1, 1.3)) * (0.45 + 0.55 * c2) * (0.7 + 0.6 * c3);
        // the bulge is brighter and warmer; the far end of the band cools
        var warm = Math.max(0, 1 - u * 1.5);
        bright *= 0.8 + warm * 0.9;
        // dust: long clouds along the band where the second noise is high
        var dv = dust(nx * 1.4 + u * 2.0, ny * 0.5 + w / HALF * 0.35, 3);
        var lane = Math.max(0, Math.min(1, (dv - 0.45) / 0.15)) * Math.min(1, prof * 1.5) * (0.65 + warm * 0.35);
        var lum = bright * (1 - lane * 0.92);
        // grey-white with a little blue away from the core, gold at the bulge —
        // the lavender of the first pass is not a colour the sky has
        var r = 196 + 44 * warm, gch = 198 + 12 * warm, bch = 214 - 84 * warm;
        var o = (py * GW + px) * 4;
        var a = Math.min(1, lum * 1.05);
        d[o] = r; d[o + 1] = gch; d[o + 2] = bch; d[o + 3] = Math.round(a * 255);
        // dust in front of the light darkens what is behind the band too
        if (lane > 0.05) {
          d[o] = Math.round(d[o] * (1 - lane * 0.4) + 20 * lane * 0.4);
          d[o + 1] = Math.round(d[o + 1] * (1 - lane * 0.4) + 14 * lane * 0.4);
          d[o + 2] = Math.round(d[o + 2] * (1 - lane * 0.4) + 12 * lane * 0.4);
          d[o + 3] = Math.max(d[o + 3], Math.round(lane * prof * 110));
        }
      }
    }
    gx.putImageData(img, 0, 0);
    sctx.imageSmoothingEnabled = true; sctx.imageSmoothingQuality = 'high';
    sctx.globalCompositeOperation = 'lighter';
    sctx.drawImage(gc, 0, 0, SW, SH);
    sctx.globalCompositeOperation = 'source-over';

    // ---- stars.
    // Magnitude follows a power law; colour follows temperature; air dims
    // and reddens near the horizon. Cores are a texel or two — a star is a
    // point — and only the brightest few per cent carry a soft skirt. The
    // faint end is dense along the band, because that is what the band is.
    var CLASSES = [
      [0.14, [166, 192, 255]], [0.40, [212, 224, 255]], [0.66, [248, 248, 250]],
      [0.85, [255, 242, 214]], [0.96, [255, 214, 164]], [1.00, [255, 184, 138]]
    ];
    function starColour(t) {
      for (var i = 0; i < CLASSES.length; i++) if (t <= CLASSES[i][0]) return CLASSES[i][1];
      return CLASSES[CLASSES.length - 1][1];
    }
    sctx.globalCompositeOperation = 'lighter';
    var NSTAR = Math.round(14000 * (SW / 3072) * (SW / 3072));
    for (var st = 0; st < NSTAR; st++) {
      var sy = Math.pow(srnd(), 1.35) * 0.62;
      var sxp = srnd();
      var x = sxp * SW, y = sy * SH;
      // the band gets the crowd: keep a star more often the closer it lies
      var bcs = bandCoords(x, y);
      var inBand = Math.exp(-(bcs[1] * bcs[1]) / (2 * HALF * HALF * 1.6));
      if (srnd() > 0.28 + 0.72 * inBand) continue;
      var air = Math.pow(1 - sy / 0.62, 1.3);
      var m = Math.pow(srnd(), 3.6);
      var mag = (0.12 + 0.88 * m) * air;
      if (mag < 0.03) continue;
      var c = starColour(srnd());
      var red = (1 - air) * 0.5;
      var rgbs = ((c[0] + (255 - c[0]) * red) | 0) + ',' + ((c[1] + (180 - c[1]) * red) | 0) + ',' + ((c[2] + (128 - c[2]) * red) | 0);
      var core = (0.45 + 1.1 * m) * (SW / 3072);
      if (m > 0.55) {
        var hg = sctx.createRadialGradient(x, y, 0, x, y, core * 5);
        hg.addColorStop(0, 'rgba(' + rgbs + ',' + (mag * 0.16).toFixed(3) + ')');
        hg.addColorStop(0.4, 'rgba(' + rgbs + ',' + (mag * 0.04).toFixed(3) + ')');
        hg.addColorStop(1, 'rgba(' + rgbs + ',0)');
        sctx.fillStyle = hg;
        sctx.beginPath(); sctx.arc(x, y, core * 5, 0, Math.PI * 2); sctx.fill();
      }
      sctx.fillStyle = 'rgba(' + rgbs + ',' + Math.min(1, mag * 1.1).toFixed(3) + ')';
      sctx.beginPath(); sctx.arc(x, y, core, 0, Math.PI * 2); sctx.fill();
    }
    // Airglow: a band along the whole horizon, green-gold, faint.
    sctx.globalCompositeOperation = 'lighter';
    var ag = sctx.createLinearGradient(0, 0.40 * SH, 0, 0.62 * SH);
    ag.addColorStop(0, 'rgba(210,150,80,0)');
    ag.addColorStop(0.75, 'rgba(220,160,80,0.14)');
    ag.addColorStop(1, 'rgba(240,180,90,0.22)');
    sctx.fillStyle = ag; sctx.fillRect(0, 0, SW, SH);
    sctx.globalCompositeOperation = 'source-over';
    // Grain. A long exposure has noise in it, and its absence is one of the
    // things that says "rendered". Painted small and scaled, very faint.
    (function grain() {
      var n = 256, c = document.createElement('canvas'); c.width = c.height = n;
      var x = c.getContext('2d'), im = x.createImageData(n, n), dd = im.data, gs = 777;
      for (var i = 0; i < n * n; i++) {
        gs = (gs * 1103515245 + 12345) & 0x7fffffff;
        var v = 118 + ((gs >> 8) % 20);
        dd[i * 4] = dd[i * 4 + 1] = dd[i * 4 + 2] = v; dd[i * 4 + 3] = 255;
      }
      x.putImageData(im, 0, 0);
      sctx.globalCompositeOperation = 'overlay';
      sctx.globalAlpha = 0.16;
      for (var ty = 0; ty < SH; ty += n) for (var tx = 0; tx < SW; tx += n) sctx.drawImage(c, tx, ty);
      sctx.globalAlpha = 1;
      sctx.globalCompositeOperation = 'source-over';
    })();

    var skyTex = new T.CanvasTexture(sc);
    skyTex.magFilter = T.LinearFilter;
    skyTex.minFilter = T.LinearFilter;
    skyTex.generateMipmaps = false;
    if (T.sRGBEncoding !== undefined) skyTex.encoding = T.sRGBEncoding;
    // Crop, never stretch: resize() sets repeat/offset so a texel stays
    // square whatever the frame's aspect. Wide frames lose a little sky at
    // the top; tall ones lose a little at the sides.
    var SKY_ASPECT = SW / SH;
    function fitSky(aspect) {
      if (aspect >= SKY_ASPECT) {
        var ry = SKY_ASPECT / aspect;
        skyTex.repeat.set(1, ry); skyTex.offset.set(0, 0);          // keep the horizon: crop the top
      } else {
        var rx = aspect / SKY_ASPECT;
        skyTex.repeat.set(rx, 1); skyTex.offset.set((1 - rx) / 2, 0);
      }
    }
    fitSky(16 / 9);
    scene.background = skyTex;
    // Exponential, and tinted to the haze at the horizon rather than to a
    // neutral grey: distance should warm and lift toward the sun, the way air
    // actually behaves, not just fade.
    // Fog is the horizon sky's own colour, so distance dissolves into it.
    scene.fog = new T.FogExp2(0x6E5C46, 0.0058);
    scene.fog.color = lin(0x6E5C46);
    var fogSky = lin(0x6E5C46), fogSoil = lin(0x0B0907);

    // ---- hills: ridge silhouettes at receding depths. Flat-shaded and
    // colour-graded toward the sky, which is what reads as distance.
    function profile(x, baseY, amp, phase) {
      return baseY
        + Math.sin(x * 0.13 + phase) * amp
        + Math.sin(x * 0.31 + phase * 1.7) * amp * 0.42
        + Math.sin(x * 0.74 + phase * 2.3) * amp * 0.16;
    }

    // A mottle for the ground. Hillsides are not one colour: rock, scrub and
    // bare earth break them up, and without something doing that job a lit
    // surface still reads as a fill.
    function groundMottle() {
      var n = 256, c = document.createElement('canvas');
      c.width = c.height = n;
      var x = c.getContext('2d');
      x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, n, n);
      var gs = 5519;
      function gr() { gs = (gs * 1103515245 + 12345) & 0x7fffffff; return gs / 0x7fffffff; }
      for (var i = 0; i < 900; i++) {
        var r = 2 + Math.pow(gr(), 2) * 26;
        x.globalAlpha = 0.03 + gr() * 0.07;
        x.fillStyle = gr() > 0.5 ? '#8C8A72' : '#3E4237';
        x.beginPath(); x.arc(gr() * n, gr() * n, r, 0, Math.PI * 2); x.fill();
      }
      var t = new T.CanvasTexture(c);
      t.wrapS = t.wrapT = T.RepeatWrapping;
      t.repeat.set(6, 3);
      if (T.sRGBEncoding !== undefined) t.encoding = T.sRGBEncoding;
      return t;
    }
    var mottle = groundMottle();

    // ---- far ridges.
    //
    // These were flat cards carrying nothing but a vertical wash, on the
    // reasoning that a hill four kilometres off at dusk is close to one tone.
    // That is true of its VALUE and false of its FORM: haze flattens contrast
    // but it does not remove the fact that one flank of a ridge faces the sun
    // and the next one does not. A card with no lateral shading reads as cut
    // paper, and no amount of vertical gradient fixes it, because the eye is
    // looking for the light to change ACROSS the ridge, not down it.
    //
    // So each card gets a shaded relief, baked once. For every column the
    // crest height and its slope are known — they come from the same
    // profile() the silhouette is cut from — and the slope gives a surface
    // normal, and the normal against the key light gives that column its
    // tone. Spurs come from a second, finer profile so the flanks break up
    // into subsidiary ridges instead of reading as one smooth flank.
    var RELIEF_W = 512, RELIEF_H = 128;

    function ridge(z, baseY, amp, phase, colour, width) {
      var pts = [], N = 320, i, x;   // 88 showed its facets on the far card
      for (i = 0; i <= N; i++) {
        x = -width / 2 + width * (i / N);
        pts.push([x, profile(x, baseY, amp, phase)]);
      }
      var shape = new T.Shape();
      shape.moveTo(-width / 2, -60);
      pts.forEach(function (p) { shape.lineTo(p[0], p[1]); });
      shape.lineTo(width / 2, -60);
      shape.closePath();

      var geo = new T.ShapeGeometry(shape);
      geo.computeBoundingBox();
      var bb = geo.boundingBox, uv = [], pos = geo.attributes.position;
      var spanX = bb.max.x - bb.min.x, spanY = bb.max.y - bb.min.y;
      for (i = 0; i < pos.count; i++) {
        uv.push((pos.getX(i) - bb.min.x) / spanX,
                (pos.getY(i) - bb.min.y) / spanY);
      }
      geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));

      // ---- the relief
      //
      // The first attempt shaded every column from the raw profile's local
      // slope and came out as vertical stripes. profile() carries a term at
      // roughly twenty oscillations across this card, so its slope alternates
      // faster than the silhouette — drawn at 88 points — ever shows. Shading
      // resolved detail the outline had already smoothed away.
      //
      // Distant relief is read at landform scale, not bump scale: what the eye
      // wants is one broad flank lit and the next one not. So the crest is
      // sampled, smoothed over a wide window, and the slope taken across that
      // window. High-frequency detail still shapes the outline and no longer
      // touches the shading.
      var gc = document.createElement('canvas');
      gc.width = RELIEF_W; gc.height = RELIEF_H;
      var gx = gc.getContext('2d');

      var base = new T.Color(colour);
      // Amplitude is deliberately small. The first pass at this was correct
      // in kind and far too strong: relief that splits a distant ridge into a
      // bright half and a dark half destroys the depth ramp, because the far
      // card stops being uniformly paler than the one in front of it. Distance
      // costs contrast — the shading has to survive inside what is left.
      // Night. The crest takes a little moon; the flank away from it goes
      // toward black; and the FOOT lifts toward the haze colour — that lift
      // is the whole trick of layered hills. Each ridge's dark crest sits
      // against the pale foot of the one behind it, and the farthest sits
      // against the horizon sky, which at night is the brightest band there is.
      var lit = base.clone().lerp(new T.Color(0xD9B27A), 0.26);
      var shade = base.clone().lerp(new T.Color(0x0F160F), 0.24);
      var foot = base.clone().lerp(new T.Color(0x7A6A4E), 0.5);

      var h = new Float32Array(RELIEF_W), sm = new Float32Array(RELIEF_W);
      for (var c0 = 0; c0 < RELIEF_W; c0++) {
        h[c0] = profile(bb.min.x + spanX * (c0 / (RELIEF_W - 1)), baseY, amp, phase);
      }
      // box smooth, twice — two passes of a box is close enough to a gaussian
      var R = 22;
      for (var pass = 0; pass < 2; pass++) {
        for (var c1 = 0; c1 < RELIEF_W; c1++) {
          var acc = 0, n = 0;
          for (var k1 = -R; k1 <= R; k1++) {
            var j = c1 + k1;
            if (j < 0 || j >= RELIEF_W) continue;
            acc += h[j]; n++;
          }
          sm[c1] = acc / n;
        }
        h.set(sm);
      }

      var stepX = spanX / (RELIEF_W - 1);
      for (var col = 0; col < RELIEF_W; col++) {
        var lo = Math.max(0, col - R), hi = Math.min(RELIEF_W - 1, col + R);
        var slope = (h[hi] - h[lo]) / ((hi - lo) * stepX || 1);
        // Gentle, and deliberately not saturated: a distant ridge separated
        // into hard light and dark halves is a poster, not a hillside.
        var t = Math.max(-1, Math.min(1, slope * 2.1));
        var top = shade.clone().lerp(lit, 0.5 + 0.5 * t);

        var g = gx.createLinearGradient(0, 0, 0, RELIEF_H);
        g.addColorStop(0, '#' + top.getHexString());
        g.addColorStop(0.35, '#' + top.clone().lerp(foot, 0.35).getHexString());
        g.addColorStop(1, '#' + foot.getHexString());
        gx.fillStyle = g;
        gx.fillRect(col, 0, 1, RELIEF_H);
      }
      // one horizontal blur pass, so nothing that survives the smoothing can
      // still land as a seam between two adjacent columns
      gx.filter = 'blur(3px)';
      gx.drawImage(gc, 0, 0);
      gx.filter = 'none';

      var gt = new T.CanvasTexture(gc);
      gt.minFilter = T.LinearFilter;
      if (T.sRGBEncoding !== undefined) gt.encoding = T.sRGBEncoding;

      var mesh = new T.Mesh(geo, new T.MeshBasicMaterial({ map: gt, fog: true }));
      mesh.position.z = z;
      scene.add(mesh);
    }

    // ---- near ridges: real ground.
    //
    // These used to be flat cards too, with a pale strip along each crest
    // standing in for the terracing. Against a lit tree that read as a
    // contour map: the strips became isolines and the bands became a vector
    // illustration. The nearest three are now heightfields — a surface that
    // runs from its crest forward and down to the next one — so the key light
    // grazes them and gives the slopes their own form. The terrace strips are
    // gone; on ground that is genuinely lit, the shading does that work.
    function landform(zBack, zFront, baseY, amp, phase, frontY, colour, width) {
      var NX = 110, NZ = 16;
      var g = new T.PlaneGeometry(width, zBack - zFront, NX, NZ);
      var pos = g.attributes.position;
      var ns = 3313;
      function nr() { ns = (ns * 1103515245 + 12345) & 0x7fffffff; return ns / 0x7fffffff; }
      for (var i = 0; i < pos.count; i++) {
        var px = pos.getX(i);
        // PlaneGeometry's local y runs across the strip; +half is the crest
        var v = (pos.getY(i) / ((zBack - zFront) / 2) + 1) / 2;   // 0 front, 1 crest
        var crest = profile(px, baseY, amp, phase);
        var e = v * v * (3 - 2 * v);                              // smoothstep
        var y = frontY + (crest - frontY) * e;
        // Relief, in three octaves. One was not enough: a single low sine
        // over a smooth slope reads as a ruled surface with a ribbon on it.
        // Ground needs a big roll, a mid fold and a fine break, and the big
        // roll has to be big enough to throw its own shade.
        var f = 1 - e * 0.55;                       // stronger toward the front
        y += Math.sin(px * 0.21 + phase * 2.1) * 0.95 * f
           + Math.sin(px * 0.63 + v * 2.2 + phase) * 0.34 * f
           + Math.sin(px * 1.7 + v * 5.4) * 0.11
           + Math.sin(px * 3.9 + v * 9.1 + phase * 4) * 0.045;
        pos.setZ(i, y);            // the plane is rotated flat below
      }
      g.rotateX(-Math.PI / 2);
      g.computeVertexNormals();
      // Normals come from the winding order, and the winding a PlaneGeometry
      // has after being deformed and rotated is not worth reasoning about
      // from the documentation — get it wrong and the hillside is lit as
      // though the sun were underneath it, which renders as a black cut-out.
      // Measure it instead: if the surface is facing down, reverse the index
      // buffer and recompute.
      var nrm = g.attributes.normal, ysum = 0, ni;
      for (ni = 0; ni < nrm.count; ni++) ysum += nrm.getY(ni);
      if (ysum < 0) {
        var idx = g.index.array;
        for (ni = 0; ni < idx.length; ni += 3) {
          var tmp = idx[ni]; idx[ni] = idx[ni + 2]; idx[ni + 2] = tmp;
        }
        g.index.needsUpdate = true;
        g.computeVertexNormals();
      }
      var m = new T.Mesh(g, new T.MeshStandardMaterial({
        color: lin(colour), roughness: 1, metalness: 0, map: mottle, fog: true
      }));
      m.position.z = (zBack + zFront) / 2;
      // Deliberately NOT a shadow receiver. The key's shadow camera is sized
      // to the tree — a few metres either side of it — and anything outside
      // that frustum samples past the edge of the depth map and comes back
      // fully shadowed. That is what turned these hills into black cut-outs.
      // Widening the frustum instead would soften the one shadow that
      // matters, which is the tree's own.
      scene.add(m);
    }

    // Judean-hill palette: pale limestone haze at the back, dry ochre-olive
    // scrub coming forward. Not lush green — these hills are dry most of the
    // year, and the drier the ground the more the tree reads as the living
    // thing in the picture.
    //
    // Staging matters as much as the shading here. A heightfield that runs
    // past the tree toward the camera becomes a wide, near-horizontal plain
    // that catches the sky fill and goes pale — it took over the bottom of
    // the frame and put the tree's base in a haze. So the ground with real
    // form sits BEHIND the tree, between the far cards and the near one, and
    // the nearest band stays a dark card the tree can stand against.
    // Night grades the other way from day: the farthest ridge is the one
    // closest to the sky's own blue, and each one nearer is darker, until
    // the near band is almost the black of the foreground trees.
    ridge(-62, 5.2, 2.3, 0.4, 0x4A5548, 190);
    ridge(-48, 3.8, 2.5, 2.1, 0x3A4A38, 150);
    ridge(-36, 2.4, 2.4, 3.9, 0x2E4030, 118);
    // Values are chosen so that, AFTER lighting, the sequence stays monotonic
    // — pale and blue at the back, warmer and darker coming forward. A ramp
    // that reverses anywhere reads as collage however well each piece is lit.
    // The two heightfields and the near card stay in the same blue family as
    // the ridges — a green band between blue cards was reading as a cut-out.
    landform(-31, -21, 1.0, 2.1, 5.6, -1.4, 0x3C4C2E, 96);
    landform(-21, -12, -0.4, 1.7, 1.2, -2.4, 0x33452A, 74);
    ridge(-9, -1.9, 1.1, 4.4, 0x2A3A22, 52);

    // ---- the foreground. The frame is closed at its two lower corners by
    // trees standing nearer than anything else in it — black, unlit, sharp
    // against the sky, the way the pines stand at the edge of the photograph.
    // Nothing in the middle, where the tree is. They are what puts the
    // viewer somewhere: at the edge of a stand, looking out.
    //
    // Each stand is a group anchored to the frame's edge every frame from
    // the camera's own frustum, so it sits at the corner on any viewport
    // rather than at a world x that one viewport happened to show.
    var FG_Z = 5.5, fgMat = null, fgL = new T.Group(), fgR = new T.Group();
    (function foreground() {
      var mat = new T.MeshBasicMaterial({ color: lin(0x0A0F0A), fog: false, transparent: true });
      fgMat = mat;
      // A pine, ragged. Tiers of unequal length, each one a short jagged run
      // that droops toward its end, and no two sides alike — a symmetric
      // zigzag reads as cut paper, which is what the first pass of these was.
      function conifer() {
        // Unit height, base at the origin; the stand scales it to the frame.
        var sh = new T.Shape(), tiers = 12 + Math.floor(rr(0, 5)), i, j, w = 0.11 + rr(0, 0.05);
        function flank(dir) {
          var pts = [];
          for (i = 0; i < tiers; i++) {
            var t = i / tiers, ty = 0.16 + 0.84 * t;
            var tw = w * (1 - Math.pow(t, 0.85) * 0.92) * rr(0.6, 1.3);
            var segs = 2 + Math.floor(rr(0, 2));
            // out along the bough, drooping toward its end; back only part
            // of the way, so the trunk never shows between the tiers
            for (j = 0; j <= segs; j++) {
              var f = 0.42 + 0.58 * (j / segs);
              pts.push([dir * tw * f, ty - tw * (f - 0.42) * rr(0.25, 0.55) + rr(-0.004, 0.004)]);
            }
            pts.push([dir * tw * 0.42, ty + 0.03]);
          }
          return pts;
        }
        var L = flank(-1), R = flank(1);
        sh.moveTo(-w * 0.1, 0);
        L.forEach(function (q) { sh.lineTo(q[0], q[1]); });
        sh.lineTo(rr(-0.01, 0.01), 1.0);
        for (i = R.length - 1; i >= 0; i--) sh.lineTo(R[i][0], R[i][1]);
        sh.lineTo(w * 0.1, 0);
        sh.closePath();
        return new T.Mesh(new T.ShapeGeometry(sh), mat);
      }
      // Five to a stand, tallest at the edge, stepping down inward; each
      // carries its own share of the frame's height and its own slot along
      // the run, and the stand sets both from the camera in place() below.
      var k;
      for (k = 0; k < 5; k++) {
        var mL = conifer(), mR = conifer();
        mL.userData.u = k / 4 + rr(-0.04, 0.04); mL.userData.h = (0.66 - k * 0.09) * rr(0.85, 1.12);
        mR.userData.u = k / 4 + rr(-0.04, 0.04); mR.userData.h = (0.66 - k * 0.09) * rr(0.85, 1.12);
        fgL.add(mL); fgR.add(mR);
      }
      fgL.position.z = FG_Z; fgR.position.z = FG_Z;
      scene.add(fgL); scene.add(fgR);
    })();
    // Place both stands against the frame's edges for the camera as it is now.
    function placeForeground() {
      var halfH = (camera.position.z - FG_Z) * Math.tan(camera.fov * Math.PI / 360);
      var halfW = halfH * camera.aspect;
      var inward = Math.min(halfW * 0.34, 3.2);        // never across the tree
      function lay(g, dir) {
        g.children.forEach(function (m) {
          var hh = m.userData.h * 2 * halfH;
          m.position.x = dir * m.userData.u * inward;
          m.scale.set(hh, hh, 1);
        });
        g.position.x = camera.position.x + dir * (halfW - inward * 0.1);
        g.position.y = camera.position.y - halfH - 0.05;
      }
      lay(fgL, -1); lay(fgR, 1);
    }

    // ---- the people on the hill.
    //
    // A shepherd and a small flock, walking the near ridges. They are flat
    // silhouettes in the manner of the hill paintings — no faces, no detail
    // at this distance — and they are here for scale as much as for life:
    // a tree only reads as large when something human-sized stands near it.
    // Original outlines, built from primitives.
    function shepherdShape() {
      // A robe with a walking stride under it, the near arm carrying the
      // staff. Asymmetric on purpose — a symmetric silhouette reads as a
      // chess piece, not a person.
      var s = new T.Shape();
      s.moveTo(-0.3, 0);              // trailing foot
      s.lineTo(-0.24, 0.06);
      s.lineTo(-0.1, 0.05);
      s.lineTo(0.16, 0);              // leading foot
      s.lineTo(0.22, 0.07);
      s.lineTo(0.14, 0.44);           // hem, swinging with the stride
      s.lineTo(0.19, 0.86);
      s.lineTo(0.3, 0.94);            // the arm out to the staff
      s.lineTo(0.31, 1.03);
      s.lineTo(0.14, 1.04);
      s.lineTo(0.1, 1.2);
      s.quadraticCurveTo(0, 1.3, -0.1, 1.2);
      s.lineTo(-0.15, 0.9);
      s.lineTo(-0.2, 0.5);
      s.closePath();
      var head = new T.Shape();
      head.moveTo(-0.13, 1.24);       // head under a headcloth
      head.quadraticCurveTo(-0.16, 1.56, 0, 1.58);
      head.quadraticCurveTo(0.15, 1.56, 0.13, 1.24);
      head.closePath();
      var staff = new T.Shape();
      staff.moveTo(0.28, 0);
      staff.lineTo(0.34, 0);
      staff.lineTo(0.42, 1.62);
      staff.lineTo(0.36, 1.62);
      staff.closePath();
      return [s, head, staff];
    }

    function sheepShape() {
      var s = new T.Shape();
      s.moveTo(-0.3, 0);              // legs and body in one outline
      s.lineTo(-0.3, 0.16);
      s.lineTo(-0.34, 0.3);
      s.quadraticCurveTo(-0.36, 0.52, -0.14, 0.55);
      s.quadraticCurveTo(0.12, 0.58, 0.26, 0.48);
      s.lineTo(0.34, 0.54);           // head, ducked to graze
      s.quadraticCurveTo(0.46, 0.46, 0.4, 0.32);
      s.lineTo(0.3, 0.28);
      s.lineTo(0.3, 0);
      s.lineTo(0.22, 0);
      s.lineTo(0.22, 0.2);
      s.lineTo(-0.2, 0.2);
      s.lineTo(-0.2, 0);
      s.closePath();
      return [s];
    }

    // Each walker keeps its feet on the ridge it is crossing, so the group
    // rises and falls with the ground instead of sliding across it.
    var walkers = [];
    function walker(shapes, ridgeArgs, x0, speed, scale, colour) {
      var group = new T.Group();
      shapes.forEach(function (sh) {
        var m = new T.Mesh(new T.ShapeGeometry(sh),
          new T.MeshBasicMaterial({ color: lin(colour), fog: true }));
        group.add(m);
      });
      group.scale.setScalar(scale);
      group.position.z = ridgeArgs[0] + 0.12;   // just in front of its ridge
      walkers.push({ g: group, r: ridgeArgs, x: x0, v: speed });
      scene.add(group);
    }

    function stepWalkers(dt) {
      for (var i = 0; i < walkers.length; i++) {
        var w = walkers[i];
        w.x += w.v * dt;
        var span = w.r[3] / 2 + 6;
        if (w.x > span) w.x = -span;
        if (w.x < -span) w.x = span;
        w.g.position.x = w.x;
        w.g.position.y = profile(w.x, w.r[1], w.r[2], w.r[4]);
        // Face the way they are going.
        w.g.scale.x = (w.v < 0 ? -1 : 1) * Math.abs(w.g.scale.y);
      }
    }

    // Ridge parameters, repeated here so the walkers stand on the same
    // profile the silhouette was cut from: [z, baseY, amp, width, phase].
    var NEAR_RIDGE = [-9, -1.8, 1.1, 52, 4.4];
    var MID_RIDGE = [-17, -0.4, 1.7, 70, 1.2];

    // A shepherd with three at his heel on the near ridge, two more grazing
    // further back. Walking pace is deliberately far slower than life: this
    // has to read as a landscape that is alive, not as something moving.
    walker(shepherdShape(), NEAR_RIDGE, -12.0, 0.34, 1.2, 0x2C3128);
    walker(sheepShape(), NEAR_RIDGE, -14.4, 0.34, 0.95, 0x30352B);
    walker(sheepShape(), NEAR_RIDGE, -16.1, 0.34, 0.86, 0x33382E);
    walker(sheepShape(), NEAR_RIDGE, -18.3, 0.34, 0.9, 0x353A30);
    walker(sheepShape(), MID_RIDGE, 13.0, -0.19, 0.8, 0x434A45);
    walker(sheepShape(), MID_RIDGE, 16.4, -0.19, 0.74, 0x4A514B);
    // Place them once up front: with reduced motion nothing ever steps them,
    // and unplaced walkers sit at the world origin, hidden inside the trunk.
    stepWalkers(0);

    // Everything that belongs to the surface is cut off at the ground line,
    // because below it the scene is a section through the ground.
    renderer.localClippingEnabled = true;
    var groundCut = new T.Plane(new T.Vector3(0, 1, 0), 0);

    // A low knoll at the base — enough to seat the tree, deliberately
    // narrower than the root spread so the roots wrap past it and stay
    // silhouetted rather than being swallowed. Three overlapping lumps with
    // jittered vertices, smooth-shaded and keyed a shade under the nearest
    // ridge: a single flat-shaded solid reads as a cardboard pyramid.
    var KNOLL = [
      { s: [2.9, 0.42, 2.2], p: [0, -0.46, 0.1], r: [0.06, 0.7, 0.04], c: 0x3A4A2E },
      { s: [1.9, 0.3, 1.5], p: [-1.7, -0.56, 0.6], r: [0.1, 2.1, -0.08], c: 0x36462B },
      { s: [2.0, 0.28, 1.55], p: [1.8, -0.58, -0.3], r: [-0.08, 4.0, 0.1], c: 0x334229 },
      { s: [1.1, 0.36, 0.9], p: [0.15, -0.34, 0.5], r: [0.16, 1.2, 0.1], c: 0x445535 }
    ];
    KNOLL.forEach(function (k, i) {
      var g = new T.IcosahedronGeometry(1, 2);
      var pos = g.attributes.position, n = 0;
      for (var v = 0; v < pos.count; v++) {
        // Deterministic jitter, so the knoll is the same shape every load.
        n = Math.sin((v + 1) * (i + 3) * 12.9898) * 43758.5453;
        n = (n - Math.floor(n)) * 0.16 + 0.92;
        pos.setXYZ(v, pos.getX(v) * n, pos.getY(v) * n, pos.getZ(v) * n);
      }
      g.computeVertexNormals();
      // Cut flat at the ground line. Below it we are looking at a section,
      // and a mound has no underside in a section — left uncut, its far
      // facets show through the cut face as broken green plates.
      var m = new T.Mesh(g, toon(k.c, RAMP_EARTH, { clippingPlanes: [groundCut] }));
      m.scale.set(k.s[0], k.s[1], k.s[2]);
      m.position.set(k.p[0], k.p[1], k.p[2]);
      m.rotation.set(k.r[0], k.r[1], k.r[2]);
      if (SHADOWS) m.receiveShadow = true;
      scene.add(m);
    });

    // A contact shadow on the knoll. Without one the tree floats above the
    // ground no matter how well the two line up; a soft dark patch is enough
    // and costs nothing next to real shadow mapping.
    var shTex = (function () {
      var c = document.createElement('canvas');
      c.width = c.height = 128;
      var x = c.getContext('2d');
      var rg = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      rg.addColorStop(0, 'rgba(38,34,22,0.34)');
      rg.addColorStop(0.55, 'rgba(38,34,22,0.15)');
      rg.addColorStop(1, 'rgba(38,34,22,0)');
      x.fillStyle = rg; x.fillRect(0, 0, 128, 128);
      var ct = new T.CanvasTexture(c);
      if (T.sRGBEncoding !== undefined) ct.encoding = T.sRGBEncoding;
      return ct;
    })();
    var shadow = new T.Mesh(
      new T.PlaneGeometry(7.2, 5.0),
      new T.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false,
                                fog: false, clippingPlanes: [groundCut] })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0.4, -0.02, 0.4);
    scene.add(shadow);

    // Valley floor, far below and set back: the tree is on a high
    // promontory, so the roots hang over open air with the valley beyond.
    var floorMottle = mottle.clone();
    floorMottle.repeat.set(22, 14);
    floorMottle.needsUpdate = true;
    var floor = new T.Mesh(
      new T.PlaneGeometry(300, 190),
      toon(0x2E3C2A, RAMP_EARTH, { map: floorMottle })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -7.4, -150);
    scene.add(floor);

    var V = T.Vector3;

    // ---- the ground the roots go down through.
    //
    // A tell in section: layer on layer, each one a city that was built on
    // the one before it. Deeper is older. Between the courses of dressed
    // limestone are genizah layers — worn text is not destroyed in Jewish
    // practice, it is buried, so what is under this tree was put there on
    // purpose, generation after generation, and the roots are feeding on it.
    //
    // The letterforms are the alphabet and words this site already uses. A
    // specific verse rendered as scenery would be a different decision, and
    // not one to make in a texture.
    // Set against the paper grain that lies over the whole scene. Grain in
    // overlay lifts a mid-tone, so these run darker than they look listed.
    // The layers were darkened once to compensate for the paper grain lifting
    // the mid-tones. The grain is gone, and the filmic curve lifts shadows on
    // its own, so what they need now is not to be darker but to be further
    // apart: adjacent layers a quarter of a stop from each other read as one
    // khaki mass however dark you make them.
    var STRATA = [
      // One dark family, low contrast: underground the eye should read
      // light and form, not a colour chart. The layers still change, but
      // the way soil does in a cutting seen by a lamp — a shade, not a stripe.
      { y0: 0.0, y1: -2.4, c: 0x1C1710 },     // topsoil
      { y0: -2.4, y1: -5.6, c: 0x2A2318 },    // brown earth
      { y0: -5.6, y1: -8.4, c: 0x3A3123 },    // ochre fill
      { y0: -8.4, y1: -9.2, c: 0x0C0A08 },    // an ash lens
      { y0: -9.2, y1: -13.4, c: 0x413827 },   // rubble and lime
      { y0: -13.4, y1: -17.8, c: 0x241E15 },
      { y0: -17.8, y1: -19.0, c: 0x0A0806 },  // a second burning
      { y0: -19.0, y1: -23.8, c: 0x362E20 },
      { y0: -23.8, y1: -28.6, c: 0x1B1711 },
      { y0: -28.6, y1: -40.0, c: 0x0F0D0A }   // bedrock
    ];

    var under = new T.Group();
    under.visible = false;        // nothing below ground is built until needed
    scene.add(under);

    // The ground itself. Once the camera is below the surface it should be
    // looking up at soil, not at a stripe of sky over a card — that stripe
    // is what made the cutting read as a diorama. A wide dark slab at the
    // ground line, faded in as the camera passes under it, closes the sky.
    var capMat = new T.MeshBasicMaterial({ color: lin(0x0A0806), side: T.DoubleSide, transparent: true, opacity: 0, fog: false });
    var cap = new T.Mesh(new T.PlaneGeometry(220, 120), capMat);
    cap.rotation.x = -Math.PI / 2;
    cap.position.set(0, -0.02, -10);
    under.add(cap);

    var WALL_W = 46, WALL_Z = -3.2;
    STRATA.forEach(function (s, i) {
      var h = s.y0 - s.y1;
      var m = new T.Mesh(new T.PlaneGeometry(WALL_W, h),
        new T.MeshStandardMaterial({ color: lin(s.c), roughness: 1, metalness: 0, map: mottle, fog: true }));
      m.position.set(0, (s.y0 + s.y1) / 2, WALL_Z - i * 0.002);
      under.add(m);
      // A ragged seam along the top of each layer: strata are not ruled lines.
      var seam = new T.Shape();
      seam.moveTo(-WALL_W / 2, 0);
      for (var x = -WALL_W / 2; x <= WALL_W / 2; x += 1.4) {
        seam.lineTo(x, Math.sin(x * 0.7 + i * 2.1) * 0.16 + Math.sin(x * 1.9 + i) * 0.07);
      }
      seam.lineTo(WALL_W / 2, -0.34);
      for (x = WALL_W / 2; x >= -WALL_W / 2; x -= 1.4) {
        seam.lineTo(x, Math.sin(x * 0.7 + i * 2.1) * 0.16 - 0.34);
      }
      seam.closePath();
      var sm = new T.Mesh(new T.ShapeGeometry(seam),
        new T.MeshBasicMaterial({
          color: lin(s.c).lerp(lin(0x0E0C08), 0.45), fog: true }));
      sm.position.set(0, s.y0, WALL_Z + 0.02);
      under.add(sm);
    });

    // Dressed stone — courses of masonry from the city above, and single
    // blocks that rolled. One instanced mesh for the lot.
    (function stones() {
      var boxes = [];
      STRATA.forEach(function (s, i) {
        if (i === 3 || i === 6 || i === 9) return;      // not in ash or bedrock
        var courses = 1 + (i % 2);
        for (var c = 0; c < courses; c++) {
          var y = s.y1 + (s.y0 - s.y1) * (0.25 + c * 0.42);
          var run = 6 + rnd() * 16;
          var x0 = rr(-WALL_W / 2 + 2, WALL_W / 2 - run - 2);
          var bw = 1.2 + rnd() * 1.5, bh = 0.6 + rnd() * 0.45;
          for (var x = x0; x < x0 + run; x += bw + 0.08) {
            boxes.push({ p: new V(x + bw / 2, y + rr(-0.05, 0.05), WALL_Z + rr(0.25, 0.6)),
                         s: new V(bw, bh, 0.5), r: rr(-0.03, 0.03) });
          }
        }
        for (var k = 0; k < 2; k++) {
          boxes.push({
            p: new V(rr(-WALL_W / 2 + 2, WALL_W / 2 - 2),
                     rr(s.y1 + 0.5, s.y0 - 0.5), WALL_Z + rr(0.2, 0.8)),
            s: new V(rr(0.6, 1.4), rr(0.4, 0.8), 0.4),
            r: rr(-0.6, 0.6) });
        }
      });
      var geo = new T.BoxGeometry(1, 1, 1);
      var mesh = new T.InstancedMesh(geo,
        toon(0x4A4234, RAMP_EARTH), boxes.length);
      var mm = new T.Matrix4(), qq = new T.Quaternion(), ee = new T.Euler();
      boxes.forEach(function (b, i) {
        ee.set(0, 0, b.r);
        mm.compose(b.p, qq.setFromEuler(ee), b.s);
        mesh.setMatrixAt(i, mm);
        // Older stone is dirtier: darken with depth.
        var t = Math.min(1, Math.max(0, -b.p.y / 34));
        mesh.setColorAt(i, lin(0x8B8168).lerp(lin(0x3A3628), 0.2 + t * 0.7));
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      under.add(mesh);
    })();

    // Buried text. Leaves of worn parchment laid flat in the genizah layers,
    // drawn once into a canvas in the site's own Hebrew face and mapped onto
    // slightly tilted planes. Whole leaves, not torn ones — the point is that
    // they were put down, not thrown away.
    (function genizah() {
      var GLYPHS = 'אבגדהוזחטיכלמנסעפצקרשת';
      var WORDS = ['איתן', 'לב', 'מוח', 'כבד', 'יסוד', 'מים', 'מנוחה', 'אנרגיה'];
      function leafTexture(seedN) {
        var c = document.createElement('canvas');
        c.width = 256; c.height = 160;
        var x = c.getContext('2d');
        x.fillStyle = '#8A7C60'; x.fillRect(0, 0, 256, 160);
        // Foxed edges, so a leaf reads as old rather than as a sticker.
        var edge = x.createRadialGradient(128, 80, 40, 128, 80, 150);
        edge.addColorStop(0, 'rgba(120,100,64,0)');
        edge.addColorStop(1, 'rgba(90,74,44,0.55)');
        x.fillStyle = edge; x.fillRect(0, 0, 256, 160);
        x.fillStyle = 'rgba(48,40,26,0.82)';
        x.textAlign = 'right';
        x.direction = 'rtl';
        var n = seedN;
        function nx() { n = (n * 1103515245 + 12345) & 0x7fffffff; return n / 0x7fffffff; }
        for (var row = 0; row < 6; row++) {
          var size = 17 + Math.floor(nx() * 4);
          x.font = size + 'px "David Libre", Georgia, serif';
          var line = '';
          for (var w = 0; w < 3 + Math.floor(nx() * 2); w++) {
            line += (nx() > 0.55
              ? WORDS[Math.floor(nx() * WORDS.length)]
              : GLYPHS.charAt(Math.floor(nx() * GLYPHS.length))
                + GLYPHS.charAt(Math.floor(nx() * GLYPHS.length))) + ' ';
          }
          x.globalAlpha = 0.5 + nx() * 0.5;      // some lines have faded out
          x.fillText(line, 234, 30 + row * 22);
        }
        x.globalAlpha = 1;
        var t = new T.CanvasTexture(c);
        if (T.sRGBEncoding !== undefined) t.encoding = T.sRGBEncoding;
        t.anisotropy = 2;
        return t;
      }

      // Only in the layers that are genizah, not in ash or bedrock.
      var LAYERS = [1, 2, 4, 5, 7, 8];
      LAYERS.forEach(function (li, k) {
        var s = STRATA[li];
        var tex = leafTexture(9001 + k * 977);
        for (var i = 0; i < 3; i++) {
          var w = rr(1.5, 2.6);
          var m = new T.Mesh(new T.PlaneGeometry(w, w * 0.62),
            toon(0xFFFFFF, RAMP_EARTH, { map: tex, transparent: true, opacity: 0.94 }));
          m.position.set(rr(-WALL_W / 2 + 3, WALL_W / 2 - 3),
                         rr(s.y1 + 0.6, s.y0 - 0.6), WALL_Z + rr(0.35, 0.95));
          m.rotation.z = rr(-0.35, 0.35);
          under.add(m);
        }
      });
    })();

    // Potsherds: small angled chips, the commonest thing in any layer.
    (function sherds() {
      var geo = new T.CircleGeometry(0.22, 5);
      var mesh = new T.InstancedMesh(geo,
        toon(0x6A452F, RAMP_EARTH), 70);
      var mm = new T.Matrix4(), qq = new T.Quaternion(), ee = new T.Euler();
      for (var i = 0; i < 70; i++) {
        var y = rr(-1, -33);
        ee.set(rr(-0.4, 0.4), rr(-0.4, 0.4), rr(0, 6.28));
        mm.compose(new V(rr(-WALL_W / 2 + 2, WALL_W / 2 - 2), y, WALL_Z + rr(0.3, 1.1)),
                   qq.setFromEuler(ee), new V(rr(0.45, 1.0), rr(0.45, 1.0), 1));
        mesh.setMatrixAt(i, mm);
        mesh.setColorAt(i, new T.Color(rnd() > 0.5 ? 0x6A452F : 0x51402F));
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      under.add(mesh);
    })();

    // The light down here comes from the opening above, so it is warm, weak
    // and from one side. It ramps up with depth and the sky light ramps down.
    var underKey = new T.DirectionalLight(0xFFE6BC, 0);
    underKey.position.set(4, 6, 12);
    scene.add(underKey);
    var underFill = new T.HemisphereLight(0xBFA981, 0x241F16, 0);
    scene.add(underFill);

    // ---- generate the skeleton
    var branches = [];   // { a, b, r }
    var clusters = [];   // leaf cards: { tip, p, s }
    var fseed = 424242;
    function frnd() { fseed = (fseed * 1103515245 + 12345) & 0x7fffffff; return fseed / 0x7fffffff; }
    function fr(a, b) { return a + frnd() * (b - a); }
    var masses = [];     // dark bodies inside the sprays: { p, s }
    var tips = [];       // world tips of the six navigable limbs

    var underground = false;

    function grow(from, dir, len, rad, depth, limb) {
      var to = from.clone().addScaledVector(dir, len);
      branches.push({ a: from.clone(), b: to.clone(), r: rad, depth: depth, root: underground });

      if (depth <= 0) {
        // Foliage. Two layers, because no single primitive is a canopy:
        //
        //   Cards — a spray of leaves painted once onto a transparent square,
        //   then instanced by the thousand, each turned to face out from its
        //   own twig. The alpha cut is what gives the crown a broken,
        //   feathered edge instead of a silhouette of bubbles, and it is the
        //   edge the eye checks first.
        //
        //   Masses — a handful of dark, smooth bodies pushed into the middle
        //   of each spray, so the inside of the crown is dark and the trunk
        //   does not show through the leaves like a coat-rack.
        if (!underground) {
          // The skeleton's seed was chosen by search while the foliage drew
          // from the same generator — one draw for the count, four per
          // clump, thirty-four clumps and change. Those draws are burned
          // here exactly as they were, so the tree that was searched for is
          // the tree that grows; the leaves take their own generator, which
          // also means the skeleton no longer depends on the viewport.
          var burn = 34 + Math.floor(rnd() * (34 * 0.42));
          for (var bI = 0; bI < burn * 4; bI++) rnd();
          var n = LEAF_N + Math.floor(frnd() * (LEAF_N * 0.42));
          for (var c = 0; c < n; c++) {
            clusters.push({
              tip: to,
              p: to.clone().add(new V(fr(-0.62, 0.62), fr(-0.40, 0.50), fr(-0.62, 0.62))),
              s: 0.28 + Math.pow(frnd(), 1.5) * 0.32
            });
          }
          var nm = 2 + Math.floor(frnd() * 2);
          for (var mI = 0; mI < nm; mI++) {
            masses.push({
              p: to.clone().add(new V(fr(-0.18, 0.18), fr(-0.1, 0.18), fr(-0.18, 0.18))),
              s: 0.06 + frnd() * 0.05
            });
          }
        }
        if (limb !== undefined && tips[limb] === undefined) tips[limb] = to.clone();
        return to;
      }

      var kids = depth > 2 ? 2 : (rnd() > 0.32 ? 3 : 2);
      var last = null;
      for (var i = 0; i < kids; i++) {
        // Rotate away from the parent, then let gravity pull the tip down a
        // little — that droop is what makes a live oak read as a live oak.
        var axis = new V(rr(-1, 1), rr(-0.35, 0.35), rr(-1, 1)).normalize();
        var nd = dir.clone().applyAxisAngle(axis, rr(0.34, 0.72)).normalize();
        // Limbs droop a little under their own weight; roots dive.
        nd.y -= underground ? rr(0.3, 0.62) : rr(0.04, 0.2);
        nd.normalize();
        last = grow(to, nd, len * rr(0.62, 0.78), rad * 0.64, depth - 1,
                    i === 0 ? limb : undefined);
      }
      return last;
    }

    // Trunk: short and heavy, with a slight lean, and a flare where it meets
    // the ground. The flare is what stops the trunk reading as a stem stuck
    // into a mound — a real trunk widens into its own roots.
    var base = new V(0, 0, 0);
    var trunkDir = new V(rr(-0.05, 0.05), 1, rr(-0.05, 0.05)).normalize();
    var trunkTop = base.clone().addScaledVector(trunkDir, 2.3);
    branches.push({ a: new V(0, -0.55, 0), b: base, r: 1.02, depth: 9 });
    branches.push({ a: base, b: trunkTop, r: 0.72, depth: 9 });

    // Six limbs. Azimuths are spread across the front and elevations
    // alternate, so no two tips land on top of each other on screen.
    var AZ = [-1.95, -1.15, -0.42, 0.42, 1.15, 1.95];
    var EL = [0.42, 0.86, 0.62, 0.66, 0.9, 0.46];
    AZ.forEach(function (az, i) {
      var dir = new V(Math.sin(az), EL[i], Math.cos(az) * 0.55).normalize();
      var from = trunkTop.clone().add(new V(0, -0.5 + i * 0.12, 0));
      grow(from, dir, rr(2.1, 2.6), 0.36, 4, i);
    });

    // Roots: the same growth rule, inverted — but heavy, and set going
    // almost level so each one arches over the ground before it dives. That
    // arch is the whole point: the roots have to be visible, and the ones
    // that run off the bottom of the frame are picked up by the page below.
    underground = true;
    // Wider than they were: the roots should answer the crown, spreading
    // under it as far as the limbs spread over it — the mirror the old
    // paintings of the tree of life all draw.
    [-2.55, -1.55, -0.55, 0.55, 1.55, 2.55].forEach(function (az, i) {
      var dir = new V(Math.sin(az) * 1.0, -rr(0.1, 0.3), Math.cos(az) * 0.72).normalize();
      grow(new V(0, 0.12, 0), dir, rr(2.0, 2.7), i % 2 ? 0.42 : 0.52, 3);
    });

    // ---- the deep root system.
    //
    // Below the shoulders the tree puts down one taproot that keeps going,
    // and six laterals leave it at six depths. Those six are the product
    // lines: each tip is where a label hangs, the same way a branch tip
    // carries a section name above ground. The depths are spaced so no two
    // labels are ever on screen together at the same moment of the descent.
    var DEEP_TOP = -1.2, DEEP_BOTTOM = -32;
    var lineTips = [];
    var deepFrom = branches.length;
    (function deepRoots() {
      var spine = [], N = 64;
      for (var i = 0; i <= N; i++) {
        var u = i / N;
        var y = DEEP_TOP + (DEEP_BOTTOM - DEEP_TOP) * u;
        // Not a plumb line: a taproot wanders as it finds its way past stone.
        spine.push(new V(Math.sin(u * 4.3 + 0.7) * 0.55 + Math.sin(u * 9.1) * 0.22,
                         y,
                         Math.cos(u * 3.1) * 0.35));
      }
      for (i = 0; i < N; i++) {
        var u0 = i / N;
        // Tapering, and running out to almost nothing at the end rather than
        // stopping on a flat cut face.
        var r0 = (0.95 - 0.72 * u0) * (u0 > 0.86 ? Math.max(0.05, (1 - u0) / 0.14) : 1);
        branches.push({ a: spine[i].clone(), b: spine[i + 1].clone(), r: r0,
                        depth: 9, root: true, spine: true });
      }
      // Six laterals, alternating sides, reaching further as they go deeper.
      var AT = [0.10, 0.25, 0.40, 0.55, 0.70, 0.84];
      AT.forEach(function (u, k) {
        var from = spine[Math.round(u * N)].clone();
        var side = k % 2 ? 1 : -1;
        // Short enough that the tip, and the card centred on it, stay
        // wholly inside the closed-in underground frame.
        var reach = 2.1 + k * 0.22;
        var to = from.clone().add(new V(side * reach, -0.8 - k * 0.12, rr(-0.9, 0.9)));
        // Three segments, so the lateral bends on its way out rather than
        // running straight — and tapers as it goes.
        var prev = from, steps = 3;
        for (var j = 1; j <= steps; j++) {
          var t = j / steps;
          var p = from.clone().lerp(to, t);
          p.y += Math.sin(t * Math.PI) * 0.75;      // it arcs, then drops
          p.x += side * Math.sin(t * Math.PI) * 0.5;
          branches.push({ a: prev.clone(), b: p.clone(),
                          r: 0.52 - 0.13 * (j - 1), depth: 9, root: true });
          prev = p;
        }
        lineTips.push(prev.clone());
        // Hair roots off each lateral, so the tip is a spray and not a stub.
        for (var h = 0; h < 5; h++) {
          var hd = new V(side * rr(0.4, 1), -rr(0.5, 1.1), rr(-0.7, 0.7)).normalize();
          grow(prev.clone(), hd, rr(0.7, 1.15), 0.16, 2);
        }
      });
      // Hair roots off the taproot itself, between the laterals.
      for (var m = 0; m < 16; m++) {
        var sp = spine[Math.round((0.06 + m * 0.058) * N)];
        var d = new V(rr(-1, 1), -rr(0.4, 1.0), rr(-1, 1)).normalize();
        grow(sp.clone(), d, rr(0.6, 1.3), 0.14, 2);
      }
    })();
    // Everything the deep system made is marked, so the surface framing can
    // ignore it wholesale rather than guessing from a depth number.
    for (var dfi = deepFrom; dfi < branches.length; dfi++) branches[dfi].deep = true;
    underground = false;

    // ---- branches as instanced meshes.
    //
    // Two, not one. The shared cylinder tapers 0.62:1 along its own length,
    // which is right for a limb drawn as a single piece and wrong for a
    // taproot drawn as sixty-four: every joint would show and the whole
    // thing reads as a drill bit. The deep system gets a straight cylinder
    // and takes its taper from the radius of each successive segment.
    var surfIdx = [], deepIdx = [];
    branches.forEach(function (b, i) { (b.deep ? deepIdx : surfIdx).push(i); });

    // Bark. A limb the colour of one flat brown is the giveaway on every
    // hand-built tree: real wood is streaked along its length and mottled
    // across it, and even a coarse texture stops the trunk reading as
    // moulded plastic. The same map drives roughness, so the ridges catch
    // the key light and the fissures do not.
    function barkTexture() {
      var n = 256, c = document.createElement('canvas');
      c.width = c.height = n;
      var x = c.getContext('2d');
      x.fillStyle = '#6E6253'; x.fillRect(0, 0, n, n);
      var bs = 4471;
      function br() { bs = (bs * 1103515245 + 12345) & 0x7fffffff; return bs / 0x7fffffff; }
      // vertical fissures — the cylinder's V runs along the limb
      for (var i = 0; i < 190; i++) {
        var w = 1 + br() * 5, xx = br() * n;
        var dark = br() > 0.42;
        x.globalAlpha = 0.10 + br() * 0.30;
        x.fillStyle = dark ? '#3A342B' : '#988B74';
        x.beginPath();
        var y = 0;
        while (y < n) {
          var h = 12 + br() * 60;
          x.rect(xx + Math.sin(y * 0.05) * 2.5, y, w, h);
          y += h + br() * 14;
        }
        x.fill();
      }
      // cross-mottle, so it is not a barcode
      x.globalAlpha = 1;
      var img = x.getImageData(0, 0, n, n), d = img.data;
      for (var k = 0; k < d.length; k += 4) {
        var v = (br() - 0.5) * 30;
        d[k] += v; d[k + 1] += v; d[k + 2] += v;
      }
      x.putImageData(img, 0, 0);
      var t = new T.CanvasTexture(c);
      t.wrapS = t.wrapT = T.RepeatWrapping;
      t.repeat.set(2, 1);
      return t;
    }
    var barkMap = barkTexture();
    if (T.sRGBEncoding !== undefined) barkMap.encoding = T.sRGBEncoding;
    var barkRough = barkMap.clone();
    barkRough.encoding = T.LinearEncoding !== undefined ? T.LinearEncoding : barkRough.encoding;
    barkRough.needsUpdate = true;

    var cyl = new T.CylinderGeometry(0.62, 1, 1, 9, 1, true);
    // No roughness map. It made the ridges of the bark catch the key as a
    // run of small bright streaks, which is what glossy means on a trunk;
    // by moonlight bark is matte, and the map carries the form on its own.
    var barkMat = toon(0xFFFFFF, RAMP_WOOD, { map: barkMap, roughness: 1.0 });
    var bMesh = new T.InstancedMesh(cyl, barkMat, surfIdx.length);
    bMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);

    var dCyl = new T.CylinderGeometry(1, 1, 1, 9, 1, true);
    var dMesh = new T.InstancedMesh(dCyl, barkMat, deepIdx.length);
    under.add(dMesh);

    // There used to be an ink line here: a second copy of every limb,
    // fattened and drawn inside out so the overhang read as a contour. It was
    // the right call when the scene was a drawing. It is the wrong one now —
    // against real light, real shadow and a real horizon it stops reading as
    // a contour and starts reading as a cut-out laid on the hills. Nothing
    // photographed has a line around it.

    var UP = new V(0, 1, 0);
    var m4 = new T.Matrix4(), q = new T.Quaternion(), mid = new V(), dirv = new V(), scl = new V();

    // Joints. Every limb is a run of straight cylinders, and where two meet
    // at an angle the seam shows as a ring — the "segmented pipe" look of
    // every procedural tree. A sphere at each joint, the radius of the
    // segment ending there, closes the seam from every angle. Same bark,
    // same light, one instanced mesh per system.
    var jointGeo = new T.SphereGeometry(1, 10, 8);
    var jS = new T.InstancedMesh(jointGeo, barkMat, surfIdx.length);
    var jD = new T.InstancedMesh(jointGeo, barkMat, deepIdx.length + 1);
    jS.instanceMatrix.setUsage(T.DynamicDrawUsage);
    var jQ = new T.Quaternion();
    function placeBranch(mesh, slot, i, t) {
      var br = branches[i];
      var grown = Math.max(0.0001, t);
      var b = br.a.clone().lerp(br.b, grown);
      mid.copy(br.a).add(b).multiplyScalar(0.5);
      dirv.copy(b).sub(br.a);
      var len = dirv.length() || 0.0001;
      q.setFromUnitVectors(UP, dirv.normalize());
      // Deep segments overlap slightly so no joint opens on a bend.
      scl.set(br.r, len * (br.deep ? 1.12 : 1), br.r);
      m4.compose(mid, q, scl);
      mesh.setMatrixAt(slot, m4);
      // the joint sits at the segment's end, at the radius the taper reaches there
      // Not on the taproot's own spine — its segments already overlap and
      // are nearly collinear, and a sphere on each of sixty-four of them
      // reads as a string of beads. Not on a terminal segment either: a
      // root or twig tapers to its tip, it does not end in a ball.
      // Sized to the thinner side of the joint, so it closes the seam without
      // standing proud of either segment.
      var jr = br.r * (br.deep ? 0.74 : 0.56) * Math.min(1, grown * 4);
      if (br.spine || br.depth <= 0) jr = 0;
      scl.set(jr, jr, jr);
      m4.compose(b, jQ, scl);
      (br.deep ? jD : jS).setMatrixAt(slot, m4);
    }

    // The deep system does not grow in — it is already there, waiting under
    // the ground — so it is placed once and never touched again.
    deepIdx.forEach(function (i, slot) { placeBranch(dMesh, slot, i, 1); });
    dMesh.instanceMatrix.needsUpdate = true;
    (function capTaproot() {
      var top = branches[deepFrom];
      scl.set(top.r * 1.02, top.r * 1.02, top.r * 1.02);
      m4.compose(top.a, jQ, scl);
      jD.setMatrixAt(deepIdx.length, m4);
    })();
    jD.instanceMatrix.needsUpdate = true;
    under.add(jD);

    // ---- foliage
    //
    // Leaves, not clumps. The canopy was smooth ellipsoids — soft-shaded,
    // colour-ramped, individually rotated — and it still read as a pile of
    // green pebbles, because a smooth closed body has a smooth closed
    // outline and a tree has neither. What a tree has is thousands of thin
    // things, each one letting light and background through around it. So:
    // a spray of narrow leaves is painted once, with alpha, and instanced as
    // flat cards. Alpha-tested, so the edge of every leaf is a real edge in
    // the depth buffer and in the shadow map. Double-sided, because a card
    // seen from behind is the underside of a leaf, which is paler — and the
    // texture carries a few pale leaves so the crown flickers silver the way
    // an olive does.
    var leafTex = (function () {
      var n = 512, c = document.createElement('canvas');
      c.width = c.height = n;
      var x = c.getContext('2d');
      var ls = 5717;
      function lr() { ls = (ls * 1103515245 + 12345) & 0x7fffffff; return ls / 0x7fffffff; }
      function leaf(cx, cy, ang, len, wid, top) {
        x.save();
        x.translate(cx, cy); x.rotate(ang);
        // a narrow lanceolate blade: two quadratic arcs to a point
        x.beginPath();
        x.moveTo(0, 0);
        x.quadraticCurveTo(wid, -len * 0.42, 0, -len);
        x.quadraticCurveTo(-wid, -len * 0.42, 0, 0);
        x.closePath();
        var g = x.createLinearGradient(-wid, 0, wid, 0);
        if (top) {
          var k = 0.74 + lr() * 0.3;
          g.addColorStop(0, 'rgb(' + Math.round(72 * k) + ',' + Math.round(96 * k) + ',' + Math.round(58 * k) + ')');
          g.addColorStop(0.5, 'rgb(' + Math.round(118 * k) + ',' + Math.round(146 * k) + ',' + Math.round(92 * k) + ')');
          g.addColorStop(1, 'rgb(' + Math.round(86 * k) + ',' + Math.round(112 * k) + ',' + Math.round(70 * k) + ')');
        } else {
          g.addColorStop(0, '#8E9A80'); g.addColorStop(0.5, '#C2CCB0'); g.addColorStop(1, '#9AA68A');
        }
        x.fillStyle = g; x.fill();
        // the midrib, and the shadow the blade's fold throws beside it
        x.strokeStyle = top ? 'rgba(20,30,16,0.35)' : 'rgba(80,92,70,0.45)';
        x.lineWidth = 2.2; x.beginPath(); x.moveTo(0.6, -len * 0.06); x.lineTo(0.6, -len * 0.94); x.stroke();
        x.strokeStyle = top ? 'rgba(212,226,180,0.55)' : 'rgba(255,255,255,0.5)';
        x.lineWidth = 1.1; x.beginPath(); x.moveTo(-0.9, -len * 0.06); x.lineTo(-0.9, -len * 0.94); x.stroke();
        x.restore();
      }
      // twigs first, so the leaves sit on them
      x.strokeStyle = '#4A4032'; x.lineCap = 'round';
      var fan = 11, i;
      for (i = 0; i < fan; i++) {
        var a = (-0.62 + (i / (fan - 1)) * 1.24) + (lr() - 0.5) * 0.14;
        var l = 190 + lr() * 60;
        x.lineWidth = 2.6 - i * 0.05;
        x.beginPath(); x.moveTo(256, 492);
        x.lineTo(256 + Math.sin(a) * l * 0.55, 492 - Math.cos(a) * l * 0.55); x.stroke();
      }
      // leaves: a fan from the stem, longer in the middle, a few showing
      // their pale underside, a few smaller ones tucked low
      var order = [];
      for (i = 0; i < 17; i++) order.push(i);
      order.sort(function () { return lr() - 0.5; });
      order.forEach(function (i) {
        var f = i / 16;
        var ang = -0.95 + f * 1.9 + (lr() - 0.5) * 0.22;
        var along = 60 + lr() * 150;
        var cx = 256 + Math.sin(ang) * along * 0.5, cy = 492 - Math.cos(ang) * along * 0.5;
        var len = 120 + (1 - Math.abs(f - 0.5) * 2) * 70 + lr() * 40;
        var wid = 17 + lr() * 9;
        leaf(cx, cy, ang + (lr() - 0.5) * 0.5, len, wid, lr() > 0.08);
      });
      var t = new T.CanvasTexture(c);
      if (T.sRGBEncoding !== undefined) t.encoding = T.sRGBEncoding;
      t.anisotropy = 4;
      t.generateMipmaps = true;
      t.minFilter = T.LinearMipmapLinearFilter;
      return t;
    })();

    var cardGeo = new T.PlaneGeometry(1, 1);
    cardGeo.translate(0, 0.44, 0);            // the stem is the pivot
    var leafMat = new T.MeshStandardMaterial({
      map: leafTex, alphaTest: 0.5, side: T.DoubleSide,
      color: 0xFFFFFF, roughness: 1.0, metalness: 0
    });
    var lMesh = new T.InstancedMesh(cardGeo, leafMat, clusters.length);
    // The shadow pass draws its own depth material, and that material has
    // to know where the holes are or every card throws a square shadow.
    lMesh.customDepthMaterial = new T.MeshDepthMaterial({
      depthPacking: T.RGBADepthPacking, map: leafTex, alphaTest: 0.5, side: T.DoubleSide
    });

    var col = new T.Color();
    var cDark = new T.Color(0.30, 0.36, 0.28), cLit = new T.Color(0.84, 0.90, 0.70), cSun = lin(LEAF_SUN);
    var yLo = Infinity, yHi = -Infinity;
    clusters.forEach(function (c) { if (c.p.y < yLo) yLo = c.p.y; if (c.p.y > yHi) yHi = c.p.y; });
    var ySpan = Math.max(0.001, yHi - yLo);
    var bx = new V(), by = new V(), bz = new V(), bm = new T.Matrix4();
    clusters.forEach(function (c, i) {
      var up = (c.p.y - yLo) / ySpan;            // 0 at the lowest card, 1 at the crown
      // the texture carries the leaf colour; the instance carries the light —
      // dark and cool inside and low, open and warm at the sunlit top
      col.copy(cDark).lerp(cLit, Math.pow(up, 0.85) * 0.8 + frnd() * 0.3);
      col.lerp(cSun, Math.pow(up, 2.4) * 0.16 * (0.5 + frnd() * 0.5));
      lMesh.setColorAt(i, col);
      // Orientation: the spray points away from its twig and a little up,
      // the way growth does; the face it shows is otherwise random, so
      // neighbours never agree and the crown has depth from every angle.
      by.copy(c.p).sub(c.tip);
      by.y += 0.35;
      by.x += fr(-0.4, 0.4); by.z += fr(-0.4, 0.4);
      if (by.lengthSq() < 1e-4) by.set(0, 1, 0);
      by.normalize();
      bz.set(fr(-1, 1), fr(-1, 1), fr(-1, 1)).normalize();
      bz.addScaledVector(by, -bz.dot(by));
      if (bz.lengthSq() < 1e-4) bz.set(0, 0, 1).addScaledVector(by, -by.z);
      bz.normalize();
      bx.crossVectors(by, bz);
      bm.makeBasis(bx, by, bz);
      c.q = new T.Quaternion().setFromRotationMatrix(bm);
      // mirror about half of them, so one painted spray reads as two
      c.mx = frnd() > 0.5 ? -1 : 1;
      c.sy = 0.9 + frnd() * 0.3;
    });

    // The masses: smooth, dark, and never on the outside of anything.
    var ico = new T.IcosahedronGeometry(1, 2);
    var massMat = toon(0x000000, RAMP_LEAF, { roughness: 0.95 });
    massMat.color.copy(lin(LEAF_A)).lerp(lin(LEAF_B), 0.35);
    var mMesh = new T.InstancedMesh(ico, massMat, Math.max(1, masses.length));
    masses.forEach(function (m) {
      m.sx = 0.8 + frnd() * 0.5; m.sy = 0.55 + frnd() * 0.3; m.sz = 0.8 + frnd() * 0.5;
      m.rx = frnd() * 6.28; m.ry = frnd() * 6.28; m.rz = frnd() * 6.28;
    });

    // Sway: the canopy is never quite still. The offset grows with height,
    // so the crown moves and the low limbs barely do, and each card carries
    // its own phase — otherwise the whole tree slides as one board. The card
    // also rocks a little about its stem, which is what a leaf spray does in
    // air: it does not travel, it nods.
    var swayP = new V(), swayQ = new T.Quaternion(), swayE = new T.Euler(), swayS = new V();
    var nod = new T.Quaternion(), nodAxis = new V(1, 0, 0);
    function placeCluster(i, t, time) {
      var c = clusters[i];
      var s = c.s * t;
      swayP.copy(c.p);
      swayQ.copy(c.q);
      if (time) {
        var lift = Math.max(0, c.p.y) * 0.011;
        var ph = c.p.x * 1.7 + c.p.z * 1.1;
        swayP.x += Math.sin(time * 0.00047 + ph) * lift;
        swayP.z += Math.cos(time * 0.00039 + ph * 1.3) * lift * 0.7;
        swayP.y += Math.sin(time * 0.00061 + ph * 0.7) * lift * 0.35;
        nod.setFromAxisAngle(nodAxis, Math.sin(time * 0.0011 + ph * 2.3) * 0.06);
        swayQ.multiply(nod);
      }
      swayS.set(s * c.mx, s * c.sy, s);
      m4.compose(swayP, swayQ, swayS);
      lMesh.setMatrixAt(i, m4);
    }
    function placeMass(i, t) {
      var m = masses[i];
      var s = m.s * t;
      swayE.set(m.rx, m.ry, m.rz);
      swayQ.setFromEuler(swayE);
      swayS.set(s * m.sx, s * m.sy, s * m.sz);
      m4.compose(m.p, swayQ, swayS);
      mMesh.setMatrixAt(i, m4);
    }

    if (SHADOWS) {
      bMesh.castShadow = true; bMesh.receiveShadow = true;
      jS.castShadow = true; jS.receiveShadow = true;
      lMesh.castShadow = true; lMesh.receiveShadow = true;
      mMesh.castShadow = true; mMesh.receiveShadow = true;
    }
    scene.add(bMesh);
    scene.add(jS);
    scene.add(lMesh);
    scene.add(mMesh);

    // ---- framing: fit the camera to the tree it actually generated,
    // rather than to numbers that happened to work once.
    var group = new T.Group();
    scene.remove(bMesh); scene.remove(jS); scene.remove(lMesh); scene.remove(mMesh);
    group.add(bMesh); group.add(jS); group.add(lMesh); group.add(mMesh);
    scene.add(group);

    // The roots are meant to run off the bottom edge, so they are left out
    // of the framing box — otherwise the tree shrinks to fit what is always
    // going to be cropped.
    var box = new T.Box3();
    branches.forEach(function (br) {
      // Root shoulders are part of the picture; the deep system belongs to
      // the descent, so it gets no vote in how the surface is framed.
      if (br.deep) return;
      if (br.root && br.depth < 3) return;
      box.expandByPoint(br.a); box.expandByPoint(br.b);
    });
    // Count the clump's radius, not just its centre, or the framing clips the
    // outer foliage off the edges of the canvas.
    var _e = new V();
    clusters.forEach(function (c) {
      box.expandByPoint(_e.copy(c.p).addScalar(c.s));
      box.expandByPoint(_e.copy(c.p).addScalar(-c.s));
    });
    var size = box.getSize(new V());
    var centre = box.getCenter(new V());
    // The group stays at the origin so the tree, the ground and the hills all
    // share one coordinate space; the camera does the framing instead.
    group.position.set(0, 0, 0);

    // Label anchors, in the same local space as the geometry.
    var VALUES_AT = new V(0, 1.25, 0);

    var yaw = 0, targetYaw = 0;

    function resize() {
      var r = frame.getBoundingClientRect();
      if (!r.width) return false;
      var h = Math.round(frame.clientHeight || r.width * 0.72);
      if (!h) return false;
      renderer.setSize(r.width, h, false);
      fitSky(r.width / h);
      canvas.style.height = h + 'px';
      camera.aspect = r.width / h;
      camera.fov = r.width < 700 ? 48 : 40;
      camera.updateProjectionMatrix();

      // Poster framing. The tree takes a fixed share of the frame height and
      // sits low in it, so the crown clears the headline and the upper third
      // stays sky. The camera is level, which keeps the horizon level too.
      var vFov = camera.fov * Math.PI / 180;
      var tanH = Math.tan(vFov / 2);
      var narrow = r.width < 700;
      // Wide enough for the headline to sit to one side, the tree moves the
      // other way so the words land on open sky instead of on the crown — and
      // it has to be sized for that shift, not merely slid into it, or the
      // far side of the crown falls off the frame.
      var leaning = r.width >= 960;
      var LEAN = 0;                             // centred: the roots go straight down into the descent
      var fill = narrow ? 0.62 : 0.54;          // share of frame height the tree fills
      var wide = narrow ? 0.98 : 0.94;
      var distH = (size.y / fill / 2) / tanH;
      var distW = (size.x / wide / 2) / tanH / camera.aspect;
      var dist = Math.max(distH, distW);
      if (leaning) {
        // Size for where the tree ends up, not where it started. Shifting by
        // LEAN eats that much of the width on one side, so solve for the
        // distance at which the far edge of the crown still lands inside
        // EDGE — otherwise the shift quietly crops the canopy.
        var EDGE = 0.90;
        dist = Math.max(dist, (size.x / 2)
          / ((EDGE - 0.5 - LEAN) * 2 * tanH * camera.aspect));
      }
      var visH = 2 * dist * tanH;               // world units visible top to bottom
      // Push the tree below frame centre far enough that the deepest roots
      // run off the bottom edge — the page picks them up from there. Aim at
      // the crown's own centre in x as well: a grown tree is never perfectly
      // balanced, and the camera should frame it rather than the origin.
      var aim = centre.y + visH * (narrow ? 0.05 : 0.17);
      // Aiming away from the tree pushes the tree the opposite way on screen,
      // and the side swaps with the document's direction.
      var aimX = centre.x;
      if (leaning) {
        var lean = visH * camera.aspect * LEAN;
        aimX -= document.documentElement.dir === 'rtl' ? -lean : lean;
      }
      // The surface framing is the top of the descent, not the whole of it.
      surfaceX = aimX; surfaceY = aim; camDist = dist;
      applyDepth(depthP);
      return true;
    }

    // ---- the descent
    //
    // The stage is pinned and the section behind it is several viewports
    // tall, so scrolling it falls the camera through the ground. Everything
    // below the surface is built once and kept hidden until the first metre
    // of the descent, so a visitor who never scrolls pays nothing for it.
    var surfaceX = 0, surfaceY = 0, camDist = 20, depthP = 0;
    var section = frame.closest ? frame.closest('[data-descent]') : null;
    var DEEP_VIEW = -27.5;      // the fall stops on the last layer
                            // that has anything in it; bedrock
                            // is the floor of the frame, not a
                            // place to arrive at

    function applyDepth(p) {
      depthP = p;
      // Ease in, so the first flick of the wheel does not drop you into rock.
      var e = p * p * (3 - 2 * p);
      var y = surfaceY + (DEEP_VIEW - surfaceY) * e;
      // The lean belongs to the headline, and the headline is gone by then.
      var x = surfaceX + (centre.x - surfaceX) * Math.min(1, p * 3);
      // Close in as you go down. Underground the frame wants to hold about
      // one root at a time; at the surface distance it holds three labels at
      // once and they fight. It also makes the layers read as walls you are
      // between rather than as a diagram you are looking at.
      var near = (frame.getBoundingClientRect().width < 760) ? 0.46 : 0.64;
      var z = camDist + (camDist * near - camDist) * Math.min(1, p * 2.4);
      camera.position.set(x, y, z);
      camera.lookAt(x, y, 0);
      placeForeground();
      // The stand at the frame's edge belongs to the surface. Underground the
      // camera has closed in and it would loom across a third of the frame.
      if (fgMat) fgMat.opacity = Math.max(0, 1 - p * 9);

      under.visible = p > 0.002;
      // Daylight falls off with depth and the warm light from the opening
      // above takes over; by the bottom you are reading by very little.
      var lit = Math.max(0, 1 - p * 1.9);
      if (renderer.toneMapping !== undefined && renderer.toneMapping !== T.NoToneMapping) {
        renderer.toneMappingExposure = 0.84 - 0.3 * Math.min(1, p * 1.7);
      }
      key.intensity = 0.55 * lit;
      rim.intensity = 0.95 * lit;
      hemi.intensity = 0.42 * lit;
      underKey.intensity = 0.62 * Math.min(1, p * 2.2);
      underFill.intensity = 0.20 * Math.min(1, p * 2.2);
      // Soil closes over as the camera passes beneath the ground line, and
      // the air down here is dust: the fog turns from the horizon's blue to
      // the dark of the cutting, and thickens, so the wall and the far roots
      // fall away into it instead of standing flat-lit at the back.
      capMat.opacity = Math.max(0, Math.min(1, (-y - 0.4) / 1.6));
      var uf = Math.min(1, Math.max(0, (p - 0.04) / 0.16));
      scene.fog.color.copy(fogSky).lerp(fogSoil, uf);
      scene.fog.density = 0.0058 + 0.05 * uf;
      if (section) section.classList.toggle('is-under', p > 0.1);
    }

    function readScroll() {
      if (!section) return;
      var b = section.getBoundingClientRect();
      var span = b.height - window.innerHeight;
      if (span <= 0) { applyDepth(0); return; }
      var p = Math.max(0, Math.min(1, -b.top / span));
      if (Math.abs(p - depthP) < 0.0002) return;
      applyDepth(p);
      kick();
    }

    // ---- labels track their branch tip in screen space
    var projV = new V();
    var placed = [];          // { a, x, y, w, h, on } reused each frame

    function positionLabels() {
      var r = canvas.getBoundingClientRect();
      placed.length = 0;

      function put(a, anchor, moves) {
        if (!anchor) return;
        projV.copy(anchor);
        if (moves) projV.applyMatrix4(group.matrixWorld);
        projV.project(camera);
        var box = a.getBoundingClientRect();
        var w = box.width || 90, h = box.height || 28;
        var x = (projV.x * 0.5 + 0.5) * r.width;
        var y = (-projV.y * 0.5 + 0.5) * r.height;
        // A label whose anchor has left the frame is not shown at all. That
        // is what swaps the branch names for the line names on the way down:
        // nothing is toggled, each label simply follows its own root.
        // A branch pill may hang off the edge and get clamped back in; a
        // line card may not, because half a card is unreadable. So the cards
        // must be wholly inside before they are shown at all — except on a
        // narrow screen, where the card is most of the width and there is no
        // horizontal room to be beside anything. There it centres, and takes
        // only its depth from the root it belongs to.
        var whole = a.classList.contains('rootlab');
        if (whole && r.width < 760) x = r.width / 2;
        var mx = whole ? w * 0.52 : -w * 0.6;
        var my = whole ? h * 0.52 : -h * 0.6;
        var on = projV.z <= 1 &&
                 x > mx && x < r.width - mx &&
                 y > my && y < r.height - my;
        placed.push({ a: a, x: x, y: y, w: w, h: h, on: on });
      }

      labels.forEach(function (a) {
        var key = a.getAttribute('data-key');
        if (key === 'values') return put(a, VALUES_AT, true);
        put(a, tips[LIMB_KEYS.indexOf(key)], true);
      });
      // The deep roots do not turn with the drag — they belong to the ground,
      // not to the tree — so their anchors are already in world space.
      var firstLine = placed.length;
      lineLabels.forEach(function (a, i) { put(a, lineTips[i], false); });

      // One root, one card. Two cards on screen at once is two things to
      // read and no sense of descending past anything, so of the ones in
      // frame only the nearest to the middle is kept — and none of them
      // before the descent has actually started.
      var best = -1, bestD = Infinity;
      for (var li = firstLine; li < placed.length; li++) {
        if (!placed[li].on) continue;
        var d = Math.abs(placed[li].y - r.height / 2);
        if (d < bestD) { bestD = d; best = li; }
      }
      for (li = firstLine; li < placed.length; li++) {
        if (li !== best || depthP < 0.06) placed[li].on = false;
      }

      // Branch tips can land on top of each other from any given angle, and
      // the tree turns. Rather than tune the geometry for one viewport, push
      // overlapping labels apart here — a few relaxation passes, capped so a
      // label never strays far enough from its own branch to mislead.
      for (var pass = 0; pass < 4; pass++) {
        var moved = false;
        for (var i = 0; i < placed.length; i++) {
          if (!placed[i].on) continue;
          for (var j = i + 1; j < placed.length; j++) {
            var A = placed[i], B = placed[j];
            if (!B.on) continue;
            var dx = B.x - A.x, dy = B.y - A.y;
            var ox = (A.w + B.w) / 2 + 8 - Math.abs(dx);
            var oy = (A.h + B.h) / 2 + 6 - Math.abs(dy);
            if (ox <= 0 || oy <= 0) continue;
            // Separate along whichever axis needs the smaller shove.
            if (oy <= ox) {
              var sy = (dy >= 0 ? 1 : -1) * oy / 2;
              A.y -= sy; B.y += sy;
            } else {
              var sx = (dx >= 0 ? 1 : -1) * ox / 2;
              A.x -= sx; B.x += sx;
            }
            moved = true;
          }
        }
        if (!moved) break;
      }

      // Keep every label wholly inside the canvas — on a narrow screen the
      // outermost limbs reach the edge, and a half-cropped link is not one.
      placed.forEach(function (q) {
        if (!q.on) return;
        var hw = q.w / 2 + 4, hh = q.h / 2 + 4;
        q.x = Math.min(Math.max(q.x, hw), Math.max(hw, r.width - hw));
        q.y = Math.min(Math.max(q.y, hh), Math.max(hh, r.height - hh));
      });

      placed.forEach(function (q) {
        q.a.style.left = q.x + 'px';
        q.a.style.top = q.y + 'px';
        q.a.style.opacity = q.on ? '1' : '0';
        // visibility, not just opacity: an invisible link must also leave the
        // tab order, or you can focus something nobody can see.
        q.a.style.visibility = q.on ? '' : 'hidden';
      });
    }

    var LIMB_KEYS = ['shop.html', 'from-here.html', 'symbols.html',
                     'journal.html', 'faq.html', 'contact.html'];

    // ---- grow in, then keep breathing. The scene is ambient after the
    // growth finishes: the canopy sways, the flock walks. Reduced motion
    // renders the finished, still frame and stops.
    var t0 = null, DUR = reduced ? 0 : 2200;
    var last = 0, onScreen = true;

    function frameLoop(now) {
      if (t0 === null) t0 = now;
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      var t = DUR ? Math.min(1, (now - t0) / DUR) : 1;
      var e = 1 - Math.pow(1 - t, 3);

      for (var i = 0; i < surfIdx.length; i++) {
        // Deeper branches finish later, so the tree unfolds outward.
        var d = branches[surfIdx[i]].depth;
        // Strict generations. A child used to start while its parent was a
        // sixth grown, from the point the parent would EVENTUALLY reach — so
        // twigs appeared in mid-air with nothing under them. Now the trunk
        // finishes first, then each generation of limbs in turn, each one
        // beginning only when the wood it grows from is there.
        var gen = d >= 9 ? 0 : (branches[surfIdx[i]].root ? 4 - d : 5 - d);
        // (g0/g1, not t0: t0 is the animation's start time in this scope,
        // and shadowing it stopped the clock.)
        var g0 = Math.max(0, (gen - 0.10) / 6), g1 = (gen + 1) / 6;
        placeBranch(bMesh, i, surfIdx[i], Math.max(0, Math.min(1, (e - g0) / (g1 - g0))));
      }
      bMesh.instanceMatrix.needsUpdate = true;
      jS.instanceMatrix.needsUpdate = true;

      var lt = Math.max(0, (e - 0.78) / 0.22);   // leaves come as the twigs finish
      var swayNow = (reduced || depthP > 0.25) ? 0 : now;
      for (var j = 0; j < clusters.length; j++) placeCluster(j, lt, swayNow);
      lMesh.instanceMatrix.needsUpdate = true;
      for (j = 0; j < masses.length; j++) placeMass(j, lt);
      mMesh.instanceMatrix.needsUpdate = true;

      if (!reduced && depthP < 0.25) stepWalkers(dt);

      yaw += (targetYaw - yaw) * 0.09;
      group.rotation.y = yaw;
      group.updateMatrixWorld();

      renderer.render(scene, camera);
      positionLabels();

      // Ambient motion runs only while the hero is actually on screen; a
      // landing page should not spin a GPU for a tab nobody is looking at.
      if (!reduced && onScreen && depthP < 0.25) requestAnimationFrame(frameLoop);
      else if (t < 1 || Math.abs(targetYaw - yaw) > 0.0005) requestAnimationFrame(frameLoop);
      else { running = false; last = 0; }
    }

    var running = false;
    function kick() { if (!running) { running = true; requestAnimationFrame(frameLoop); } }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        onScreen = es[0].isIntersecting;
        if (onScreen) kick();
      }, { rootMargin: '80px' }).observe(frame);
    }

    // The tree may be laid out at zero size (inside a hidden container, or
    // before fonts settle). Wait for a real box rather than giving up — the
    // SVG stays visible until then, so nothing is missing meanwhile.
    function start() {
      frame.classList.add('is-3d');
      if (section) section.classList.add('is-descent');
      if (svg) svg.setAttribute('aria-hidden', 'true');
      // Adding is-descent makes the section several viewports tall, which
      // changes the stage's box; re-measure before the first frame.
      resize();
      readScroll();
      kick();
    }

    // The tree may be laid out at zero size — inside a container that is
    // still hidden, say. Wait for a real box rather than giving up; the SVG
    // stays visible until then, so nothing is missing meanwhile.
    if (!resize()) {
      if (!('ResizeObserver' in window)) return;
      var wait = new ResizeObserver(function () {
        if (resize()) { wait.disconnect(); start(); }
      });
      wait.observe(frame);
    }

    // No drag. The tree stands where it stands: the descent's taproot is
    // directly beneath it, and a tree you can spin is a model, not a tree.
    canvas.style.touchAction = 'pan-y';

    var scrollQueued = false;
    window.addEventListener('scroll', function () {
      if (scrollQueued) return;
      scrollQueued = true;
      requestAnimationFrame(function () { scrollQueued = false; readScroll(); });
    }, { passive: true });

    window.addEventListener('resize', function () { if (resize()) { t0 = null; kick(); } });
    // Switching language mirrors the layout, and the tree leans the other way.
    if ('MutationObserver' in window) {
      new MutationObserver(function () { if (resize()) kick(); })
        .observe(document.documentElement, { attributes: true, attributeFilter: ['dir'] });
    }
    if ('ResizeObserver' in window) new ResizeObserver(function () { if (resize()) kick(); }).observe(frame);

    if (frame.getBoundingClientRect().width) start();
  }

  // Only fetch Three when the tree is close to being seen.
  function arm() {
    if (!('IntersectionObserver' in window)) { loadThree(build); return; }
    var obs = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { obs.disconnect(); loadThree(build); }
    }, { rootMargin: '300px' });
    obs.observe(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm);
  else arm();
})();
