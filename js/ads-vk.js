/* Реклама и SDK ВКонтакте (VK Bridge) — тонкая прослойка. Заменяет js/ads.js в сборке для VK Mini Apps.
   Интерфейс тот же, что у ads.js: VN_ADS.interstitial(done), VN_ADS.busy, VN_ADS.lang — main.js менять не нужно.

   Что делает:
   - VKWebAppInit — сообщает ВКонтакте, что игра загружена;
   - полноэкранная реклама между главами (со 2-й) через VKWebAppShowNativeAds (interstitial);
   - пауза музыки и блокировка ввода на время рекламы, а также когда приложение свернули (VKWebAppViewHide / VKWebAppViewRestore);
   - если рекламы нет или VK Bridge не поднялся — игра просто идёт дальше. */
(function () {
  'use strict';
  var bridge = window.vkBridge;
  var A = window.VN_ADS = { bridge: bridge || null, mode: bridge ? 'vk' : 'none', lang: 'ru' };
  var adBusy = false, platPause = false, failsafe = null;
  // busy — ввод заблокирован: идёт реклама или приложение свёрнуто
  Object.defineProperty(A, 'busy', { get: function () { return adBusy || platPause; } });

  function setPaused(on) { if (window.VN && window.VN.setPaused) window.VN.setPaused(on); }

  function finish(done) {                        // реклама закончилась (показана, не показана или ошибка) — продолжаем игру
    if (!adBusy) return;
    clearTimeout(failsafe); adBusy = false; setPaused(platPause);
    if (typeof done === 'function') done();
  }

  /* Полноэкранная реклама в паузе между главами. done вызывается всегда: и если рекламы нет, и если она не загрузилась */
  A.interstitial = function (done) {
    if (A.busy) return;
    if (!bridge) { if (typeof done === 'function') done(); return; }
    adBusy = true; setPaused(true);
    failsafe = setTimeout(function () { finish(done); }, 90000);      // на случай, если Bridge не вернул ответ
    try {
      bridge.send('VKWebAppCheckNativeAds', { ad_format: 'interstitial' })
        .then(function (r) {
          if (!r || !r.result) { finish(done); return null; }          // рекламы сейчас нет
          return bridge.send('VKWebAppShowNativeAds', { ad_format: 'interstitial' })
            .then(function () { finish(done); });
        })
        .catch(function () { finish(done); });
    } catch (e) { finish(done); }
  };

  if (bridge) {
    try { bridge.send('VKWebAppInit').catch(function () {}); } catch (e) {}
    // приложение свернули или вернули — музыка на паузу и обратно
    try {
      bridge.subscribe(function (e) {
        var t = e && e.detail && e.detail.type;
        if (t === 'VKWebAppViewHide') { platPause = true; setPaused(true); }
        else if (t === 'VKWebAppViewRestore') { platPause = false; if (!adBusy) setPaused(false); }
      });
    } catch (e) {}
    // язык игрока: параметры запуска (vk_language: ru, uk, be, en …)
    try {
      var vl = new URLSearchParams(location.search).get('vk_language');
      if (vl) A.lang = vl;
    } catch (e) {}
  }
})();
