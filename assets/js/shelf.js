// Eytan Lev — the shelf.
//
// Filtering for produce.html, plus the season wheel that drives it. The wheel
// is a polar histogram: each wedge's length is how many things on the shelf
// are harvested in that month, so before you touch anything it has already
// told you something true — the summer gap, and the fact that the valleys
// carry months the hills cannot.
//
// Everything is done in the DOM against data- attributes the build script
// wrote. There is no client-side copy of the data, so the page cannot drift
// out of sync with content/produce.json.

(function () {
  'use strict';

  function init() {
    var grid = document.querySelector('[data-shelf-section]');
    if (!grid) return;

    var cards = Array.prototype.slice.call(document.querySelectorAll('.pcard'));
    var sections = Array.prototype.slice.call(document.querySelectorAll('[data-shelf-section]'));
    var segs = Array.prototype.slice.call(document.querySelectorAll('.wheel__seg'));
    var status = document.querySelector('[data-shelf-status]');
    var countEl = document.querySelector('[data-wheel-count]');
    var search = document.querySelector('[data-shelf-search]');

    var state = { month: 0, shelf: '', verdict: '', israeli: '', q: '' };

    // The wheel marks today's month whether or not it is selected. A shelf
    // that does not know what month it is has no business calling itself a
    // shelf.
    var now = new Date().getMonth() + 1;
    segs.forEach(function (g) {
      if (+g.getAttribute('data-month') === now) g.classList.add('is-now');
    });

    function matches(card) {
      if (state.shelf && card.getAttribute('data-shelf') !== state.shelf) return false;
      if (state.verdict && card.getAttribute('data-verdict') !== state.verdict) return false;
      if (state.israeli && card.getAttribute('data-israeli') !== state.israeli) return false;
      if (state.month) {
        var s = card.getAttribute('data-season');
        // an empty season means the thing has no harvest of its own — water,
        // a mineral, a mill's output. Those are never "in season", so a month
        // filter hides them rather than pretending.
        if (!s) return false;
        if (s.split(',').indexOf(String(state.month)) < 0) return false;
      }
      if (state.q && card.getAttribute('data-search').indexOf(state.q) < 0) return false;
      return true;
    }

    function apply() {
      var shown = 0;
      cards.forEach(function (c) {
        var on = matches(c);
        c.hidden = !on;
        if (on) shown++;
      });
      // A section header over nothing is worse than no section.
      sections.forEach(function (sec) {
        var any = sec.querySelector('.pcard:not([hidden])');
        sec.hidden = !any;
      });
      if (countEl) countEl.textContent = String(shown);
      if (status) {
        var he = document.documentElement.lang === 'he';
        status.textContent = shown === cards.length
          ? (he ? 'כל המדף' : 'the whole shelf')
          : (he ? shown + ' מתוך ' + cards.length : shown + ' of ' + cards.length);
      }
      segs.forEach(function (g) {
        var on = +g.getAttribute('data-month') === state.month;
        g.classList.toggle('is-on', on);
        g.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    // ----- the wheel
    function pickMonth(m) {
      state.month = (state.month === m) ? 0 : m;
      apply();
    }
    segs.forEach(function (g) {
      var m = +g.getAttribute('data-month');
      g.addEventListener('click', function () { pickMonth(m); });
      g.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickMonth(m); }
      });
    });

    // ----- chips. One value live per group; clicking the live one clears it,
    // which is the behaviour people expect and almost nobody implements.
    Array.prototype.forEach.call(document.querySelectorAll('.chiprow'), function (row) {
      var key = row.getAttribute('data-filter');
      var chips = Array.prototype.slice.call(row.querySelectorAll('.chip'));
      chips.forEach(function (chip) {
        chip.addEventListener('click', function () {
          var v = chip.getAttribute('data-value');
          state[key] = (state[key] === v) ? '' : v;
          chips.forEach(function (c) {
            c.classList.toggle('is-on', c.getAttribute('data-value') === state[key]);
          });
          apply();
        });
      });
    });

    if (search) {
      search.addEventListener('input', function () {
        state.q = search.value.trim().toLowerCase();
        apply();
      });
    }

    // Opening one card should not push the others around, so the details
    // elements are laid out in their own column flow — but a card that is
    // open when a filter hides it would keep its height on the way back.
    // Closing on hide costs nothing and avoids that.
    cards.forEach(function (c) {
      var d = c.querySelector('details');
      if (!d) return;
      d.addEventListener('toggle', function () { c.classList.toggle('is-open', d.open); });
    });

    document.addEventListener('eyl:lang', apply);
    apply();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
