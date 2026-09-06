// Eytan Lev — the double helix, as an object under a lens.
//
// The previous version drew a helix with Canvas 2D: tubes stroked five times
// to fake a cylinder, spheres pre-rendered as sprites, a hand-rolled painter's
// algorithm. It was a good drawing. It was still a drawing — every highlight
// was painted where a highlight ought to be rather than put there by a light,
// and nothing in it could refract, because a 2D canvas has no idea what is
// behind anything.
//
// This is the same molecule, lit. Frosted fused quartz for the backbones,
// brilliant-cut gems for the nucleotides, a 3200K key above and to the left,
// a 5600K rim behind, and a black void to sit in. The specular highlights are
// reflections of a real environment; the facets on a gem catch the key at
// different angles because they ARE at different angles.
//
// The geometry is real B-DNA and unchanged from the drawing it replaces:
//   rise 3.4 Å per base pair, 10.5 base pairs per turn, radius 10 Å, and the
//   two strands offset by 135° rather than 180°. That offset is the whole
//   reason DNA has a narrow minor groove and a wide major one.
//
// If there is no WebGL this file does nothing at all and helix.js draws the
// 2D version instead. The flag is set synchronously, before helix.js's own
// DOMContentLoaded handler can run, so the two never both render.

(function () {
  'use strict';

  var canvas = document.querySelector('[data-helix]');
  if (!canvas) return;

  // Claim the canvas only if WebGL will actually come up. This has to be a
  // real context test, not a feature sniff: a machine can have the API and
  // still refuse to give you a context.
  function webglOK() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext &&
                (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }
  if (!webglOK()) return;
  window.__eylHelix3D = true;

  var THREE_SRC = 'assets/vendor/three.min.js';
  var THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

  function loadThree(cb) {
    if (window.THREE) return cb();
    var tried = 0;
    function attempt(src) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = cb;
      s.onerror = function () {
        if (++tried === 1 && src !== THREE_CDN) return attempt(THREE_CDN);
        // three never arrived: hand the canvas back to the 2D renderer
        window.__eylHelix3D = false;
        if (window.__eylHelixFallback) window.__eylHelixFallback();
      };
      document.head.appendChild(s);
    }
    attempt(THREE_SRC);
  }

  // ===================== the molecule =====================================
  var M = {
    bp: 18,               // base pairs in shot
    bpPerTurn: 10.5,      // B-DNA
    rise: 0.34,           // one unit is 10 Å, so 3.4 Å is 0.34
    radius: 1.0,          // 10 Å to the backbone
    minorPhase: 2.356,    // 135°, the groove asymmetry — not π
    tilt: 0.35,           // ~20° in the picture plane
    tube: 0.098,          // backbone radius
    lift: 0.045           // how far a hovered pair rises — about 4mm at scale
  };
  // Which pairs carry a written pairing. Six of eighteen: the rest being
  // ordinary is what makes these six read as picked out of a molecule.
  var MARKED = [2, 5, 8, 11, 14, 17];

  // A/T warm — gold and rose. C/G cool — sapphire and emerald.
  var BASES = {
    A: 0xC98A1E, T: 0xC24659,
    C: 0x1E3FC4, G: 0x0B8B58
  };
  // A sequence that alternates the two families, so the eye reads the warm
  // pairs and the cool ones as two kinds of thing.
  var SEQ = 'ATCGATCGCGATATCGAT';

  function build() {
    if (!window.THREE) return;
    var T = window.THREE;
    var stage = canvas.closest('.helix__stage') || canvas.parentNode;
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var renderer;
    try {
      renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    } catch (e) { window.__eylHelix3D = false; if (window.__eylHelixFallback) window.__eylHelixFallback(); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    if (T.ACESFilmicToneMapping !== undefined) {
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
    }
    if (T.sRGBEncoding !== undefined) renderer.outputEncoding = T.sRGBEncoding;
    renderer.setClearColor(0x050507, 1);

    var scene = new T.Scene();
    // 85mm macro on full frame: vertical FOV is 2·atan(24/170) = 16.1°. A long
    // lens is what makes a small object read as a specimen rather than as a
    // model — it flattens perspective and it is what a macro plate looks like.
    var camera = new T.PerspectiveCamera(16.1, 1, 0.5, 200);

    // ---- the environment.
    //
    // Glass has no colour of its own; what you see in it is the room. So the
    // room is built first: a black void with two sources in it, the warm key
    // over the left shoulder and the cool rim behind. Every highlight on
    // every facet below is a reflection of this image, which is why they land
    // in different places on different facets instead of being painted on.
    var envTex = (function () {
      var w = 512, h = 256, c = document.createElement('canvas');
      c.width = w; c.height = h;
      var x = c.getContext('2d');
      x.fillStyle = '#040406'; x.fillRect(0, 0, w, h);
      function blob(cx, cy, r, col, a) {
        var g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, 'rgba(' + col + ',' + a + ')');
        g.addColorStop(0.45, 'rgba(' + col + ',' + (a * 0.30).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(' + col + ',0)');
        x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
      }
      // 3200K key, up and to the left
      blob(w * 0.20, h * 0.20, w * 0.20, '255,187,122', 1.0);
      // a soft box for it to sit in, so the reflection has an edge
      x.fillStyle = 'rgba(255,196,140,0.5)';
      x.fillRect(w * 0.13, h * 0.10, w * 0.14, h * 0.10);
      // 5600K rim, behind and low
      blob(w * 0.72, h * 0.60, w * 0.26, '255,243,233', 0.85);
      // a cold floor bounce, very dim
      blob(w * 0.45, h * 0.95, w * 0.40, '120,150,200', 0.22);
      var t = new T.CanvasTexture(c);
      t.mapping = T.EquirectangularReflectionMapping;
      if (T.sRGBEncoding !== undefined) t.encoding = T.sRGBEncoding;
      return t;
    })();
    var envMap = envTex;
    try {
      var pmrem = new T.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      envMap = pmrem.fromEquirectangular(envTex).texture;
      pmrem.dispose();
    } catch (e) { /* the raw equirect still works as a reflection map */ }

    // ---- lights. The env map supplies reflection; these supply the diffuse
    // shaping and the shadow terminator that tells you the object is round.
    var key = new T.DirectionalLight(0xFFBB7A, 1.05);     // 3200K
    key.position.set(-4.5, 6.5, 3.5);
    scene.add(key);
    var rim = new T.DirectionalLight(0xFFF3E9, 1.55);     // 5600K
    rim.position.set(3.2, 1.4, -6.5);
    scene.add(rim);
    var floor = new T.DirectionalLight(0x6E88B8, 0.22);
    floor.position.set(0.5, -5, 2);
    scene.add(floor);

    // ---- micro-scratches, as roughness rather than as normals.
    //
    // A polished quartz rod that has been handled is not uniformly smooth:
    // it carries fine circumferential scratches, and what they do is change
    // how tight the highlight is along their length. Driving ROUGHNESS with
    // them rather than the normal is both cheaper and truer — the scratch
    // does not change which way the surface faces, it changes how it scatters.
    var scratchMap = (function () {
      var n = 512, c = document.createElement('canvas');
      c.width = c.height = n;
      var x = c.getContext('2d');
      x.fillStyle = '#3A3A3A'; x.fillRect(0, 0, n, n);   // base roughness
      var ss = 8677;
      function sr() { ss = (ss * 1103515245 + 12345) & 0x7fffffff; return ss / 0x7fffffff; }
      for (var i = 0; i < 420; i++) {
        var y = sr() * n, len = 20 + sr() * 260, x0 = sr() * n;
        x.strokeStyle = 'rgba(' + (sr() > 0.5 ? '150,150,150' : '20,20,20') + ',' + (0.05 + sr() * 0.22).toFixed(3) + ')';
        x.lineWidth = 0.5 + sr() * 1.6;
        x.beginPath();
        x.moveTo(x0, y);
        x.lineTo(x0 + len, y + (sr() - 0.5) * 5);
        x.stroke();
      }
      // and a slow cloud, so the frosting is uneven the way ground glass is
      for (i = 0; i < 90; i++) {
        var r = 12 + sr() * 90;
        x.globalAlpha = 0.05 + sr() * 0.09;
        x.fillStyle = sr() > 0.5 ? '#8A8A8A' : '#1C1C1C';
        x.beginPath(); x.arc(sr() * n, sr() * n, r, 0, Math.PI * 2); x.fill();
      }
      x.globalAlpha = 1;
      var t = new T.CanvasTexture(c);
      t.wrapS = t.wrapT = T.RepeatWrapping;
      t.repeat.set(3, 14);
      return t;
    })();

    // ---- frosted fused quartz.
    //
    // Not glass-as-transparency. Quartz reads as quartz because of three
    // things at once: a bright, slightly rough specular that smears the
    // reflection instead of mirroring it; a clearcoat over the top that
    // stays sharp; and enough body that light gets into it and comes back
    // out paler than it went in. The last of those is the emissive term —
    // a cheat for internal scatter, and the reason the rods glow along their
    // length instead of only at the edges.
    var quartz = new T.MeshPhysicalMaterial({
      color: 0x3B4E58,
      roughness: 0.19,
      roughnessMap: scratchMap,
      metalness: 0.0,
      envMap: envMap,
      envMapIntensity: 2.4,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
      transparent: true,
      opacity: 0.46,
      // a little internal scatter, which is what "fused" means — light gets
      // in, bounces, and leaves paler than it arrived
      emissive: 0x081013,
      emissiveIntensity: 0.35,
      side: T.DoubleSide,
      depthWrite: false
    });

    // the base-pair rods: the same quartz, thinner and a shade cooler
    var quartzRod = quartz.clone();
    quartzRod.opacity = 0.40;
    quartzRod.color = new T.Color(0x35464F);
    quartzRod.roughness = 0.14;

    // ---- the helix.
    function strandPoint(i, phase, r) {
      var a = (i / M.bpPerTurn) * Math.PI * 2 + phase;
      var rr = r === undefined ? M.radius : r;
      return new T.Vector3(
        Math.cos(a) * rr,
        (i - (M.bp - 1) / 2) * M.rise,
        Math.sin(a) * rr
      );
    }

    var root = new T.Group();
    root.rotation.z = M.tilt;
    scene.add(root);

    var strandGroups = [new T.Group(), new T.Group()];
    strandGroups.forEach(function (g) { root.add(g); });

    // Backbones as one swept tube each, not as a run of segments: a tube
    // along a spline has no joints to show and takes a continuous highlight
    // down its length, which is most of what says "one drawn rod of glass".
    [0, 1].forEach(function (sIdx) {
      var pts = [];
      for (var i = 0; i <= (M.bp - 1) * 8; i++) {
        pts.push(strandPoint(i / 8, sIdx * M.minorPhase));
      }
      var curve = new T.CatmullRomCurve3(pts);
      var geo = new T.TubeGeometry(curve, (M.bp - 1) * 10, M.tube, 16, false);
      var mesh = new T.Mesh(geo, sIdx === 0 ? quartz : quartz.clone());
      if (sIdx === 1) { mesh.material.color = new T.Color(0x40544B); }
      mesh.renderOrder = 2;
      strandGroups[sIdx].add(mesh);
    });

    // ---- a brilliant cut.
    //
    // Eight-fold, table on top, girdle, pavilion to a point. Lathed and left
    // flat-shaded, so every facet is genuinely planar and takes the key at
    // its own angle. That is the whole difference between a gem and a
    // coloured sphere: a sphere has one highlight, a gem has a dozen and they
    // move independently.
    var gemGeo = (function () {
      var prof = [
        new T.Vector2(0.00, 0.46),
        new T.Vector2(0.34, 0.46),   // table
        new T.Vector2(0.62, 0.24),   // crown
        new T.Vector2(0.68, 0.08),   // girdle top
        new T.Vector2(0.68, -0.02),  // girdle
        new T.Vector2(0.40, -0.42),  // pavilion
        new T.Vector2(0.00, -0.62)   // culet
      ];
      var g = new T.LatheGeometry(prof, 8);
      g.computeVertexNormals();
      return g;
    })();

    function gemMaterial(hex) {
      return new T.MeshPhysicalMaterial({
        color: hex,
        roughness: 0.045,
        metalness: 0.0,
        envMap: envMap,
        envMapIntensity: 1.7,
        clearcoat: 1.0,
        clearcoatRoughness: 0.02,
        reflectivity: 1.0,
        flatShading: true,
        // A gem does not glow. Everything bright on it is a reflection, and
        // that is exactly why the highlights move when the stone turns.
        emissive: hex,
        emissiveIntensity: 0.045
      });
    }
    var gemMats = {};
    Object.keys(BASES).forEach(function (k) { gemMats[k] = gemMaterial(BASES[k]); });

    var COMPLEMENT = { A: 'T', T: 'A', C: 'G', G: 'C' };

    // ---- base pairs. Each one is its own group so it can be lifted.
    var pairs = [];
    for (var i = 0; i < M.bp; i++) {
      var g = new T.Group();
      var a = strandPoint(i, 0);
      var b = strandPoint(i, M.minorPhase);
      var mid = a.clone().add(b).multiplyScalar(0.5);
      var mk = MARKED.indexOf(i);
      var letter = SEQ.charAt(i % SEQ.length);
      var comp = COMPLEMENT[letter];

      // the two half-rods, meeting at the hydrogen bond in the middle
      [[a, mid, letter], [b, mid, comp]].forEach(function (seg) {
        var from = seg[0], to = seg[1];
        var dir = to.clone().sub(from);
        var len = dir.length();
        var rod = new T.Mesh(
          new T.CylinderGeometry(0.042, 0.030, len * 0.72, 10, 1, true),
          quartzRod
        );
        rod.position.copy(from).addScaledVector(dir, 0.36);
        rod.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.clone().normalize());
        rod.renderOrder = 1;
        g.add(rod);

        // the nucleotide, seated where the rod leaves the backbone
        var gem = new T.Mesh(gemGeo, gemMats[seg[2]]);
        var sc = mk >= 0 ? 0.40 : 0.17;
        gem.scale.setScalar(sc);
        gem.position.copy(from).addScaledVector(dir, 0.40);
        gem.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.clone().normalize());
        gem.rotateY(i * 0.7);
        gem.renderOrder = 3;
        g.add(gem);
      });

      // the sugar-phosphate node on each backbone: a small quartz bead
      [a, b].forEach(function (p) {
        var bead = new T.Mesh(new T.SphereGeometry(0.118, 18, 14), quartz);
        bead.position.copy(p);
        bead.renderOrder = 2;
        g.add(bead);
      });

      root.add(g);
      pairs.push({ g: g, i: i, mk: mk, mid: mid, out: mid.clone().normalize(), lift: 0 });
    }

    // ---- a faint shaft through the specimen.
    //
    // Volumetric light needs a medium, and a black void has none — so the
    // shaft is a single additive card behind the glass, angled with the key.
    // At six per cent it is not a beam, it is the suggestion that the air has
    // something in it, which is all a macro plate ever shows.
    (function shaft() {
      var n = 256, c = document.createElement('canvas');
      c.width = c.height = n;
      var x = c.getContext('2d');
      var g = x.createLinearGradient(0, 0, n, n);
      g.addColorStop(0, 'rgba(255,196,140,0.55)');
      g.addColorStop(0.5, 'rgba(255,214,170,0.16)');
      g.addColorStop(1, 'rgba(255,232,200,0)');
      x.fillStyle = g; x.fillRect(0, 0, n, n);
      var v = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,1)');
      x.globalCompositeOperation = 'destination-out';
      x.fillStyle = v; x.fillRect(0, 0, n, n);
      var t = new T.CanvasTexture(c);
      var m = new T.Mesh(new T.PlaneGeometry(9, 9), new T.MeshBasicMaterial({
        map: t, transparent: true, opacity: 0.06, blending: T.AdditiveBlending,
        depthWrite: false, depthTest: false
      }));
      m.position.set(-1.2, 0.6, -3.4);
      m.rotation.z = -0.5;
      m.renderOrder = 0;
      scene.add(m);
    })();

    // ---- framing
    var dist = 22;
    function resize() {
      var r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / r.height;
      camera.updateProjectionMatrix();
      // fit the molecule's height, allowing for the tilt
      var span = (M.bp - 1) * M.rise;
      var half = (span / 2) * Math.cos(M.tilt) + M.radius * Math.abs(Math.sin(M.tilt)) + 0.55;
      var vFov = camera.fov * Math.PI / 180;
      var dH = half / Math.tan(vFov / 2);
      var halfW = M.radius + 0.5;
      var dW = halfW / Math.tan(vFov / 2) / camera.aspect;
      dist = Math.max(dH, dW) * 1.04;
      camera.position.set(0, 0, dist);
      camera.lookAt(0, 0, 0);
      return true;
    }

    // ---- the turn: dragged, with inertia, and it stops.
    //
    // Not an auto-orbit. A specimen that spins by itself is a product page;
    // one that holds still until you turn it and then coasts to a stop is an
    // object on a table. Angular velocity decays at about 6% a frame, which
    // is roughly the feel of something with mass on a good bearing.
    var yaw = -0.35, vel = 0, target = null, dragging = false, lastX = 0, moved = false;

    canvas.addEventListener('pointerdown', function (e) {
      dragging = true; moved = false; lastX = e.clientX; target = null; vel = 0;
      canvas.classList.add('is-dragging');
      canvas.setPointerCapture(e.pointerId);
      kick();
    });
    canvas.addEventListener('pointermove', function (e) {
      var r = canvas.getBoundingClientRect();
      if (dragging) {
        var dx = e.clientX - lastX;
        if (Math.abs(dx) > 2) moved = true;
        yaw += dx * 0.008;
        vel = dx * 0.008;
        lastX = e.clientX;
        kick();
        return;
      }
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      pointerIn = true;
      kick();
    });
    canvas.addEventListener('pointerup', function (e) {
      canvas.classList.remove('is-dragging');
      if (dragging && !moved) pickAt(e);
      dragging = false;
      kick();
    });
    canvas.addEventListener('pointercancel', function () {
      dragging = false; canvas.classList.remove('is-dragging');
    });
    canvas.addEventListener('pointerleave', function () {
      pointerIn = false; hover = -1; setLabel(-1); kick();
    });

    // ---- picking and the hover lift
    var ray = new T.Raycaster();
    var pointer = new T.Vector2();
    var pointerIn = false;
    var hover = -1, active = 0;

    function markedHit() {
      if (!pointerIn) return -1;
      ray.setFromCamera(pointer, camera);
      var best = -1, bestD = Infinity;
      for (var k = 0; k < pairs.length; k++) {
        if (pairs[k].mk < 0) continue;
        var hits = ray.intersectObjects(pairs[k].g.children, false);
        if (hits.length && hits[0].distance < bestD) { bestD = hits[0].distance; best = pairs[k].mk; }
      }
      return best;
    }

    function pickAt() {
      var h = markedHit();
      if (h >= 0) setPair(h);
    }

    // ---- the label that rides with the pair
    var label = document.createElement('p');
    label.className = 'helix__tip';
    label.setAttribute('aria-hidden', 'true');
    stage.appendChild(label);
    var TIPS = [];
    Array.prototype.forEach.call(document.querySelectorAll('.helix__pair'), function (pn, k) {
      var en = pn.querySelector('h3 [data-lang="en"]');
      var he = pn.querySelector('h3 [data-lang="he"]');
      var tag = pn.querySelector('.hpill');
      TIPS[k] = {
        en: en ? en.textContent.trim() : '',
        he: he ? he.textContent.trim() : '',
        note: tag ? (tag.querySelector('[data-lang="en"]') || tag).textContent.trim() : ''
      };
    });
    function setLabel(k) {
      if (k < 0 || !TIPS[k]) { label.classList.remove('is-on'); return; }
      var he = document.documentElement.lang === 'he';
      var t = TIPS[k];
      label.textContent = (he ? (t.he || t.en) : t.en) + (t.note ? ' · ' + t.note : '');
      label.classList.add('is-on');
    }

    // ---- the picker buttons and panels, unchanged in contract
    var dots = Array.prototype.slice.call(document.querySelectorAll('.helix__dot'));
    var panels = Array.prototype.slice.call(document.querySelectorAll('.helix__pair'));

    function faceTo(k) {
      var bp = MARKED[k];
      // bring that pair's strand-0 point to the front of the object
      var base = (bp / M.bpPerTurn) * Math.PI * 2;
      target = -Math.PI / 2 - base;
      while (target - yaw > Math.PI) target -= Math.PI * 2;
      while (target - yaw < -Math.PI) target += Math.PI * 2;
    }
    function setPair(k, turn) {
      active = k;
      dots.forEach(function (d) { d.classList.toggle('is-active', +d.getAttribute('data-pair') === k); });
      panels.forEach(function (pn) { pn.classList.toggle('is-active', +pn.getAttribute('data-pair') === k); });
      if (turn !== false) faceTo(k);
      kick();
    }
    dots.forEach(function (d) {
      d.addEventListener('click', function () { setPair(+d.getAttribute('data-pair')); });
    });

    // strand toggles keep working: hiding one is how you read the other
    Array.prototype.forEach.call(document.querySelectorAll('.helix__strand'), function (btn) {
      btn.addEventListener('click', function () {
        var s = +btn.getAttribute('data-strand');
        var other = strandGroups[1 - s];
        if (!strandGroups[s].visible) { /* turning back on */ }
        else if (!other.visible) return;          // never hide both
        strandGroups[s].visible = !strandGroups[s].visible;
        btn.setAttribute('aria-pressed', strandGroups[s].visible ? 'true' : 'false');
        kick();
      });
    });

    // ---- the loop
    var running = false, raf = null, onScreen = true;
    function tick() {
      raf = null;
      var busy = false;

      if (!dragging) {
        if (target !== null) {
          var d = target - yaw;
          yaw += d * 0.10;
          if (Math.abs(d) < 0.0015) { yaw = target; target = null; }
          busy = true;
        } else if (Math.abs(vel) > 0.00012) {
          yaw += vel;
          vel *= 0.94;                 // inertia, and it comes to rest
          busy = true;
        }
      } else busy = true;
      root.rotation.y = yaw;

      var want = dragging ? -1 : markedHit();
      if (want !== hover) { hover = want; setLabel(hover); }

      for (var k = 0; k < pairs.length; k++) {
        var pr = pairs[k];
        var goal = (pr.mk >= 0 && (pr.mk === hover || pr.mk === active)) ? 1 : 0;
        if (Math.abs(pr.lift - goal) > 0.002) {
          pr.lift += (goal - pr.lift) * 0.16;
          busy = true;
        } else pr.lift = goal;
        var amt = pr.lift * M.lift;
        pr.g.position.set(pr.out.x * amt, 0, pr.out.z * amt);
        pr.g.scale.setScalar(1 + pr.lift * 0.06);
      }

      renderer.render(scene, camera);

      if (hover >= 0) {
        // the tip follows the pair it belongs to
        var pr2 = pairs[MARKED[hover]];
        var v = pr2.mid.clone().applyMatrix4(root.matrixWorld).project(camera);
        var r = canvas.getBoundingClientRect();
        label.style.left = ((v.x * 0.5 + 0.5) * r.width).toFixed(1) + 'px';
        label.style.top = ((-v.y * 0.5 + 0.5) * r.height).toFixed(1) + 'px';
      }

      if (busy && onScreen && !reduced) raf = requestAnimationFrame(tick);
      else running = false;
    }
    function kick() {
      if (reduced) { root.rotation.y = yaw; renderer.render(scene, camera); return; }
      if (!running) { running = true; raf = requestAnimationFrame(tick); }
    }

    // The canvas may be laid out at zero size before fonts settle. Wait for a
    // real box rather than giving up.
    if (resize()) start();
    else if ('ResizeObserver' in window) {
      var wait = new ResizeObserver(function () {
        if (resize()) { wait.disconnect(); start(); }
      });
      wait.observe(canvas);
    }

    function start() {
      stage.classList.add('is-live', 'is-3d');
      setPair(0, false);
      faceTo(0);
      yaw = target; target = null;
      root.rotation.y = yaw;
      renderer.render(scene, camera);
      kick();
    }

    if ('ResizeObserver' in window) {
      new ResizeObserver(function () { if (resize()) kick(); }).observe(canvas);
    } else {
      window.addEventListener('resize', function () { if (resize()) kick(); });
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        onScreen = es[0].isIntersecting;
        if (onScreen) kick();
      }, { threshold: 0.05 }).observe(canvas);
    }
    document.addEventListener('eyl:lang', function () { setLabel(hover); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { loadThree(build); });
  } else {
    loadThree(build);
  }
})();
