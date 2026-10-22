/* Запуск игры во ВКонтакте: перед main.js подтягиваем сохранения игрока из хранилища VK Bridge и дальше пишем в него.
   Зачем: localStorage у мини-приложения привязан к браузеру и домену, а хранилище VK Bridge — к игроку (переходит между устройствами).
   Как это работает:
   1. VKWebAppInit, затем читаем из VKWebAppStorageGet прогресс и кладём его в localStorage — main.js ничего не знает про ВК и читает как обычно.
   2. Подменяем setItem/removeItem для трёх ключей игры: каждая запись дублируется в VKWebAppStorageSet (с задержкой, чтобы не слать запрос на каждую реплику).
   3. Если Bridge молчит дольше 2,5 с или его нет, игра стартует на обычном localStorage.
   После этого по порядку подключаются main.js, cover-fx.js и ads-vk.js (динамически, чтобы они стартовали после загрузки данных).
   В хранилище ВК допустимы только латиница, цифры, «_» и «-» в имени ключа, поэтому «put.save.v2» хранится как «put_save_v2»; длинные значения режутся на куски. */
(function () {
  'use strict';
  var bridge = window.vkBridge;
  var KEYS = ['put.save.v2', 'put.prog.v1', 'vn_sound'];
  var CHUNK = 3000, WAIT = 2500, DELAY = 2000;
  var started = false, timers = {}, pending = {};

  function nm(k) { return k.replace(/[^A-Za-z0-9_-]/g, '_'); }
  function cnt(k) { return nm(k) + '_n'; }
  function part(k, j) { return nm(k) + '_' + j; }

  function start() {
    if (started) return; started = true;
    hook();
    var list = ['js/main.js', 'js/cover-fx.js', 'js/ads-vk.js'];
    (function next() {
      var s = list.shift(); if (!s) return;
      var e = document.createElement('script'); e.src = s; e.async = false;
      e.onload = e.onerror = next;
      document.body.appendChild(e);
    })();
  }

  /* запись в хранилище ВК: сначала куски, потом их число (число пишем последним — по нему читаем) */
  var queue = Promise.resolve();                  // все записи идут по очереди: иначе число кусков от старой записи может прийти позже новой
  function push(k) {
    if (!bridge) return;
    queue = queue.then(function () {
      var v = pending[k], chunks = [];
      if (v != null) for (var p = 0; p < v.length; p += CHUNK) chunks.push(v.slice(p, p + CHUNK));
      var seq = Promise.resolve();
      chunks.forEach(function (c, j) { seq = seq.then(function () { return bridge.send('VKWebAppStorageSet', { key: part(k, j), value: c }); }); });
      return seq.then(function () { return bridge.send('VKWebAppStorageSet', { key: cnt(k), value: String(chunks.length) }); });
    }).catch(function () {});
  }
  function schedule(k, v) {
    pending[k] = v; clearTimeout(timers[k]);
    timers[k] = setTimeout(function () { push(k); }, DELAY);
  }
  function flush() { Object.keys(timers).forEach(function (k) { clearTimeout(timers[k]); delete timers[k]; push(k); }); }

  function hook() {
    if (!bridge) return;
    var P = Storage.prototype, si = P.setItem, ri = P.removeItem;
    P.setItem = function (k, v) { si.call(this, k, v); if (this === window.localStorage && KEYS.indexOf(k) >= 0) schedule(k, String(v)); };
    P.removeItem = function (k) { ri.call(this, k); if (this === window.localStorage && KEYS.indexOf(k) >= 0) schedule(k, null); };
    // при сворачивании и закрытии не ждём задержку
    document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });
    window.addEventListener('pagehide', flush);
  }

  function hydrate() {
    return bridge.send('VKWebAppStorageGet', { keys: KEYS.map(cnt) }).then(function (r) {
      var n = {}; ((r && r.keys) || []).forEach(function (x) { n[x.key] = parseInt(x.value, 10) || 0; });
      var need = [];
      KEYS.forEach(function (k) { for (var j = 0; j < (n[cnt(k)] || 0); j++) need.push(part(k, j)); });
      if (!need.length) return null;
      return bridge.send('VKWebAppStorageGet', { keys: need }).then(function (r2) {
        var m = {}; ((r2 && r2.keys) || []).forEach(function (x) { m[x.key] = x.value; });
        KEYS.forEach(function (k) {
          var c = n[cnt(k)] || 0; if (!c) return;
          var s = '', ok = true;
          for (var j = 0; j < c; j++) { if (typeof m[part(k, j)] !== 'string') { ok = false; break; } s += m[part(k, j)]; }
          if (ok && !started) { try { localStorage.setItem(k, s); } catch (e) {} }   // подмена setItem ещё не стоит: запись идёт только в localStorage; если игра уже стартовала (Bridge ответил поздно), данные не трогаем
        });
      });
    });
  }

  if (!bridge) { start(); return; }
  var guard = setTimeout(start, WAIT);
  try { bridge.send('VKWebAppInit').catch(function () {}); } catch (e) {}
  hydrate().catch(function () {}).then(function () { clearTimeout(guard); start(); });
})();
