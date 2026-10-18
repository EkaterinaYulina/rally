/* Реклама и SDK Яндекс Игр — тонкая прослойка. Игра обращается только сюда (VN_ADS.interstitial), напрямую к SDK не ходит.

   Три режима:
   1. SDK есть (игра открыта на Яндекс Играх, в сборке подключён /sdk.js) — настоящая полноэкранная реклама через SDK.
   2. ?adtest — на GitHub Pages или локально: вместо рекламы серая плашка на пару секунд. Паузы музыки и блокировка ввода те же,
      так что поведение можно проверить без Яндекса.
   3. Иначе (Pages, обычный запуск) — рекламы нет, игра идёт как есть.

   Пауза: на время рекламы музыка ставится на паузу (VN.setPaused), ввод в игре блокируется (VN_ADS.busy).
   Sticky-баннер включается в черновике на Яндексе, кодом не вызывается. */
(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  var TEST = params.has('adtest') && !window.VN_PROD;
  var A = window.VN_ADS = { ysdk: null, mode: 'none', lang: 'ru' };
  var adBusy = false, platPause = false, failsafe = null;
  // busy — ввод в игре заблокирован: идёт наша реклама или платформа поставила игру на паузу (стартовая реклама, сворачивание вкладки)
  Object.defineProperty(A, 'busy', { get: function () { return adBusy || platPause; } });

  function setPaused(on) { if (window.VN && window.VN.setPaused) window.VN.setPaused(on); }

  function finish(done) {                          // реклама закончилась (показана, не показана или ошибка) — продолжаем игру
    if (!adBusy) return;
    clearTimeout(failsafe); adBusy = false; setPaused(platPause); gpSync();
    if (typeof done === 'function') done();
  }

  function stubAd(done) {                          // заглушка для проверки без Яндекса
    var o = document.createElement('div');
    o.setAttribute('role', 'dialog'); o.setAttribute('aria-label', 'Реклама');
    o.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#1b1d22;color:#e8e2d4;display:flex;align-items:center;justify-content:center;' +
      'font:500 20px/1.4 Onest,system-ui,sans-serif;text-align:center;padding:24px';
    o.textContent = 'Здесь будет реклама';
    document.body.appendChild(o);
    setTimeout(function () { if (o.parentNode) o.parentNode.removeChild(o); finish(done); }, 2500);
  }

  /* Полноэкранная реклама в паузе между сценами. done вызывается всегда — и если рекламы нет, и если она не загрузилась */
  A.interstitial = function (done) {
    if (A.busy) return;
    if (!A.ysdk && !TEST) { if (typeof done === 'function') done(); return; }
    adBusy = true; setPaused(true); gpSync();
    failsafe = setTimeout(function () { finish(done); }, 90000);       // на случай, если SDK не вернул ни одного колбэка
    if (!A.ysdk) { stubAd(done); return; }
    try {
      A.ysdk.adv.showFullscreenAdv({
        callbacks: {
          onOpen: function () { setPaused(true); },
          onClose: function () { finish(done); },
          onError: function () { finish(done); },
          onOffline: function () { finish(done); }
        }
      });
    } catch (e) { finish(done); }
  };

  /* Разметка геймплея (обязательное требование Яндекса): GameplayAPI.start() — игрок играет, stop() — обложка, главы, концовка,
     таблица, маршрутный лист, реклама. Состояние выводим из экранов (атрибут hidden), так что в main.js ничего вызывать не нужно.
     Паузу и возобновление от платформы (game_api_pause / game_api_resume) платформа сама связывает со stop() и start(). */
  var gpOn = false, gpReady = false;
  function gpSync() {
    if (!A.ysdk || !gpReady) return;
    var screens = ['cover', 'toc', 'end', 'rb', 'tt'], want = !adBusy;
    screens.forEach(function (id) { var e = document.getElementById(id); if (e && !e.hidden) want = false; });
    if (want === gpOn) return;
    gpOn = want;
    try { var g = A.ysdk.features && A.ysdk.features.GameplayAPI; if (g) { if (want) g.start(); else g.stop(); } } catch (e) {}
  }
  function gpWatch() {
    if (!window.MutationObserver) return;
    ['cover', 'toc', 'end', 'rb', 'tt'].forEach(function (id) {
      var e = document.getElementById(id);
      if (e) new MutationObserver(gpSync).observe(e, { attributes: true, attributeFilter: ['hidden'] });
    });
  }

  if (typeof window.YaGames !== 'undefined') {
    A.mode = 'yandex';
    window.YaGames.init().then(function (ysdk) {
      A.ysdk = ysdk;
      try { A.lang = (ysdk.environment && ysdk.environment.i18n && ysdk.environment.i18n.lang) || 'ru'; } catch (e) {}   // язык игрока от платформы
      // платформа просит поставить игру на паузу (стартовая и любая полноэкранная реклама, окно покупок, сворачивание вкладки) и вернуть обратно
      try {
        ysdk.on('game_api_pause', function () { platPause = true; setPaused(true); });
        ysdk.on('game_api_resume', function () { platPause = false; if (!adBusy) setPaused(false); });
      } catch (e) {}
      // игра загружена и игрок может начать: сообщаем платформе и включаем разметку геймплея
      var ready = function () {
        try { if (ysdk.features && ysdk.features.LoadingAPI) ysdk.features.LoadingAPI.ready(); } catch (e) {}
        gpReady = true; gpWatch(); gpSync();
      };
      if (document.readyState === 'complete') ready(); else window.addEventListener('load', ready);
    }).catch(function () { /* SDK не поднялся — играем без рекламы */ });
  } else if (TEST) {
    A.mode = 'test';
  }
})();
