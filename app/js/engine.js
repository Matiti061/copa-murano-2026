/* Motor de cálculo — Copa Internacional Murano 2026 U16
 * Funciones puras: reciben el "estado" (equipos, resultados, configuración) y devuelven
 * todo lo derivado: tablas de grupos, tabla general, copas, triangulares, play-offs y ranking final.
 * Reglas según el Dossier Oficial (36 equipos, Copa Oro / Plata / Bronce).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'));
  else root.Engine = factory(root.MuranoData);
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';

  const CUPS = ['Oro', 'Plata', 'Bronce'];
  const CUP_NAME = { Oro: 'Copa de Oro', Plata: 'Copa de Plata', Bronce: 'Copa de Bronce' };
  const CUP_OFFSET = { Oro: 0, Plata: 12, Bronce: 24 };
  // Siembra en serpentina: [A, B, C] por triangular, según ranking general
  const TRI_RANKS = {
    Oro: [[1, 8, 9], [2, 7, 10], [3, 6, 11], [4, 5, 12]],
    Plata: [[13, 20, 21], [14, 19, 22], [15, 18, 23], [16, 17, 24]],
    Bronce: [[25, 32, 33], [26, 31, 34], [27, 30, 35], [28, 29, 36]],
  };
  const GROUP_KEYS = Object.keys(D.GROUPS);

  const DEFAULT_CONFIG = {
    scoring: '2-1-0', // '2-1-0' (Victoria 2, Derrota 1, W.O. 0) | 'fivb' (3-0/3-1 = 3/0; 3-2 = 2/1)
    bestOf: 3, // sets máximos por partido (por defecto)
    bestOfFinalOro: 5, // la Gran Final de Oro es a 5 sets
    woSetPoints: 25, // puntos que se asignan por set en un W.O.
  };

  // ---------------------------------------------------------------- estado
  function createState() {
    return {
      version: 1,
      config: Object.assign({}, DEFAULT_CONFIG),
      teams: D.TEAMS.map(t => Object.assign({}, t)),
      results: {}, // { [matchId]: { sets:[[a,b],..], wo:null|'a'|'b', bestOf, a, b } }
      manualTie: {}, // { [scope]: [teamId,...] } orden elegido para empates sin resolver
      triOverride: {}, // { 'Oro-1': [teamA, teamB, teamC] } integrantes fijados a mano
      updatedAt: null,
    };
  }

  function normalizeState(raw) {
    const base = createState();
    if (!raw || typeof raw !== 'object') return base;
    const s = Object.assign(base, raw);
    s.config = Object.assign({}, DEFAULT_CONFIG, raw.config || {});
    // los equipos siempre son los 36 oficiales; sólo se toman las ediciones permitidas
    s.teams = D.TEAMS.map(t => {
      const e = (raw.teams || []).find(x => x && x.id === t.id) || {};
      return {
        id: t.id,
        name: typeof e.name === 'string' && e.name.trim() ? e.name.trim() : t.name,
        city: typeof e.city === 'string' ? e.city : t.city,
        country: typeof e.country === 'string' ? e.country : t.country,
        fav: typeof e.fav === 'boolean' ? e.fav : t.fav,
      };
    });
    s.results = raw.results && typeof raw.results === 'object' ? raw.results : {};
    s.manualTie = raw.manualTie && typeof raw.manualTie === 'object' ? raw.manualTie : {};
    s.triOverride = raw.triOverride && typeof raw.triOverride === 'object' ? raw.triOverride : {};
    return s;
  }

  // ---------------------------------------------------------------- resultados
  function defaultBestOf(matchId, cfg) {
    return matchId === 'FINAL-ORO' ? cfg.bestOfFinalOro : cfg.bestOf;
  }

  const isEmptyVal = v => v === null || v === undefined || v === '';

  /** Evalúa el resultado crudo de un partido. status: empty | partial | invalid | ok */
  function evaluateResult(res, bestOf, cfg) {
    const out = { status: 'empty', errors: [], winner: null, setsA: 0, setsB: 0, ptsA: 0, ptsB: 0, wo: null, sets: [] };
    if (!res) return out;
    const need = Math.floor(bestOf / 2) + 1;
    if (res.wo === 'a' || res.wo === 'b') {
      const winner = res.wo === 'a' ? 'b' : 'a';
      out.wo = res.wo;
      out.winner = winner;
      for (let i = 0; i < need; i++) {
        out.sets.push(winner === 'a' ? [cfg.woSetPoints, 0] : [0, cfg.woSetPoints]);
      }
      out.setsA = winner === 'a' ? need : 0;
      out.setsB = winner === 'b' ? need : 0;
      out.ptsA = out.sets.reduce((s, x) => s + x[0], 0);
      out.ptsB = out.sets.reduce((s, x) => s + x[1], 0);
      out.status = 'ok';
      return out;
    }
    const sets = Array.isArray(res.sets) ? res.sets : [];
    let sawEmpty = false;
    let played = 0;
    for (let i = 0; i < sets.length; i++) {
      const pair = sets[i] || [null, null];
      const ea = isEmptyVal(pair[0]);
      const eb = isEmptyVal(pair[1]);
      if (ea && eb) { sawEmpty = true; continue; }
      if (sawEmpty) { out.errors.push(`Set ${i + 1}: hay un set vacío antes de este`); continue; }
      if (ea || eb) { out.errors.push(`Set ${i + 1}: falta el puntaje de un equipo`); continue; }
      const a = Number(pair[0]);
      const b = Number(pair[1]);
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
        out.errors.push(`Set ${i + 1}: los puntos deben ser números enteros`);
        continue;
      }
      if (a === b) { out.errors.push(`Set ${i + 1}: no puede terminar empatado`); continue; }
      if (i >= bestOf) { out.errors.push(`Set ${i + 1}: el partido es a un máximo de ${bestOf} sets`); continue; }
      if (out.setsA >= need || out.setsB >= need) {
        out.errors.push(`Set ${i + 1}: el partido ya estaba definido`);
        continue;
      }
      played++;
      out.sets.push([a, b]);
      out.ptsA += a;
      out.ptsB += b;
      if (a > b) out.setsA++; else out.setsB++;
    }
    if (out.errors.length) { out.status = 'invalid'; return out; }
    if (played === 0) { out.status = 'empty'; return out; }
    if (out.setsA < need && out.setsB < need) { out.status = 'partial'; return out; }
    out.winner = out.setsA > out.setsB ? 'a' : 'b';
    out.status = 'ok';
    return out;
  }

  /** Puntos de tabla [ganador, perdedor] según el sistema configurado */
  function tablePoints(setsW, setsL, wo, cfg) {
    if (cfg.scoring === 'fivb') return wo ? [3, 0] : setsW - setsL >= 2 ? [3, 0] : [2, 1];
    return [2, wo ? 0 : 1];
  }

  // ---------------------------------------------------------------- estadísticas y ranking
  function emptyRow(id) {
    return { teamId: id, pj: 0, pg: 0, pp: 0, sf: 0, sc: 0, pf: 0, pc: 0, pts: 0, setDiff: 0, ptsDiff: 0 };
  }

  /** items: [{a, b, out}] con out.status==='ok' */
  function tally(ids, items, cfg) {
    const rows = new Map(ids.map(id => [id, emptyRow(id)]));
    for (const it of items) {
      const ra = rows.get(it.a);
      const rb = rows.get(it.b);
      if (!ra || !rb || !it.out || it.out.status !== 'ok') continue;
      const o = it.out;
      ra.pj++; rb.pj++;
      ra.sf += o.setsA; ra.sc += o.setsB; rb.sf += o.setsB; rb.sc += o.setsA;
      ra.pf += o.ptsA; ra.pc += o.ptsB; rb.pf += o.ptsB; rb.pc += o.ptsA;
      const w = o.winner === 'a' ? ra : rb;
      const l = o.winner === 'a' ? rb : ra;
      const sw = o.winner === 'a' ? o.setsA : o.setsB;
      const sl = o.winner === 'a' ? o.setsB : o.setsA;
      const [pw, pl] = tablePoints(sw, sl, !!o.wo, cfg);
      w.pg++; l.pp++; w.pts += pw; l.pts += pl;
    }
    for (const r of rows.values()) { r.setDiff = r.sf - r.sc; r.ptsDiff = r.pf - r.pc; }
    return rows;
  }

  const keyCmp = (x, y) => y.pts - x.pts || y.setDiff - x.setDiff || y.ptsDiff - x.ptsDiff;
  const sameKey = (x, y) => keyCmp(x, y) === 0;

  /**
   * Ordena un conjunto de equipos: Puntos > Dif. sets > Dif. puntos > resultado directo > orden manual.
   * opts: { manual:[ids], flagTies:boolean }
   */
  function rankScope(ids, items, cfg, opts) {
    const rows = tally(ids, items, cfg);
    const order = new Map(ids.map((id, i) => [id, i]));
    const sorted = ids.map(id => rows.get(id)).sort((x, y) => keyCmp(x, y) || order.get(x.teamId) - order.get(y.teamId));
    const result = [];
    let i = 0;
    while (i < sorted.length) {
      let j = i + 1;
      while (j < sorted.length && sameKey(sorted[i], sorted[j])) j++;
      const cluster = sorted.slice(i, j);
      if (cluster.length === 1) result.push(cluster[0]);
      else result.push(...resolveCluster(cluster, items, cfg, opts, order));
      i = j;
    }
    result.forEach((r, k) => { r.pos = k + 1; });
    return result;
  }

  function resolveCluster(cluster, items, cfg, opts, order) {
    const ids = cluster.map(r => r.teamId);
    const idSet = new Set(ids);
    // resultado directo (mini-tabla entre los empatados)
    const mini = tally(ids, items.filter(it => idSet.has(it.a) && idSet.has(it.b)), cfg);
    const sorted = cluster.slice().sort((x, y) => keyCmp(mini.get(x.teamId), mini.get(y.teamId)) || order.get(x.teamId) - order.get(y.teamId));
    const out = [];
    let i = 0;
    while (i < sorted.length) {
      let j = i + 1;
      while (j < sorted.length && sameKey(mini.get(sorted[i].teamId), mini.get(sorted[j].teamId))) j++;
      let sub = sorted.slice(i, j);
      if (sub.length > 1) {
        const manual = (opts && opts.manual) || [];
        if (sub.every(r => manual.includes(r.teamId))) {
          sub = sub.slice().sort((x, y) => manual.indexOf(x.teamId) - manual.indexOf(y.teamId));
          sub.forEach(r => { r.manualTie = true; });
        } else if (opts && opts.flagTies) {
          sub.forEach(r => { r.tie = true; });
        }
      }
      out.push(...sub);
      i = j;
    }
    return out;
  }

  // ---------------------------------------------------------------- derivación completa
  const rankLabel = r =>
    r <= 9 ? `${r}° de grupo` : r <= 18 ? `${r - 9}° mejor 2°` : r <= 27 ? `${r - 18}° mejor 3°` : `${r - 27}° mejor 4°`;
  const cupOfRank = r => (r <= 12 ? 'Oro' : r <= 24 ? 'Plata' : 'Bronce');
  const finalId = (cup, n) => (n === 1 ? (cup === 'Plata' ? 'F-1-Plata' : 'FINAL-' + cup.toUpperCase()) : `F-${n}-${cup}`);

  // Playoffs: definición de cruces. src: ['tri', posición, nTriangular] | ['win'|'lose', semiCode]
  const SEMIS = {
    A: { src: [['tri', 1, 1], ['tri', 1, 4]], pos: 1 },
    B: { src: [['tri', 1, 2], ['tri', 1, 3]], pos: 1 },
    C: { src: [['tri', 2, 1], ['tri', 2, 4]], pos: 2 },
    D: { src: [['tri', 2, 2], ['tri', 2, 3]], pos: 2 },
    E: { src: [['tri', 3, 1], ['tri', 3, 4]], pos: 3 },
    F: { src: [['tri', 3, 2], ['tri', 3, 3]], pos: 3 },
  };
  const FINALS = {
    1: { src: [['win', 'A'], ['win', 'B']], title: 'Final (1° y 2°)' },
    3: { src: [['lose', 'A'], ['lose', 'B']], title: 'Tercer puesto (3° y 4°)' },
    5: { src: [['win', 'C'], ['win', 'D']], title: 'Final 5° y 6°' },
    7: { src: [['lose', 'C'], ['lose', 'D']], title: 'Final 7° y 8°' },
    9: { src: [['win', 'E'], ['win', 'F']], title: 'Final 9° y 10°' },
    11: { src: [['lose', 'E'], ['lose', 'F']], title: 'Final 11° y 12°' },
  };

  function compute(state) {
    const cfg = state.config;
    const teamById = new Map(state.teams.map(t => [t.id, t]));
    const groupOf = {};
    GROUP_KEYS.forEach(g => D.GROUPS[g].forEach(id => { groupOf[id] = g; }));
    const warnings = [];
    const manual = scope => state.manualTie[scope] || [];

    // ---- 1) Fase de grupos
    const matches = []; // todos los partidos (modelo unificado)
    const groups = {};
    GROUP_KEYS.forEach(g => { groups[g] = { key: g, teams: D.GROUPS[g].slice(), matches: [] }; });

    function makeMatch(base) {
      const res = state.results[base.id] || null;
      const bestOf = res && res.bestOf ? res.bestOf : defaultBestOf(base.id, cfg);
      const out = evaluateResult(res, bestOf, cfg);
      const m = Object.assign({ aLabel: '', bLabel: '', result: res, bestOf, out, stale: false }, base);
      if (res && base.phase !== 'G') {
        const teamsMatch = res.a === m.a && res.b === m.b && m.a != null && m.b != null;
        if (!teamsMatch) m.stale = true;
      }
      m.played = out.status === 'ok' && !m.stale;
      m.status = m.stale ? 'stale' : out.status === 'ok' ? 'played' : out.status === 'invalid' ? 'invalid' : out.status === 'partial' ? 'partial' : 'pending';
      m.editable = m.a != null && m.b != null;
      m.ord = m.dayOrder * 100000 + m.turn * 10 + (typeof m.court === 'number' ? m.court : 9);
      return m;
    }

    for (const gm of D.GROUP_MATCHES) {
      const m = makeMatch({
        id: gm.id, phase: 'G', group: gm.group, scope: 'Grupo ' + gm.group, title: 'Grupo ' + gm.group,
        a: gm.a, b: gm.b, court: gm.court, turn: gm.turn, time: gm.time, dayLabel: gm.dayLabel, dayOrder: gm.dayOrder,
      });
      matches.push(m);
      groups[gm.group].matches.push(m);
    }

    for (const g of GROUP_KEYS) {
      const grp = groups[g];
      grp.played = grp.matches.filter(m => m.played).length;
      grp.complete = grp.played === grp.matches.length;
      const items = grp.matches.filter(m => m.played).map(m => ({ a: m.a, b: m.b, out: m.out }));
      grp.standings = rankScope(grp.teams, items, cfg, { manual: manual('group:' + g), flagTies: grp.complete });
      grp.hasTie = grp.standings.some(r => r.tie);
      if (grp.hasTie) warnings.push({ level: 'warn', text: `Grupo ${g}: empate sin resolver (puntos, sets y puntos iguales).`, tie: { scope: 'group:' + g, ids: grp.standings.filter(r => r.tie).map(r => r.teamId) } });
    }
    const groupsPlayed = matches.filter(m => m.phase === 'G' && m.played).length;
    const groupsComplete = groupsPlayed === 54;

    // ---- 2) Tabla general (1° al 36°)
    const gRows = [];
    GROUP_KEYS.forEach((g, gi) => {
      groups[g].standings.forEach((r, k) => {
        gRows.push(Object.assign({}, r, { group: g, groupPos: k + 1, gi, groupComplete: groups[g].complete, groupTie: !!r.tie }));
      });
    });
    gRows.forEach(r => { r.tie = false; r.manualTie = false; });
    gRows.sort((x, y) => x.groupPos - y.groupPos || keyCmp(x, y) || x.gi - y.gi);
    // resolver empates dentro de la misma posición de grupo
    const general = [];
    {
      let i = 0;
      while (i < gRows.length) {
        let j = i + 1;
        while (j < gRows.length && gRows[j].groupPos === gRows[i].groupPos && sameKey(gRows[i], gRows[j])) j++;
        let cl = gRows.slice(i, j);
        if (cl.length > 1) {
          const man = manual('general');
          if (cl.every(r => man.includes(r.teamId))) {
            cl = cl.slice().sort((x, y) => man.indexOf(x.teamId) - man.indexOf(y.teamId));
            cl.forEach(r => { r.manualTie = true; });
          } else if (cl.every(r => r.groupComplete)) {
            cl.forEach(r => { r.tie = true; });
          }
        }
        general.push(...cl);
        i = j;
      }
    }
    general.forEach((r, k) => {
      r.rank = k + 1;
      r.cup = cupOfRank(r.rank);
      r.seedLabel = rankLabel(r.rank);
    });
    const generalTieIds = general.filter(r => r.tie).map(r => r.teamId);
    if (generalTieIds.length) {
      warnings.push({ level: 'warn', text: 'Tabla general: hay equipos empatados en todos los criterios (posición, puntos, dif. de sets y dif. de puntos).', tie: { scope: 'general', ids: generalTieIds } });
    }
    const rankTeam = {};
    general.forEach(r => { rankTeam[r.rank] = r.teamId; });
    const rowOfTeam = {};
    general.forEach(r => { rowOfTeam[r.teamId] = r; });

    // ---- 3) Triangulares con regla de protección de rival
    const triangulars = [];
    const swaps = [];
    for (const cup of CUPS) {
      const slots = TRI_RANKS[cup].map(ranks => ranks.map(r => rankTeam[r]));
      const conflictsOf = t => {
        const c = [];
        for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) if (groupOf[t[i]] === groupOf[t[j]]) c.push([i, j]);
        return c;
      };
      const skip = new Set();
      for (let guard = 0; guard < 30; guard++) {
        let found = null;
        for (let t = 0; t < 4 && !found; t++) {
          const cs = conflictsOf(slots[t]).filter(([i, j]) => !skip.has(`${t}:${i}:${j}`));
          if (cs.length) found = { t, i: cs[0][0], j: cs[0][1] };
        }
        if (!found) break;
        const { t, i, j } = found;
        const line = j; // se mueve el peor sembrado del cruce repetido (línea C; en A–B, la línea B)
        const myRank = TRI_RANKS[cup][t][line];
        const cands = [0, 1, 2, 3].filter(k => k !== t).map(k => ({ k, rank: TRI_RANKS[cup][k][line] }))
          .sort((x, y) => Math.abs(x.rank - myRank) - Math.abs(y.rank - myRank) || y.rank - x.rank);
        const before = conflictsOf(slots[t]).length;
        let done = false;
        let best = null;
        for (const c of cands) {
          const a = slots[t].slice(); const b = slots[c.k].slice();
          [a[line], b[line]] = [b[line], a[line]];
          const after = conflictsOf(a).length + conflictsOf(b).length;
          const total = before + conflictsOf(slots[c.k]).length;
          if (after === 0) { best = { c, a, b }; break; }
          if (after < total && (!best || after < best.after)) best = { c, a, b, after };
        }
        if (best) {
          const movedTeam = slots[t][line];
          const otherTeam = slots[best.c.k][line];
          slots[t] = best.a; slots[best.c.k] = best.b;
          swaps.push({ cup, from: myRank, to: best.c.rank, tri: t + 1, triOther: best.c.k + 1, teamId: movedTeam, otherId: otherTeam });
          done = true;
        }
        if (!done) skip.add(`${t}:${i}:${j}`);
      }
      for (let t = 0; t < 4; t++) {
        const key = `${cup}-${t + 1}`;
        let teams = slots[t].slice();
        const ov = state.triOverride[key];
        const overridden = Array.isArray(ov) && ov.length === 3 && new Set(ov).size === 3 && ov.every(id => teamById.has(id));
        if (overridden) teams = ov.slice();
        triangulars.push({ key, cup, n: t + 1, name: `Triangular ${cup} ${t + 1}`, ranks: TRI_RANKS[cup][t], teams, overridden, conflicts: conflictsOf(teams), swaps: [] });
      }
    }
    swaps.forEach(s => {
      const a = triangulars.find(x => x.cup === s.cup && x.n === s.tri);
      const b = triangulars.find(x => x.cup === s.cup && x.n === s.triOther);
      a.swaps.push(s); b.swaps.push(s);
    });

    const phase1Done = groupsComplete;
    for (const tri of triangulars) {
      tri.provisional = !phase1Done;
      tri.matches = [];
      for (const def of D.TRI_MATCHES.filter(d => d.cup === tri.cup && d.tri === tri.n).sort((x, y) => x.round - y.round)) {
        const [ia, ib] = def.round === 1 ? [0, 2] : def.round === 2 ? [1, 2] : [0, 1];
        const m = makeMatch({
          id: def.id, phase: 'T', cup: tri.cup, tri: tri.n, round: def.round, scope: tri.name, title: `${tri.name} · Ronda ${def.round}`,
          a: tri.teams[ia], b: tri.teams[ib], court: def.court, turn: def.turn, time: def.time, dayLabel: def.dayLabel, dayOrder: def.dayOrder,
        });
        m.repeat = groupOf[m.a] === groupOf[m.b];
        tri.matches.push(m);
        matches.push(m);
      }
      const items = tri.matches.filter(m => m.played).map(m => ({ a: m.a, b: m.b, out: m.out }));
      tri.played = tri.matches.filter(m => m.played).length;
      tri.complete = tri.played === 3;
      tri.standings = rankScope(tri.teams, items, cfg, { manual: manual('tri:' + tri.key), flagTies: tri.complete });
      tri.hasTie = tri.standings.some(r => r.tie);
      if (tri.hasTie) warnings.push({ level: 'warn', text: `${tri.name}: empate sin resolver.`, tie: { scope: 'tri:' + tri.key, ids: tri.standings.filter(r => r.tie).map(r => r.teamId) } });
      for (const c of tri.conflicts) {
        warnings.push({ level: 'warn', text: `${tri.name}: ${teamById.get(tri.teams[c[0]]).name} y ${teamById.get(tri.teams[c[1]]).name} ya se enfrentaron en la Fase 1 y la regla de protección no pudo evitarlo. Puedes cambiar los integrantes a mano.` });
      }
    }

    // ---- 4) Play-offs
    const playoffs = {};
    const finalRanking = Array.from({ length: 36 }, (_, i) => ({ pos: i + 1, cup: cupOfRank(i + 1), cupPos: ((i) % 12) + 1, teamId: null, matchId: null }));
    for (const cup of CUPS) {
      const triPos = (pos, n) => {
        const tri = triangulars.find(t => t.cup === cup && t.n === n);
        return tri.complete ? tri.standings[pos - 1].teamId : null;
      };
      const semis = {};
      const finals = {};
      const resolve = (src, cupObj) => {
        if (src[0] === 'tri') return { team: triPos(src[1], src[2]), label: `${src[1]}° ${triangulars.find(t => t.cup === cup && t.n === src[2]).name}` };
        const sm = cupObj.semis[src[1]];
        const label = `${src[0] === 'win' ? 'Ganador' : 'Perdedor'} Semi ${src[1]} ${cup}`;
        if (!sm.played) return { team: null, label };
        const winTeam = sm.out.winner === 'a' ? sm.a : sm.b;
        const loseTeam = sm.out.winner === 'a' ? sm.b : sm.a;
        return { team: src[0] === 'win' ? winTeam : loseTeam, label };
      };
      const cupObj = { cup, semis, finals, list: [] };
      for (const code of Object.keys(SEMIS)) {
        const def = SEMIS[code];
        const A = resolve(def.src[0], cupObj);
        const B = resolve(def.src[1], cupObj);
        const sched = D.PLAYOFF_SCHEDULE[`SF-${code}-${cup}`];
        const lo = CUP_OFFSET[cup] + (def.pos - 1) * 4 + 1;
        const m = makeMatch({
          id: `SF-${code}-${cup}`, phase: 'P', cup, scope: CUP_NAME[cup], kind: 'semi', code, title: `Semifinal ${code} · ${CUP_NAME[cup]}`,
          subtitle: `Define puestos ${lo}°–${lo + 3}° generales`, a: A.team, b: B.team, aLabel: A.label, bLabel: B.label,
          court: sched.court, turn: sched.turn, time: sched.time, dayLabel: sched.dayLabel, dayOrder: sched.dayOrder,
        });
        semis[code] = m; cupObj.list.push(m); matches.push(m);
      }
      for (const n of [1, 3, 5, 7, 9, 11]) {
        const def = FINALS[n];
        const A = resolve(def.src[0], cupObj);
        const B = resolve(def.src[1], cupObj);
        const id = finalId(cup, n);
        const sched = D.PLAYOFF_SCHEDULE[id];
        const g = CUP_OFFSET[cup] + n;
        const m = makeMatch({
          id, phase: 'P', cup, scope: CUP_NAME[cup], kind: 'final', n, title: n === 1 ? `Gran Final · ${CUP_NAME[cup]}` : `${def.title} · ${CUP_NAME[cup]}`,
          subtitle: `Define puestos ${g}° y ${g + 1}° generales`, a: A.team, b: B.team, aLabel: A.label, bLabel: B.label,
          court: sched.court, turn: sched.turn, time: sched.time, dayLabel: sched.dayLabel, dayOrder: sched.dayOrder,
        });
        finals[n] = m; cupObj.list.push(m); matches.push(m);
        if (m.played) {
          const w = m.out.winner === 'a' ? m.a : m.b;
          const l = m.out.winner === 'a' ? m.b : m.a;
          finalRanking[g - 1].teamId = w; finalRanking[g - 1].matchId = id;
          finalRanking[g].teamId = l; finalRanking[g].matchId = id;
        }
      }
      playoffs[cup] = cupObj;
    }

    // ---- avisos de resultados descartados / inválidos
    for (const m of matches) {
      if (m.stale) warnings.push({ level: 'error', text: `Partido ${m.id}: el resultado guardado corresponde a otros equipos (cambió la tabla o el cruce). No se está contando.`, matchId: m.id });
      else if (m.status === 'invalid') warnings.push({ level: 'error', text: `Partido ${m.id}: resultado inválido — ${m.out.errors[0]}`, matchId: m.id });
    }
    if (!groupsComplete && matches.some(m => m.phase !== 'G' && m.played)) {
      warnings.push({ level: 'info', text: 'Hay resultados de triangulares o play-offs ingresados con la Fase 1 incompleta: los cruces son provisorios y pueden cambiar.' });
    }

    const playedBy = ph => matches.filter(m => m.phase === ph && m.played).length;
    const progress = { G: playedBy('G'), T: playedBy('T'), P: playedBy('P'), total: matches.filter(m => m.played).length, matches: matches.length };

    matches.sort((x, y) => x.ord - y.ord);
    return { state, teamById, groupOf, groups, general, rankTeam, rowOfTeam, triangulars, swaps, playoffs, finalRanking, matches, warnings, progress, groupsComplete };
  }

  // ---------------------------------------------------------------- empates manuales
  /** Fija el orden de un conjunto de empatados (ids en el orden elegido) */
  function setManualTie(state, scope, orderedIds) {
    const cur = (state.manualTie[scope] || []).filter(id => !orderedIds.includes(id));
    state.manualTie[scope] = cur.concat(orderedIds);
  }

  // ---------------------------------------------------------------- simulación (modo demo y pruebas)
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomResult(m, strength, rand) {
    const need = Math.floor(m.bestOf / 2) + 1;
    const pa = 1 / (1 + Math.exp(-(strength[m.a] - strength[m.b])));
    let sa = 0, sb = 0;
    const sets = [];
    while (sa < need && sb < need) {
      const decider = sa === need - 1 && sb === need - 1 && m.bestOf > 1;
      const target = decider ? 15 : 25;
      const aWins = rand() < pa;
      const lose = Math.max(0, Math.min(target - 2, Math.round(target * (0.45 + rand() * 0.5))));
      const win = Math.max(target, lose + 2);
      sets.push(aWins ? [win, lose] : [lose, win]);
      if (aWins) sa++; else sb++;
    }
    return { sets, wo: null, bestOf: m.bestOf, a: m.a, b: m.b };
  }

  /** Rellena resultados aleatorios (hasta la fase indicada: 'G' | 'T' | 'P'). Devuelve el estado. */
  function simulate(state, seed, upTo) {
    const rand = rng(seed || 1);
    const strength = {};
    state.teams.forEach(t => { strength[t.id] = (rand() - 0.5) * 3; });
    const phases = upTo === 'G' ? ['G'] : upTo === 'T' ? ['G', 'T'] : ['G', 'T', 'P'];
    for (let guard = 0; guard < 200; guard++) {
      const d = compute(state);
      // resolver empates para poder avanzar
      let tied = false;
      for (const w of d.warnings) {
        if (w.tie) { setManualTie(state, w.tie.scope, w.tie.ids); tied = true; }
      }
      if (tied) continue;
      let todo = d.matches.filter(m => phases.includes(m.phase) && !m.played && m.a != null && m.b != null);
      if (!todo.length) break;
      // no avanzar a la siguiente fase hasta completar la actual
      const first = phases.find(ph => d.matches.some(m => m.phase === ph && !m.played));
      todo = todo.filter(m => m.phase === first);
      if (!todo.length) break;
      for (const m of todo) state.results[m.id] = randomResult(m, strength, rand);
    }
    return state;
  }

  return {
    CUPS, CUP_NAME, CUP_OFFSET, TRI_RANKS, GROUP_KEYS, DEFAULT_CONFIG, SEMIS, FINALS,
    createState, normalizeState, evaluateResult, tablePoints, rankScope, compute, setManualTie, simulate, defaultBestOf,
    rankLabel, cupOfRank, finalId,
  };
});
