// Eytan Lev — the hero film, scrubbed by scroll.
//
// A rendered film (star field → seed → tree) sits above the descent on the
// home page. It never plays as a movie: its currentTime is driven by how far
// the page has scrolled through its own track, so scrolling down runs it
// forward and scrolling up runs it back. The descent below is untouched —
// this section has its own track and hands off at its foot.
//
// FLAG. The section is `hidden` in the markup and stays that way until
// data-hero-video carries a path. To turn it on: set data-hero-video (the
// mp4) and data-hero-poster (a still) on the section. To revert: empty the
// attribute, or delete the section — nothing else references it.
//
// Fallbacks. Reduced motion, Save-Data, or a 2G/3G connection get the poster
// as a plain full-height still and no film is fetched. A film that fails to
// load falls back the same way; with no poster either, the section stays
// hidden and the page is exactly what it was before.
//
// Encoding note for whoever renders the film: scrubbing seeks on every frame,
// so the file wants a keyframe every few frames (ffmpeg: -g 4, or all-intra)
// and a modest bitrate. A normal 250-frame GOP will stutter on every seek.

(function () {
  'use strict';

  var section = document.querySelector('[data-hero-video]');
  if (!section) return;
  var src = section.getAttribute('data-hero-video') || '';
  var poster = section.getAttribute('data-hero-poster') || '';
  var TRACK = +(section.getAttribute('data-hero-track') || 320);   // svh of scroll
  if (!src) return;                                                  // flag off

  var stage = section.querySelector('.hero-video__stage');
  if (!stage) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var conn = navigator.connection || {};
  var slow = !!conn.saveData || /(^|\b)(slow-2g|2g|3g)$/.test(conn.effectiveType || '');

  function showPoster() {
    if (!poster) { section.hidden = true; return; }
    section.classList.remove('is-live');
    section.classList.add('is-poster');
    section.style.height = '';
    stage.style.backgroundImage = 'url("' + poster + '")';
    section.hidden = false;
  }

  if (reduced || slow) { showPoster(); return; }

  var video = document.createElement('video');
  video.className = 'hero-video__video';
  video.muted = true; video.defaultMuted = true;
  video.playsInline = true; video.setAttribute('playsinline', '');
  video.preload = 'auto';
  video.setAttribute('aria-hidden', 'true');
  video.tabIndex = -1;
  if (poster) video.poster = poster;
  video.src = src;
  stage.appendChild(video);

  var duration = 0, live = false, failed = false;
  video.addEventListener('error', function () { if (!failed) { failed = true; showPoster(); } });

  // ---- scroll → time
  var target = 0, current = 0, running = false, onScreen = true;
  function readScroll() {
    var b = section.getBoundingClientRect();
    var span = b.height - window.innerHeight;
    var p = span > 0 ? Math.max(0, Math.min(1, -b.top / span)) : 0;
    section.style.setProperty('--p', p.toFixed(4));
    target = isFinite(duration) ? p * Math.max(0, duration - 0.05) : 0;
    kick();
  }
  function frame() {
    running = false;
    if (!live || !onScreen) return;
    // Ease toward the target rather than jumping to it: a wheel notch is a
    // step in scroll, and a step in time reads as a dropped frame.
    var d = target - current;
    if (Math.abs(d) < 1 / 120) { current = target; }
    else { current += d * 0.24; }
    if (!video.seeking && Math.abs(video.currentTime - current) > 1 / 120) {
      try { video.currentTime = current; } catch (e) { /* not seekable yet */ }
    }
    if (Math.abs(target - current) >= 1 / 120) kick();
  }
  function kick() { if (!running) { running = true; requestAnimationFrame(frame); } }

  function goLive() {
    if (live || failed) return;
    live = true;
    section.classList.add('is-live');
    section.classList.remove('is-poster');
    section.style.height = TRACK + 'svh';
    section.hidden = false;
    video.pause();
    readScroll();
  }
  // Duration. A properly muxed file reports it at loadedmetadata; a file
  // without a duration header (some WebM encoders, anything recorded live)
  // reports Infinity, and the standard way to get the real figure is to seek
  // past the end and read what the browser lands on. data-hero-duration on
  // the section overrides both, for a file that is known to be difficult.
  var forced = +(section.getAttribute('data-hero-duration') || 0);
  function settleDuration() {
    if (forced > 0) { duration = forced; return; }
    var d = video.duration;
    if (isFinite(d) && d > 0) { duration = d; return; }
    var once = function () {
      video.removeEventListener('durationchange', once);
      video.removeEventListener('seeked', once);
      if (isFinite(video.duration) && video.duration > 0) duration = video.duration;
      try { video.currentTime = 0; } catch (e) { /* fine */ }
      readScroll();
    };
    video.addEventListener('durationchange', once);
    video.addEventListener('seeked', once);
    try { video.currentTime = 1e101; } catch (e) { /* not seekable: stays 0 */ }
  }
  video.addEventListener('loadedmetadata', settleDuration);
  // canplay is enough to show it; the rest keeps buffering behind the scrub
  video.addEventListener('canplay', goLive);
  video.addEventListener('loadeddata', function () { if (video.readyState >= 3) goLive(); });
  // Fully buffered: mark it, so the CSS can drop the loading state.
  video.addEventListener('progress', function () {
    try {
      var b = video.buffered;
      if (duration && b.length && b.end(b.length - 1) >= duration - 0.25) section.classList.add('is-buffered');
    } catch (e) { /* nothing to do */ }
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      onScreen = es[0].isIntersecting;
      if (onScreen) readScroll();
    }, { rootMargin: '120px' }).observe(section);
  }
  var queued = false;
  window.addEventListener('scroll', function () {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; readScroll(); });
  }, { passive: true });
  window.addEventListener('resize', readScroll);
})();
