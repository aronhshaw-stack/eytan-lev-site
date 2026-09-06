// Eytan Lev — shared behavior. Progressive: each feature wires up only if
// its markup exists on the page, so every page includes this one file.
(function () {
  'use strict';

  // ----- language toggle (persists; the inline head script applies it pre-paint)
  function setLang(lang) {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
    try { localStorage.setItem('eyl_lang', lang); } catch (e) {}
    // Copy that lives in JS rather than in twinned spans — status lines,
    // canvas labels — has to be told the language changed.
    document.dispatchEvent(new CustomEvent('eyl:lang', { detail: lang }));
  }

  /* The landing tree is sized against the viewport minus the header, and the
     header's height changes with the language, the font and the breakpoint.
     Publish the measured height so CSS can subtract the real number. */
  function initHeaderHeight() {
    var header = document.querySelector('.site-header');
    if (!header) return;
    function set() {
      document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
    }
    set();
    if ('ResizeObserver' in window) new ResizeObserver(set).observe(header);
    else window.addEventListener('resize', set);
    // Webfonts land after first paint and can change the header's height.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(set);
  }

  /* The root web.

     The roots run out of the bottom of the hero and down the page to the six
     product lines. Paths are generated from where the cards actually land,
     so the drawing follows the layout at any width and in either direction,
     and they are drawn on by scroll — the deeper you go, the further the
     roots have reached. The cards are ordinary links whether or not any of
     this runs. */
  function initRootWeb() {
    var sec = document.querySelector('[data-rootweb]');
    if (!sec) return;
    var svg = sec.querySelector('.rootweb__svg');
    var cards = Array.prototype.slice.call(sec.querySelectorAll('.rootline'));
    if (!svg || !cards.length) return;

    var NS = 'http://www.w3.org/2000/svg';
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var paths = [];

    function bez(x1, y1, cx1, cy1, cx2, cy2, x2, y2) {
      return 'M' + x1 + ',' + y1 + ' C' + cx1 + ',' + cy1 + ' ' +
             cx2 + ',' + cy2 + ' ' + x2 + ',' + y2;
    }

    function add(d, width, cls, colour) {
      var p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('stroke-width', width);
      if (cls) p.setAttribute('class', cls);
      if (colour) p.style.stroke = colour;
      svg.appendChild(p);
      return p;
    }

    // Sample a path so hair roots can be hung off the curve itself rather
    // than off a straight line between its ends — that was what made them
    // float away from the root they belong to.
    function sample(el, n) {
      var out = [], len;
      try { len = el.getTotalLength(); } catch (e) { return out; }
      if (!len) return out;
      for (var i = 0; i <= n; i++) out.push(el.getPointAtLength(len * i / n));
      return out;
    }

    // A root does not keep one thickness the whole way down. Draw it as
    // three overlapping runs, thick at the shoulder, fine at the tip.
    function taper(pts, w0, w1, order, colour) {
      var made = [];
      var cuts = [[0, 0.42], [0.38, 0.76], [0.72, 1]];
      cuts.forEach(function (c, k) {
        var a = Math.floor(c[0] * (pts.length - 1));
        var b = Math.ceil(c[1] * (pts.length - 1));
        var d = 'M' + pts[a].x.toFixed(1) + ',' + pts[a].y.toFixed(1);
        for (var i = a + 1; i <= b; i++) d += ' L' + pts[i].x.toFixed(1) + ',' + pts[i].y.toFixed(1);
        made.push({ el: add(d, (w0 + (w1 - w0) * (k / 2)).toFixed(2), null, colour),
                    order: order + k * 0.02 });
      });
      return made;
    }

    function build() {
      var box = sec.getBoundingClientRect();
      var w = box.width, h = box.height;
      if (!w || !h) return false;

      svg.setAttribute('viewBox', '0 0 ' + Math.round(w) + ' ' + Math.round(h));
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      paths.length = 0;

      var ox = w / 2;
      var head = sec.querySelector('.rootweb__head');
      var hb = head ? head.getBoundingClientRect() : null;
      var headTop = hb ? hb.top - box.top : 0;
      var headBot = hb ? hb.bottom - box.top : 0;
      var made = [];

      // Where each card wants to be met.
      var tips = cards.map(function (card) {
        var t = (card.querySelector('.rootline__tip') || card).getBoundingClientRect();
        return {
          x: t.left - box.left + t.width / 2,
          y: t.top - box.top + t.height / 2,
          colour: (getComputedStyle(card).getPropertyValue('--line-bg') || '').trim() || null
        };
      });

      // The taproot. One continuous run from the top of the section to below
      // the last card, so it grows downward as you scroll instead of
      // appearing in pieces — and not dead straight, because roots are not.
      var startY = 0;
      var endY = Math.min(h - 10, tips[tips.length - 1].y + 90);
      var spinePts = [], N = 80;
      for (var i = 0; i <= N; i++) {
        var u = i / N;
        var y = startY + (endY - startY) * u;
        spinePts.push({ x: ox + Math.sin(u * 5.1 + 0.6) * 7 + Math.sin(u * 11.3) * 3, y: y });
      }
      // A gap where the heading crosses it: the root passes behind the words.
      function run(a, b, width, order) {
        if (b - a < 2) return;
        var d = 'M' + spinePts[a].x.toFixed(1) + ',' + spinePts[a].y.toFixed(1);
        for (var k = a + 1; k <= b; k++) d += ' L' + spinePts[k].x.toFixed(1) + ',' + spinePts[k].y.toFixed(1);
        made.push({ el: add(d, width), order: order });
      }
      function idxAt(y) {
        return Math.max(0, Math.min(N, Math.round((y - startY) / (endY - startY) * N)));
      }
      var gapA = headTop > 24 ? idxAt(headTop - 14) : 0;
      var gapB = idxAt(headBot + 16);
      // Thick at the shoulder, finer as it goes down, in four runs.
      var segs = [[0, 0.26, 8], [0.24, 0.52, 6], [0.5, 0.78, 4.4], [0.76, 1, 3]];
      segs.forEach(function (sg, k) {
        var a = Math.round(sg[0] * N), b = Math.round(sg[1] * N);
        if (b <= gapA || a >= gapB) { run(a, b, sg[2], k * 0.05); return; }
        run(a, Math.min(b, gapA), sg[2], k * 0.05);
        run(Math.max(a, gapB), b, sg[2], k * 0.05);
      });

      // Laterals: each one leaves the taproot just above its own card and
      // runs almost level into it. Short, so the connection is unmistakable.
      var hairSpecs = [];
      tips.forEach(function (tp, i) {
        var fi = idxAt(tp.y - 108);
        var f = spinePts[fi];
        var reach = tp.x - f.x;
        var guide = add(bez(f.x, f.y,
                            f.x + reach * 0.4, f.y + (tp.y - f.y) * 0.5,
                            f.x + reach * 0.86, tp.y - 4,
                            tp.x, tp.y), 0);
        var pts = sample(guide, 34);
        svg.removeChild(guide);
        if (!pts.length) return;
        // Draw order follows the taproot: a lateral starts once the spine
        // has grown past its fork.
        var order = 0.06 + (fi / N) * 0.5;
        made = made.concat(taper(pts, 5.4, 2.6, order, tp.colour));

        var side = reach < 0 ? -1 : 1;
        [0.34, 0.62].forEach(function (u, k) {
          var q = pts[Math.round(u * (pts.length - 1))];
          var len = 16 + k * 12, dy = 26 + k * 12;
          hairSpecs.push({
            d: bez(q.x, q.y, q.x + side * len * 0.35, q.y + dy * 0.45,
                   q.x + side * len * 0.75, q.y + dy * 0.85,
                   q.x + side * len, q.y + dy),
            colour: tp.colour,
            order: order + 0.05 + k * 0.01
          });
        });
      });

      // A few hair roots off the taproot itself, between the forks.
      for (var hj = 0; hj < 7; hj++) {
        var hu = 0.16 + hj * 0.11;
        var hi = idxAt(startY + (endY - startY) * hu);
        if (hi > gapA && hi < gapB) continue;
        var hp = spinePts[hi], hs = hj % 2 ? 1 : -1;
        hairSpecs.push({
          d: bez(hp.x, hp.y, hp.x + hs * 12, hp.y + 18,
                 hp.x + hs * 26, hp.y + 34, hp.x + hs * 34, hp.y + 46),
          colour: null,
          order: 0.08 + hu * 0.6
        });
      }

      hairSpecs.forEach(function (s) {
        made.push({ el: add(s.d, 1.5, 'is-hair', s.colour), order: s.order });
      });

      made.forEach(function (o) {
        var len = 0;
        try { len = o.el.getTotalLength(); } catch (e) { len = 0; }
        if (len && !reduced) {
          o.el.style.strokeDasharray = len;
          o.el.style.strokeDashoffset = len;
        }
        paths.push({ el: o.el, len: len, order: o.order });
      });
      return true;
    }

    // Progress is measured from the moment the section's top reaches the
    // bottom of the viewport to the moment its bottom clears the top: the
    // roots reach their tips at about the point the last card is read.
    function draw() {
      if (reduced) return;
      var box = sec.getBoundingClientRect();
      if (box.height <= 0) return;
      var p = (window.innerHeight - box.top) / box.height;
      p = Math.max(0, Math.min(1, p));
      paths.forEach(function (o) {
        if (!o.len) return;
        // Each run carries its own place in the order, so the web grows from
        // the taproot outward instead of every line filling at once.
        var start = Math.min(0.62, o.order);
        var q = Math.max(0, Math.min(1, (p - start) / (1 - start)));
        o.el.style.strokeDashoffset = o.len * (1 - q);
      });
    }

    var queued = false;
    function onScroll() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; draw(); });
    }

    if (!build()) {
      if ('ResizeObserver' in window) {
        var wait = new ResizeObserver(function () {
          if (build()) { wait.disconnect(); draw(); }
        });
        wait.observe(sec);
      }
    } else {
      draw();
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    var rebuild = null;
    window.addEventListener('resize', function () {
      clearTimeout(rebuild);
      rebuild = setTimeout(function () { build(); draw(); }, 150);
    });
    // The Hebrew layout mirrors, so the web has to be regrown on a switch.
    if ('MutationObserver' in window) {
      new MutationObserver(function () {
        clearTimeout(rebuild);
        rebuild = setTimeout(function () { build(); draw(); }, 60);
      }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    }
  }

  /* The header sheds its glass at the very top of the page and takes it back
     as soon as you scroll. The class marks the top rather than the scrolled
     state, so a page with no JS keeps its glass instead of losing it. */
  function initHeaderScroll() {
    var header = document.querySelector('.site-header');
    if (!header) return;
    // On a page that opens on the night sky, the transparent header is over
    // something dark and has to be drawn in light. Nowhere else does — and
    // "nowhere else" has to mean a descent that is actually on screen, not
    // merely present in the document. The review build keeps every page in
    // one document and shows one at a time, so a descent that is switched
    // off still answers querySelector; asking for its client rects is what
    // tells the two apart. Getting this wrong paints the whole header in
    // cream on a cream page, which is to say paints it invisible.
    function overSky() {
      // Every match, not the first: the review build holds one of each in the
      // same document, and querySelector would stop at a hidden one and call
      // the answer no.
      var all = document.querySelectorAll('[data-descent], [data-dark-top]');
      for (var i = 0; i < all.length; i++) {
        if (all[i].getClientRects().length > 0) return true;
      }
      return false;
    }
    var state = null, queued = false;
    function apply() {
      queued = false;
      var top = window.scrollY <= 24;
      var sky = top && overSky();
      var next = (top ? 't' : '') + (sky ? 's' : '');
      if (next === state) return;
      state = next;
      header.classList.toggle('is-top', top);
      header.classList.toggle('is-over-sky', sky);
    }
    function queue() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(apply);
    }
    apply();
    window.addEventListener('scroll', queue, { passive: true });
    // Which page is on screen can change without a scroll — a hash route in
    // the review build, an in-page anchor here.
    window.addEventListener('hashchange', queue);
    // And it can settle after this runs: anything that lays out on load, or a
    // router that renders its first route in its own DOMContentLoaded handler.
    window.addEventListener('load', queue);
  }

  /* Paper grain.
     Everything drawn on this site is meant to read as ink on a sheet, and a
     sheet has tooth. One noise tile is generated once and handed to CSS as a
     custom property; the stages that want it lay it over themselves. Doing
     it here rather than shipping an image keeps it to about a kilobyte and
     lets the density be tuned in one place. */
  function initPaperGrain() {
    if (!document.querySelector('[data-paper]')) return;
    var N = 128;
    var c = document.createElement('canvas');
    c.width = c.height = N;
    var x = c.getContext('2d');
    if (!x) return;
    var img = x.createImageData(N, N), d = img.data;
    // Deterministic, so the tile is the same sheet every load.
    var g = 4711;
    function grnd() { g = (g * 1103515245 + 12345) & 0x7fffffff; return g / 0x7fffffff; }
    for (var i = 0; i < N * N; i++) {
      // Two octaves: fine tooth over a slower blotch, which is what fibre
      // looks like. Pure white noise reads as television static.
      var px = i % N, py = (i / N) | 0;
      var fine = grnd();
      var slow = 0.5 + 0.5 * Math.sin(px * 0.19 + py * 0.11)
                     * Math.sin(px * 0.07 - py * 0.23);
      var v = 118 + (fine - 0.5) * 46 + (slow - 0.5) * 26;
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
      d[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    try {
      document.documentElement.style.setProperty(
        '--paper', 'url(' + c.toDataURL('image/png') + ')');
    } catch (e) { /* a tainted or unavailable canvas just means no grain */ }
  }

  // ----- the menu button (small screens)
  function initNavToggle() {
    var header = document.querySelector('.site-header');
    var btn = document.querySelector('.nav-toggle');
    if (!header || !btn) return;
    function set(open) {
      header.classList.toggle('nav-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    btn.addEventListener('click', function () { set(!header.classList.contains('nav-open')); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
    header.querySelectorAll('.site-nav a').forEach(function (a) { a.addEventListener('click', function () { set(false); }); });
    if ('ResizeObserver' in window) new ResizeObserver(function () {
      document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
    }).observe(header);
  }

  function initLangToggle() {
    var btn = document.querySelector('.lang-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      setLang(document.documentElement.lang === 'he' ? 'en' : 'he');
    });
  }

  // ----- FAQ accordion
  function initFaq() {
    document.querySelectorAll('.faq-item').forEach(function (item) {
      var q = item.querySelector('.faq-question');
      if (!q) return;
      q.addEventListener('click', function () {
        var open = item.classList.toggle('open');
        q.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });
  }

  // ----- journal category filter
  function initJournalFilter() {
    var filters = document.querySelectorAll('.journal-filter');
    if (!filters.length) return;
    var cards = document.querySelectorAll('.journal-card');
    filters.forEach(function (btn) {
      btn.addEventListener('click', function () {
        filters.forEach(function (f) { f.classList.remove('active'); });
        btn.classList.add('active');
        var cat = btn.getAttribute('data-cat');
        cards.forEach(function (card) {
          card.hidden = cat !== 'all' && card.getAttribute('data-cat') !== cat;
        });
      });
    });
  }

  // ----- waitlist + contact forms.
  // A form posts to whatever data-endpoint names (Formspree, Buttondown, a
  // function of your own — anything that takes a JSON POST). With no
  // endpoint set there is nothing to send to, so the form and its promise
  // are hidden rather than shown and broken: a visitor is never told
  // "we'll be in touch" by a page that cannot keep it. Set the attribute on
  // the form and the whole thing comes back on.
  function initForms() {
    document.querySelectorAll('.waitlist-form, .contact-form').forEach(function (form) {
      var endpoint = (form.getAttribute('data-endpoint') || '').trim();
      var note = form.parentElement.querySelector('.form-note');
      if (!endpoint) {
        form.hidden = true;
        // the "leave an address" line above it is a promise too
        var lead = form.parentElement.querySelector('.sub, .page-intro');
        if (lead && form.classList.contains('waitlist-form')) lead.hidden = true;
        return;
      }
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var data = {};
        form.querySelectorAll('input, textarea').forEach(function (el) { if (el.name || el.id) data[el.name || el.id] = el.value; });
        data.page = location.pathname; data.lang = document.documentElement.lang;
        var btn = form.querySelector('button[type="submit"]');
        if (btn) btn.disabled = true;
        fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(data) })
          .then(function (r) { if (!r.ok) throw new Error(String(r.status)); if (note) note.hidden = false; form.reset(); })
          .catch(function () { if (btn) btn.disabled = false; form.classList.add('is-failed'); })
          .then(function () { if (btn) btn.disabled = false; });
      });
    });
  }

  // ----- shop: search + line filter (no cart — BRAND.md hard rule 8)
  function initShop() {
    var grid = document.querySelector('[data-shop-grid]');
    if (!grid) return;
    var tiles = Array.prototype.slice.call(grid.querySelectorAll('.product-tile'));
    var searchInput = document.querySelector('.shop-search');
    var filters = document.querySelectorAll('.shop-filter');
    var noResults = document.querySelector('.no-results');

    function apply() {
      var q = searchInput ? searchInput.value.trim().toLowerCase() : '';
      var activeBtn = document.querySelector('.shop-filter.active');
      var line = activeBtn ? activeBtn.getAttribute('data-line') : 'all';
      var visible = 0;
      tiles.forEach(function (tile) {
        var matchesLine = line === 'all' || tile.getAttribute('data-line') === line;
        var matchesSearch = !q || (tile.getAttribute('data-search') || '').toLowerCase().indexOf(q) !== -1;
        var show = matchesLine && matchesSearch;
        tile.hidden = !show;
        if (show) visible++;
      });
      if (noResults) noResults.hidden = visible !== 0;
    }

    if (searchInput) searchInput.addEventListener('input', apply);
    filters.forEach(function (btn) {
      btn.addEventListener('click', function () {
        filters.forEach(function (f) { f.classList.remove('active'); });
        btn.classList.add('active');
        apply();
      });
    });
    apply();
  }

  // ----- reveal-on-scroll for the melech spine.
  // Reduced motion is handled in CSS (finished state, no transition), so the
  // class is still applied and nothing depends on the animation running.
  function initReveal() {
    var targets = document.querySelectorAll('[data-reveal]');
    if (!targets.length) return;
    if (!('IntersectionObserver' in window)) {
      targets.forEach(function (t) { t.classList.add('is-revealed'); });
      return;
    }
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('is-revealed');
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.25 });
    targets.forEach(function (t) { obs.observe(t); });
  }

  // ----- tree navigator: link labels and SVG limbs light together
  function initTreeNav() {
    var frame = document.querySelector('.treenav__frame');
    if (!frame) return;
    var labels = frame.querySelectorAll('.treenav__label');
    var groups = frame.querySelectorAll('.tr-group');

    function light(key) {
      groups.forEach(function (g) { g.classList.toggle('is-lit', g.getAttribute('data-key') === key); });
      frame.classList.toggle('has-lit', !!key);
    }

    labels.forEach(function (a) {
      var key = a.getAttribute('data-key');
      ['mouseenter', 'focus'].forEach(function (ev) { a.addEventListener(ev, function () { light(key); }); });
      ['mouseleave', 'blur'].forEach(function (ev) { a.addEventListener(ev, function () { light(null); }); });
    });

    // The limbs themselves are clickable too, mirroring their label — where
    // there is one. The home tree carries no section pins any more (the nav
    // has them), so on that page this loop finds nothing and does nothing.
    groups.forEach(function (g) {
      var key = g.getAttribute('data-key');
      var target = frame.querySelector('.treenav__label[data-key="' + key + '"]');
      if (!target) return;
      g.addEventListener('mouseenter', function () { light(key); });
      g.addEventListener('mouseleave', function () { light(null); });
      g.addEventListener('click', function () { window.location.href = target.getAttribute('href'); });
    });
  }

  // The double helix lives in assets/js/helix.js — it grew past the size
  // where it belonged in the shared bundle, and only one page loads it.

  // ----- tree diagram: a node opens its entry and scrolls to it
  function initTreeDiagram() {
    var nodes = document.querySelectorAll('.vt-node-g[data-target]');
    if (!nodes.length) return;

    function go(id) {
      var target = document.getElementById(id);
      if (!target) return;
      target.open = true;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.querySelectorAll('.vt-node.is-targeted').forEach(function (n) { n.classList.remove('is-targeted'); });
      target.classList.add('is-targeted');
    }

    nodes.forEach(function (n) {
      var id = n.getAttribute('data-target');
      n.addEventListener('click', function () { go(id); });
      n.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(id); }
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initHeaderHeight();
    initNavToggle();
    initHeaderScroll();
    initPaperGrain();
    initLangToggle();
    initReveal();
    initRootWeb();
    initTreeNav();
    // initHelix moved to helix.js
    initTreeDiagram();
    initFaq();
    initJournalFilter();
    initForms();
    initShop();
  });
})();
