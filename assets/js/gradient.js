// Eytan Lev — the growing-regions plot on farms.html.
//
// Rainfall against elevation. Picking a node lists what comes out of that
// region; the diagram is the index and the list is the entry, rather than the
// diagram being a picture next to a list that repeats it.

(function () {
  'use strict';

  function init() {
    var svg = document.querySelector('.grad__svg');
    if (!svg) return;
    var nodes = Array.prototype.slice.call(svg.querySelectorAll('.grad__node'));
    var panels = Array.prototype.slice.call(document.querySelectorAll('[data-region-panel]'));
    if (!nodes.length || !panels.length) return;

    var picked = '';

    function show(key) {
      panels.forEach(function (p) {
        p.hidden = p.getAttribute('data-region-panel') !== key;
      });
      nodes.forEach(function (n) {
        var on = n.getAttribute('data-region') === key;
        n.classList.toggle('is-on', on);
        // Everything that is not the pick recedes, so a region with two crops
        // is as easy to find as one with nine.
        n.classList.toggle('is-off', !!key && !on);
      });
    }

    function pick(key) {
      picked = (picked === key) ? '' : key;
      show(picked);
    }

    nodes.forEach(function (n) {
      var key = n.getAttribute('data-region');
      n.addEventListener('click', function () { pick(key); });
      n.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(key); }
      });
      // Hover previews without committing — you can sweep the plot and read
      // it, and only click when you want the list to stay.
      n.addEventListener('mouseenter', function () { if (!picked) show(key); });
      n.addEventListener('mouseleave', function () { if (!picked) show(''); });
      n.addEventListener('focus', function () { if (!picked) show(key); });
      n.addEventListener('blur', function () { if (!picked) show(''); });
    });

    show('');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
