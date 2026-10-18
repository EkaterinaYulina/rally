/* Оживление титульного экрана: тихий idle + раз в ~11 с; работает только пока показана обложка «событие» (пыль из-под колёс, вспышка фар, пробег света по названию). */
(function () {
  'use strict';
  var cover = document.getElementById('cover');
  var cv = document.getElementById('cvFx');
  if (!cover || !cv) return;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  var ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  var rnd = function (a, b) { return a + Math.random() * (b - a); };

  /* --- пылинки в воздухе (idle) --- */
  var specks = [];
  for (var i = 0; i < 46; i++) specks.push(newSpeck(true));
  function newSpeck(init) {
    return { x: rnd(0, W), y: init ? rnd(300, H) : rnd(H * .7, H), r: rnd(.8, 2.4), vx: rnd(-.12, -.02), vy: rnd(-.22, -.05), ph: rnd(0, 6.28), a: rnd(.18, .55) };
  }

  /* --- шлейф пыли (событие) --- */
  var puffs = [];
  var WHEEL = { x: 1200, y: 806 };       // заднее колесо в координатах кадра 1600×900
  function spawnPlume() {
    for (var i = 0; i < 34; i++) {
      puffs.push({ x: WHEEL.x + rnd(-30, 20), y: WHEEL.y + rnd(-14, 10), r: rnd(14, 28), g: rnd(.35, .8),
        vx: rnd(.6, 2.2), vy: rnd(-.7, -.15), life: 0, max: rnd(80, 130), delay: Math.floor(rnd(0, 14)) });
    }
  }

  var last = 0, t = 0, running = false;
  function frame(now) {
    if (!running) return;
    var dt = Math.min(2, (now - last) / 16.7 || 1); last = now; t += dt;
    if (cover.hidden) { running = false; ctx.clearRect(0, 0, W, H); return; }
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < specks.length; i++) {
      var s = specks[i];
      s.x += s.vx * dt; s.y += s.vy * dt; s.x += Math.sin(t * .02 + s.ph) * .06;
      if (s.y < 240 || s.x < -10) { specks[i] = newSpeck(false); continue; }
      var a = s.a * (.6 + .4 * Math.sin(t * .03 + s.ph));
      ctx.fillStyle = 'rgba(255,214,150,' + a.toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.2832); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    for (var j = puffs.length - 1; j >= 0; j--) {
      var p = puffs[j];
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.life += dt; var k = p.life / p.max;
      if (k >= 1) { puffs.splice(j, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .995;
      var r = p.r + k * 70 * p.g, a2 = Math.sin(Math.PI * Math.min(1, k * 1.15)) * .26 * p.g;
      var gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      gr.addColorStop(0, 'rgba(176,138,92,' + a2.toFixed(3) + ')'); gr.addColorStop(1, 'rgba(176,138,92,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.2832); ctx.fill();
    }
    requestAnimationFrame(frame);
  }
  
  /* --- событие раз в ~11 с; работает только пока показана обложка, потом возврат к idle --- */
  var timer = 0;
  function event() {
    if (document.hidden || cover.hidden) return schedule();
    cover.classList.remove('ev'); void cover.offsetWidth; cover.classList.add('ev');
    spawnPlume();
    setTimeout(function () { cover.classList.remove('ev'); }, 1700);
    schedule();
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(event, rnd(10000, 12000)); }
  function onShow() { clearTimeout(timer); puffs.length = 0; if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); } timer = setTimeout(event, 700); }  // первое событие — сразу после показа
  new MutationObserver(function () { if (!cover.hidden) onShow(); else clearTimeout(timer); }).observe(cover, { attributes: true, attributeFilter: ['hidden'] });
  if (!cover.hidden) onShow();

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) running = false; else if (!running && !cover.hidden) { running = true; last = performance.now(); requestAnimationFrame(frame); }
  });
})();
