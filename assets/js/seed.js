// Eytan Lev — the seed, under a macro lens.
//
// A twelve-second loop that reverses into itself, so it never cuts: the coat
// splits, a shoot and a root come out, the whole thing settles, and then it
// goes back the way it came. Nothing snaps back to a first frame, because
// every animated quantity is a curve that starts and ends at zero.
//
// The grain is barley — one of the seven species, and the one the omer is
// brought from, which is why it and not a generic bean. It is a solid of
// revolution with the ventral crease pressed into one side, because the
// crease is the whole silhouette of a cereal grain and a smooth ellipsoid
// reads as a pill.
//
// The frame in the soil is the mark's own: a circle and a square in shallow
// relief, and nothing else. No pentagram, no wheel, no geometry the brand has
// not already earned.
//
// 100mm macro at f/2. The lens is the reason the soil goes soft two
// centimetres from the grain, and that softness is baked into the ground
// texture as a radial blur rather than faked with a post pass — at this
// framing the ground IS the out-of-focus region, and blurring it in the
// texture costs nothing and never shimmers.
//
// Reduced motion holds the settled frame: sprouted, still, no loop.

(function () {
  'use strict';

  var frame = document.querySelector('[data-seed]');
  if (!frame) return;

  var THREE_SRC = 'assets/vendor/three.min.js';
  var THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

  var canvas = document.createElement('canvas');
  canvas.className = 'seedframe__canvas';
  canvas.setAttribute('aria-hidden', 'true');
  frame.insertBefore(canvas, frame.firstChild);
  var svg = frame.querySelector('svg');
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
        /* else: the drawn mark stays, which says the same thing */
      };
      document.head.appendChild(s);
    }
    attempt(THREE_SRC);
  }

  // easing used for every stage: smooth at both ends, so a stage that starts
  // and a stage that stops never show a corner
  function ease(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

  function build() {
    if (!window.THREE) return;
    var T = window.THREE;

    var renderer;
    try {
      renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    } catch (e) { return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    if (T.ACESFilmicToneMapping !== undefined) {
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.04;
    }
    if (T.sRGBEncoding !== undefined) renderer.outputEncoding = T.sRGBEncoding;
    renderer.localClippingEnabled = true;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.VSMShadowMap !== undefined ? T.VSMShadowMap : T.PCFSoftShadowMap;

    var scene = new T.Scene();
    // 100mm on full frame: vertical FOV is 2·atan(24/200) = 13.7°.
    var camera = new T.PerspectiveCamera(13.7, 1, 0.5, 100);

    function lin(hex) {
      var c = new T.Color(hex);
      if (T.sRGBEncoding !== undefined && c.convertSRGBToLinear) c.convertSRGBToLinear();
      return c;
    }

    // ---- light. One raking source at 2700K, low and from the left, which is
    // the light that finds a shallow relief: a groove a third of a millimetre
    // deep is invisible from the front and unmistakable at a grazing angle.
    var keyCol = 0xFF9F5A;                                    // 2700K
    var key = new T.DirectionalLight(keyCol, 2.6);
    key.position.set(-4.6, 2.75, -3.2);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5; key.shadow.camera.far = 26;
    key.shadow.camera.left = -4; key.shadow.camera.right = 4;
    key.shadow.camera.top = 4; key.shadow.camera.bottom = -4;
    key.shadow.bias = -0.0009;
    if (key.shadow.normalBias !== undefined) key.shadow.normalBias = 0.06;
    key.shadow.radius = 5;
    if (key.shadow.blurSamples !== undefined) key.shadow.blurSamples = 12;
    scene.add(key);
    // the sky above an evening field: cool, weak, and from straight up
    var sky = new T.HemisphereLight(0x8FA8D0, 0x2A1F14, 0.40);
    scene.add(sky);
    // a weak fill from the camera side so the grain is not a silhouette
    var back = new T.DirectionalLight(0xC8D6FF, 0.42);
    back.position.set(2.4, 1.6, 6);
    scene.add(back);

    // ---- the ground.
    //
    // Soil, with the circle and the square pressed into it. The relief is
    // shallow on purpose: a raised edge catching the key on its left flank
    // and a shadow on its right is all the depth a pressed line has.
    //
    // The radial blur is the lens. At f/2 on a 100mm lens focused at the
    // grain, everything a few centimetres out is gone, and painting that into
    // the texture is both cheaper and steadier than a post-process blur.
    function soilCanvas(withRelief) {
      var n = 2048, c = document.createElement('canvas');
      c.width = c.height = n;
      var x = c.getContext('2d');
      var gs = 20260906;
      function gr() { gs = (gs * 1103515245 + 12345) & 0x7fffffff; return gs / 0x7fffffff; }

      if (withRelief) {
        x.fillStyle = '#6B5334'; x.fillRect(0, 0, n, n);
        // grain of the soil: clods and grit, two scales
        for (var i = 0; i < 19000; i++) {
          var r = 1 + Math.pow(gr(), 2.6) * 22;
          x.globalAlpha = 0.05 + gr() * 0.16;
          x.fillStyle = gr() > 0.5 ? '#8A6E45' : '#3E2E1B';
          x.beginPath(); x.arc(gr() * n, gr() * n, r, 0, Math.PI * 2); x.fill();
        }
        x.globalAlpha = 1;
      } else {
        x.fillStyle = '#808080'; x.fillRect(0, 0, n, n);       // flat normal
      }

      // The frame. A circle and a square, concentric, nothing else.
      var cx = n / 2, cy = n / 2;
      var R = n * 0.095, S = n * 0.084;
      function relief(draw) {
        // the lip the press throws up on the key side
        x.save();
        x.translate(-4, -4);
        x.strokeStyle = withRelief ? 'rgba(206,176,126,0.22)' : 'rgba(180,180,255,0.95)';
        x.lineWidth = withRelief ? 7 : 10;
        draw();
        x.restore();
        // the channel itself, which sits in its own shade
        x.strokeStyle = withRelief ? 'rgba(22,14,7,0.50)' : 'rgba(76,76,255,0.95)';
        x.lineWidth = withRelief ? 8 : 9;
        draw();
      }
      relief(function () {
        x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.stroke();
      });
      relief(function () {
        x.beginPath(); x.rect(cx - S, cy - S, S * 2, S * 2); x.stroke();
      });

      // ---- the lens. One blurred copy, mixed into the sharp one by
      // distance from the grain. The mix is done per pixel rather than
      // through a radial gradient because the browser dithers gradients, and
      // that dither survives minification as rings of dots across the bed.
      var blurC = document.createElement('canvas');
      blurC.width = blurC.height = n;
      var bx = blurC.getContext('2d');
      bx.filter = 'blur(40px)';
      bx.drawImage(c, 0, 0);
      bx.filter = 'none';

      var A = x.getImageData(0, 0, n, n);
      var B = bx.getImageData(0, 0, n, n);
      var a = A.data, bd = B.data;
      var r0 = n * 0.155, r1 = n * 0.52, dr = r1 - r0;
      for (var yy = 0; yy < n; yy++) {
        var dy = yy - cy;
        for (var xx = 0; xx < n; xx++) {
          var dx = xx - cx;
          var t = (Math.sqrt(dx * dx + dy * dy) - r0) / dr;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          t = t * t * (3 - 2 * t);
          var k = (yy * n + xx) * 4;
          a[k]     += (bd[k]     - a[k])     * t;
          a[k + 1] += (bd[k + 1] - a[k + 1]) * t;
          a[k + 2] += (bd[k + 2] - a[k + 2]) * t;
        }
      }
      var out = document.createElement('canvas');
      out.width = out.height = n;
      out.getContext('2d').putImageData(A, 0, 0);
      return out;
    }

    function mip(t) {
      t.generateMipmaps = true;
      t.minFilter = T.LinearMipmapLinearFilter;
      t.magFilter = T.LinearFilter;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return t;
    }
    var soilTex = mip(new T.CanvasTexture(soilCanvas(true)));
    if (T.sRGBEncoding !== undefined) soilTex.encoding = T.sRGBEncoding;
        var soilNorm = mip(new T.CanvasTexture(soilCanvas(false)));
    
    scene.fog = new T.Fog(0x000000, 10, 20);

    var floor = new T.Mesh(
      new T.PlaneGeometry(70, 70),
      new T.MeshStandardMaterial({ color: 0x6B5334, roughness: 1, metalness: 0 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.004;
    scene.add(floor);

    var ground = new T.Mesh(
      new T.PlaneGeometry(10, 10, 1, 1),
      new T.MeshStandardMaterial({
        map: soilTex, normalMap: soilNorm,
        normalScale: new T.Vector2(1.15, 1.15),
        roughness: 1, metalness: 0
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // ---- the grain.
    //
    // A solid of revolution from a real barley profile — plump at the middle,
    // drawn to a point at the brush end, rounded at the embryo end — with the
    // ventral crease pressed down one side afterwards. The crease is what
    // makes it a cereal grain rather than a bean.
    var GRAIN_H = 0.62;
    function grainGeometry(scale, phiStart, phiLength) {
      var prof = [
        [0.000, -1.16], [0.115, -1.10], [0.230, -0.94], [0.320, -0.70],
        [0.386, -0.36], [0.412, 0.00], [0.404, 0.32], [0.360, 0.62],
        [0.286, 0.86], [0.180, 1.03], [0.075, 1.13], [0.000, 1.18]
      ].map(function (q) { return new T.Vector2(q[0] * scale, q[1] * scale); });
      var g = phiLength === undefined
        ? new T.LatheGeometry(prof, 48)
        : new T.LatheGeometry(prof, 26, phiStart, phiLength);
      var pos = g.attributes.position;
      var v = new T.Vector3();
      for (var i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        // flatten a little: a grain is not round in section
        v.z *= 0.84;
        // the crease, on the −z face, deepest at the middle of the grain
        var ang = Math.atan2(v.z, v.x);
        var d = Math.abs(Math.atan2(Math.sin(ang + Math.PI / 2), Math.cos(ang + Math.PI / 2)));
        var w = Math.max(0, 1 - d / 0.62);
        var along = 1 - Math.pow(Math.min(1, Math.abs(v.y) / (1.18 * scale)), 2.2);
        var press = Math.pow(w, 1.7) * 0.30 * along;
        v.x *= (1 - press); v.z *= (1 - press);
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      g.computeVertexNormals();
      return g;
    }

    // the husk: warm straw, matte, with the fine longitudinal ribbing a
    // barley pericarp carries
    var huskTex = (function () {
      var n = 512, c = document.createElement('canvas');
      c.width = c.height = n;
      var x = c.getContext('2d');
      x.fillStyle = '#A8834A'; x.fillRect(0, 0, n, n);
      var hs = 771;
      function hr() { hs = (hs * 1103515245 + 12345) & 0x7fffffff; return hs / 0x7fffffff; }
      for (var i = 0; i < 260; i++) {
        x.strokeStyle = 'rgba(' + (hr() > 0.5 ? '160,124,66' : '224,196,140') + ',' + (0.1 + hr() * 0.3).toFixed(2) + ')';
        x.lineWidth = 0.6 + hr() * 2.2;
        var xx = hr() * n;
        x.beginPath(); x.moveTo(xx, 0); x.lineTo(xx + (hr() - 0.5) * 14, n); x.stroke();
      }
      for (i = 0; i < 900; i++) {
        x.globalAlpha = 0.03 + hr() * 0.07;
        x.fillStyle = hr() > 0.5 ? '#E8D0A0' : '#8A6A34';
        x.beginPath(); x.arc(hr() * n, hr() * n, 1 + hr() * 6, 0, Math.PI * 2); x.fill();
      }
      var t = new T.CanvasTexture(c);
      if (T.sRGBEncoding !== undefined) t.encoding = T.sRGBEncoding;
      return t;
    })();

    // ---- the coat, in two halves that hinge open at the top.
    var seed = new T.Group();
    var TILT = 0.40;
    var SEED_Y = 0.78;
    seed.position.y = SEED_Y;
    seed.rotation.z = TILT;
    scene.add(seed);

    var halves = [];
    [1, -1].forEach(function (sgn) {
      var mat = new T.MeshStandardMaterial({
        map: huskTex, bumpMap: huskTex, bumpScale: 0.0055,
        color: 0xFFFFFF, roughness: 0.78, metalness: 0,
        side: T.DoubleSide
      });
      // phi runs from +z, so [0, π] is the +x half and [π, 2π] the −x half;
      // the seam falls on the ventral crease, which is where a barley grain
      // actually opens
      var m = new T.Mesh(grainGeometry(GRAIN_H, sgn > 0 ? 0 : Math.PI, Math.PI), mat);
      m.castShadow = true; m.receiveShadow = true;
      var hinge = -GRAIN_H * 0.80;
      m.position.y = -hinge;
      var pivot = new T.Group();
      pivot.position.y = hinge;
      pivot.add(m);
      seed.add(pivot);
      halves.push({ pivot: pivot, sgn: sgn, hinge: hinge });
    });

    // ---- the kernel inside. Starch and oil: it scatters light rather than
    // reflecting it, so the same translucency term the canopy uses goes here.
    var kernelMat = new T.MeshStandardMaterial({
      color: 0xA5885A, roughness: 0.80, metalness: 0
    });
    kernelMat.onBeforeCompile = function (sh) {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <lights_fragment_end>',
        [
          '#include <lights_fragment_end>',
          '#if defined( RE_Direct ) && ( NUM_DIR_LIGHTS > 0 )',
          '  {',
          '    vec3 lD = directionalLights[ 0 ].direction;',
          '    float bk = clamp( dot( -geometry.normal, lD ), 0.0, 1.0 );',
          '    float th = clamp( dot( -geometry.viewDir, lD ), 0.0, 1.0 );',
          '    reflectedLight.indirectDiffuse += directionalLights[ 0 ].color',
          '      * diffuseColor.rgb * pow( bk, 1.5 ) * ( 0.25 + 0.75 * pow( th, 2.4 ) ) * 0.30;',
          '  }',
          '#endif'
        ].join('\n'));
    };
    var kernel = new T.Mesh(grainGeometry(GRAIN_H * 0.985), kernelMat);
    kernel.castShadow = true;
    seed.add(kernel);

    // ---- shoot and root. Both grow from the grain and both retract with it.
    function limb(pts, r0, r1, colour, segs) {
      var curve = new T.CatmullRomCurve3(pts.map(function (q) {
        return new T.Vector3(q[0], q[1], q[2]);
      }));
      var g = new T.TubeGeometry(curve, segs || 22, 1, 10, false);
      // taper by hand: TubeGeometry has one radius, so the vertices are
      // scaled toward the spine as a function of how far along they sit
      var pos = g.attributes.position;
      var v = new T.Vector3(), c = new T.Vector3();
      for (var i = 0; i < pos.count; i++) {
        var ring = Math.floor(i / 11);
        var t = Math.min(1, ring / ((segs || 22)));
        curve.getPoint(t, c);
        v.fromBufferAttribute(pos, i);
        var rad = r0 + (r1 - r0) * t;
        v.sub(c).multiplyScalar(rad).add(c);
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      g.computeVertexNormals();
      var m = new T.Mesh(g, new T.MeshStandardMaterial({
        color: colour, roughness: 0.66, metalness: 0
      }));
      m.castShadow = true;
      return m;
    }

    var shootGrp = new T.Group(), rootGrp = new T.Group();
    shootGrp.position.y = GRAIN_H * 0.90;
    rootGrp.position.y = -GRAIN_H * 1.02;
    rootGrp.rotation.z = -TILT;
    seed.add(shootGrp); seed.add(rootGrp);

    // the coleoptile: pale at the base, greening as it goes up
    shootGrp.add(limb([
      [0, 0, 0], [0.02, 0.24, 0.01], [0.06, 0.52, 0.02], [0.05, 0.78, -0.01]
    ], 0.050, 0.018, 0xCBD8A2));
    // the radicle turns down, meets the bed and runs along it; the two
    // seminal roots go out to the sides the same way
    rootGrp.add(limb([
      [0, 0, 0], [0.02, -0.12, 0.06], [0.03, -0.17, 0.22], [0.00, -0.19, 0.40]
    ], 0.034, 0.010, 0xC9BC9A));
    rootGrp.add(limb([
      [0, 0, 0], [-0.12, -0.11, 0.02], [-0.28, -0.17, 0.06], [-0.44, -0.19, 0.03]
    ], 0.024, 0.007, 0xC3B694, 16));
    rootGrp.add(limb([
      [0, 0, 0], [0.13, -0.12, -0.02], [0.30, -0.18, -0.05], [0.46, -0.19, -0.02]
    ], 0.024, 0.007, 0xC3B694, 16));

    // ---- framing
    function resize() {
      var r = frame.getBoundingClientRect();
      if (!r.width) return false;
      var h = Math.round(Math.min(r.width, 460));
      renderer.setSize(r.width, h, false);
      canvas.style.height = h + 'px';
      camera.aspect = r.width / h;
      camera.updateProjectionMatrix();
      // frame the grain, not the ground: the circle and square fall where
      // they fall and are meant to run out of shot
      // 18° down: enough to read the relief in the bed and to keep the
      // horizon out of shot entirely, so the frame is soil and nothing else
      var view = 2.95;
      var d = (view / 2) / Math.tan((camera.fov * Math.PI / 180) / 2);
      var pitch = 18 * Math.PI / 180;
      camera.position.set(0, 0.34 + d * Math.sin(pitch), d * Math.cos(pitch));
      camera.lookAt(0, 0.34, 0);
      // dusk closes in a couple of metres past the subject, so the bed goes
      // to nothing before it can show an edge or a horizon
      scene.fog.near = d + 0.4;
      scene.fog.far = d + 5.0;
      return true;
    }

    // ---- the loop.
    //
    // Twelve seconds. Every quantity is the difference of two smoothsteps, so
    // it leaves zero, does its work and returns to zero before the loop wraps.
    // There is no cut to hide.
    var LOOP = 12000;
    var start = null;

    function pose(u) {
      var open   = ease((u - 0.10) / 0.22) - ease((u - 0.70) / 0.22);
      var sprout = ease((u - 0.30) / 0.24) - ease((u - 0.62) / 0.22);
      var settle = ease((u - 0.50) / 0.18) - ease((u - 0.72) / 0.16);

      halves.forEach(function (h) {
        var hingeY = h.hinge;
        // the coat hinges at the embryo end and opens like a shell
        h.pivot.rotation.z = -h.sgn * open * 0.095;
        h.pivot.position.x = h.sgn * open * 0.014;
        h.pivot.position.y = hingeY + open * 0.010;
      });
      // the kernel swells a little as it takes up water
      var swell = 1 + open * 0.045;
      kernel.scale.set(swell, 1 + open * 0.02, swell);

      shootGrp.scale.set(1, Math.max(0.0001, sprout), 1);
      shootGrp.visible = sprout > 0.004;
      rootGrp.scale.set(1, Math.max(0.0001, sprout), 1);
      rootGrp.visible = sprout > 0.004;

      // it settles into the soil as the root takes: a millimetre, no more
      seed.position.y = SEED_Y - settle * 0.045;
      seed.rotation.z = TILT + Math.sin(u * Math.PI * 2) * 0.012;
    }

    var running = false, onScreen = true;
    function tick(now) {
      if (start === null) start = now;
      var u = ((now - start) % LOOP) / LOOP;
      pose(u);
      renderer.render(scene, camera);
      if (onScreen && !reduced) requestAnimationFrame(tick);
      else running = false;
    }
    function kick() {
      if (running) return;
      running = true;
      requestAnimationFrame(tick);
    }

    function go() {
      frame.classList.add('is-3d');
      if (svg) svg.setAttribute('aria-hidden', 'true');
      if (reduced) {
        // the settled frame: sprouted, still
        pose(0.56);
        renderer.render(scene, camera);
      } else kick();
    }

    if (resize()) go();
    else if ('ResizeObserver' in window) {
      var wait = new ResizeObserver(function () {
        if (resize()) { wait.disconnect(); go(); }
      });
      wait.observe(frame);
    }

    if ('ResizeObserver' in window) {
      new ResizeObserver(function () {
        if (resize() && reduced) { pose(0.56); renderer.render(scene, camera); }
      }).observe(frame);
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        onScreen = es[0].isIntersecting;
        if (onScreen && !reduced) kick();
      }, { rootMargin: '120px' }).observe(frame);
    }
  }

  function arm() {
    if (!('IntersectionObserver' in window)) return loadThree(build);
    var obs = new IntersectionObserver(function (es) {
      if (es[0].isIntersecting) { obs.disconnect(); loadThree(build); }
    }, { rootMargin: '300px' });
    obs.observe(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm);
  else arm();
})();
