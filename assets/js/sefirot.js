// Eytan Lev — the value tree's sefirot diagram.
//
// The drawing was a wireframe: thin circles joined by thin lines, all of it
// at one weight, so nothing told you where to start reading or what was
// connected to what. Two things fix that, and both come out of what the
// structure actually means rather than out of decoration.
//
// The light descends. Hishtalshelut — the chaining-down — is the idea the
// diagram is drawn from: light enters at the top and passes through each
// vessel to the one below. So a pulse runs down every channel in turn,
// staged by how far down the channel starts. It takes about nine seconds and
// then rests, because a diagram that never stops moving cannot be read.
//
// And hovering a node lights only what it is joined to. The graph has twenty
// channels; without that you can trace one by eye, but you cannot see a
// node's neighbourhood at a glance, which is the one thing this shape is
// good at showing.
//
// Connectivity is derived by matching line endpoints to node centres, so the
// markup needs no data attributes and cannot fall out of step with the
// drawing.

(function () {
  'use strict';

  var CYCLE = 9000;      // ms for one full descent, including the rest
  var TRAVEL = 1500;     // ms a pulse takes to cross one channel
  var SPAN = 700;        // the drawing's own vertical extent, in viewBox units

  function init() {
    var svg = document.querySelector('.vt-sefirot');
    if (!svg) return;
    var NS = 'http://www.w3.org/2000/svg';
    var edges = Array.prototype.slice.call(svg.querySelectorAll('.vt-edge'));
    var nodes = Array.prototype.slice.call(svg.querySelectorAll('.vt-node-g'));
    if (!edges.length || !nodes.length) return;

    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---- match endpoints to centres
    function key(x, y) { return Math.round(x) + ':' + Math.round(y); }
    var byPoint = {};
    nodes.forEach(function (g) {
      var c = g.querySelector('.vt-node-c');
      if (!c) return;
      byPoint[key(+c.getAttribute('cx'), +c.getAttribute('cy'))] = g;
    });

    var links = edges.map(function (e) {
      var x1 = +e.getAttribute('x1'), y1 = +e.getAttribute('y1');
      var x2 = +e.getAttribute('x2'), y2 = +e.getAttribute('y2');
      // orient every channel downward, so a pulse always runs the way the
      // light is supposed to
      if (y2 < y1 || (y2 === y1 && x2 < x1)) {
        var tx = x1, ty = y1; x1 = x2; y1 = y2; x2 = tx; y2 = ty;
      }
      return {
        el: e, x1: x1, y1: y1, x2: x2, y2: y2,
        len: Math.hypot(x2 - x1, y2 - y1),
        a: byPoint[key(x1, y1)] || null,
        b: byPoint[key(x2, y2)] || null
      };
    });

    // ---- the descent. One short bright dash per channel, released when the
    // light reaches the top of that channel.
    if (!reduced) {
      var host = svg.querySelector('.vt-edges');
      links.forEach(function (l) {
        var g = document.createElementNS(NS, 'line');
        g.setAttribute('class', 'vt-flow');
        g.setAttribute('x1', l.x1); g.setAttribute('y1', l.y1);
        g.setAttribute('x2', l.x2); g.setAttribute('y2', l.y2);
        var dash = Math.min(26, l.len * 0.4);
        g.style.strokeDasharray = dash + ' ' + (l.len + dash);
        g.style.strokeDashoffset = String(l.len + dash);
        g.style.animationDuration = TRAVEL + 'ms';
        // a channel starting further down is reached later
        g.style.animationDelay = Math.round((l.y1 / SPAN) * (CYCLE * 0.5)) + 'ms';
        g.style.setProperty('--flow-len', (l.len + dash).toFixed(1));
        l.flow = g;
        host.appendChild(g);
      });
      svg.style.setProperty('--vt-cycle', CYCLE + 'ms');
      svg.classList.add('is-flowing');
    }

    // ---- neighbourhood. Hover or focus a vessel and only its own channels
    // stay lit; everything else recedes rather than disappearing, because the
    // shape of the whole is part of what you are being shown.
    function light(g) {
      svg.classList.toggle('is-focused', !!g);
      nodes.forEach(function (n) { n.classList.remove('is-lit', 'is-near'); });
      links.forEach(function (l) { l.el.classList.remove('is-lit'); });
      if (!g) return;
      g.classList.add('is-lit');
      links.forEach(function (l) {
        if (l.a === g || l.b === g) {
          l.el.classList.add('is-lit');
          if (l.a && l.a !== g) l.a.classList.add('is-near');
          if (l.b && l.b !== g) l.b.classList.add('is-near');
        }
      });
    }

    nodes.forEach(function (g) {
      g.addEventListener('mouseenter', function () { light(g); });
      g.addEventListener('mouseleave', function () { light(null); });
      g.addEventListener('focus', function () { light(g); });
      g.addEventListener('blur', function () { light(null); });
    });
    svg.addEventListener('mouseleave', function () { light(null); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
