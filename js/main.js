/* «Путь» — пролог и главы 2–6: реплики, портреты, шапка, фоны, выбор, числа индикаторов, карточка главы, протокол этапа (модель сезона), автосохранение. */
(function () {
  'use strict';
  var S = window.STORY, B = S.beats;
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);
  var REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var STATIC = params.has('static') || REDUCED;   // без набора текста (проверка / отключена анимация)
  var CPS_MS = 22;                                 // мс на символ

  var el = {
    stage: $('stage'), frame: document.querySelector('.frame'),
    dialog: $('dialog'), name: $('dlgName'), shown: $('tShown'), rest: $('tRest'), hint: $('dlgHint'),
    sr: $('srLive'), end: $('end'), endBtn: $('endBtn'),
    choice: $('choice'), cut: $('cut'), cShown: $('cShown'), cRest: $('cRest'), cHint: $('cutHint'),
    cKick: $('cKick'), cTitle: $('cTitle'),
    bgA: $('bgA'), bgB: $('bgB'), bgLabel: $('bgLabel'),
    locPre: $('locPre'), locName: $('locName'), locKm: $('locKm'),
    portraits: {},
    ind: { car: { box: $('indCar'), name: $('indCarName'), word: $('indCarWord'), was: $('indCarWas') },
           trust: { box: $('indTrust'), name: $('indTrustName'), word: $('indTrustWord'), was: $('indTrustWas') } },
    proto: $('proto'), protoTitle: $('protoTitle'), protoSub: $('protoSub'), protoBody: $('protoBody'), protoSheet: document.querySelector('.proto-sheet'), protoGap: $('protoGap'), scrHint: $('scrHint')
  };

  /* портреты — из списка говорящих */
  (function () {
    var host = $('portraits');
    Object.keys(S.speakers).forEach(function (k) {
      [S.speakers[k].portrait, S.speakers[k].portraitRed].forEach(function (p) {
        if (!p || el.portraits[p]) return;
        var im = new Image();
        im.className = 'portrait'; im.alt = ''; im.draggable = false; im.decoding = 'async';
        im.setAttribute('data-who', p); im.src = 'assets/' + p + '.webp';
        host.appendChild(im); el.portraits[p] = im;
      });
    });
  })();

  var i = 0, flags = {}, mode = 'beat';            // beat | choice | cut
  /* ---------- музыка: треки из S.tracks, поле music у реплики ('id' — включить, 'stop' — погасить) ----------
     Web Audio API, а не <audio>: по кругу без щелчка на стыке, точные плавные входы и выходы, и на Android не появляется
     плеер страницы в панели уведомлений (пункт чек-листа Яндекс Игр). Звук стартует после первого нажатия игрока
     (политика автовоспроизведения) и замолкает: при смене вкладки и потере фокуса, на паузе платформы (VN.setPaused:
     game_api_pause / реклама), по кнопке звука и клавише S. Состояние пересчитывается при восстановлении и прыжках (replay). */
  var MUS = { want: null, unlocked: false, muted: false, hidden: false, paused: false, ctx: null, trk: {}, fadeMs: 1400 };
  try { MUS.muted = localStorage.getItem('vn_sound') === 'off'; } catch (e) {}
  function musCtx() {
    if (MUS.ctx) return MUS.ctx;
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    try { MUS.ctx = new AC(); } catch (e) { MUS.ctx = null; }
    return MUS.ctx;
  }
  function musTrack(id) {                              // создаёт запись трека и грузит файл (один раз)
    var t = (S.tracks || {})[id], c = musCtx(); if (!t || !c) return null;
    var k = MUS.trk[id];
    if (k) return k;
    k = MUS.trk[id] = { id: id, vol: t.vol == null ? 0.6 : t.vol, buf: null, src: null, gain: c.createGain(), tm: 0 };
    k.gain.gain.value = 0; k.gain.connect(c.destination);
    fetch(t.src).then(function (r) { return r.arrayBuffer(); }).then(function (ab) {
      return new Promise(function (ok, bad) { c.decodeAudioData(ab, ok, bad); });
    }).then(function (buf) { k.buf = buf; musSync(); }).catch(function () {
      /* index.html открыт как файл (file://): браузер запрещает fetch и чтение для Web Audio — играем обычным <audio>.
         Так бывает только при локальной проверке; на Яндекс Играх игра открывается по https и идёт через Web Audio */
      k.el = new Audio(t.src); k.el.loop = true; k.el.preload = 'auto'; k.el.volume = 0; musSync();
    });
    return k;
  }
  function musElFade(k, to, sec, id) {               // плавная громкость обычного <audio> (запасной путь)
    var e = k.el, from = e.volume, t0 = performance.now(); clearInterval(k.fi);
    if (to > 0 && e.paused) { var pr = e.play(); if (pr && pr.catch) pr.catch(function () {}); }
    k.fi = setInterval(function () {
      var p = Math.min(1, (performance.now() - t0) / (sec * 1000)); e.volume = Math.max(0, Math.min(1, from + (to - from) * p));
      if (p >= 1) {
        clearInterval(k.fi);
        if (to === 0) { e.pause(); if (id !== MUS.want) { try { e.currentTime = 0; } catch (x) {} } }
      }
    }, 40);
  }
  function musSync(ms) {
    if (ms != null) MUS.fadeMs = ms;
    var c = musCtx(); if (!c) return;
    if (MUS.want) musTrack(MUS.want);
    var play = MUS.unlocked && !MUS.muted && !MUS.hidden && !MUS.paused, fade = Math.max(0.04, MUS.fadeMs / 1000);
    Object.keys(MUS.trk).forEach(function (id) {
      var k = MUS.trk[id], on = id === MUS.want && play, g = k.gain.gain, now = c.currentTime;
      clearTimeout(k.tm);
      if (k.el) { musElFade(k, on ? k.vol : 0, fade, id); return; }          // запасной путь для file://
      if (on) {
        if (c.state !== 'running') c.resume();
        if (!k.src && k.buf) {
          k.src = c.createBufferSource(); k.src.buffer = k.buf; k.src.loop = true; k.src.connect(k.gain); k.src.start(0);
        }
        g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(k.vol, now + fade);
      } else {
        g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + fade);
        k.tm = setTimeout(function () {
          if (id !== MUS.want && k.src) { try { k.src.stop(); } catch (e) {} k.src.disconnect(); k.src = null; }   // снят — с начала при следующем запуске
          audSettle();                                                                                                    // тишина — устройство вывода не держим
        }, fade * 1000 + 60);
      }
    });
  }
  function setMusic(v, instant) {
    MUS.want = (v && v !== 'stop') ? v : null;
    var tr = MUS.want && (S.tracks || {})[MUS.want];
    musSync(instant ? 40 : (v === 'stop' ? 900 : ((tr && tr.fadeIn) || 1400)));      // смена трека — кроссфейд
  }
  function musUnlock() { if (MUS.unlocked) return; MUS.unlocked = true; musSync(1400); }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { window.addEventListener(ev, musUnlock, { passive: true }); });
  function musFocus() { MUS.hidden = document.hidden || !document.hasFocus(); musSync(MUS.hidden ? 200 : 800); }
  document.addEventListener('visibilitychange', musFocus); window.addEventListener('blur', musFocus); window.addEventListener('focus', musFocus);
  window.VN = window.VN || {};
  window.VN.setPaused = function (on) { MUS.paused = !!on; musSync(on ? 100 : 600); };         // вызывать из game_api_pause / game_api_resume и вокруг рекламы
  function setMuted(on) {
    MUS.muted = on; try { localStorage.setItem('vn_sound', on ? 'off' : 'on'); } catch (e) {}
    var b = document.getElementById('sndbtn');
    if (b) { b.setAttribute('aria-pressed', on ? 'false' : 'true'); b.setAttribute('aria-label', on ? 'Звук выключен' : 'Звук включён'); }
    musSync(350);
  }

  /* аудио в игре — только музыка (треки S.tracks, поле music у реплики). Звуков и фоновых слоёв нет */
  function audSettle() {                               // тишина — устройство вывода не держим
    var c = MUS.ctx; if (!c || c.state !== 'running') return;
    if (MUS.want && MUS.unlocked && !MUS.muted && !MUS.hidden && !MUS.paused) return;
    c.suspend();
  }
  (function () { var b = document.getElementById('sndbtn'); if (!b) return; setMuted(MUS.muted); b.addEventListener('click', function () { MUS.unlocked = true; setMuted(!MUS.muted); b.blur(); }); })();

  var typing = false, timer = null, pos = 0, ended = false, autoT = null, cutAt = 0, bgCur = null, cutOpen = false, chapHold = false, chapT = null;
  var stats = { car: null, trust: null };
  var rbOpen = false, rbSel = {}, ttOpen = false;
  /* состояние, которое не лежит в флагах и пересобирается replay(): снимки 🤝/🔧 на старте этапов,
     однократное «гашение» следующего прироста доверия ({наорал}), слова индикаторов на начало главы */
  var snaps = {}, dampPending = false, chap0 = null;

  /* ---------- модель сезона: места Алекса считаются по снимкам 🤝/🔧 на старте этапа ---------- */
  var CYR = { A: 'А', B: 'Б', V: 'В' };               // в сценарии варианты латиницей, в модели — кириллицей
  var ORD = ['', 'Первое', 'Второе', 'Третье', 'Четвёртое', 'Пятое', 'Шестое', 'Седьмое', 'Восьмое', 'Девятое', 'Десятое', 'Одиннадцатое', 'Двенадцатое', 'Тринадцатое', 'Четырнадцатое', 'Пятнадцатое', 'Шестнадцатое', 'Семнадцатое', 'Восемнадцатое', 'Девятнадцатое', 'Двадцатое'];
  var ORDM = ['', 'первом', 'втором', 'третьем', 'четвёртом', 'пятом', 'шестом', 'седьмом', 'восьмом', 'девятом', 'десятом', 'одиннадцатом', 'двенадцатом', 'тринадцатом', 'четырнадцатом', 'пятнадцатом', 'шестнадцатом', 'семнадцатом', 'восемнадцатом', 'девятнадцатом', 'двадцатом'];   // предложный падеж: «на третьем месте»
  var dKey = null, dVal = null;
  function isRet2() {                                // сход на «Печорах» (4.5Б): не хранится флагом, считается по снимку 🔧 перед 4.5 — не «застревает» при прыжках по маршрутному листу
    return flags.k45 === 'B' && !!snaps.s45 && (snaps.s45.car - 4) <= 3;
  }
  function alexTimes() {                             // время Алекса на этапах 0 (Ильмень), 1 (Рускеала), 2 (Печоры), 4 (Урал); null — этап ещё не стартовал, сход или Алекс не заявлен (3 — «Горный край»)
    var ch = {};
    if (flags.k33) ch['3.3'] = CYR[flags.k33];
    if (flags.k37) ch['3.7'] = CYR[flags.k37];
    if (flags.k44) ch['4.4'] = CYR[flags.k44];
    if (flags.k45) ch['4.5'] = CYR[flags.k45];
    /* снимок для формулы времени — как в калибровке (rally_tables_calibration.py): Ильмень — перед 3.4; Рускеала — после эффекта выбора 3.7 (🤝),
       до износа; Печоры — после выбора 4.4 (🔧 +2), до последствий 4.5; Урал — на старте 5.7, после капиталки, выбора 5.5 и бонусов 5.2/5.4, до износа.
       Разовая потеря 3.7-А смотрит на 🤝 до выбора (снимок s1). «Горный край» (этап 3): Алекс не заявлен — времени нет. */
    var KEY = ['s0', 's1b', 's45', null, 's4', 's5'];
    return [0, 1, 2, 3, 4, 5].map(function (s) {
      if (s === 3) return null;
      var sn = snaps[KEY[s]]; if (!sn) return null;
      if (s === 2 && isRet2()) return null;
      if (s === 5) {                                 // финал: снимок на старте 6.4 (после эффекта 6.3). Риск 6.6-Б с запасом даёт −1,5 с; без запаса — сход, времени нет
        var risk = flags.k66 === 'B';
        if (risk && !gate6ok(sn)) return null;
        return RallyModel.alexStageTime(5, sn.trust, sn.car, { choices: risk ? { '6.6': 'Б' } : {}, flags: risk ? ['риск_прошёл'] : [], trust: sn.trust });
      }
      return RallyModel.alexStageTime(s, sn.trust, sn.car, { choices: s === 4 ? {} : ch, flags: [], trust: (s === 1 && snaps.s1) ? snaps.s1.trust : sn.trust });
    });
  }
  /* Общий зачёт после этапов 0..upto. Одинаковые очки — по лучшим результатам (как в регламенте): у кого выше места на этапах, тот впереди. */
  function gate6ok(sn) {                             // ворота 6.6: 🤝 ≥ 7 и 🔧 ≥ 7; при {принял_обе_правды} достаточно 🔧 ≥ 6 (как в калибровке)
    return !!sn && sn.trust >= 7 && (sn.car >= 7 || (sn.car >= 6 && !!flags.принял_обе_правды));
  }
  function seasonRanked(upto, t, byNum) {
    var per = {};
    for (var s = 0; s <= upto; s++) {
      var res = RallyModel.placeOnStage(s, t[s]);
      res.standings.forEach(function (x) {
        var r = per[x.n] || (per[x.n] = { n: x.n, label: x.label, pts: 0, places: [], isAlex: !!x.isAlex });
        r.pts += x.points; r.places.push(x.place);
      });
    }
    var arr = Object.keys(per).map(function (k) { return per[k]; });
    arr.forEach(function (r) { r.places.sort(function (a, b) { return a - b; }); });
    arr.sort(function (a, b) {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (byNum) return a.n - b.n;                    // итоговый зачёт сезона: при равных очках — младший номер (правило калибровки; у Алекса №4)
      for (var i = 0; i < Math.max(a.places.length, b.places.length); i++) {
        var pa = a.places[i] == null ? 99 : a.places[i], pb = b.places[i] == null ? 99 : b.places[i];
        if (pa !== pb) return pa - pb;
      }
      return a.n - b.n;
    });
    arr.forEach(function (r, i) { r.place = i + 1; });
    return arr;
  }
  function derived() {                               // place0..place2, place4, place5, rank1..rank5, ret2, gate6, crash6 — по модели; null, пока данных нет
    var key = JSON.stringify([snaps.s0 || 0, snaps.s1 || 0, snaps.s1b || 0, snaps.s45 || 0, snaps.s4 || 0, snaps.s5 || 0, flags.k33 || 0, flags.k37 || 0, flags.k44 || 0, flags.k45 || 0, flags.k66 || 0, flags.принял_обе_правды || 0]);
    if (key === dKey) return dVal;
    var t = alexTimes(), out = { place0: null, place1: null, place2: null, place4: null, place5: null, rank1: null, rank2: null, rank3: null, rank4: null, rank5: null, ret2: snaps.s45 ? (isRet2() ? 1 : 0) : null,
      gate6: snaps.s5 ? (gate6ok(snaps.s5) ? 1 : 0) : null, crash6: snaps.s5 ? ((flags.k66 === 'B' && !gate6ok(snaps.s5)) ? 1 : 0) : null, t: t };
    var pl = [0, 1, 2, 3, 4, 5].map(function (s) { return t[s] != null ? RallyModel.placeOnStage(s, t[s]) : null; });
    if (pl[0]) out.place0 = pl[0].alex.place;
    if (pl[1]) out.place1 = pl[1].alex.place;
    if (pl[2]) out.place2 = pl[2].alex.place;
    if (pl[4]) out.place4 = pl[4].alex.place;
    if (pl[5]) out.place5 = pl[5].alex.place;
    function rankAfter(upto) {                         // место Алекса в общем зачёте после этапов 0..upto (null — у Алекса нет строки)
      var rk = seasonRanked(upto, t, upto === 5);
      for (var q = 0; q < rk.length; q++) if (rk[q].n === 4) return { r: q + 1, pts: rk[q].pts };
      return null;
    }
    if (pl[0] && pl[1]) { var r1 = rankAfter(1); if (r1) { out.rank1 = r1.r; out.pts = r1.pts; } }          // после двух этапов
    if (pl[0] && pl[1] && snaps.s45) {                  // после трёх (при сходе на третьем — без очков за него) и после «Горного края» (Алекс не заявлен)
      var r2 = rankAfter(2); if (r2) { out.rank2 = r2.r; out.pts2 = r2.pts; }
      var r3 = rankAfter(3); if (r3) { out.rank3 = r3.r; out.pts3 = r3.pts; }
      if (pl[4]) { var r4 = rankAfter(4); if (r4) { out.rank4 = r4.r; out.pts4 = r4.pts; } }
      if (pl[4] && snaps.s5) { var r5 = rankAfter(5); if (r5) { out.rank5 = r5.r; out.pts5 = r5.pts; } }    // итог сезона (при сходе на финале — без очков за него)
    }
    dKey = key; dVal = out; return out;
  }
  function endKey() {                               // концовка по итоговой таблице сезона: В → А → Б → Г (null, пока финал не рассчитан)
    var dv = derived();
    if (dv.crash6 == null) return null;
    if (dv.crash6 === 0 && dv.rank5 == null) return null;
    return RallyModel.decideEnding({ retiredAt66: dv.crash6 === 1, alexSeasonRank: dv.rank5 });
  }
  function blk52(fl) {                               // 5.2-А («срочная доставка») заблокирована: нет денег. Нужны оба флага — штраф на ознакомлении (3.3-А) и резина за свои (3.6-А); при молчании (1.4-Б) хватает одного
    var a = fl.k33 === 'A', b = fl.k36 === 'A', m = fl.k14 === 'B';
    return (a && b) || (m && (a || b)) ? 1 : 0;
  }
  function numVal(k, fl) {
    if (k === 'trust' || k === 'car') return stats[k];
    if (k === 'blk52') return blk52(fl || flags);
    if (k === 'place0' || k === 'place1' || k === 'place2' || k === 'place4' || k === 'rank1' || k === 'rank2' || k === 'rank3' || k === 'rank4' || k === 'ret2' || k === 'place5' || k === 'rank5' || k === 'gate6' || k === 'crash6') return derived()[k];
    return null;
  }
  /* 🔧 после капиталки (5.6): значение на входе в 4.5, минус износ (0 при {сберегли_мотор}, 3 при сходе, иначе 1); сверху 5.2-А (+2) и 5.4-А (+1, кроме {молчание}) */
  function repairCar() {
    var s = snaps.s45; if (!s) return null;
    var v = s.car - (flags.k45 === 'A' ? 0 : (isRet2() ? 3 : 1));
    if (flags.k52 === 'A') v += 2;
    if (flags.k54 === 'A' && flags.k14 !== 'B') v += 1;
    return Math.max(0, Math.min(10, v));
  }
  function tpl(text) {                                // {{ord0}}, {{ord1}}, {{ord2}}, {{ord4}}, {{ord5}} — порядковое числительное места на этапе («Пятое»); {{ordr1}}…{{ordr4}} — места в общем зачёте после этапа (ordl — со строчной)
    return text.replace(/\{\{ordm5\}\}/g, function () { var p = derived().place5; return ORDM[p] || (p + '-м'); })
               .replace(/\{\{ord([01245])\}\}/g, function (m, d) { var p = derived()['place' + d]; return ORD[p] || (p + '-е'); })
               .replace(/\{\{ordp5\}\}/g, function () { var p = derived().place5, w = ORD[p] || (p + '-е'); return w.charAt(0).toLowerCase() + w.slice(1); })
               .replace(/\{\{ord([rl])([1234])\}\}/g, function (m, k, d) { var p = derived()['rank' + d], w = ORD[p] || (p + '-е'); return k === 'l' ? w.charAt(0).toLowerCase() + w.slice(1) : w; });
  }

  /* ---------- условия показа ---------- */
  function whenOk(w, fl) {                               // условие показа реплики или варианта выбора
    if (!w) return true;
    fl = fl || flags;
    for (var k in w) {
      var need = w[k], have = fl[k];
      if (need && typeof need === 'object' && !Array.isArray(need)) {          // число: {gte, lte, eq}
        var v = numVal(k, fl);
        if (v == null) return false;
        if (need.gte !== undefined && v < need.gte) return false;
        if (need.lte !== undefined && v > need.lte) return false;
        if (need.eq !== undefined && v !== need.eq) return false;
        continue;
      }
      if (Array.isArray(need)) { if (need.indexOf(have) < 0) return false; }
      else if (need === true) { if (!have) return false; }
      else if (need === false) { if (have) return false; }
      else if (have !== need) return false;
    }
    return true;
  }
  function visible(n) { return whenOk(B[n].when); }
  function nextVisible(n) { n++; while (n < B.length && !visible(n)) n++; return n; }
  function lastVisible() { var n = B.length - 1; while (n > 0 && !visible(n)) n--; return n; }

  /* ---------- сохранение (локально; Яндекс-сохранения подключим позже) ---------- */
  var KEY = 'put.save.v2';   // ключ сохранения новой сборки: старые сохранения пролога не подхватываются
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ i: i, flags: flags })); } catch (e) {} }
  function load() {
    try { var v = JSON.parse(localStorage.getItem(KEY)); if (v && typeof v.i === 'number' && v.i < B.length) return v; } catch (e) {}
    return null;
  }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) {} }

  /* ---------- шапка, индикаторы, фон ---------- */
  function setHud(h) {
    el.locPre.hidden = !h.pre; el.locPre.textContent = h.pre || '';
    el.locName.textContent = h.name;
    el.locKm.hidden = !h.tail; el.locKm.textContent = h.tail || '';
  }
  var indState = { car: {}, trust: {} }, dirT = { car: null, trust: null }, revT = { car: null, trust: null };
  function setInd(k, patch, animate, dir) {
    var s = indState[k], t = el.ind[k];
    var wasNone = s.word != null && S.noneWords.indexOf(s.word) >= 0;
    if (patch.name) s.name = patch.name;
    if (patch.word) s.word = patch.word;
    t.name.textContent = s.name; t.word.textContent = s.word;
    t.word.classList.toggle('zero', S.zeroWords.indexOf(s.word) >= 0);
    t.word.classList.toggle('none', S.noneWords.indexOf(s.word) >= 0);
    t.box.setAttribute('aria-label', s.name + ' ' + s.word);
    clearTimeout(dirT[k]); t.word.removeAttribute('data-dir');
    if (!animate || STATIC) { clearTimeout(revT[k]); t.box.classList.remove('reveal'); }
    if (animate && !STATIC) {
      if (dir) { t.word.setAttribute('data-dir', dir); dirT[k] = setTimeout(function () { t.word.removeAttribute('data-dir'); }, 2000); }
      if (wasNone && patch.word && S.noneWords.indexOf(patch.word) < 0) {   // индикатор появился: подсветить всю плашку
        t.box.classList.remove('reveal'); void t.box.offsetWidth; t.box.classList.add('reveal');
        clearTimeout(revT[k]); revT[k] = setTimeout(function () { t.box.classList.remove('reveal'); }, 3200);
      }
      if (patch.word || dir) { t.word.classList.remove('flash'); void t.word.offsetWidth; t.word.classList.add('flash'); }
    }
  }
  function wordFor(k, v) {
    var w = S.bands[k].words;
    for (var q = 0; q < w.length; q++) if (v >= w[q][0] && v <= w[q][1]) return w[q][2];
    return w[w.length - 1][2];
  }
  function applyStats(map, animate) {                 // {car|trust: {set:N} | {add:±N}}
    Object.keys(map).forEach(function (k) {
      var e = map[k], old = stats[k], nv, add = e.add;
      if (k === 'trust' && add > 0 && dampPending) { add -= 1; dampPending = false; }   // {наорал}: следующий прирост доверия на 1 меньше, один раз
      nv = e.set !== undefined ? e.set : (old == null ? 0 : old) + add;
      nv = Math.max(0, Math.min(10, nv));
      stats[k] = nv;
      var dir = ((e.add !== undefined || e.dir) && old != null && nv !== old) ? (nv > old ? 'up' : 'down') : null;
      setInd(k, { name: S.bands[k].name, word: wordFor(k, nv) }, animate, dir);
      if (animate && dir) el.sr.textContent = S.bands[k].name + (dir === 'up' ? ' выросла. ' : ' упала. ') + wordFor(k, nv);
    });
  }

  /* ---------- эффекты поверх фона (canvas #fx): по сценам ----------
     bg11 (1.1)  — редкий медленный дождь, дым из выхлопа, свет фар
     bg12 (1.2)  — быстро стекающие по лобовому стеклу капли
     bg13 (1.3)  — дымок над машиной, моргающие аварийные фары, туман над землёй
     bg14 (1.4)  — дрейфующий туман, морось, тёплый свет в тенте
     bg15 (1.5)  — свет лампы «дышит», мерцает экран ноутбука, снег в окне
     bg21 (2.1)  — пар из чайника;  bg22 (2.2) — медленный снег за окном кафе
     bg23 (2.3)  — лампа над столом иногда моргает
     bg24 (2.4)  — снежная пыль из-под колёс, позёмка, пар дыхания зрителей
     bg25 (2.5)  — «запись с онборда» на экране ноутбука, снег в окне, голубой свет экрана
     bg41 (4.1)  — лампа и окно «дышат», экран ноутбука мерцает
     bg42 (4.2)  — дымок из выхлопа, туман над полем, солнце за облаками
     bg43 (4.3)  — пыль и щебень из-под машины в прыжке
     bg44 (4.4)  — рабочий прожектор «дышит» и иногда моргает, пылинки в луче, тёплая дымка
     bg45 (4.5)  — мигают контрольные лампы масла и двигателя, тлеет подсветка приборов
     bg45b (4.5Б) — дрейфующий туман, фары «дышат»
     bg46 (4.6)  — капли по лобовому стеклу в сумерках, свет фар на дороге, мигают красные лампы, низкий туман
     bg47a (4.7) — позёмка из песка, жар над землёй, блики на кубке и бутылке
     bg47b (4.7) — пылинки в солнечном свете, дымка над площадкой
     bg48 (4.8)  — пар из-под капота, прожекторы «дышат», ночная дымка
     bg48b (4.8) — то же для кадра «всё в масле»: пар из-под капота, прожекторы, дымка
     bg49 (4.9)  — лампа «дышит», мерцает экран ноутбука, пар над кружкой
     bg51 (5.1)  — лампа над столом и холодный свет слева «дышат», пылинки в луче, дымка над верстаком
     bg52 (5.2)  — лампа и синий свет «дышат», красная обводка 28–29 августа медленно пульсирует, дымка
     bg53 (5.3)  — экран ноутбука с таймингом мерцает и раз в десять секунд «обновляется» (вспышка и бегущая строка), по стеклу окна стекают капли
     bg54 (5.4)  — лампа над машиной «дышит» и иногда моргает, пылинки в луче, дымка у пола
     bg55 (5.5)  — телефон на капоте пульсирует, как входящий звонок, фонарь и фары «дышат», низкий туман над парковкой
     bg56 (5.6)  — лампа «дышит», ночная дымка (пара нет: мотор собран)
     bg57 (5.7)  — пыль из-под колёс, блики на инее, утренняя дымка над землёй
     bg58 (5.8)  — лампа и холодный свет «дышат», пылинки в луче, блики на плёнке упаковки и кузове
     bg61 (6.1)  — ливень под навесом секретариата, круги на лужах, гирлянда «дышит», дымка
     bg62 (6.2)  — дрейфующий лесной туман за стеклом
     bg63 (6.3)  — лампа «дышит», по оконному стеклу стекает ледяная морось
     bg64 (6.4)  — пар от прогретой машины, дымка над сервис-парком, свет палаток и фар «дышит»
     bg65 (6.5)  — снег, свет фар «дышит», пар дыхания судьи
     bg66 (6.6)  — капли и дымка на лобовом стекле, свет фар и приборов «дышит»
     bg67a / bg67b (6.7А / 6.7Б) — снегопад, позёмка у земли, блики на кубке и бутылке
     bg67g (6.7Г) — лёгкий снег, зарево над горизонтом и свет у баннера «дышат»
     bg67v (6.7В) — снег, аварийные огни машины моргают, красный отсвет на снегу
     drive       — ощущение езды (см. DRIVE ниже): bg12 (1.2), bg33 (3.3), bg37 (3.7) — «подъезжающая» дорога из салона; bg24 (2.4) — фон плывёт за машиной */
  var FX_BG = {
    bg11: ['rain', 'puff:smoke', 'headlights'], bg12: ['glass'], bg13: ['puff:smoke13', 'lights13', 'mist'],
    bg14: ['rain', 'mist', 'glow'], bg15: ['glow', 'screen15', 'snow'], bg21: ['puff:steam'], bg22: ['snow'], bg23: ['flicker'],
    bg24: ['snow', 'puff:dust24', 'puff:breath24'], bg25: ['video25', 'glow', 'snow'],
    bg33: ['puff:steam33', 'led33'],
    bg41: ['glow', 'screen'], bg42: ['mist', 'puff:exhaust42', 'glow'], bg43: ['puff:dust43'],
    bg44: ['mist', 'flicker', 'snow', 'glow'], bg45: ['glow', 'blink'], bg45b: ['mist', 'glow'],
    bg46: ['mist', 'glass', 'glow', 'blink'], bg47a: ['mist', 'snow', 'glint'], bg47b: ['mist', 'snow', 'glow'],
    bg48: ['mist', 'puff:steam48', 'glow'], bg48b: ['mist', 'puff:steam48b', 'glow'], bg49: ['glow', 'screen', 'puff:steam49'],
    bg51: ['mist', 'glow', 'snow'], bg52: ['mist', 'glow', 'blink'], bg53: ['glow', 'screen', 'refresh53', 'glass'],
    bg54: ['mist', 'glow', 'snow', 'flicker'], bg55: ['mist', 'glow', 'blink'], bg56: ['mist', 'glow'],
    bg57: ['mist', 'puff:dust57', 'glint', 'glow'], bg58: ['mist', 'glow', 'glint', 'snow'],
    bg61: ['rain', 'mist', 'glow'], bg62: ['mist'], bg63: ['glow', 'glass'], bg64: ['mist', 'puff:steam64', 'glow'],
    bg65: ['snow', 'glow', 'puff:breath65'], bg66: ['mist', 'glass', 'glow'],
    bg67a: ['mist', 'snow', 'glint'], bg67b: ['mist', 'snow', 'glint'], bg67g: ['mist', 'snow', 'glow'], bg67v: ['mist', 'snow', 'glow', 'blink']
  };
  var RAIN = {
    bg11: { n: .2, sp: 1, len: 1, hl: true, rings: true, col: [190, 205, 228] },
    bg14: { n: .16, sp: .6, len: .7, hl: false, rings: false, col: [205, 212, 220], a: .8 },
    bg61: { n: .5, sp: 1.05, len: 1.1, hl: false, rings: true, col: [205, 215, 230], a: .9 }
  };
  var SNOW = {
    bg22: { poly: [[0, 0], [1058, 0], [1088, 612], [380, 900], [0, 900]], n: 1, sc: 1, vx: 0 },
    bg15: { poly: [[992, 18], [1224, 18], [1224, 222], [992, 222]], n: .22, sc: .6, vx: 0, local: true },
    bg25: { poly: [[212, 48], [406, 48], [406, 212], [212, 212]], n: .22, sc: .6, vx: 0, local: true },
    bg24: { poly: [[0, 0], [1600, 0], [1600, 900], [0, 900]], n: 1.1, sc: 1, vx: -70, fast: 1, col: '170,185,205' },
    bg44: { poly: [[1050, 120], [1330, 120], [1420, 560], [880, 560]], n: .3, sc: .5, vx: 0, local: true, col: '255,235,190' },
    bg47a: { poly: [[0, 500], [1600, 500], [1600, 900], [0, 900]], n: 1.4, sc: .8, vx: -170, fast: 1, streak: 1, col: '238,208,152' },
    bg47b: { poly: [[160, 210], [1440, 210], [1440, 640], [160, 640]], n: .35, sc: .5, vx: 0, local: true, col: '255,236,186' },
    bg51: { poly: [[790, 140], [1030, 140], [1160, 560], [620, 560]], n: .35, sc: .5, vx: 0, local: true, col: '255,215,160' },
    bg54: { poly: [[540, 70], [690, 70], [820, 420], [430, 420]], n: .3, sc: .5, vx: 0, local: true, col: '255,230,180' },
    bg58: { poly: [[820, 140], [960, 140], [1060, 520], [720, 520]], n: .3, sc: .5, vx: 0, local: true, col: '255,225,175' },
    bg65: { poly: [[0, 0], [1600, 0], [1600, 900], [0, 900]], n: .9, sc: 1, vx: -35, col: '205,218,238' },
    bg67a: { poly: [[0, 0], [1600, 0], [1600, 900], [0, 900]], n: 1.3, sc: 1, vx: -55, col: '215,225,240' },
    bg67b: { poly: [[0, 0], [1600, 0], [1600, 900], [0, 900]], n: 1.3, sc: 1, vx: -55, col: '215,225,240' },
    bg67g: { poly: [[0, 0], [1600, 0], [1600, 900], [0, 900]], n: .6, sc: 1, vx: -25, col: '215,225,240' },
    bg67v: { poly: [[0, 0], [1600, 0], [1600, 900], [0, 900]], n: 1.0, sc: 1, vx: -40, col: '205,218,238' }
  };
  var MIST = {
    bg13: [{ y: 640, rx: 460, ry: 70, sp: 11, a: .075, col: [135, 155, 180], off: 0 }, { y: 560, rx: 520, ry: 60, sp: -7, a: .06, col: [120, 145, 175], off: 700 }, { y: 300, rx: 540, ry: 130, sp: 5, a: .05, col: [115, 140, 170], off: 300 }],
    bg14: [{ y: 380, rx: 560, ry: 120, sp: 14, a: .10, col: [232, 232, 226], off: 0 }, { y: 640, rx: 620, ry: 90, sp: -9, a: .08, col: [225, 225, 220], off: 800 }, { y: 200, rx: 640, ry: 130, sp: 7, a: .07, col: [235, 235, 232], off: 400 }],
    bg42: [{ y: 455, rx: 520, ry: 42, sp: 9, a: .12, col: [210, 215, 220], off: 0 }, { y: 485, rx: 600, ry: 36, sp: -6, a: .09, col: [200, 205, 212], off: 800 }],
    bg44: [{ y: 300, rx: 700, ry: 110, sp: 6, a: .07, col: [255, 230, 180], off: 0 }, { y: 560, rx: 760, ry: 60, sp: -5, a: .05, col: [235, 215, 170], off: 600 }],
    bg45b: [{ y: 330, rx: 620, ry: 90, sp: 9, a: .09, col: [225, 228, 230], off: 0 }, { y: 560, rx: 700, ry: 70, sp: -6, a: .07, col: [215, 220, 224], off: 700 }, { y: 250, rx: 640, ry: 60, sp: 5, a: .06, col: [225, 228, 230], off: 300 }],
    bg46: [{ y: 320, rx: 600, ry: 70, sp: 6, a: .07, col: [120, 140, 165], off: 0 }, { y: 260, rx: 700, ry: 60, sp: -4, a: .05, col: [110, 130, 158], off: 500 }],
    bg47a: [{ y: 480, rx: 700, ry: 50, sp: 8, a: .10, col: [240, 215, 165], off: 0 }, { y: 600, rx: 760, ry: 40, sp: -6, a: .08, col: [235, 210, 160], off: 500 }],
    bg47b: [{ y: 540, rx: 700, ry: 60, sp: 6, a: .07, col: [235, 215, 165], off: 0 }, { y: 420, rx: 640, ry: 60, sp: -4, a: .05, col: [235, 215, 170], off: 400 }],
    bg48b: [{ y: 430, rx: 700, ry: 90, sp: 5, a: .08, col: [110, 125, 150], off: 0 }, { y: 560, rx: 800, ry: 60, sp: -4, a: .06, col: [100, 115, 140], off: 700 }],
    bg48: [{ y: 430, rx: 700, ry: 90, sp: 5, a: .08, col: [110, 125, 150], off: 0 }, { y: 560, rx: 800, ry: 60, sp: -4, a: .06, col: [100, 115, 140], off: 700 }],
    bg51: [{ y: 560, rx: 640, ry: 70, sp: 6, a: .06, col: [200, 205, 210], off: 0 }, { y: 300, rx: 700, ry: 90, sp: -4, a: .05, col: [190, 200, 210], off: 600 }],
    bg52: [{ y: 640, rx: 700, ry: 80, sp: 5, a: .06, col: [210, 200, 185], off: 300 }],
    bg54: [{ y: 540, rx: 700, ry: 60, sp: 5, a: .06, col: [200, 205, 210], off: 0 }],
    bg55: [{ y: 560, rx: 760, ry: 70, sp: 8, a: .09, col: [150, 170, 195], off: 0 }, { y: 700, rx: 800, ry: 60, sp: -5, a: .07, col: [140, 160, 185], off: 700 }, { y: 300, rx: 700, ry: 80, sp: 4, a: .06, col: [150, 170, 195], off: 300 }],
    bg56: [{ y: 440, rx: 700, ry: 80, sp: 5, a: .07, col: [110, 125, 150], off: 0 }, { y: 600, rx: 800, ry: 60, sp: -4, a: .05, col: [100, 115, 140], off: 700 }],
    bg57: [{ y: 520, rx: 700, ry: 50, sp: 7, a: .12, col: [225, 225, 230], off: 0 }, { y: 640, rx: 760, ry: 45, sp: -5, a: .09, col: [220, 222, 228], off: 600 }],
    bg58: [{ y: 560, rx: 700, ry: 60, sp: 5, a: .06, col: [190, 195, 205], off: 0 }],
    bg61: [{ y: 560, rx: 760, ry: 90, sp: 6, a: .07, col: [200, 205, 212], off: 0 }, { y: 360, rx: 700, ry: 70, sp: -4, a: .05, col: [205, 210, 218], off: 500 }],
    bg62: [{ y: 330, rx: 700, ry: 70, sp: 5, a: .07, col: [190, 200, 195], off: 0 }, { y: 470, rx: 800, ry: 50, sp: -4, a: .05, col: [185, 195, 190], off: 600 }],
    bg64: [{ y: 470, rx: 720, ry: 80, sp: 5, a: .07, col: [150, 165, 190], off: 0 }, { y: 650, rx: 800, ry: 60, sp: -4, a: .05, col: [140, 155, 180], off: 600 }],
    bg66: [{ y: 330, rx: 600, ry: 70, sp: 6, a: .06, col: [120, 140, 165], off: 0 }],
    bg67a: [{ y: 700, rx: 760, ry: 60, sp: 7, a: .07, col: [170, 185, 205], off: 0 }, { y: 520, rx: 700, ry: 50, sp: -5, a: .05, col: [160, 175, 200], off: 500 }],
    bg67b: [{ y: 700, rx: 760, ry: 60, sp: 7, a: .07, col: [170, 185, 205], off: 0 }, { y: 520, rx: 700, ry: 50, sp: -5, a: .05, col: [160, 175, 200], off: 500 }],
    bg67g: [{ y: 640, rx: 760, ry: 60, sp: 6, a: .06, col: [170, 185, 205], off: 0 }, { y: 400, rx: 700, ry: 50, sp: -4, a: .05, col: [230, 200, 150], off: 500 }],
    bg67v: [{ y: 700, rx: 760, ry: 60, sp: 6, a: .07, col: [150, 165, 190], off: 0 }]
  };
  var GLOW = {
    bg14: [{ x: 1130, y: 235, r: 230, col: [255, 214, 150], a: .07, sp: .5 }],
    bg15: [{ x: 295, y: 185, r: 300, col: [255, 190, 100], a: .07, sp: .7 }, { x: 460, y: 290, r: 190, col: [120, 190, 255], a: .05, sp: 1.3 }],
    bg25: [{ x: 850, y: 230, r: 430, col: [140, 190, 255], a: .05, sp: .9 }],
    bg41: [{ x: 940, y: 235, r: 420, col: [255, 200, 120], a: .07, sp: .6 }, { x: 780, y: 190, r: 300, col: [150, 185, 235], a: .04, sp: .4 }, { x: 240, y: 350, r: 260, col: [150, 200, 255], a: .05, sp: 1.1 }],
    bg42: [{ x: 850, y: 70, r: 520, col: [255, 245, 220], a: .05, sp: .3 }],
    bg44: [{ x: 1230, y: 125, r: 380, col: [255, 235, 190], a: .09, sp: .8 }],
    bg45: [{ x: 720, y: 400, r: 300, col: [255, 90, 50], a: .04, sp: .7 }, { x: 1000, y: 420, r: 260, col: [255, 120, 60], a: .035, sp: .9 }],
    bg45b: [{ x: 430, y: 365, r: 130, col: [255, 225, 160], a: .10, sp: .9 }, { x: 713, y: 385, r: 110, col: [255, 225, 160], a: .09, sp: 1.1 }],
    bg46: [{ x: 780, y: 480, r: 420, col: [255, 215, 150], a: .05, sp: .5 }, { x: 330, y: 745, r: 200, col: [255, 150, 70], a: .06, sp: 1.2 }],
    bg47b: [{ x: 600, y: 60, r: 600, col: [255, 235, 190], a: .05, sp: .35 }],
    bg48: [{ x: 92, y: 287, r: 260, col: [255, 190, 110], a: .12, sp: .9 }, { x: 1190, y: 307, r: 300, col: [255, 190, 110], a: .12, sp: 1.1 }],
    bg48b: [{ x: 90, y: 300, r: 260, col: [255, 190, 110], a: .12, sp: .9 }, { x: 1190, y: 305, r: 300, col: [255, 190, 110], a: .12, sp: 1.1 }],
    bg49: [{ x: 420, y: 150, r: 420, col: [255, 170, 90], a: .10, sp: .7 }, { x: 625, y: 390, r: 330, col: [170, 210, 255], a: .04, sp: 1.3 }],
    bg51: [{ x: 910, y: 105, r: 340, col: [255, 185, 110], a: .10, sp: .7 }, { x: 60, y: 40, r: 300, col: [120, 190, 210], a: .05, sp: .5 }],
    bg52: [{ x: 1280, y: 200, r: 340, col: [255, 200, 130], a: .09, sp: .6 }, { x: 830, y: 95, r: 260, col: [140, 190, 255], a: .06, sp: 1.1 }],
    bg53: [{ x: 900, y: 420, r: 420, col: [255, 200, 120], a: .07, sp: .8 }, { x: 1290, y: 130, r: 300, col: [160, 190, 230], a: .05, sp: .4 }],
    bg54: [{ x: 612, y: 60, r: 380, col: [255, 215, 150], a: .09, sp: .6 }],
    bg55: [{ x: 636, y: 300, r: 300, col: [255, 205, 130], a: .09, sp: .8 }, { x: 520, y: 440, r: 170, col: [255, 245, 220], a: .06, sp: 1.3 }],
    bg56: [{ x: 850, y: 95, r: 360, col: [255, 200, 130], a: .10, sp: .7 }],
    bg57: [{ x: 700, y: 430, r: 560, col: [255, 225, 170], a: .05, sp: .35 }],
    bg58: [{ x: 890, y: 120, r: 360, col: [255, 190, 120], a: .09, sp: .7 }, { x: 1330, y: 70, r: 300, col: [150, 200, 255], a: .05, sp: .5 }],
    bg61: [{ x: 800, y: 320, r: 560, col: [255, 214, 150], a: .07, sp: .6 }],
    bg63: [{ x: 813, y: 500, r: 420, col: [255, 200, 120], a: .09, sp: .6 }],
    bg64: [{ x: 230, y: 150, r: 330, col: [255, 225, 160], a: .09, sp: .8 }, { x: 1100, y: 150, r: 300, col: [255, 210, 150], a: .07, sp: 1.0 }, { x: 740, y: 350, r: 170, col: [255, 245, 225], a: .09, sp: 1.2 }],
    bg65: [{ x: 840, y: 440, r: 280, col: [255, 215, 150], a: .08, sp: 1.1 }],
    bg66: [{ x: 800, y: 420, r: 420, col: [255, 215, 150], a: .05, sp: .5 }, { x: 760, y: 740, r: 300, col: [255, 150, 70], a: .04, sp: 1.2 }],
    bg67g: [{ x: 1100, y: 350, r: 520, col: [255, 190, 110], a: .07, sp: .5 }, { x: 160, y: 270, r: 240, col: [255, 200, 120], a: .08, sp: .9 }],
    bg67v: [{ x: 560, y: 290, r: 380, col: [255, 40, 30], a: .05, sp: 1.2 }]
  };
  var FLICKER = {                                   // области, затемняемые при моргании света: [cx, cy, радиус, непрозрачность, растяжение x, растяжение y]
    bg23: [[770, 330, 640, .5], [765, 100, 150, .78], [930, 124, 560, .5, 1, .05]],
    bg44: [[1230, 125, 520, .34], [1232, 102, 110, .55]],
    bg54: [[612, 70, 520, .3], [612, 45, 110, .5]]
  };
  var SCRN = {                                      // экраны ноутбуков: мерцание и бегущая строка развёртки
    bg41: { poly: [[140, 285], [331, 296], [333, 400], [144, 408]], col: '150,200,255', a: .06 },
    bg49: { poly: [[447, 300], [797, 300], [797, 487], [447, 487]], col: '150,205,255', a: .05 },
    bg53: { poly: [[803, 346], [1038, 336], [998, 500], [775, 490]], col: '200,225,255', a: .05 }
  };
  var BLINK = {                                     // индикаторы, мигающие по-настоящему: x, y, радиус, цвет, период, доля «горит», яркость, сдвиг фазы
    bg45: [{ x: 840, y: 469, r: 70, col: '255,190,60', per: 1.3, on: .55, a: .55 }, { x: 713, y: 437, r: 34, col: '255,150,50', per: 1.3, on: .55, a: .5 }, { x: 597, y: 413, r: 30, col: '255,150,50', per: 1.3, on: .55, a: .45 }, { x: 1000, y: 457, r: 34, col: '255,140,50', per: 1.3, on: .55, a: .45 }],
    bg46: [{ x: 337, y: 716, r: 22, col: '255,60,45', per: 1.1, on: .5, a: .7 }, { x: 388, y: 720, r: 22, col: '255,60,45', per: 1.1, on: .5, a: .7, off: .55 }],
    bg52: [{ x: 630, y: 556, r: 100, col: '255,70,50', per: 3.4, on: .55, a: .30 }],
    bg55: [{ x: 603, y: 402, r: 46, col: '120,200,255', per: 1.5, on: .6, a: .5 }, { x: 603, y: 402, r: 18, col: '200,235,255', per: 1.5, on: .6, a: .5 }],
    bg67v: [{ x: 562, y: 286, r: 80, col: '255,50,40', per: 1.1, on: .5, a: .6 }, { x: 408, y: 256, r: 44, col: '255,50,40', per: 1.1, on: .5, a: .55, off: .55 }]
  };
  var GLINT = {                                     // блики на металле: x, y, размер, период, сдвиг
    bg47a: [{ x: 672, y: 300, r: 34, per: 3.4, off: 0 }, { x: 655, y: 380, r: 28, per: 4.1, off: 1.3 }, { x: 713, y: 378, r: 22, per: 3.1, off: 2.2 }],
    bg57: [{ x: 900, y: 700, r: 22, per: 3.6, off: 0 }, { x: 1120, y: 770, r: 20, per: 4.2, off: 1.1 }, { x: 1320, y: 700, r: 18, per: 3.1, off: 2 }, { x: 1000, y: 830, r: 24, per: 4.6, off: 2.7 },
           { x: 1230, y: 620, r: 16, per: 3.3, off: .6 }, { x: 760, y: 760, r: 18, per: 3.9, off: 1.8 }, { x: 1450, y: 820, r: 22, per: 4.4, off: 3.1 }, { x: 600, y: 690, r: 16, per: 3.0, off: 2.4 }],
    bg58: [{ x: 210, y: 440, r: 30, per: 4, off: 0 }, { x: 430, y: 520, r: 26, per: 4.8, off: 1.7 }, { x: 120, y: 560, r: 22, per: 3.8, off: 2.9 }, { x: 1100, y: 215, r: 24, per: 5, off: .8 }],
    bg67a: [{ x: 612, y: 325, r: 30, per: 3.4, off: 0 }, { x: 718, y: 318, r: 22, per: 4.1, off: 1.3 }],
    bg67b: [{ x: 330, y: 354, r: 28, per: 3.6, off: .4 }, { x: 441, y: 366, r: 22, per: 4.2, off: 1.7 }]
  };
  var GLASSCFG = {                                  // стекло, по которому стекают капли (по умолчанию — лобовое bg12)
    bg46: { poly: [[10, 110], [200, 62], [700, 42], [900, 42], [1400, 62], [1590, 110], [1585, 520], [1500, 620], [1100, 610], [500, 610], [100, 620], [10, 540]],
      x0: 120, x1: 1480, y0: 90, y1: 400, ymax: 590, tr: '205,218,238', g: ['rgba(238,244,252,.9)', 'rgba(190,205,226,.55)', 'rgba(170,190,215,.15)'] },
    bg53: { poly: [[1125, 8], [1432, 8], [1432, 285], [1125, 292]], x0: 1140, x1: 1420, y0: 30, y1: 140, ymax: 280, tr: '205,218,238', g: ['rgba(238,244,252,.85)', 'rgba(190,205,226,.5)', 'rgba(170,190,215,.12)'] },
    bg63: { poly: [[30, 20], [440, 20], [440, 740], [30, 745]], x0: 50, x1: 420, y0: 40, y1: 300, ymax: 730, tr: '205,218,238', g: ['rgba(238,244,252,.85)', 'rgba(190,205,226,.5)', 'rgba(170,190,215,.12)'] },
    bg66: { poly: [[117, 210], [270, 150], [1250, 150], [1407, 230], [1392, 625], [132, 625]], x0: 140, x1: 1390, y0: 175, y1: 380, ymax: 600, tr: '205,218,238', g: ['rgba(238,244,252,.9)', 'rgba(190,205,226,.55)', 'rgba(170,190,215,.15)'] }
  };
  var fxC = document.getElementById('fx'), fxX = fxC && fxC.getContext ? fxC.getContext('2d') : null;
  var fxOn = false, fxRaf = 0, fxW = 0, fxH = 0, fxK = 1, fxLast = 0, fxOff = 0, fxKey = null, fxModes = [], fxImg = null;
  var IMG_W = 1600, IMG_H = 900;
  var drops = [], rings = [], flakes = [], gdrops = [], gT = 0, puffSt = {}, fl = { next: 2, seq: [], t0: 0, lvl: 0 }, fl2 = { next: 1.5, seq: [], lvl: .55 };
  var rainCfg = RAIN.bg11, snowCfg = SNOW.bg22;
  var PUFF = {
    steam:   { em: [[171, 466]], dx: -78, dy: -340, pw: .85, life: [4.6, 6.8], spawn: [.16, .26], r0: [9, 16], grow: 78, al: [.10, .17], col: [238, 230, 218], wob: [4, 38] },
    smoke:   { em: [[1080, 474]], dx: 150, dy: -230, pw: .8, life: [4.2, 6.2], spawn: [.30, .5], r0: [9, 15], grow: 70, al: [.10, .17], col: [190, 190, 198], wob: [3, 26] },
    smoke13: { em: [[585, 392]], dx: -60, dy: -250, pw: .85, life: [4.5, 6.5], spawn: [.28, .45], r0: [8, 13], grow: 60, al: [.08, .14], col: [160, 172, 190], wob: [3, 24] },
    dust24:  { em: [[470, 468], [610, 502]], dx: -230, dy: -95, pw: .8, life: [1.8, 3.0], spawn: [.10, .18], r0: [14, 24], grow: 70, al: [.16, .26], col: [244, 247, 252], wob: [2, 14] },
    breath24: { em: [[1213, 303], [1276, 298], [1308, 294], [1371, 302], [1438, 297], [1473, 300]], dx: -18, dy: -34, pw: .9, life: [1.3, 2.0], spawn: [.35, .6], r0: [3, 5], grow: 11, al: [.18, .3], col: [250, 252, 255], wob: [1, 4] },
    steam33: { em: [[938, 515]], dx: -8, dy: -105, pw: .9, life: [2.6, 3.8], spawn: [.28, .45], r0: [4, 7], grow: 24, al: [.10, .17], col: [236, 236, 240], wob: [2, 10] },
    exhaust42: { em: [[300, 472]], dx: -150, dy: -80, pw: .8, life: [2.8, 4.2], spawn: [.28, .45], r0: [8, 14], grow: 50, al: [.07, .12], col: [175, 178, 185], wob: [3, 18] },
    dust43:  { em: [[420, 470], [300, 495], [190, 480], [110, 470]], dx: -250, dy: -50, pw: .8, life: [2.4, 3.8], spawn: [.08, .15], r0: [30, 50], grow: 110, al: [.16, .28], col: [226, 196, 140], wob: [4, 22] },
    steam48: { em: [[900, 350], [820, 345], [960, 320]], dx: 70, dy: -250, pw: .85, life: [3.4, 5.2], spawn: [.2, .34], r0: [10, 16], grow: 70, al: [.10, .17], col: [215, 222, 235], wob: [3, 28] },
    steam48b: { em: [[870, 372], [800, 366], [960, 352]], dx: 70, dy: -260, pw: .85, life: [3.4, 5.2], spawn: [.2, .34], r0: [10, 16], grow: 70, al: [.10, .17], col: [215, 222, 235], wob: [3, 28] },
    steam49: { em: [[1003, 498]], dx: -10, dy: -150, pw: .9, life: [2.2, 3.4], spawn: [.28, .45], r0: [4, 7], grow: 22, al: [.10, .17], col: [240, 236, 228], wob: [2, 10] },
    steam56: { em: [[820, 335], [760, 325], [880, 345]], dx: 40, dy: -250, pw: .85, life: [3.4, 5.2], spawn: [.2, .34], r0: [10, 16], grow: 70, al: [.10, .17], col: [215, 222, 235], wob: [3, 28] },
    steam64: { em: [[930, 360], [885, 348], [1000, 385]], dx: 40, dy: -210, pw: .85, life: [3.4, 5.2], spawn: [.2, .34], r0: [10, 16], grow: 70, al: [.10, .17], col: [215, 222, 235], wob: [3, 28] },
    breath65: { em: [[420, 262]], dx: -22, dy: -30, pw: .9, life: [1.3, 2.0], spawn: [.35, .6], r0: [3, 5], grow: 11, al: [.18, .3], col: [250, 252, 255], wob: [1, 4] },
    dust57:  { em: [[740, 560], [780, 570], [820, 555]], dx: 320, dy: -60, pw: .8, life: [2.6, 4.2], spawn: [.09, .16], r0: [26, 40], grow: 130, al: [.14, .24], col: [226, 214, 196], wob: [4, 22] }
  };
  var GLASS12 = [[125, 150], [300, 48], [1300, 48], [1475, 150], [1385, 585], [1225, 622], [260, 622]];
  var SCREEN25 = [[691, 163], [1010, 156], [998, 334], [688, 324]], VP25 = [850, 262];
  var SCREEN15 = [[380, 232], [524, 220], [540, 320], [396, 340]];
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function fxMap(key) {                              // картинка bg-cover: пересчёт координат картинки в кадр
    var d = S.bgs[key || fxKey || 'bg11'], p = (d.pos || '50% 50%').split(' ');
    var s = Math.max(fxW / IMG_W, fxH / IMG_H), w = IMG_W * s, h = IMG_H * s;
    return { s: s, x: (fxW - w) * parseFloat(p[0]) / 100, y: (fxH - h) * parseFloat(p[1]) / 100 };
  }
  function lit(m, x, y) {                            // насколько точка освещена фарами (bg11), 0..1
    var ix = (x - m.x) / m.s, iy = (y - m.y) / m.s;
    function g(cx, cy, rx, ry) { var a = (ix - cx) / rx, b = (iy - cy) / ry; return Math.exp(-(a * a + b * b)); }
    return Math.min(1, g(220, 560, 330, 190) + g(560, 560, 260, 150) + g(600, 400, 260, 120));
  }
  function clipPoly(x, m, pts) {
    x.beginPath();
    pts.forEach(function (p, i) { var px = m.x + p[0] * m.s, py = m.y + p[1] * m.s; if (i) x.lineTo(px, py); else x.moveTo(px, py); });
    x.closePath(); x.clip();
  }
  function newDrop(any) {
    var near = Math.random() < .3, sc = fxH / 900, c = rainCfg;
    return {
      x: Math.random() * (fxW + 200) - 40, y: any ? Math.random() * fxH : -40 * Math.random(),
      len: (near ? 24 + Math.random() * 22 : 11 + Math.random() * 12) * sc * c.len,
      v: (near ? 780 + Math.random() * 260 : 540 + Math.random() * 220) * sc * c.sp,
      a: (near ? .32 + Math.random() * .2 : .16 + Math.random() * .16) * (c.a || 1), w: near ? 1.5 : 1
    };
  }
  function newFlake(any) {
    var near = Math.random() < .3, sc = fxH / 900, c = snowCfg, k = c.sc;
    var s = { x: Math.random() * fxW, y: any ? Math.random() * fxH : -10, r: (near ? rnd(1.8, 3) : rnd(.8, 1.7)) * Math.max(.7, sc) * k,
      vy: (near ? rnd(34, 58) : rnd(18, 34)) * sc * (c.fast ? 1.4 : 1), ph: Math.random() * 6.28, sw: rnd(.4, 1), amp: rnd(8, 26) * sc * k, a: near ? rnd(.6, .9) : rnd(.35, .65) };
    if (c.vx) { s.vx = c.vx * sc * rnd(.6, 1.3); if (!any) { s.x = fxW + 10 * Math.random(); s.y = Math.random() * fxH; } }
    return s;
  }
  function fxInit() {
    var base = Math.min(260, Math.max(90, fxW * fxH / 5200));
    drops = []; rings = []; flakes = []; gdrops = []; gT = 0;
    rainCfg = RAIN[fxKey] || RAIN.bg11; snowCfg = SNOW[fxKey] || SNOW.bg22;
    if (fxModes.indexOf('rain') >= 0) for (var q = 0, n = Math.round(base * rainCfg.n); q < n; q++) drops.push(newDrop(true));
    if (fxModes.indexOf('snow') >= 0) for (var k = 0, nf = Math.round(Math.min(220, Math.max(70, fxW * fxH / 7000)) * snowCfg.n); k < nf; k++) flakes.push(newFlake(true));
    puffSt = {};
    fxModes.forEach(function (md) {
      if (md.indexOf('puff:') !== 0) return;
      var nm = md.slice(5), c = PUFF[nm]; if (!c) return;
      var st = puffSt[nm] = { list: [], t: 0 };
      for (var i = 0; i < 26; i++) st.list.push(newPuff(c, Math.random() * c.life[1]));
    });
    fl = { next: 2.5, seq: [], t0: 0, lvl: 0 }; fl2 = { next: 1.2, seq: [], lvl: .55 };
    var Dv = DRIVE[fxKey]; if (Dv) { dImg(S.bgs[fxKey].src); if (Dv.plate) dImg(Dv.plate); if (Dv.car) dImg(Dv.car.src); }
    var src = S.bgs[fxKey] && S.bgs[fxKey].src;
    if (fxModes.indexOf('video25') >= 0 && src && (!fxImg || fxImg._s !== src)) { fxImg = new Image(); fxImg._s = src; fxImg.src = src; }
  }
  function fxSize() {
    if (!fxC) return;
    var r = fxC.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    fxW = Math.max(1, Math.round(r.width)); fxH = Math.max(1, Math.round(r.height)); fxK = dpr;
    fxC.width = Math.round(fxW * dpr); fxC.height = Math.round(fxH * dpr);
    if (!dc) { dc = document.createElement('canvas'); dx = dc.getContext('2d'); }
    dc.width = fxC.width; dc.height = fxC.height;
    if (!dc2) { dc2 = document.createElement('canvas'); dx2 = dc2.getContext('2d'); }
    dc2.width = fxC.width; dc2.height = fxC.height;
    fxInit();
  }

  /* дождь / морось */
  function rainFx(x, m, tt, dt) {
    var wind = -.16, c = rainCfg, cr = c.col;
    x.lineCap = 'round';
    for (var q = 0; q < drops.length; q++) {
      var d = drops[q];
      d.y += d.v * dt; d.x += d.v * wind * dt;
      if (d.y > fxH + 20) {
        if (c.rings && d.y > fxH * .58 && Math.random() < .5 && rings.length < 40) rings.push({ x: d.x, y: d.y, t: 0, l: lit(m, d.x, fxH * .8) });
        drops[q] = newDrop(false); continue;
      }
      var L = c.hl ? lit(m, d.x, d.y) : 0, a = d.a * (1 + L * 1.1);
      x.strokeStyle = 'rgba(' + ((cr[0] + 60 * L) | 0) + ',' + ((cr[1] + 30 * L) | 0) + ',' + ((cr[2] - 60 * L) | 0) + ',' + Math.min(.8, a).toFixed(3) + ')';
      x.lineWidth = d.w;
      x.beginPath(); x.moveTo(d.x, d.y); x.lineTo(d.x - d.len * wind, d.y - d.len); x.stroke();
    }
    for (var k = rings.length - 1; k >= 0; k--) {
      var rg = rings[k]; rg.t += dt;
      if (rg.t > .4) { rings.splice(k, 1); continue; }
      var p = rg.t / .4, rr = (2 + 8 * p) * (fxH / 900);
      x.strokeStyle = 'rgba(' + ((210 + 40 * rg.l) | 0) + ',' + ((215 + 10 * rg.l) | 0) + ',' + ((225 - 50 * rg.l) | 0) + ',' + ((1 - p) * (.28 + .3 * rg.l)).toFixed(3) + ')';
      x.lineWidth = 1; x.beginPath(); x.ellipse(rg.x, rg.y, rr, rr * .38, 0, 0, 6.2832); x.stroke();
    }
  }
  function headlightsFx(x, m, tt) {                   // bg11: свет фар «дышит», туман в луче
    var br = .55 + .08 * Math.sin(tt * 1.7) + .04 * Math.sin(tt * 4.3 + 1);
    x.globalCompositeOperation = 'lighter';
    [[395, 388, 90], [705, 402, 120]].forEach(function (h) {
      var cx = m.x + h[0] * m.s, cy = m.y + h[1] * m.s, rad = h[2] * m.s;
      var gr = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
      gr.addColorStop(0, 'rgba(255,225,150,' + (.22 * br).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(255,200,110,0)');
      x.fillStyle = gr; x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    });
    var fx2 = m.x + (230 + 40 * Math.sin(tt * .35)) * m.s, fy2 = m.y + 590 * m.s, fr = 380 * m.s;
    var fg = x.createRadialGradient(fx2, fy2, 0, fx2, fy2, fr);
    fg.addColorStop(0, 'rgba(255,215,140,' + (.05 + .02 * Math.sin(tt * .9)).toFixed(3) + ')'); fg.addColorStop(1, 'rgba(255,215,140,0)');
    x.fillStyle = fg; x.fillRect(fx2 - fr, fy2 - fr, fr * 2, fr * 2);
    x.globalCompositeOperation = 'source-over';
  }

  /* клубы пара / дыма / пыли: поднимаются из точек-источников и расплываются */
  function newPuff(c, age0) {
    var e = c.em[(Math.random() * c.em.length) | 0];
    return { age: age0 || 0, life: rnd(c.life[0], c.life[1]), ph: Math.random() * 6.28, sw: rnd(.8, 1.7), r0: rnd(c.r0[0], c.r0[1]), a: rnd(c.al[0], c.al[1]), ex: e[0] + rnd(-3, 3), ey: e[1] };
  }
  function puffFx(x, m, tt, dt, name) {
    var c = PUFF[name], st = puffSt[name]; if (!st) return;
    st.t -= dt;
    if (st.t <= 0) { st.list.push(newPuff(c, 0)); st.t = rnd(c.spawn[0], c.spawn[1]); }
    for (var q = st.list.length - 1; q >= 0; q--) {
      var p = st.list[q]; p.age += dt;
      var u = p.age / p.life;
      if (u >= 1) { st.list.splice(q, 1); continue; }
      var wob = Math.sin(p.age * p.sw * 2 + p.ph) * (c.wob[0] + (c.wob[1] - c.wob[0]) * u) + Math.sin(tt * .45 + p.ph) * 14 * u * (c.wob[1] > 10 ? 1 : .2);
      var ix = p.ex + c.dx * Math.pow(u, c.pw) + wob, iy = p.ey + c.dy * u;
      var rad = (p.r0 + c.grow * Math.pow(u, .8)) * m.s;
      var al = p.a * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), .9) * (u < .08 ? u / .08 : 1);
      var cx = m.x + ix * m.s, cy = m.y + iy * m.s, col = c.col.join(',');
      var stx = c.st || 1;                             // st > 1 — клуб вытянут по горизонтали (снежный шлейф за машиной)
      x.save(); x.translate(cx, cy); x.scale(stx, 1);
      var g = x.createRadialGradient(0, 0, 0, 0, 0, rad);
      g.addColorStop(0, 'rgba(' + col + ',' + al.toFixed(3) + ')'); g.addColorStop(.55, 'rgba(' + col + ',' + (al * .55).toFixed(3) + ')'); g.addColorStop(1, 'rgba(' + col + ',0)');
      x.fillStyle = g; x.fillRect(-rad, -rad, rad * 2, rad * 2); x.restore();
    }
  }

  /* туман: широкие мягкие полосы медленно дрейфуют по кадру */
  function mistFx(x, m, tt) {
    (MIST[fxKey] || []).forEach(function (b) {
      var span = IMG_W + b.rx * 2, px = (((tt * b.sp + b.off) % span) + span) % span - b.rx;
      var cx = m.x + px * m.s, cy = m.y + b.y * m.s, rx = b.rx * m.s, ry = b.ry * m.s, br = 1 + .25 * Math.sin(tt * .3 + b.off);
      x.save(); x.translate(cx, cy); x.scale(1, ry / rx);
      var g = x.createRadialGradient(0, 0, 0, 0, 0, rx), c = b.col.join(',');
      g.addColorStop(0, 'rgba(' + c + ',' + (b.a * br).toFixed(3) + ')'); g.addColorStop(.6, 'rgba(' + c + ',' + (b.a * br * .5).toFixed(3) + ')'); g.addColorStop(1, 'rgba(' + c + ',0)');
      x.fillStyle = g; x.fillRect(-rx, -rx, rx * 2, rx * 2); x.restore();
    });
  }
  /* мягкое «дыхание» источников света */
  function glowFx(x, m, tt) {
    x.globalCompositeOperation = 'lighter';
    (GLOW[fxKey] || []).forEach(function (g) {
      var cx = m.x + g.x * m.s, cy = m.y + g.y * m.s, r = g.r * m.s, a = g.a * (1 + .35 * Math.sin(tt * g.sp) + .15 * Math.sin(tt * g.sp * 2.7 + 1)), c = g.col.join(',');
      var gr = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, 'rgba(' + c + ',' + a.toFixed(3) + ')'); gr.addColorStop(1, 'rgba(' + c + ',0)');
      x.fillStyle = gr; x.fillRect(cx - r, cy - r, r * 2, r * 2);
    });
    x.globalCompositeOperation = 'source-over';
  }

  /* снег: за окном (clip по стеклу) или позёмка на весь кадр */
  function snowFx(x, m, tt, dt) {
    x.save(); clipPoly(x, m, snowCfg.poly);
    var box = null;
    if (snowCfg.local) {                              // маленькое окно: снежинки только в его границах
      var xs = snowCfg.poly.map(function (p) { return m.x + p[0] * m.s; }), ys = snowCfg.poly.map(function (p) { return m.y + p[1] * m.s; });
      box = { x0: Math.min.apply(0, xs), x1: Math.max.apply(0, xs), y0: Math.min.apply(0, ys), y1: Math.max.apply(0, ys) };
    }
    for (var q = 0; q < flakes.length; q++) {
      var f = flakes[q];
      if (box && !f.bx) { f.x = box.x0 + Math.random() * (box.x1 - box.x0); f.y = box.y0 + Math.random() * (box.y1 - box.y0); f.bx = 1; }
      f.y += f.vy * dt; if (f.vx) f.x += f.vx * dt;
      var fxp = f.x + Math.sin(tt * f.sw + f.ph) * f.amp;
      var out = box ? f.y > box.y1 + 4 : (f.y > fxH + 8 || (f.vx && f.x < -10));
      if (out) {
        var nf = newFlake(false);
        if (box) { nf.x = box.x0 + Math.random() * (box.x1 - box.x0); nf.y = box.y0 - 2; nf.bx = 1; }
        flakes[q] = nf; continue;
      }
      if (snowCfg.streak && f.vx) {                   // летящий снег: короткие росчерки по ходу ветра
        x.strokeStyle = 'rgba(' + snowCfg.col + ',' + (f.a * .6).toFixed(3) + ')'; x.lineWidth = Math.max(1, f.r * .9); x.lineCap = 'round';
        x.beginPath(); x.moveTo(fxp, f.y); x.lineTo(fxp - f.vx * .05, f.y - f.vy * .05); x.stroke();
      } else if (f.r > 1.7) {
        var g = x.createRadialGradient(fxp, f.y, 0, fxp, f.y, f.r * 1.8);
        g.addColorStop(0, 'rgba(' + (snowCfg.col || '255,255,255') + ',' + f.a.toFixed(3) + ')'); g.addColorStop(1, 'rgba(' + (snowCfg.col || '255,255,255') + ',0)');
        x.fillStyle = g; x.fillRect(fxp - f.r * 2, f.y - f.r * 2, f.r * 4, f.r * 4);
      } else {
        x.fillStyle = 'rgba(' + (snowCfg.col || '255,255,255') + ',' + f.a.toFixed(3) + ')'; x.beginPath(); x.arc(fxp, f.y, f.r, 0, 6.2832); x.fill();
      }
    }
    x.restore();
  }

  /* быстро стекающие по лобовому стеклу капли (bg12) */
  function glassFx(x, m, tt, dt) {
    var gc = GLASSCFG[fxKey] || { poly: GLASS12, x0: 200, x1: 1400, y0: 70, y1: 430, ymax: 618, tr: '255,222,170', g: ['rgba(255,240,205,.95)', 'rgba(255,205,130,.6)', 'rgba(255,190,100,.15)'] };
    gT -= dt;
    if (gT <= 0 && gdrops.length < 10) {
      gdrops.push({ x: rnd(gc.x0, gc.x1), y: rnd(gc.y0, gc.y1), r: rnd(3, 6.5), v: rnd(260, 520), ph: Math.random() * 6.28, trail: [], hold: rnd(.05, .5) });
      gT = rnd(.25, .7);
    }
    x.save(); clipPoly(x, m, gc.poly); x.lineCap = 'round';
    for (var q = gdrops.length - 1; q >= 0; q--) {
      var d = gdrops[q];
      if (d.hold > 0) d.hold -= dt;
      else {
        var sp = d.v * (.55 + .75 * Math.max(0, Math.sin(tt * 3 + d.ph)) + .2);      // рывками: то быстрее, то медленнее
        d.y += sp * dt; d.x += Math.sin(tt * 2.2 + d.ph) * 14 * dt;
        d.trail.push([d.x, d.y]); if (d.trail.length > 18) d.trail.shift();
      }
      if (d.y > gc.ymax) { gdrops.splice(q, 1); continue; }
      var tl = d.trail;
      for (var k = 1; k < tl.length; k++) {
        x.strokeStyle = 'rgba(' + gc.tr + ',' + (.22 * k / tl.length).toFixed(3) + ')'; x.lineWidth = Math.max(1, d.r * .55 * k / tl.length) * m.s;
        x.beginPath(); x.moveTo(m.x + tl[k - 1][0] * m.s, m.y + tl[k - 1][1] * m.s); x.lineTo(m.x + tl[k][0] * m.s, m.y + tl[k][1] * m.s); x.stroke();
      }
      var cx = m.x + d.x * m.s, cy = m.y + d.y * m.s, rr = d.r * m.s;
      x.fillStyle = 'rgba(0,0,0,.28)'; x.beginPath(); x.ellipse(cx + rr * .15, cy + rr * .25, rr, rr * 1.25, 0, 0, 6.2832); x.fill();
      var g = x.createRadialGradient(cx - rr * .3, cy - rr * .4, 0, cx, cy, rr * 1.2);
      g.addColorStop(0, gc.g[0]); g.addColorStop(.6, gc.g[1]); g.addColorStop(1, gc.g[2]);
      x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, rr, rr * 1.2, 0, 0, 6.2832); x.fill();
    }
    x.restore();
  }

  /* лампа над столом иногда моргает (bg23): затемняем лампу и освещённую область */
  function flickerFx(x, m, tt) {
    if (!fl.seq.length && tt > fl.next) {
      var n = 2 + (Math.random() * 3 | 0), s = [];
      for (var i = 0; i < n; i++) { s.push([rnd(.04, .09), rnd(.55, .95)]); s.push([rnd(.03, .08), rnd(0, .25)]); }
      s.push([rnd(.1, .22), rnd(.3, .6)]); fl.seq = s; fl.t0 = tt; fl.cur = 0; fl.cs = tt;
    }
    var lvl = 0;
    if (fl.seq.length) {
      var step = fl.seq[fl.cur];
      if (tt - fl.cs > step[0]) { fl.cur++; fl.cs = tt; if (fl.cur >= fl.seq.length) { fl.seq = []; fl.next = tt + rnd(4, 9); } }
      if (fl.seq.length) lvl = fl.seq[fl.cur][1];
    }
    fl.lvl += (lvl - fl.lvl) * .6;
    var L = fl.lvl; if (L < .01) return;
    function rad(cx, cy, r, a, rx, ry) {
      var X = m.x + cx * m.s, Y = m.y + cy * m.s, R = r * m.s;
      x.save(); x.translate(X, Y); x.scale(rx || 1, ry || 1);
      var g = x.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, 'rgba(8,6,5,' + (a * L).toFixed(3) + ')'); g.addColorStop(.6, 'rgba(8,6,5,' + (a * L * .55).toFixed(3) + ')'); g.addColorStop(1, 'rgba(8,6,5,0)');
      x.fillStyle = g; x.fillRect(-R, -R, R * 2, R * 2); x.restore();
    }
    (FLICKER[fxKey] || []).forEach(function (c) { rad(c[0], c[1], c[2], c[3], c[4], c[5]); });
  }
  /* экран ноутбука (bg41, bg49): холодное мерцание и редкие скачки яркости */
  function screenFx(x, m, tt) {
    var c = SCRN[fxKey]; if (!c) return;
    var xs = c.poly.map(function (p) { return p[0]; }), ys = c.poly.map(function (p) { return p[1]; });
    var x0 = Math.min.apply(0, xs), x1 = Math.max.apply(0, xs), y0 = Math.min.apply(0, ys), y1 = Math.max.apply(0, ys);
    var a = c.a * (1 + .5 * Math.sin(tt * 6.5) * Math.sin(tt * 1.3)) + (Math.sin(tt * 23) > .92 ? c.a * .9 : 0);
    var sy = y1 - (((tt * 38) % (y1 - y0 + 40)) - 20);                    // тонкая полоса развёртки ползёт вверх
    x.save(); clipPoly(x, m, c.poly); x.globalCompositeOperation = 'lighter';
    x.fillStyle = 'rgba(' + c.col + ',' + a.toFixed(3) + ')'; x.fillRect(m.x + x0 * m.s, m.y + y0 * m.s, (x1 - x0) * m.s, (y1 - y0) * m.s);
    x.fillStyle = 'rgba(' + c.col + ',.10)'; x.fillRect(m.x + x0 * m.s, m.y + sy * m.s, (x1 - x0) * m.s, 4 * m.s);
    x.restore();
  }
  /* контрольные лампы: по-настоящему мигают (горят — гаснут), а не «дышат» */
  function blinkFx(x, m, tt) {
    x.globalCompositeOperation = 'lighter';
    (BLINK[fxKey] || []).forEach(function (b) {
      var ph = (((tt + (b.off || 0)) % b.per) + b.per) % b.per / b.per, lv = ph < b.on ? 1 : .08;
      var cx = m.x + b.x * m.s, cy = m.y + b.y * m.s, r = b.r * m.s, g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(' + b.col + ',' + (b.a * lv).toFixed(3) + ')'); g.addColorStop(1, 'rgba(' + b.col + ',0)');
      x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2);
    });
    x.globalCompositeOperation = 'source-over';
  }
  /* блик на металле: короткая вспышка четырёхлучевой звёздочкой */
  function glintFx(x, m, tt) {
    x.globalCompositeOperation = 'lighter';
    (GLINT[fxKey] || []).forEach(function (b) {
      var ph = (((tt + b.off) % b.per) + b.per) % b.per / b.per, lv = Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, ph * 3.2))), 3) * (ph < .31 ? 1 : 0);
      if (lv < .01) return;
      var cx = m.x + b.x * m.s, cy = m.y + b.y * m.s, r = b.r * m.s * (.55 + .45 * lv);
      var g = x.createRadialGradient(cx, cy, 0, cx, cy, r * .45);
      g.addColorStop(0, 'rgba(255,250,235,' + (.8 * lv).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,240,200,0)');
      x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2);
      x.strokeStyle = 'rgba(255,248,225,' + (.7 * lv).toFixed(3) + ')'; x.lineWidth = Math.max(1, 1.4 * m.s); x.lineCap = 'round';
      x.beginPath(); x.moveTo(cx - r, cy); x.lineTo(cx + r, cy); x.moveTo(cx, cy - r); x.lineTo(cx, cy + r); x.stroke();
    });
    x.globalCompositeOperation = 'source-over';
  }

  /* bg13: аварийные фары машины мигают, как при плохом контакте */
  function lights13Fx(x, m, tt) {
    if (!fl2.seq.length && tt > fl2.next) {
      var s = [], n = 3 + (Math.random() * 4 | 0);
      for (var i = 0; i < n; i++) s.push([rnd(.04, .12), Math.random() < .5 ? rnd(0, .25) : rnd(.8, 1.1)]);
      s.push([rnd(.1, .3), .55]); fl2.seq = s; fl2.cur = 0; fl2.cs = tt;
    }
    var tgt = .55 + .06 * Math.sin(tt * 1.3);
    if (fl2.seq.length) {
      if (tt - fl2.cs > fl2.seq[fl2.cur][0]) { fl2.cur++; fl2.cs = tt; if (fl2.cur >= fl2.seq.length) { fl2.seq = []; fl2.next = tt + rnd(1.5, 4.5); } }
      if (fl2.seq.length) tgt = fl2.seq[fl2.cur][1];
    }
    fl2.lvl += (tgt - fl2.lvl) * .7;
    var L = fl2.lvl;
    [[600, 498, 52], [752, 517, 56]].forEach(function (h) {
      var cx = m.x + h[0] * m.s, cy = m.y + h[1] * m.s, r = h[2] * m.s;
      if (L < .5) {                                                       // гаснет: затемняем нарисованный свет
        var d = (.5 - L) / .5, g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, 'rgba(10,12,18,' + (.78 * d).toFixed(3) + ')'); g.addColorStop(1, 'rgba(10,12,18,0)');
        x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2);
      } else {                                                            // ярче — подсвечиваем
        var a = (L - .5) * .9, g2 = x.createRadialGradient(cx, cy, 0, cx, cy, r * 2.2);
        x.globalCompositeOperation = 'lighter';
        g2.addColorStop(0, 'rgba(255,200,120,' + a.toFixed(3) + ')'); g2.addColorStop(1, 'rgba(255,180,90,0)');
        x.fillStyle = g2; x.fillRect(cx - r * 2.2, cy - r * 2.2, r * 4.4, r * 4.4); x.globalCompositeOperation = 'source-over';
      }
    });
  }

  /* bg15: экран ноутбука мерцает, мигает курсор */
  function screen15Fx(x, m, tt) {
    x.save(); clipPoly(x, m, SCREEN15);
    x.globalCompositeOperation = 'lighter';
    var a = .05 + .03 * Math.sin(tt * 7) * Math.sin(tt * 1.3) + (Math.sin(tt * 23) > .9 ? .05 : 0);
    var sy = ((tt * 40) % 160) - 20;                                      // тонкая полоса развёртки ползёт вверх
    x.fillStyle = 'rgba(120,200,255,' + a.toFixed(3) + ')'; x.fillRect(m.x + 370 * m.s, m.y + 215 * m.s, 180 * m.s, 140 * m.s);
    x.fillStyle = 'rgba(160,220,255,.10)'; x.fillRect(m.x + 370 * m.s, m.y + (340 - sy) * m.s, 180 * m.s, 5 * m.s);
    x.restore();
    if (Math.floor(tt * 1.6) % 2 === 0) { x.fillStyle = 'rgba(180,235,255,.8)'; x.fillRect(m.x + 402 * m.s, m.y + 318 * m.s, 2.5 * m.s, 9 * m.s); }
  }

  /* bg25: «запись с онборда» — картинка на экране медленно «едет» навстречу (бесконечный зум от точки схода) */
  function video25Fx(x, m, tt) {
    var img = fxImg; if (!img || !img.complete || !img.naturalWidth) return;
    x.save(); clipPoly(x, m, SCREEN25);
    var P = 3.4, vx = m.x + VP25[0] * m.s, vy = m.y + VP25[1] * m.s;
    for (var k = 0; k < 2; k++) {
      var ph = ((tt / P) + k * .5) % 1, sc = 1 + .26 * ph, w = Math.pow(Math.sin(Math.PI * ph), 2);
      x.globalAlpha = w;
      x.drawImage(img, vx - VP25[0] * m.s * sc, vy - VP25[1] * m.s * sc, IMG_W * m.s * sc, IMG_H * m.s * sc);
    }
    x.globalAlpha = 1; x.restore();
    x.save(); clipPoly(x, m, SCREEN25); x.globalCompositeOperation = 'lighter';       // лёгкий дрожащий блик «видео»
    x.fillStyle = 'rgba(150,200,255,' + (.03 + .02 * Math.sin(tt * 11)).toFixed(3) + ')'; x.fillRect(m.x + 680 * m.s, m.y + 150 * m.s, 340 * m.s, 180 * m.s);
    x.restore();
  }

  /* ---------- «езда» ----------
     zoom — вид из машины: дорога «подъезжает» от точки схода. Три наложенных слоя с плавной сменой масштаба дают радиальное
            размытие в движении; поверх — лёгкая тряска и редкие толчки на неровностях. Рисуем только «мир» внутри окон:
            салон, приборка, дворники и края стекла остаются неподвижными.
     pan  — машина снаружи: фон без машины (assets/bgNN_plate.webp) плывёт полосами с разной скоростью (параллакс),
            вырезанная машина (assets/bgNN_car.webp) покачивается на ухабах и чуть «скользит» в повороте. */
  var GLASS_DRV12 = [[135, 112], [300, 42], [1300, 42], [1468, 112], [1392, 586], [1000, 584], [700, 580], [450, 582], [262, 592]];
  var PATCH33 = [[618, 262], [626, 298], [655, 318], [700, 330], [750, 338], [870, 338], [910, 331], [962, 316], [990, 298], [1003, 275], [1030, 258], [1042, 230], [1012, 205], [950, 198], [885, 199], [740, 199], [692, 205], [650, 214], [626, 238]];
  var DRIVE = {};                                   // «езда» отключена: эффект движения не прижился (механизм оставлен на случай отдельных кадров)
  var dImgs = {}, dc = null, dx = null, dc2 = null, dx2 = null, drv = { key: null, t0: null }, drvOut = null, moveOn = false, moveT = -9, bump = { t: -9, a: 0, next: 1.2 };
  function dImg(src) { var i = dImgs[src]; if (!i) { i = dImgs[src] = new Image(); i.src = src; } return i.complete && i.naturalWidth ? i : null; }
  function bumpAt(tt, amp) {                          // толчок на неровности: короткое затухающее колебание
    if (tt > bump.next) { bump.t = tt; bump.a = (Math.random() < .5 ? -1 : 1) * (.5 + Math.random() * .8); bump.next = tt + 1.4 + Math.random() * 3.2; }
    var d = tt - bump.t; return bump.a * amp * Math.exp(-5 * d) * Math.cos(16 * d);
  }
  function driveFx(x, m, tt, key, fade) {
    var D = DRIVE[key], img = dImg(S.bgs[key].src); if (!D || !img || !dx) return false;
    var g = dx, k;
    g.setTransform(fxK, 0, 0, fxK, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, fxW, fxH);
    if (D.type === 'zoom') {
      var sx = (Math.sin(tt * 13.1) + .6 * Math.sin(tt * 21.7 + 1.3)) * .5 * D.shake * m.s;
      var sy = ((Math.sin(tt * 11.3 + .7) + .6 * Math.sin(tt * 19.1)) * .5 * D.shake + bumpAt(tt, D.bump)) * m.s;
      D.zones.forEach(function (Z) {
        g.save();
        if (Z.clip) {
          g.beginPath();
          Z.clip.forEach(function (poly) { poly.forEach(function (p, i) { var px = m.x + p[0] * m.s, py = m.y + p[1] * m.s; if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.closePath(); });
          g.clip();
        }
        var src = D.plate ? (dImg(D.plate) || img) : img;
        var vx = m.x + Z.vp[0] * m.s + sx, vy = m.y + Z.vp[1] * m.s + sy, ws = [], scs = [], tot = 0, ph, w;
        for (k = 0; k < Z.n; k++) { ph = (tt / Z.per + k / Z.n) % 1; scs.push(1.03 * Math.pow(Z.z, ph)); w = Math.sin(Math.PI * ph); ws.push(w * w + .002); }
        for (k = 0; k < Z.n; k++) {                                   // нормированная смена слоёв: сумма весов всегда 1, швов нет
          tot += ws[k]; g.globalAlpha = k ? ws[k] / tot : 1;
          g.drawImage(src, vx - Z.vp[0] * m.s * scs[k], vy - Z.vp[1] * m.s * scs[k], IMG_W * m.s * scs[k], IMG_H * m.s * scs[k]);
        }
        g.restore();
      });
      if (D.car && D.type === 'zoom') {                               // машина едет «на нас»: сама почти неподвижна, покачивается на кочках
        var Cz = D.car, cimg = dImg(Cz.src);
        if (cimg) {
          var zb = Cz.bob * (.55 * Math.sin(tt * 10.5) + .45 * Math.sin(tt * 6.3 + 1.1)) + bumpAt(tt, 2.6), zr = Cz.rot * Math.sin(tt * 7.7 + .4) + .004 * Math.sin(tt * .9);
          var qx = Cz.w * Cz.px, qy = Cz.h * Cz.py;
          g.save(); g.translate(m.x + (Cz.x + qx + 3 * Math.sin(tt * .8)) * m.s, m.y + (Cz.y + qy + zb) * m.s); g.rotate(zr);
          g.drawImage(cimg, -qx * m.s, -qy * m.s, Cz.w * m.s, Cz.h * m.s); g.restore();
        }
      }
      if (D.fade) {                                                   // у нижнего края окна «мир» растворяется — там неподвижные дворники и свет фар
        g.globalCompositeOperation = 'destination-out';
        var gr = g.createLinearGradient(0, m.y + D.fade[0] * m.s, 0, m.y + D.fade[1] * m.s);
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
        g.fillStyle = gr; g.fillRect(0, 0, fxW, fxH); g.globalCompositeOperation = 'source-over';
      }
    } else {
      var plate = dImg(D.plate), car = dImg(D.car.src); if (!plate || !car) return false;
      if (!D._mir || D._mirSrc !== plate) {                           // зеркальная лента 2×ширина: фон можно крутить по кругу без шва
        var mc = document.createElement('canvas'); mc.width = IMG_W * 2; mc.height = IMG_H;
        var mg = mc.getContext('2d'); mg.drawImage(plate, 0, 0); mg.translate(IMG_W * 2, 0); mg.scale(-1, 1); mg.drawImage(plate, 0, 0);
        D._mir = mc; D._mirSrc = plate;
      }
      var OV = 80;                                                    // на стыках полосы скорости плавно перетекают друг в друга (без «разрыва» веток и деревьев)
      function band(gc, b, ya, yb) {
        var off = (tt * b[2]) % (IMG_W * 2), w1 = Math.min(IMG_W, IMG_W * 2 - off), hh = yb - ya, dy = m.y + ya * m.s, dh = hh * m.s;
        gc.drawImage(D._mir, off, ya, w1, hh, m.x, dy, w1 * m.s, dh);
        if (w1 < IMG_W) gc.drawImage(D._mir, 0, ya, IMG_W - w1, hh, m.x + w1 * m.s, dy, (IMG_W - w1) * m.s, dh);
      }
      D.bands.forEach(function (b, bi) {
        if (!bi) { band(g, b, b[0], b[1] + 1); return; }
        var t2 = dx2; t2.setTransform(fxK, 0, 0, fxK, 0, 0); t2.globalCompositeOperation = 'source-over'; t2.globalAlpha = 1; t2.clearRect(0, 0, fxW, fxH);
        band(t2, b, b[0] - OV, b[1] + 1);
        t2.globalCompositeOperation = 'destination-in';
        var gr = t2.createLinearGradient(0, m.y + (b[0] - OV) * m.s, 0, m.y + b[0] * m.s);
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
        t2.fillStyle = gr; t2.fillRect(0, 0, fxW, fxH); t2.globalCompositeOperation = 'source-over';
        g.drawImage(dc2, 0, 0, fxW, fxH);
      });
      var C = D.car, bob = 1.5 * (.55 * Math.sin(tt * 10.5) + .45 * Math.sin(tt * 6.3 + 1.1)) + bumpAt(tt, 3.5);
      var slide = 5 * Math.sin(tt * .8), rot = .0075 * Math.sin(tt * .9 + .6) + .0035 * Math.sin(tt * 7.7 + .4);
      var px0 = C.w * .52, py0 = C.h * .8;
      g.save(); g.translate(m.x + (C.x + px0 + slide) * m.s, m.y + (C.y + py0 + bob) * m.s); g.rotate(rot);
      g.drawImage(car, -px0 * m.s, -py0 * m.s, C.w * m.s, C.h * m.s); g.restore();
    }
    x.globalAlpha = Math.max(0, Math.min(1, fade)); x.drawImage(dc, 0, 0, fxW, fxH); x.globalAlpha = 1;
    return true;
  }
  /* bg53: страница live-тайминга «обновляется» раз в десять секунд — короткая вспышка экрана и бегущая сверху вниз строка */
  var SCREEN53 = [[803, 346], [1038, 336], [998, 500], [775, 490]];
  function refresh53Fx(x, m, tt) {
    var ph = (tt + 6) % 10, D = .9;
    if (ph > D) return;
    var u = ph / D, a = Math.sin(Math.PI * u);
    var xs = SCREEN53.map(function (p) { return p[0]; }), ys = SCREEN53.map(function (p) { return p[1]; });
    var x0 = Math.min.apply(0, xs), x1 = Math.max.apply(0, xs), y0 = Math.min.apply(0, ys), y1 = Math.max.apply(0, ys);
    x.save(); clipPoly(x, m, SCREEN53); x.globalCompositeOperation = 'lighter';
    x.fillStyle = 'rgba(200,228,255,' + (.12 * a).toFixed(3) + ')'; x.fillRect(m.x + x0 * m.s, m.y + y0 * m.s, (x1 - x0) * m.s, (y1 - y0) * m.s);
    x.fillStyle = 'rgba(255,255,255,' + (.22 * a).toFixed(3) + ')'; x.fillRect(m.x + x0 * m.s, m.y + (y0 + u * (y1 - y0)) * m.s, (x1 - x0) * m.s, 7 * m.s);
    x.restore();
  }
  /* bg33: красный огонёк видеорегистратора мигает */
  function led33Fx(x, m, tt) {
    var on = (tt % 1.6) < .22 ? 1 : .18, cx = m.x + 712 * m.s, cy = m.y + 119 * m.s, r = 16 * m.s;
    x.globalCompositeOperation = 'lighter';
    var g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,70,50,' + (.5 * on).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,70,50,0)');
    x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2); x.globalCompositeOperation = 'source-over';
  }

  function fxFrame(t) {
    fxRaf = requestAnimationFrame(fxFrame);
    var dt = Math.min(.05, (t - (fxLast || t)) / 1000); fxLast = t;
    var x = fxX, m = fxMap(fxKey), tt = t / 1000, md = fxModes;
    x.setTransform(fxK, 0, 0, fxK, 0, 0); x.clearRect(0, 0, fxW, fxH);
    if (drvOut) {                                    // уходящая «езда» растворяется, пока под ней проявляется новый кадр
      var fo = 1 - (tt - drvOut.t) / .7;
      if (fo <= 0 || !driveFx(x, fxMap(drvOut.key), tt, drvOut.key, fo * (drvOut.g || 1))) drvOut = null;
    }
    if (DRIVE[fxKey]) {
      if (drv.key !== fxKey) drv = { key: fxKey, t0: null };
      var gf = 1;
      if (DRIVE[fxKey].gate) { var gq = (tt - moveT) / (moveOn ? 1.5 : 1.1); gq = Math.max(0, Math.min(1, gq)); gf = moveOn ? gq * gq * (3 - 2 * gq) : 1 - gq * gq * (3 - 2 * gq); }
      if (gf > 0.002 && driveFx(x, m, tt, fxKey, gf * (drv.t0 == null ? 0 : Math.min(1, (tt - drv.t0) / .8))) && drv.t0 == null) drv.t0 = tt;
    }
    for (var q = 0; q < md.length; q++) {
      var n = md[q];
      if (n === 'rain') rainFx(x, m, tt, dt);
      else if (n === 'headlights') headlightsFx(x, m, tt);
      else if (n.indexOf('puff:') === 0) puffFx(x, m, tt, dt, n.slice(5));
      else if (n === 'snow') snowFx(x, m, tt, dt);
      else if (n === 'glass') glassFx(x, m, tt, dt);
      else if (n === 'flicker') flickerFx(x, m, tt);
      else if (n === 'mist') mistFx(x, m, tt);
      else if (n === 'glow') glowFx(x, m, tt);
      else if (n === 'lights13') lights13Fx(x, m, tt);
      else if (n === 'screen15') screen15Fx(x, m, tt);
      else if (n === 'video25') video25Fx(x, m, tt);
      else if (n === 'led33') led33Fx(x, m, tt);
      else if (n === 'screen') screenFx(x, m, tt);
      else if (n === 'blink') blinkFx(x, m, tt);
      else if (n === 'glint') glintFx(x, m, tt);
      else if (n === 'refresh53') refresh53Fx(x, m, tt);
    }
  }
  function fxMove(on) { if (on === moveOn) return; moveOn = on; moveT = performance.now() / 1000; if (STATIC) moveOn = false; }
  function fxSet(key) {
    if (!fxC || !fxX) return;
    var modes = FX_BG[key] || null, want = !!modes && !STATIC;
    if (modes && key !== fxKey) {
      if (fxKey && DRIVE[fxKey] && fxOn && (!DRIVE[fxKey].gate || moveOn)) drvOut = { key: fxKey, t: performance.now() / 1000 };
      moveOn = false; moveT = -9;
      fxKey = key; fxModes = modes; if (fxW) fxInit();
    }
    if (want && !fxOn) {
      fxOn = true; clearTimeout(fxOff); fxSize(); fxC.classList.add('on'); fxLast = 0;
      if (!fxRaf) fxRaf = requestAnimationFrame(fxFrame);
    } else if (!want && fxOn) {
      fxOn = false; fxC.classList.remove('on');
      clearTimeout(fxOff); fxOff = setTimeout(function () { if (!fxOn) { cancelAnimationFrame(fxRaf); fxRaf = 0; fxX.clearRect(0, 0, fxC.width, fxC.height); } }, 800);
    }
  }
  if (fxC && window.ResizeObserver) new ResizeObserver(function () { if (fxOn) fxSize(); }).observe(fxC);

  var layers = [el.bgA, el.bgB], act = -1;
  var KIT_RED = {}; (S.kitRed || []).forEach(function (b) { KIT_RED[b] = true; });
  function portraitKey(sp) { return sp.portraitRed && KIT_RED[bgCur] ? sp.portraitRed : sp.portrait; }   // красный комплект по фону сцены
  function setBg(key, instant) {
    if (key === bgCur) return;
    var d = S.bgs[key], ni = act < 0 ? 0 : 1 - act, next = layers[ni], prev = act < 0 ? null : layers[act];
    var quick = !!instant || STATIC;
    clearTimeout(next._t);
    next.style.backgroundImage = 'url(' + d.src + ')'; next.style.backgroundPosition = d.pos;
    next.style.zIndex = 1; if (prev) prev.style.zIndex = 0;
    next.classList.toggle('instant', quick);
    next.classList.add('on');
    if (prev) {
      clearTimeout(prev._t);
      if (quick) prev.classList.remove('on');
      else prev._t = setTimeout(function () { prev.classList.remove('on'); }, 750);
    }
    act = ni; bgCur = key;
    fxSet(key);
    el.frame.setAttribute('data-bg', key);
    el.bgLabel.setAttribute('aria-label', d.label);
  }
  function applyProps(b, animate) {
    if (b.set) Object.keys(b.set).forEach(function (k) { flags[k] = b.set[k]; });
    if (b.hud) setHud(b.hud);
    if (b.music !== undefined) setMusic(b.music, !animate);
    if (b.bg) setBg(b.bg, !animate);
    if (b.move !== undefined) fxMove(!!b.move);
    if (b.big !== undefined) el.frame.classList.toggle('inds-big', !!b.big);
    if (b.big === false && b.delta === undefined) showDelta(false);              // новая глава: отметка «было» от прошлой не должна висеть под маленькими индикаторами
    if (b.ind) Object.keys(b.ind).forEach(function (k) { setInd(k, b.ind[k], animate); });
    if (b.chapStart) chap0 = { car: stats.car, trust: stats.trust, carW: indState.car.word, trustW: indState.trust.word };
    if (b.snap) snaps[b.snap] = { car: stats.car, trust: stats.trust };
    if (b.stat) applyStats(b.stat, animate);
    if (b.repair) { var rv = repairCar(); if (rv != null) applyStats({ car: { set: rv, dir: true } }, animate); }   // капиталка (5.6): 🔧 возвращается на уровень до «Печор» с поправками
    if (b.delta !== undefined) showDelta(!!b.delta);
    if (b.pulse && animate && !STATIC) b.pulse.forEach(function (k) { var w = el.ind[k].word; w.classList.remove('flash'); void w.offsetWidth; w.classList.add('flash'); });
  }
  function wordLevel(k, w) {                          // место слова в полосе: чем выше, тем лучше; слова обнуления («кончилась», «потеряно») — ниже всех
    if (S.zeroWords.indexOf(w) >= 0) return -1;
    var ws = S.bands[k].words;
    for (var q = 0; q < ws.length; q++) if (ws[q][2] === w) return ws.length - q;
    return 0;
  }
  function showDelta(on) {                          // крупные индикаторы: что изменилось с начала главы
    el.frame.classList.toggle('inds-delta', on);
    ['car', 'trust'].forEach(function (k) {
      var w = el.ind[k].was; if (!w) return;
      if (!on || !chap0 || chap0[k] == null || stats[k] == null) { w.textContent = ''; return; }
      var a = chap0[k + 'W'] || wordFor(k, chap0[k]), b = indState[k].word || wordFor(k, stats[k]);
      var up = wordLevel(k, b) > wordLevel(k, a);                                // направление — по словам, которые видит игрок («кончилась» ниже любого слова полосы)
      w.textContent = a === b ? '' : (up ? '▲ было: ' : '▼ было: ') + a;   // без изменений — без подписи
      w.setAttribute('data-dir', a === b ? '' : (up ? 'up' : 'down'));
    });
  }
  function replay(upTo) {                           // мгновенно восстановить фон/шапку/индикаторы/флаги по реплику upTo включительно
    stats = { car: null, trust: null }; indState = { car: {}, trust: {} };
    snaps = {}; dampPending = false; chap0 = null; MUS.want = null;
    el.frame.classList.remove('inds-big', 'inds-delta');
    for (var n = 0; n <= upTo; n++) {
      if (!visible(n)) continue;
      var b = B[n];
      applyProps(b, false);
      if (b.kind === 'choice' && b.id && flags[b.id]) {
        for (var q = 0; q < b.options.length; q++) if (b.options[q].val === flags[b.id]) {
          if (optStat(b.options[q])) applyStats(optStat(b.options[q]), false);
          if (b.options[q].damp) dampPending = true;
        }
      }
    }
  }

  /* ---------- показ реплики ---------- */
  var lastName = null;
  function showBeat(n, opts) {
    opts = opts || {};
    var b = B[n];
    ttBtnSync();
    stopTyping(); clearAuto(); clearTimeout(chapT); chapHold = false;
    el.hint.classList.remove('on'); el.cHint.classList.remove('on');
    if (b.kind !== 'protocol' && b.kind !== 'standings' && b.kind !== 'hud') hideScreen();
    if (b.kind === 'protocol' || b.kind === 'standings') return showProtocol(b, opts);
    if (b.kind === 'hud') return showHudBeat(b, opts);
    if (b.text && b.text.indexOf('{{') >= 0) b = Object.assign({}, b, { text: tpl(b.text) });
    if (b.kind === 'cut') return showCut(b, opts);
    if (b.kind === 'chapter') return showChapter(b, opts);
    if (b.kind === 'choice') return showChoice(b, opts);
    mode = 'beat';
    el.dialog.classList.remove('away'); el.choice.hidden = true;
    applyProps(b, !opts.instant);
    if (b.kind === 'black') return showBlack(b, opts);
    if (cutOpen) closeCut(!!opts.instant);

    var sp = S.speakers[b.who], nm = sp.name + (b.tag ? ' · ' + b.tag : '');
    if (nm !== lastName || opts.force) {
      el.name.classList.remove('swap'); void el.name.offsetWidth;
      el.name.textContent = nm; el.name.classList.add('swap'); lastName = nm;
    }
    el.dialog.classList.toggle('thought', b.kind === 'thought');
    Object.keys(el.portraits).forEach(function (k) { el.portraits[k].classList.toggle('on', portraitKey(sp) === k); });
    if (!(b.stat && !opts.instant)) el.sr.textContent = nm + '. ' + b.text;
    typeIn(b, el.shown, el.rest, el.hint, opts);
  }

  /* ---------- экраны без текста: протокол этапа и итог индикаторов ---------- */
  var protoCur = null, protoMe = null, protoScrollT = null;
  function hideScreen() { stopProtoAnim(); clearTimeout(protoScrollT); el.frame.classList.remove('proto-on'); el.proto.hidden = true; el.proto.classList.remove('on'); el.scrHint.classList.remove('on'); }
  function screenCommon(b, opts) {                  // общее для протокола и крупных индикаторов
    mode = 'beat';
    if (cutOpen) closeCut(!!opts.instant);
    el.choice.hidden = true; el.dialog.classList.add('away');
    Object.keys(el.portraits).forEach(function (k) { el.portraits[k].classList.remove('on'); });
    applyProps(b, !opts.instant);
    lastName = null;
    el.scrHint.classList.remove('on');
    if (opts.instant || STATIC) el.scrHint.classList.add('on');
    else setTimeout(function () { if (mode === 'beat' && (!el.proto.hidden || el.frame.classList.contains('inds-delta'))) el.scrHint.classList.add('on'); }, 900);
  }
  function gapParts(g) {                            // отставание в десятых секунды → {m, s, d}: целочисленно, без ошибок округления
    var t = Math.max(0, Math.round(g * 10));
    return { m: Math.floor(t / 600), s: Math.floor((t % 600) / 10), d: t % 10 };
  }
  function fmtGap(g) {                              // «+ММ:СС,д» — например, +00:15,0 и +01:04,7
    var p = gapParts(g), z = function (n) { return (n < 10 ? '0' : '') + n; };
    return '+' + z(p.m) + ':' + z(p.s) + ',' + p.d;
  }
  function spokenGap(g) {                           // для скринридера: «1 мин 4,7 с»
    var p = gapParts(g);
    return (p.m ? p.m + ' мин ' : '') + p.s + ',' + p.d + ' с';
  }
  function protoRows(stage, tAlex) {                // строки протокола: все экипажи — финишировавшие по местам, затем сходы и незаявленные
    var res = RallyModel.placeOnStage(stage, tAlex), st = res.standings;
    var rows = [], alexOut = tAlex === null;          // tAlex = null — Алекс сошёл: строка «сход» вместо места
    st.forEach(function (r) {
      rows.push({ place: r.place, label: r.label, gapT: r.place === 1 ? 'лидер' : fmtGap(r.gap), gapRaw: r.gap, pts: r.points, alex: !!r.isAlex });
    });
    var out = [];
    RALLY_DATA.crews.forEach(function (c) {
      var stt = c.r[stage][0];
      if (stt === 'ret') out.push({ place: '—', label: RallyModel.crewLabelByNumber(c.n), gapT: 'сход', pts: 0, off: true });
      else if (stt !== 'fin' && c.n < 50) out.push({ place: '—', label: RallyModel.crewLabelByNumber(c.n), gapT: 'не заявлен', pts: 0, off: true });
    });
    if (alexOut) out.push({ place: '—', label: 'Алекс / Лебедева', gapT: 'сход', pts: 0, off: true, alex: true });
    return { rows: rows.concat(out), alex: res.alex, total: st.length };
  }
  /* появление таблицы: лист всплывает, строки выезжают по очереди, отставание и очки «набегают» от нуля.
     mode: 'intro' — первое открытие; 'more' — по кнопке «весь протокол» (анимируются только новые строки); иначе без анимации */
  var protoRaf = null, protoSeen = {};
  function stopProtoAnim() { if (protoRaf) cancelAnimationFrame(protoRaf); protoRaf = null; }
  function runCounters(items) {                     // items: {td, kind, to, at, dur}; один rAF-цикл на все числа
    stopProtoAnim();
    var t0 = performance.now();
    (function tick() {
      var now = performance.now() - t0, alive = false;
      items.forEach(function (it) {
        var p = Math.max(0, Math.min(1, (now - it.at) / it.dur)), e = 1 - Math.pow(1 - p, 3);
        var v = Math.round(it.to * e);
        it.td.textContent = it.kind === 'gap' ? fmtGap(v / 10) : String(v);
        if (p < 1) alive = true;
      });
      protoRaf = alive ? requestAnimationFrame(tick) : null;
    })();
  }
  var NUMW = ['', 'одного', 'двух', 'трёх', 'четырёх', 'пяти'], NUMN = ['ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть'];
  function plural(n, a, b, c) { var m = n % 100, d = n % 10; return (m > 10 && m < 15) ? c : d === 1 ? a : (d >= 2 && d <= 4) ? b : c; }
  function standRows(b, t) {                        // общий зачёт после этапа b.stage: все экипажи, движение относительно прошлого этапа
    var now = seasonRanked(b.stage, t, b.stage === 5).filter(function (r) { return r.pts > 0 || r.n === 4; }), before = {};   // без очков в зачёте не значатся
    if (b.stage > 0) seasonRanked(b.stage - 1, t).filter(function (r) { return r.pts > 0 || r.n === 4; }).forEach(function (r, i) { before[r.n] = i + 1; });
    now.forEach(function (r, i) { r.place = i + 1; });
    var alex = now.filter(function (r) { return r.n === 4; })[0] || null;
    var rows = [];
    now.forEach(function (r) {
      var mv = '', dir = '', was = before[r.n];
      if (was != null && was !== r.place) { dir = was > r.place ? 'up' : 'down'; mv = (dir === 'up' ? '▲ ' : '▼ ') + Math.abs(was - r.place); }
      else mv = '—';
      rows.push({ place: r.place, label: r.label, gapT: mv, mv: dir, pts: r.pts, alex: r.n === 4 });
    });
    return { rows: rows, alex: alex };
  }
  function teamRows(t) {                           // командный зачёт сезона: очки экипажей по командам (у «Ладоги» — Алекс и Лыков)
    var by = {};
    seasonRanked(5, t, true).forEach(function (r) {
      var c = RALLY_DATA.crews.filter(function (x) { return x.n === r.n; })[0], team = r.n === 4 ? 'Ладога Ралли' : (c && c.t);
      if (team) by[team] = (by[team] || 0) + r.pts;
    });
    var arr = Object.keys(by).map(function (k) { return { team: k, pts: by[k] }; }).sort(function (a, b) { return b.pts - a.pts; }), lead = arr.length ? arr[0].pts : 0;
    return arr.map(function (r, i) { return { place: i + 1, label: r.team, gapT: i === 0 ? 'лидер' : '−' + (lead - r.pts) + ' ' + plural(lead - r.pts, 'очко', 'очка', 'очков'), pts: r.pts, alex: r.team === 'Ладога Ралли' }; });
  }
  function renderProto(mode) {
    var b = protoCur; if (!b) return;
    var anim = !STATIC && mode === 'intro';
    stopProtoAnim();
    var dv = derived(), retAt = function (si) { return (si === 2 && dv.ret2 === 1) || (si === 5 && dv.crash6 === 1); };     // сход на «Печорах» (4.5Б) или на финале (6.6Б без запаса): времени Алекса нет
    var ret = retAt(b.stage), team = b.kind === 'standings' && b.mode === 'team';
    var t = ret ? null : dv.t[b.stage];
    if (t == null && !ret && b.stage !== 3) t = RallyModel.alexStageTime(b.stage, stats.trust, stats.car, { choices: {}, flags: [], trust: stats.trust });
    var stand = b.kind === 'standings', d, tAll = derived().t.slice();
    if (stand) {
      for (var si = 0; si <= b.stage; si++) if (tAll[si] == null && si !== 3 && !retAt(si)) tAll[si] = RallyModel.alexStageTime(si, stats.trust, stats.car, { choices: {}, flags: [], trust: stats.trust });
      d = team ? { rows: teamRows(tAll), alex: null } : standRows(b, tAll);
    } else d = protoRows(b.stage, t);
    el.proto.classList.toggle('st', stand);
    el.protoGap.textContent = team ? 'Отставание' : stand ? 'Движение' : 'Отставание от лидера';
    el.protoTitle.textContent = '';                  // «Итоги ралли «Ильмень»»: первая часть тонко, название — акцентом
    var fin = stand && b.stage === 5;                // после финала — итог сезона
    var tPre = document.createElement('span'); tPre.className = 'pt-pre'; tPre.textContent = team ? 'Командный зачёт' : fin ? 'Итоговый зачёт' : stand ? 'Общий зачёт' : 'Итоги ралли';
    var tName = document.createElement('span'); tName.className = 'pt-name'; tName.textContent = (team || fin) ? 'сезона' : stand ? 'после ' + (NUMW[b.stage + 1] || (b.stage + 1)) + ' ' + plural(b.stage + 1, 'этапа', 'этапов', 'этапов') : '«' + RALLY_DATA.stages[b.stage] + '»';
    el.protoTitle.appendChild(tPre); el.protoTitle.appendChild(document.createTextNode(' ')); el.protoTitle.appendChild(tName);
    el.protoSub.textContent = 'Чемпионат России · класс R2 · ' + (team ? 'командный зачёт' : stand ? 'личный зачёт' : RALLY_DATA.dates[b.stage]);
    el.protoBody.innerHTML = '';
    var counters = [], k = 0, T0 = 420, STEP = 55;   // первая строка — после лица листа; шаг между строками
    d.rows.forEach(function (r) {
      var tr = document.createElement('tr'), delay = T0 + Math.min(k, 14) * STEP;
      if (anim) { tr.classList.add('a-in'); tr.style.setProperty('--d', delay); }
      k++;
      if (r.alex) tr.classList.add('me'); if (r.off) tr.classList.add('off'); else if (!r.alex && r.place === 1) tr.classList.add('lead');
      var counts = anim && !r.off;
      [[r.place, 'c-pl'], [r.label, 'c-cr'], [r.gapT, 'c-gap'], [r.pts ? String(r.pts) : '—', 'c-pt']].forEach(function (c, ci) {
        var td = document.createElement('td'); td.className = c[1] + (ci === 2 && r.mv ? ' mv-' + r.mv : ''); td.textContent = c[0]; tr.appendChild(td);
        if (!counts) return;
        if (ci === 2 && r.gapRaw != null && r.place !== 1) { var tn = Math.round(r.gapRaw * 10); td.textContent = fmtGap(0); counters.push({ td: td, kind: 'gap', to: tn, at: delay + 160, dur: 750 }); }
        if (ci === 3 && r.pts) { td.textContent = '0'; counters.push({ td: td, kind: 'pts', to: r.pts, at: delay + 160, dur: 600 }); }
      });
      if (r.alex) protoMe = tr;
      el.protoBody.appendChild(tr);
    });
    if (anim && counters.length) runCounters(counters);
    var a = d.alex;
    if (team) el.sr.textContent = 'Командный зачёт сезона. ' + d.rows.map(function (r) { return r.place + '. ' + r.label + ', очков: ' + r.pts; }).join('. ') + '.';
    else if (stand) el.sr.textContent = el.protoTitle.textContent + '. ' + (a ? 'Алекс: ' + a.place + '-е место, очков: ' + a.pts + '.' : '');
    else if (ret) el.sr.textContent = 'Итоги ралли «' + RALLY_DATA.stages[b.stage] + '». Алекс: сход, очков: 0.';
    else el.sr.textContent = 'Итоги ралли «' + RALLY_DATA.stages[b.stage] + '». ' + (a ? 'Алекс: ' + a.place + '-е место' + (a.place > 1 ? ', отставание от лидера ' + spokenGap(a.gap) : '') + ', очков: ' + a.points + '.' : '');
  }
  function showProtocol(b, opts) {
    protoCur = b; protoMe = null;
    screenCommon(b, opts);
    var anim = !STATIC && !opts.instant;
    el.protoSheet.classList.remove('intro');
    renderProto(anim ? 'intro' : 'none');
    el.frame.classList.add('proto-on');               // фон за таблицей размывается — взгляд остаётся на результатах
    el.proto.hidden = false; void el.proto.offsetWidth; el.proto.classList.add('on');
    if (anim) el.protoSheet.classList.add('intro');
    el.proto.scrollTop = 0;
    clearTimeout(protoScrollT);                       // список длинный: если строка Алекса не помещается на экран, подвести её в видимую область
    protoScrollT = setTimeout(function () {
      if (!protoMe || el.proto.hidden) return;
      var pr = el.proto.getBoundingClientRect(), r = protoMe.getBoundingClientRect(), pad = pr.height * 0.14;
      if (r.bottom > pr.bottom - pad || r.top < pr.top + pad) {
        var to = el.proto.scrollTop + (r.top - pr.top) - (pr.height - r.height) / 2;
        try { el.proto.scrollTo({ top: Math.max(0, to), behavior: STATIC ? 'auto' : 'smooth' }); } catch (e) { el.proto.scrollTop = Math.max(0, to); }
      }
    }, anim ? 1900 : 50);
  }
  function showHudBeat(b, opts) {                   // только индикаторы, крупно, с отметкой «что изменилось за главу»
    screenCommon(b, opts);
    showDelta(!!b.delta);
    el.sr.textContent = ['car', 'trust'].map(function (k) { return S.bands[k].name + ' ' + wordFor(k, stats[k]) + (el.ind[k].was.textContent ? ' (' + el.ind[k].was.textContent.replace(/[▲▼] /, '') + ')' : ''); }).join('. ');
  }

  function typeIn(b, shownEl, restEl, hintEl, opts) {
    var ctx = { b: b, s: shownEl, r: restEl, h: hintEl };
    cur = ctx;
    if (STATIC || (opts && opts.instant)) { finishTyping(); return; }
    typing = true; pos = 0;
    var t0 = performance.now();
    (function tick() {
      var want = Math.min(b.text.length, Math.floor((performance.now() - t0) / CPS_MS));
      if (want !== pos) { pos = want; paint(b.text, pos); }
      if (pos >= b.text.length) { finishTyping(); return; }
      timer = requestAnimationFrame(tick);
    })();
  }
  var cur = null;
  function paint(text, p) { cur.s.textContent = text.slice(0, p); cur.r.textContent = text.slice(p); }
  function finishTyping() {
    if (timer) cancelAnimationFrame(timer); timer = null;
    typing = false; paint(cur.b.text, cur.b.text.length);
    cur.h.classList.add('on');
  }
  function stopTyping() { if (timer) cancelAnimationFrame(timer); timer = null; typing = false; }
  function clearAuto() { if (autoT) clearTimeout(autoT); autoT = null; }

  /* ---------- чёрные кадры, карточка главы ---------- */
  function openCut(hard) {
    cutOpen = true;
    el.cut.classList.toggle('hard', !!hard || STATIC);
    el.cut.classList.add('on');
  }
  function closeCut(instant) {
    cutOpen = false;
    el.cut.classList.toggle('hard', !!instant || STATIC);
    el.cut.classList.remove('on');
    el.cShown.textContent = ''; el.cRest.textContent = '';
    if (instant || STATIC) el.cut.classList.remove('chap');
    else { clearTimeout(el.cut._t); el.cut._t = setTimeout(function () { if (!cutOpen) el.cut.classList.remove('chap'); }, 950); }
  }
  function showCut(b, opts) {
    mode = 'cut'; cutAt = performance.now();
    Object.keys(el.portraits).forEach(function (k) { el.portraits[k].classList.remove('on'); });
    if (b.music !== undefined) setMusic(b.music, !!opts.instant);
    if (b.fx === 'crash') {
      openCut(true);
      if (!STATIC) { el.frame.classList.remove('shake'); void el.frame.offsetWidth; el.frame.classList.add('shake'); }
    } else openCut(false);
    el.sr.textContent = b.fx === 'crash' ? 'Удар. Тишина.' : 'Затемнение.';
    autoT = setTimeout(function () { autoT = null; go(); }, opts.instant ? 0 : (b.hold || 1200));
  }
  function showBlack(b, opts) {
    mode = 'cut';
    clearTimeout(el.cut._t); el.cut.classList.remove('chap');
    if (!cutOpen) openCut(true);
    el.sr.textContent = b.text;
    typeIn(b, el.cShown, el.cRest, el.cHint, opts);
  }
  function showChapter(b, opts) {                   // чёрный кадр с названием главы; хук для рекламной паузы — событие vn:chapter
    mode = 'cut'; cutAt = performance.now(); chapHold = true;
    if (b.music !== undefined) setMusic(b.music, !!(opts && opts.instant));
    Object.keys(el.portraits).forEach(function (k) { el.portraits[k].classList.remove('on'); });
    el.dialog.classList.add('away');
    clearTimeout(el.cut._t);
    el.cKick.textContent = b.kicker || ''; el.cTitle.textContent = b.title || '';
    el.cShown.textContent = ''; el.cRest.textContent = '';
    el.cut.classList.add('chap');
    if (!cutOpen) openCut(false);
    el.cut.classList.remove('on'); void el.cut.offsetWidth; el.cut.classList.add('on');
    window.dispatchEvent(new CustomEvent('vn:chapter', { detail: { n: b.n, title: b.title } }));
    el.sr.textContent = (b.kicker || '') + '. ' + (b.title || '');
    if (opts.instant || STATIC) el.cHint.classList.add('on');
    else chapT = setTimeout(function () { el.cHint.classList.add('on'); }, 1100);
  }

  /* ---------- выбор ---------- */
  function showChoice(b, opts) {
    mode = 'choice';
    el.dialog.classList.add('away');
    el.hint.classList.remove('on');
    el.choice.innerHTML = '';
    var vis = b.options.filter(function (o) { return whenOk(o.when); });     // вариант с условием показывается, только если условие выполнено
    vis.forEach(function (o) {
      var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'opt'; btn.textContent = o.label;
      btn.addEventListener('click', function (e) { e.stopPropagation(); pick(b, o); });
      el.choice.appendChild(btn);
    });
    if (!document.querySelector('.portrait.on')) {           // при восстановлении: показать того, кто говорил перед выбором
      for (var q = i - 1; q >= 0; q--) if (visible(q) && B[q].who) { var pp = portraitKey(S.speakers[B[q].who]); if (pp) el.portraits[pp].classList.add('on'); break; }
    }
    el.choice.hidden = false;
    el.sr.textContent = 'Выберите ответ. ' + vis.map(function (o, k) { return (k + 1) + '. ' + o.label; }).join('. ');
    var first = el.choice.querySelector('.opt'); if (first && !opts.instant) { try { first.focus({ preventScroll: true }); } catch (e) {} }
  }
  function optStat(o) {                              // 🤝/🔧 выбранного варианта: alt перекрывает stat, если выполнено условие (например, 6.3-А: +2, при {сомнение} +1)
    if (o.alt) for (var q = 0; q < o.alt.length; q++) if (whenOk(o.alt[q].when)) return o.alt[q].stat;
    return o.stat;
  }
  function setChoice(b, o) {                        // флаги выбранного варианта; флаги остальных вариантов снимаются
    b.options.forEach(function (x) { if (x.flags) Object.keys(x.flags).forEach(function (k) { delete flags[k]; }); });
    flags[b.id] = o.val;
    if (o.flags) Object.keys(o.flags).forEach(function (k) { flags[k] = o.flags[k]; });
  }
  function pick(b, o) {
    if (mode !== 'choice') return;
    setChoice(b, o);
    el.choice.hidden = true; el.dialog.classList.remove('away');
    if (optStat(o)) applyStats(optStat(o), true);            // изменение — только после подтверждения выбора
    if (o.damp) dampPending = true;
    i = nextVisible(i); save(); showBeat(i, { force: true });
  }

  /* ---------- переходы ---------- */
  function go() {                                   // следующая реплика без «дописывания»
    if (ended || rbOpen || ttOpen) return;
    var n = nextVisible(i);
    if (n >= B.length) { showEnd(); return; }
    i = n; save(); showBeat(i);
  }
  function advance() {
    if (ended || rbOpen || ttOpen || mode === 'choice') return;
    if (mode === 'cut' && chapHold) {               // карточка главы: тап не сразу
      if (performance.now() - cutAt < 700) return;
      chapHold = false; go(); return;
    }
    if (mode === 'cut' && autoT) {                  // тап во время чёрного кадра — пропустить, но не сразу
      if (performance.now() - cutAt < 450) return;
      clearAuto(); go(); return;
    }
    if (typing) { finishTyping(); return; }         // первое касание дописывает текст
    go();
  }
  var END_NAMES = { 'А': ['Концовка А', 'Имя'], 'Б': ['Концовка Б', 'Серебро'], 'Г': ['Концовка Г', 'Финиш без подиума'], 'В': ['Концовка В', 'Кювет'] };
  function showEnd() {
    var ek = endKey(), nm = END_NAMES[ek];
    $('endKick').textContent = nm ? nm[0] : 'Конец'; $('endTitle').textContent = nm ? nm[1] : 'Путь пройден';
    el.sr.textContent = nm ? nm[0] + '. ' + nm[1] + '.' : 'Конец.';
    ended = true; el.cShown.textContent = ''; el.cRest.textContent = ''; el.end.hidden = false; el.scrHint.classList.remove('on'); el.hint.classList.remove('on'); el.cHint.classList.remove('on'); clear();
    try { el.endBtn.focus({ preventScroll: true }); } catch (e) {}
  }
  function restart() {
    ended = false; el.end.hidden = true; flags = {}; i = 0; lastName = null; hideScreen();
    closeCut(true); save(); replay(-1); showBeat(0, { force: true });
  }

  /* ---------- маршрутный лист: оглавление сцен для вычитки и тестирования (кнопка в шапке или клавиша M) ---------- */
  var RB_GROUPS = [
    { key: 'k14', label: 'Сцена 1.4', opts: [['A', 'Не сдал назад'], ['B', 'Промолчал']] },
    { key: 'k23', label: 'Сцена 2.3', opts: [['A', 'Признал горку'], ['B', 'Про педаль'], ['V', 'Что бы ты написала']] },
    { key: 'k32', label: 'Сцена 3.1', opts: [['A', 'Спросил о Кравце'], ['B', 'Не полез']] },
    { key: 'k33', label: 'Сцена 3.3', opts: [['A', 'Прибавил'], ['B', 'В лимите, быстрая проверка'], ['V', 'В лимите, полная проверка СУ-3']] },
    { key: 'k34', label: 'Сцена 3.4', opts: [['A', 'Не убегай'], ['B', 'Разберём вечером'], ['V', 'Накричал']] },
    { key: 'k36', label: 'Сцена 3.6', opts: [['A', 'Купили резину'], ['B', 'Спонсорская']] },
    { key: 'k37', label: 'Сцена 3.7', opts: [['A', 'Молчал'], ['B', '«Ищи!»'], ['V', 'Дал ориентир']] },
    { key: 'k41', label: 'Сцена 4.1', opts: [['A', 'Верю, обе вещи правда'], ['B', 'Не вытянул'], ['V', 'Про трассу']] },
    { key: 'k42', label: 'Сцена 4.2', opts: [['A', 'Денис, сейчас'], ['B', 'После сезона']] },
    { key: 'k44', label: 'Сцена 4.4', opts: [['A', 'Ровнее, опоздаем на КВ'], ['B', 'Сколько успеешь'], ['V', 'Верю на слово (нужно 1.4-А)']] },
    { key: 'k45', label: 'Сцена 4.5', opts: [['A', 'Дорожный темп'], ['B', 'На пределе']] },
    { key: 'k52', label: 'Сцена 5.2', opts: [['A', 'Срочная доставка (нужны деньги)'], ['B', 'Обычная доставка']] },
    { key: 'k54', label: 'Сцена 5.4', opts: [['A', 'Не обещал'], ['B', 'Обещал победу']] },
    { key: 'k55', label: 'Сцена 5.5', opts: [['A', 'Твоё решение'], ['B', 'Он тебя сменит'], ['V', 'Ты нужна на финале']] },
    { key: 'k63', label: 'Сцена 6.3', opts: [['A', 'Спасибо, что сказала'], ['B', 'Я его уничтожу'], ['V', 'Промолчал, перечитал']] },
    { key: 'k66', label: 'Сцена 6.6', opts: [['A', 'Отпустил газ по метке'], ['B', 'Не отпустил (риск)']] }
  ];
  /* пресеты веток под четыре концовки (проверены перебором калибровки: Финал А, Б, Г, В) */
  var RB_PRESETS = [
    { label: 'Пресет «Финал А»', title: 'Все варианты «А»: чемпион, запас на 6.6, Вика осталась', sel: 'AAAAAAAAAAAAAAAA' },
    { label: 'Пресет «Финал Б»', title: 'Второе место в чемпионате: 6.3-В, риска нет', sel: 'AAAAAAAAAABABBVA' },
    { label: 'Пресет «Финал Г»', title: 'Место ниже второго: доверие 4, машина 7, Вика уходит к Кравцу', sel: 'AAAAAAAVABBABBBA' },
    { label: 'Пресет «Финал В»', title: 'Риск в 6.6 без запаса (🤝 6): занос, сход', sel: 'AAAAAAAAAABAABBB' }
  ];
  function rbFlags() {                               // флаги, которые получились бы при выбранных в листе вариантах (для условий вариантов)
    var f = {};
    RB_GROUPS.forEach(function (g) {
      var cb = choiceBeat(g.key); if (!cb) return;
      var v = rbSel[g.key]; if (v == null) return;
      f[g.key] = v;
      cb.options.forEach(function (o) { if (o.val === v && o.flags) Object.keys(o.flags).forEach(function (k) { f[k] = o.flags[k]; }); });
    });
    return f;
  }
  function rbValid(key, val) {                       // вариант доступен при выбранных ветках (например, «Верю на слово» требует 1.4-А)
    var cb = choiceBeat(key), ok = false; if (!cb) return true;
    var f = rbFlags();
    cb.options.forEach(function (o) { if (o.val === val && whenOk(o.when, f)) ok = true; });
    return ok;
  }
  function rbFix() {                                 // недоступный вариант заменяется первым доступным
    RB_GROUPS.forEach(function (g) {
      if (rbValid(g.key, rbSel[g.key])) return;
      for (var q = 0; q < g.opts.length; q++) if (rbValid(g.key, g.opts[q][0])) { rbSel[g.key] = g.opts[q][0]; break; }
    });
  }
  function selectOpt(key, val) {                     // поставить вариант выбора (с флагами); недоступный — первый доступный
    var cb = choiceBeat(key); if (!cb) return;
    var o = null;
    cb.options.forEach(function (x) { if (!o && x.val === val && whenOk(x.when)) o = x; });
    if (!o) cb.options.forEach(function (x) { if (!o && whenOk(x.when)) o = x; });
    if (o) { setChoice(cb, o); rbSel[key] = o.val; }
  }
  function choiceBeat(key) { for (var n = 0; n < B.length; n++) if (B[n].kind === 'choice' && B[n].id === key) return B[n]; return null; }
  function currentScene() { var id = null; for (var n = 0; n <= i && n < B.length; n++) if (B[n].scene && visible(n)) id = B[n].scene; return id; }
  function buildRb() {
    var body = $('rbBody'), foot = $('rbFoot');
    body.innerHTML = ''; foot.innerHTML = '';
    S.chapters.forEach(function (ch) {
      var col = document.createElement('div'); col.className = 'rb-col';
      var h = document.createElement('div'); h.className = 'rb-ch'; h.textContent = ch.title; col.appendChild(h);
      ch.scenes.forEach(function (sc) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'rb-row'; b.setAttribute('data-scene', sc.id);
        var a = document.createElement('span'); a.className = 'rb-id'; a.textContent = sc.id;
        var t = document.createElement('span'); t.className = 'rb-name'; t.textContent = sc.title;
        b.appendChild(a); b.appendChild(t);
        b.addEventListener('click', function (e) { e.stopPropagation(); jumpTo(sc.id); });
        col.appendChild(b);
      });
      body.appendChild(col);
    });
    RB_GROUPS.forEach(function (g) {
      var seg = document.createElement('div'); seg.className = 'rb-seg'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', g.label);
      var l = document.createElement('span'); l.className = 'rb-seg-l'; l.textContent = g.label + ' →'; seg.appendChild(l);
      g.opts.forEach(function (o) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'rb-opt'; b.textContent = o[1]; b.setAttribute('data-key', g.key); b.setAttribute('data-val', o[0]);
        b.addEventListener('click', function (e) { e.stopPropagation(); if (!rbValid(g.key, o[0])) return; rbSel[g.key] = o[0]; rbFix(); markRb(); });
        seg.appendChild(b);
      });
      foot.appendChild(seg);
    });
    var pr = document.createElement('button'); pr.type = 'button'; pr.className = 'rb-preset'; pr.textContent = 'Пресет «сход на Печорах»';
    pr.setAttribute('title', 'Резина по цене (3.6-Б), Толя без поправок (4.4-Б), на пределе (4.5-Б)');
    pr.addEventListener('click', function (e) { e.stopPropagation(); rbSel.k36 = 'B'; rbSel.k44 = 'B'; rbSel.k45 = 'B'; rbFix(); markRb(); });
    foot.appendChild(pr);
    RB_PRESETS.forEach(function (pz) {
      var pb = document.createElement('button'); pb.type = 'button'; pb.className = 'rb-preset'; pb.textContent = pz.label; pb.setAttribute('title', pz.title);
      pb.addEventListener('click', function (e) { e.stopPropagation(); RB_GROUPS.forEach(function (g, q) { rbSel[g.key] = pz.sel.charAt(q) === 'B' ? 'B' : pz.sel.charAt(q) === 'V' ? 'V' : 'A'; }); rbFix(); markRb(); });
      foot.appendChild(pb);
    });
    var rs = document.createElement('button'); rs.type = 'button'; rs.className = 'rb-restart'; rs.textContent = 'Начать сначала';
    rs.addEventListener('click', function (e) { e.stopPropagation(); closeRb(); restart(); });
    foot.appendChild(rs);
    $('rbClose').addEventListener('click', function (e) { e.stopPropagation(); closeRb(); });
  }
  function markRb() {
    var cur = currentScene();
    Array.prototype.forEach.call(document.querySelectorAll('.rb-row'), function (r) {
      var on = r.getAttribute('data-scene') === cur; r.classList.toggle('cur', on);
      if (on) r.setAttribute('aria-current', 'step'); else r.removeAttribute('aria-current');
    });
    rbFix();
    Array.prototype.forEach.call(document.querySelectorAll('.rb-opt'), function (b) {
      var k = b.getAttribute('data-key'), v = b.getAttribute('data-val'), ok = rbValid(k, v);
      b.setAttribute('aria-pressed', rbSel[k] === v ? 'true' : 'false');
      b.disabled = !ok; b.classList.toggle('na', !ok);
    });
  }
  function openRb() {
    RB_GROUPS.forEach(function (g) { rbSel[g.key] = flags[g.key] || rbSel[g.key] || 'A'; });
    markRb(); rbOpen = true; $('rb').hidden = false;
    var cur = document.querySelector('.rb-row.cur') || document.querySelector('.rb-row');
    if (cur) { try { cur.focus({ preventScroll: true }); } catch (e) {} }
  }
  function closeRb() { rbOpen = false; $('rb').hidden = true; }
  function jumpTo(id) {                              // перейти к началу сцены с выбранными ветками
    var n = sceneStart(id); if (n < 0) return;
    RB_GROUPS.forEach(function (g) { selectOpt(g.key, rbSel[g.key]); });
    ended = false; el.end.hidden = true;
    stopTyping(); clearAuto(); clearTimeout(chapT); chapHold = false; hideScreen();
    closeCut(true); el.choice.hidden = true; el.dialog.classList.remove('away');
    Object.keys(el.portraits).forEach(function (k) { el.portraits[k].classList.remove('on'); });
    replay(n - 1);
    if (!visible(n)) { n = nextVisible(n); replay(n - 1); }
    i = n; lastName = null; closeRb(); save();
    showBeat(i, { force: true, instant: true });
  }
  buildRb();

  /* ---------- турнирная таблица: общий зачёт и результаты пройденных этапов (открывается кнопкой в шапке или клавишей T) ---------- */
  var ttTab = 'st';
  function ttAvail() {                              // что игрок уже видел: протоколы этапов и общий зачёт по битам до текущей реплики (включительно)
    var st = {}, stand = -1, team = false;
    for (var n = 0; n <= i && n < B.length; n++) {
      var b = B[n]; if (!visible(n)) continue;
      if (b.kind === 'protocol') st[b.stage] = true;
      else if (b.kind === 'standings') { if (b.mode === 'team') team = true; else { stand = Math.max(stand, b.stage); st[b.stage] = true; } }
    }
    return { stages: st, stand: stand, team: team, any: stand >= 0 || Object.keys(st).length > 0 };
  }
  function ttBtnSync() { var a = ttAvail(); $('ttbtn').hidden = !a.any; return a; }
  function ttData(tab, av) {                        // → {title:[pre,name], sub, gap, rows, alex, stand}
    var dv = derived(), t = dv.t.slice(), retAt = function (si) { return (si === 2 && dv.ret2 === 1) || (si === 5 && dv.crash6 === 1); };
    var upto = tab === 'st' || tab === 'team' ? Math.max(av.stand, 0) : +tab;
    for (var si = 0; si <= upto; si++) if (t[si] == null && si !== 3 && !retAt(si)) t[si] = RallyModel.alexStageTime(si, stats.trust, stats.car, { choices: {}, flags: [], trust: stats.trust });
    if (tab === 'team') return { title: ['Командный зачёт', 'сезона'], sub: 'Чемпионат России · класс R2 · командный зачёт', gap: 'Отставание', rows: teamRows(t), stand: true };
    if (tab === 'st') {
      var d = standRows({ stage: upto }, t), fin = upto === 5;
      return { title: [fin ? 'Итоговый зачёт' : 'Общий зачёт', fin ? 'сезона' : 'после ' + (NUMW[upto + 1] || (upto + 1)) + ' ' + plural(upto + 1, 'этапа', 'этапов', 'этапов')],
               sub: 'Чемпионат России · класс R2 · личный зачёт', gap: 'Движение', rows: d.rows, stand: true };
    }
    var s = +tab, p = protoRows(s, s === 3 ? null : (retAt(s) ? null : t[s]));
    var rows = s === 3 ? p.rows.filter(function (r) { return !r.alex; }) : p.rows;     // «Горный край»: Алекс не заявлен
    return { title: ['Итоги ралли', '«' + RALLY_DATA.stages[s] + '»'], sub: 'Чемпионат России · класс R2 · ' + RALLY_DATA.dates[s] + (s === 3 ? ' · наш экипаж не заявлен' : ''), gap: 'Отставание от лидера', rows: rows, stand: false };
  }
  function ttRender() {
    var av = ttAvail(), tabs = [];
    if (av.stand >= 0) tabs.push({ id: 'st', label: 'Общий зачёт' });
    if (av.team) tabs.push({ id: 'team', label: 'Командный зачёт' });
    [0, 1, 2, 3, 4, 5].forEach(function (s) { if (av.stages[s]) tabs.push({ id: String(s), label: RALLY_DATA.stages[s] }); });
    if (!tabs.length) return;
    if (!tabs.some(function (x) { return x.id === ttTab; })) ttTab = tabs[0].id;
    var box = $('ttTabs'); box.innerHTML = '';
    tabs.forEach(function (x) {
      var bt = document.createElement('button'); bt.type = 'button'; bt.className = 'tt-tab'; bt.textContent = x.label;
      bt.setAttribute('role', 'tab'); bt.setAttribute('aria-selected', x.id === ttTab ? 'true' : 'false');
      bt.addEventListener('click', function (e) { e.stopPropagation(); ttTab = x.id; ttRender(); bt.focus({ preventScroll: true }); });
      box.appendChild(bt);
    });
    var d = ttData(ttTab, av), ti = $('ttTitle');
    $('tt').classList.toggle('st', d.stand);
    ti.textContent = '';
    var a = document.createElement('span'); a.className = 'pt-pre'; a.textContent = d.title[0];
    var b2 = document.createElement('span'); b2.className = 'pt-name'; b2.textContent = d.title[1];
    ti.appendChild(a); ti.appendChild(document.createTextNode(' ')); ti.appendChild(b2);
    $('ttSub').textContent = d.sub; $('ttGap').textContent = d.gap;
    var body = $('ttBody'), me = null; body.innerHTML = '';
    d.rows.forEach(function (r) {
      var tr = document.createElement('tr');
      if (r.alex) { tr.classList.add('me'); me = tr; } if (r.off) tr.classList.add('off'); else if (!r.alex && r.place === 1) tr.classList.add('lead');
      [[r.place, 'c-pl'], [r.label, 'c-cr'], [r.gapT, 'c-gap'], [r.pts ? String(r.pts) : '—', 'c-pt']].forEach(function (c, ci) {
        var td = document.createElement('td'); td.className = c[1] + (ci === 2 && r.mv ? ' mv-' + r.mv : ''); td.textContent = c[0]; tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    return me;
  }
  function openTT() {
    var av = ttAvail(); if (!av.any) return;
    if (!av.stages[+ttTab] && ttTab !== 'st' && ttTab !== 'team') ttTab = 'st';
    if (ttTab === 'st' && av.stand < 0) ttTab = '';
    ttOpen = true; $('tt').hidden = false;
    var me = ttRender();
    $('tt').scrollTop = 0;
    var cur = document.querySelector('.tt-tab[aria-selected="true"]') || $('ttClose');
    try { cur.focus({ preventScroll: true }); } catch (e) {}
    if (me) setTimeout(function () { if (!ttOpen) return; var pr = $('tt').getBoundingClientRect(), r = me.getBoundingClientRect(); if (r.bottom > pr.bottom - 20) $('tt').scrollTop = $('tt').scrollTop + (r.top - pr.top) - pr.height / 2; }, 30);
  }
  function closeTT() { ttOpen = false; $('tt').hidden = true; try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) {} }   // фокус не возвращаем на кнопку: иначе пробел снова открыл бы таблицу
  $('ttbtn').addEventListener('click', function (e) { e.stopPropagation(); if (ttOpen) closeTT(); else openTT(); });
  $('ttClose').addEventListener('click', function (e) { e.stopPropagation(); closeTT(); });
  $('roadbook').addEventListener('click', function (e) { e.stopPropagation(); if (rbOpen) closeRb(); else openRb(); });

  /* ---------- ввод ---------- */
  el.stage.addEventListener('click', function (e) {
    if (e.target.closest && (e.target.closest('#roadbook') || e.target.closest('#ttbtn') || e.target.closest('#tt') || e.target.closest('#end') || e.target.closest('#choice') || e.target.closest('#rb'))) return;
    advance();
  });
  document.addEventListener('keydown', function (e) {
    if (ttOpen) { if (e.key === 'Escape' || (e.code === 'KeyT' && !e.ctrlKey && !e.metaKey && !e.altKey)) { e.preventDefault(); closeTT(); } return; }
    if (e.code === 'KeyT' && !e.ctrlKey && !e.metaKey && !e.altKey && !rbOpen) { if (ttAvail().any) { e.preventDefault(); openTT(); } return; }
    if (e.code === 'KeyM' && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); if (rbOpen) closeRb(); else openRb(); return; }
    if (rbOpen) { if (e.key === 'Escape') { e.preventDefault(); closeRb(); } return; }
    if (mode === 'choice' && !ended) {
      var opts = el.choice.querySelectorAll('.opt'), n = parseInt(e.key, 10);
      if (n >= 1 && n <= opts.length) { e.preventDefault(); opts[n - 1].click(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        var idx = Array.prototype.indexOf.call(opts, document.activeElement);
        idx = e.key === 'ArrowDown' ? Math.min(opts.length - 1, idx + 1) : Math.max(0, idx < 0 ? 0 : idx - 1);
        opts[idx].focus(); return;
      }
    }
    if (e.code === 'KeyS' && !e.ctrlKey && !e.metaKey && !e.altKey) { MUS.unlocked = true; setMuted(!MUS.muted); return; }   // S — звук вкл/выкл (M занята маршрутным листом)
    if (e.target && e.target.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return;
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); advance(); }
  });
  el.endBtn.addEventListener('click', restart);
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* ---------- старт ---------- */
  function sceneStart(id) { for (var n = 0; n < B.length; n++) if (B[n].scene === id) return n; return -1; }
  var start = 0, saved = null;
  if (params.has('s') && sceneStart(params.get('s')) >= 0) start = sceneStart(params.get('s'));
  else if (params.has('b')) start = Math.max(0, Math.min(B.length - 1, parseInt(params.get('b'), 10) || 0));
  else if (!params.has('fresh')) { saved = load(); if (saved) { flags = saved.flags || {}; start = saved.i; } }
  if (params.has('k')) flags.k14 = params.get('k');                    // для проверки веток: ?s=2.3&k=A|B
  if (params.has('f')) params.get('f').split(',').forEach(function (kv) {   // ?f=k14:A,k23:B,k33:V
    var p = kv.split(':'); if (p[0]) flags[p[0]] = (p[1] === '1' || p[1] === 'true') ? true : p[1];
  });
  RB_GROUPS.forEach(function (g) {                                      // развилки, заданные в адресе: доставить и сопутствующие флаги варианта
    if (flags[g.key]) selectOpt(g.key, flags[g.key]);
  });
  if (start > 0) replay(start - 1);                                    // условия показа зависят от состояния — восстановить его до проверки
  if (!visible(start)) { start = nextVisible(start); replay(start - 1); }
  if (params.has('end')) {
    RB_GROUPS.forEach(function (g) { selectOpt(g.key, flags[g.key] || 'A'); });   // ?end — конец фрагмента; ветки по умолчанию «А», остальные — из ?f=
    i = lastVisible(); replay(i - 1); showBeat(i, { instant: true, force: true }); showEnd();
  }
  else {
    i = Math.min(start, B.length - 1);
    replay(i - 1);
    showBeat(i, { force: true, instant: params.has('b') || params.has('s') });
  }

  /* фоны подгружаем заранее, чтобы смена кадра не мигала */
  setTimeout(function () { Object.keys(S.bgs).forEach(function (k) { var im = new Image(); im.src = S.bgs[k].src; }); }, 600);

  window.__vn = {
    music: function () { var o = { want: MUS.want, unlocked: MUS.unlocked, muted: MUS.muted, hidden: MUS.hidden, paused: MUS.paused, ctx: MUS.ctx && MUS.ctx.state, tracks: {} }; Object.keys(MUS.trk).forEach(function (k) { var t = MUS.trk[k]; o.tracks[k] = t.el ? { fallback: true, paused: t.el.paused, vol: +t.el.volume.toFixed(3) } : { ready: !!t.buf, started: !!t.src, gain: +t.gain.gain.value.toFixed(3) }; }); return o; }, bg: function (k) { setBg(k, true); }, jump: jumpTo, rbSel: rbSel, flags: function () { return flags; }, stats: function () { return stats; }, index: function () { return i; }, total: B.length,
                  derived: function () { return derived(); }, snaps: function () { return snaps; },
                  protocol: function () { return Array.prototype.map.call(el.protoBody.querySelectorAll('tr'), function (r) { return Array.prototype.map.call(r.children, function (c) { return c.textContent; }); }); },
                  mode: function () { return mode; }, ended: function () { return ended; }, ending: function () { return endKey(); },
                  lines: function () { var r = []; for (var n = 0; n < B.length; n++) if (visible(n)) r.push(n); return r; },
                  opts: function () { return Array.prototype.map.call(el.choice.querySelectorAll('.opt'), function (b) { return b.textContent; }); } };
})();
