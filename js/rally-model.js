// rally-model.js
// Модель времени и очков. Источник формул: claude/rally_vn_mehanika_igry.md §3-4,
// rally_vn_turnirnye_tablitsy.md §1,4. Поле экипажей — из rally-data.js (RALLY_DATA),
// взято из откалиброванного rally_season_data.json — не рандом, не генерируется заново.
//
// Используется с Главы 3. Порядок этапов (0-based, RALLY_DATA.stages):
// 0 Ильмень, 1 Рускеала, 2 Печоры, 3 Горный край (Алекс не заявлен — пропускается),
// 4 Урал, 5 Ладожская Дуга (финал).

const RallyModel = (function () {
  const M = RALLY_DATA.model;

  // Разовые потери времени, привязанные к конкретным выборам сценария.
  // Ключ — id выбора, значение — функция(optionLetter, state) -> секунды (0, если не применимо).
  const ONE_OFF_LOSSES = {
    '3.3': (opt) => (opt === 'Б' ? 4 : 0), // «Ильмень»
    '3.7': (opt, state) => {
      if (opt === 'А') return state.trust >= 5 ? 2 : 6;
      if (opt === 'Б') return 5;
      if (opt === 'В') return 3;
      return 0;
    }, // «Рускеала»
    '4.4': (opt) => (opt === 'А' ? 20 : 0), // «Печоры»
    '4.5': (opt) => (opt === 'А' ? M.roadpace_loss : 0), // «Печоры» — дорожный темп
  };

  // Индекс этапа (0-based) в RALLY_DATA.stages, к которому относится разовая потеря выбора.
  const CHOICE_STAGE_INDEX = {
    '3.3': 0, // Ильмень
    '3.7': 1, // Рускеала
    '4.4': 2, // Печоры
    '4.5': 2, // Печоры
    '6.6': 5, // Финал
  };

  /**
   * Время Алекса на этапе.
   * @param {number} stageIndex 0..5
   * @param {number} trust 🤝 на момент старта этапа (снимок, см. движок сцен)
   * @param {number} car 🔧 на момент старта этапа (снимок)
   * @param {object} state — { choices: {id:letter}, flags: string[] }
   */
  function alexStageTime(stageIndex, trust, car, state) {
    let t = M.A0 + (10 - trust) * M.K_trust + (10 - car) * M.K_car + M.stage_bias[stageIndex];

    for (const choiceId in CHOICE_STAGE_INDEX) {
      if (CHOICE_STAGE_INDEX[choiceId] !== stageIndex) continue;
      const opt = state.choices[choiceId];
      if (!opt) continue;
      const fn = ONE_OFF_LOSSES[choiceId];
      if (fn) t += fn(opt, state);
    }
    if (stageIndex === 5 && state.choices['6.6'] === 'Б' && state.flags.includes('риск_прошёл')) {
      t -= 1.5; // успешный риск в 6.6
    }
    return t;
  }

  /**
   * Сортирует финишировавших экипажей этапа (плюс, при заданном, Алекса) и возвращает
   * место, очки и отрыв от лидера для каждого — материал для протокола этапа.
   */
  function placeOnStage(stageIndex, alexTimeOrNull) {
    const rows = RALLY_DATA.crews
      .map((c) => ({ n: c.n, label: crewLabel(c), status: c.r[stageIndex][0], time: c.r[stageIndex][1] }))
      .filter((r) => r.status === 'fin');

    if (alexTimeOrNull !== null) {
      rows.push({ n: 4, label: 'Алекс / Лебедева', status: 'fin', time: alexTimeOrNull, isAlex: true });
    }

    // при равном времени Алекс впереди (как в калибровке: bisect_left)
    rows.sort((a, b) => a.time - b.time || (b.isAlex ? 1 : 0) - (a.isAlex ? 1 : 0));
    const leaderTime = rows.length ? rows[0].time : 0;

    const result = rows.map((r, i) => ({
      ...r,
      place: i + 1,
      points: RALLY_DATA.points[i] || 0,
      gap: i === 0 ? 0 : +(r.time - leaderTime).toFixed(1),
    }));

    return {
      standings: result,
      alex: alexTimeOrNull !== null ? result.find((r) => r.isAlex) : null,
    };
  }

  function crewLabel(c) {
    return `${c.p} / ${c.s}`;
  }

  /** Топ-3 + окно ±2 вокруг Алекса (ТЗ turnirnye_tablitsy.md §7), без дублей, по возрастанию места. */
  function protocolWindow(standings, alexPlace) {
    const wanted = new Set();
    for (let p = 1; p <= 3 && p <= standings.length; p++) wanted.add(p);
    if (alexPlace) {
      for (let p = alexPlace - 2; p <= alexPlace + 2; p++) {
        if (p >= 1 && p <= standings.length) wanted.add(p);
      }
    }
    return standings.filter((r) => wanted.has(r.place)).sort((a, b) => a.place - b.place);
  }

  /** Накопление очков по сезону: сумма всех 6 этапов, без отбрасывания худших (§4). */
  function seasonPoints(perStagePointsArray) {
    return perStagePointsArray.reduce((a, b) => a + (b || 0), 0);
  }

  /**
   * Полный командный/личный зачёт по итогам сезона: для каждого этапа считает
   * протокол (включая Алекса, если он в нём стартовал) и суммирует очки по номеру экипажа.
   * @param {Array<number|null>} alexTimes — время Алекса по этапам 0..5 (null, если не стартовал)
   * @returns {{ totals: Map<number,number>, ranked: Array, alexTotal: number, alexRank: number }}
   */
  function seasonStandings(alexTimes) {
    const totals = new Map();
    const teams = new Map(); // team name -> points sum (командный зачёт)

    for (let stageIndex = 0; stageIndex < RALLY_DATA.stages.length; stageIndex++) {
      const alexTime = alexTimes[stageIndex] != null ? alexTimes[stageIndex] : null;
      const { standings } = placeOnStage(stageIndex, alexTime);
      standings.forEach((row) => {
        totals.set(row.n, (totals.get(row.n) || 0) + row.points);
      });
    }

    // командный зачёт: экипажи RALLY_DATA.crews хранят команду в поле `t`; Алекс — «Ладога Ралли»
    RALLY_DATA.crews.forEach((c) => {
      teams.set(c.t, (teams.get(c.t) || 0) + (totals.get(c.n) || 0));
    });
    teams.set('Ладога Ралли', (teams.get('Ладога Ралли') || 0) + (totals.get(4) || 0));

    const ranked = Array.from(totals.entries())
      .map(([n, points]) => ({ n, points, label: n === 4 ? 'Алекс / Лебедева' : crewLabelByNumber(n) }))
      .sort((a, b) => b.points - a.points)
      .map((r, i) => ({ ...r, rank: i + 1 }));

    const teamsRanked = Array.from(teams.entries())
      .map(([team, points]) => ({ team, points }))
      .sort((a, b) => b.points - a.points)
      .map((r, i) => ({ ...r, rank: i + 1 }));

    const alexRow = ranked.find((r) => r.n === 4);
    const ladogaRow = teamsRanked.find((r) => r.team === 'Ладога Ралли');
    const kravetsRow = ranked.find((r) => r.n === 1);

    return {
      ranked,
      teamsRanked,
      alexTotal: alexRow ? alexRow.points : 0,
      alexRank: alexRow ? alexRow.rank : ranked.length + 1,
      ladogaTeamRank: ladogaRow ? ladogaRow.rank : teamsRanked.length + 1,
      kravetsTotal: kravetsRow ? kravetsRow.points : 0,
    };
  }

  function crewLabelByNumber(n) {
    const c = RALLY_DATA.crews.find((c) => c.n === n);
    return c ? crewLabel(c) : `№ ${n}`;
  }

  /**
   * Итоговая концовка. Порядок проверки: В → А → Б → Г (rally_vn_mehanika_igry.md §5).
   * @param {object} params { retiredAt66: bool, alexSeasonRank: number }
   */
  function decideEnding({ retiredAt66, alexSeasonRank }) {
    if (retiredAt66) return 'В'; // 🌫 Кювет — эхо пролога
    if (alexSeasonRank === 1) return 'А'; // 🏆 Имя — чемпион
    if (alexSeasonRank === 2) return 'Б'; // 🥈 Серебро
    return 'Г'; // 🏁 Финиш без подиума
  }

  /** Готовый объект для line{type:'protocol'} — протокол одного этапа. */
  function buildProtocolTable(stageIndex, alexTime, title) {
    const { standings, alex } = placeOnStage(stageIndex, alexTime);
    return {
      title: title || `Протокол · ${RALLY_DATA.stages[stageIndex]}`,
      window: protocolWindow(standings, alex ? alex.place : null),
      alexPlace: alex ? alex.place : null,
      alexPoints: alex ? alex.points : 0,
      alexGap: alex ? alex.gap : null,
    };
  }

  /** Готовый объект для line{type:'standings', field}, режим 'lead' — главная строка общего зачёта. */
  function buildSeasonLeadTable(seasonResult, stagesLeft, title) {
    const gap = seasonResult.kravetsTotal - seasonResult.alexTotal;
    const lead =
      gap > 0
        ? `До Кравца ${gap} очк${gap === 1 ? 'о' : gap < 5 ? 'а' : 'ов'}, осталось ${stagesLeft} этап${stagesLeft === 1 ? '' : stagesLeft < 5 ? 'а' : 'ов'}.`
        : `Опережаем Кравца на ${Math.abs(gap)} очк${Math.abs(gap) === 1 ? 'о' : 'а'}, осталось ${stagesLeft} этап${stagesLeft === 1 ? '' : 'а'}.`;
    return { mode: 'lead', title: title || 'Общий зачёт', lead };
  }

  /** Готовый объект для line{type:'standings'}, режим 'team' — командный зачёт «Ладога» vs «Балтик». */
  function buildTeamStandingsTable(seasonResult, title) {
    const rows = seasonResult.teamsRanked
      .filter((r) => r.team === 'Ладога Ралли' || r.team === 'Балтик Моторспорт')
      .map((r) => ({ ...r, isLadoga: r.team === 'Ладога Ралли' }));
    return { mode: 'team', title: title || 'Командный зачёт', rows };
  }

  return {
    alexStageTime,
    placeOnStage,
    protocolWindow,
    seasonPoints,
    seasonStandings,
    decideEnding,
    crewLabelByNumber,
    buildProtocolTable,
    buildSeasonLeadTable,
    buildTeamStandingsTable,
    M,
  };
})();
