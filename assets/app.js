/* Generative node field + scroll reveal.
   Kept deliberately cheap: the field pauses when the tab is hidden or when the
   viewport has scrolled past it, and it never runs under prefers-reduced-motion. */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- scroll reveal ---------- */
  var revealables = Array.prototype.slice.call(document.querySelectorAll('.reveal'));

  if (reduced || !('IntersectionObserver' in window)) {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var pending = revealables.slice();

    /* Stagger index for the cascade. Capped so a ten-card section still
       finishes inside half a second. */
    var STAGGER_SEL = '.card,.proj,.paper,.talk,.ip,.timeline li,.contrib';
    revealables.forEach(function (root) {
      var kids = root.querySelectorAll(STAGGER_SEL);
      for (var i = 0; i < kids.length; i++) {
        kids[i].style.setProperty('--i', Math.min(i, 8));
      }
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) show(e.target);
      });
    }, { threshold: 0, rootMargin: '0px 0px -6% 0px' });
    revealables.forEach(function (el) { io.observe(el); });

    function show(el) {
      if (el.classList.contains('is-in')) return;
      el.classList.add('is-in');
      io.unobserve(el);
      countUp(el);
      var i = pending.indexOf(el);
      if (i > -1) pending.splice(i, 1);
    }

    /* The contribution total counts up once, when its section arrives. */
    function countUp(root) {
      var el = root.querySelector ? root.querySelector('.contrib__total') : null;
      if (!el || el.getAttribute('data-counted')) return;
      var target = parseInt(el.textContent.replace(/\D/g, ''), 10);
      if (!target) return;
      el.setAttribute('data-counted', '1');
      var t0 = 0;
      (function step(ts) {
        if (!t0) t0 = ts;
        var p = Math.min((ts - t0) / 900, 1);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) window.requestAnimationFrame(step);
      })(0);
    }

    /* Safety sweep. Fast or programmatic scrolling can outrun the observer and
       strand a section at opacity 0, which would hide real content. A rect check
       on every scroll frame makes that impossible. */
    var sweepQueued = false;
    function sweep() {
      sweepQueued = false;
      var limit = window.innerHeight * 0.94;
      for (var i = pending.length - 1; i >= 0; i--) {
        if (pending[i].getBoundingClientRect().top < limit) show(pending[i]);
      }
      if (!pending.length) {
        window.removeEventListener('scroll', queueSweep);
        window.removeEventListener('resize', queueSweep);
      }
    }
    function queueSweep() {
      if (sweepQueued) return;
      sweepQueued = true;
      window.requestAnimationFrame(sweep);
    }
    window.addEventListener('scroll', queueSweep, { passive: true });
    window.addEventListener('resize', queueSweep);
    window.addEventListener('load', queueSweep);
    queueSweep();
  }

  /* ---------- cursor spotlight on cards ---------- */
  var fine = window.matchMedia('(hover:hover) and (pointer:fine)').matches;
  if (!reduced && fine && document.documentElement.classList) {
    var SPOT_SEL = '.card,.proj,.paper,.ip,.talk,.contrib';
    var spotTarget = null, spotX = 0, spotY = 0, spotQueued = false;

    function paintSpot() {
      spotQueued = false;
      if (!spotTarget) return;
      var r = spotTarget.getBoundingClientRect();
      spotTarget.style.setProperty('--mx', (spotX - r.left) + 'px');
      spotTarget.style.setProperty('--my', (spotY - r.top) + 'px');
    }

    document.addEventListener('pointermove', function (e) {
      var el = e.target && e.target.closest ? e.target.closest(SPOT_SEL) : null;
      spotTarget = el;
      if (!el) return;
      spotX = e.clientX;
      spotY = e.clientY;
      if (spotQueued) return;
      spotQueued = true;
      window.requestAnimationFrame(paintSpot);
    }, { passive: true });
  }

  /* ---------- nav scroll spy ---------- */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav__links a'));
  var targets = navLinks
    .map(function (a) { return document.querySelector(a.getAttribute('href')); })
    .filter(Boolean);

  if (targets.length && 'IntersectionObserver' in window) {
    var visible = new Set();
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) visible.add(e.target.id); else visible.delete(e.target.id);
      });
      var current = null;
      for (var i = 0; i < targets.length; i++) {
        if (visible.has(targets[i].id)) { current = targets[i].id; break; }
      }
      navLinks.forEach(function (a) {
        a.classList.toggle('is-active', a.getAttribute('href') === '#' + current);
      });
    }, { rootMargin: '-30% 0px -55% 0px' });
    targets.forEach(function (t) { spy.observe(t); });
  }

  /* ---------- generative field ---------- */
  var canvas = document.getElementById('field');
  if (!canvas) return;
  var ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  var STOPS = [[76, 224, 165], [123, 235, 192], [168, 244, 215]];
  var LINK_DIST = 168;
  var nodes = [];
  var w = 0, h = 0, dpr = 1;
  var pointer = { x: -9999, y: -9999, active: false };
  var running = false;
  var rafId = 0;

  function mix(t) {
    t = Math.max(0, Math.min(1, t)) * (STOPS.length - 1);
    var i = Math.min(Math.floor(t), STOPS.length - 2);
    var f = t - i, a = STOPS[i], b = STOPS[i + 1];
    return [
      Math.round(a[0] + (b[0] - a[0]) * f),
      Math.round(a[1] + (b[1] - a[1]) * f),
      Math.round(a[2] + (b[2] - a[2]) * f)
    ];
  }

  function build() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var target = Math.round((w * h) / 26000);
    var count = Math.max(22, Math.min(target, 72));
    nodes = [];
    for (var i = 0; i < count; i++) {
      nodes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        r: 1.3 + Math.random() * 1.9
      });
    }
  }

  function frame() {
    ctx.clearRect(0, 0, w, h);

    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      n.x += n.vx;
      n.y += n.vy;
      if (n.x < -30) n.x = w + 30;
      if (n.x > w + 30) n.x = -30;
      if (n.y < -30) n.y = h + 30;
      if (n.y > h + 30) n.y = -30;

      if (pointer.active) {
        var pdx = pointer.x - n.x, pdy = pointer.y - n.y;
        var pd2 = pdx * pdx + pdy * pdy;
        if (pd2 < 34000 && pd2 > 1) {
          var pull = 0.00016 * (34000 - pd2) / 34000;
          n.vx += pdx * pull;
          n.vy += pdy * pull;
        }
      }
      var sp = Math.hypot(n.vx, n.vy);
      if (sp > 0.55) { n.vx *= 0.55 / sp; n.vy *= 0.55 / sp; }
    }

    for (var a = 0; a < nodes.length; a++) {
      for (var b = a + 1; b < nodes.length; b++) {
        var p = nodes[a], q = nodes[b];
        var dx = p.x - q.x, dy = p.y - q.y;
        var d = Math.hypot(dx, dy);
        if (d > LINK_DIST) continue;
        var c = mix(((p.x + q.x) / 2) / w);
        ctx.strokeStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' +
          (0.2 * (1 - d / LINK_DIST)).toFixed(3) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
    }

    for (var k = 0; k < nodes.length; k++) {
      var m = nodes[k];
      var col = mix(m.x / w);
      ctx.fillStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',0.62)';
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }

    rafId = window.requestAnimationFrame(frame);
  }

  function start() {
    if (running || reduced) return;
    running = true;
    rafId = window.requestAnimationFrame(frame);
  }

  function stop() {
    if (!running) return;
    running = false;
    window.cancelAnimationFrame(rafId);
  }

  function shouldRun() {
    return !document.hidden && window.scrollY < window.innerHeight * 1.4;
  }

  function sync() {
    if (shouldRun()) start(); else stop();
  }

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      build();
      if (reduced) frameOnce();
    }, 180);
  });

  window.addEventListener('scroll', sync, { passive: true });
  document.addEventListener('visibilitychange', sync);

  window.addEventListener('pointermove', function (e) {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;
  }, { passive: true });
  window.addEventListener('pointerleave', function () { pointer.active = false; });

  function frameOnce() {
    var keep = rafId;
    ctx.clearRect(0, 0, w, h);
    for (var k = 0; k < nodes.length; k++) {
      var m = nodes[k];
      var col = mix(m.x / w);
      ctx.fillStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',0.5)';
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
    rafId = keep;
  }

  build();
  if (reduced) frameOnce(); else sync();
})();
