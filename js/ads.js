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
  var A = window.VN_ADS = { busy: false, ysdk: null, mode: 'none' };
  var failsafe = null;

  function setPaused(on) { if (window.VN && window.VN.setPaused) window.VN.setPaused(on); }

  function finish(done) {                          // реклама закончилась (показана, не показана или ошибка) — продолжаем игру
    if (!A.busy) return;
    clearTimeout(failsafe); A.busy = false; setPaused(false);
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
    A.busy = true; setPaused(true);
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

  if (typeof window.YaGames !== 'undefined') {
    A.mode = 'yandex';
    window.YaGames.init().then(function (ysdk) {
      A.ysdk = ysdk;
      // платформа просит поставить игру на паузу (свернули вкладку, началась реклама) и вернуть обратно
      try {
        ysdk.on('game_api_pause', function () { setPaused(true); });
        ysdk.on('game_api_resume', function () { if (!A.busy) setPaused(false); });
      } catch (e) {}
      // игра загружена и готова к показу
      var ready = function () { try { if (ysdk.features && ysdk.features.LoadingAPI) ysdk.features.LoadingAPI.ready(); } catch (e) {} };
      if (document.readyState === 'complete') ready(); else window.addEventListener('load', ready);
    }).catch(function () { /* SDK не поднялся — играем без рекламы */ });
  } else if (TEST) {
    A.mode = 'test';
  }
})();
