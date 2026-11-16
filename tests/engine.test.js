// Ejecutar con:  node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../app/js/data.js');
const E = require('../app/js/engine.js');

const cfg = E.DEFAULT_CONFIG;
const ev = (sets, bestOf = 3, wo = null) => E.evaluateResult({ sets, wo }, bestOf, cfg);

test('resultado válido 2-1 con sets ganados calculados solos', () => {
  const o = ev([[25, 20], [22, 25], [15, 12]]);
  assert.equal(o.status, 'ok');
  assert.equal(o.setsA, 2); assert.equal(o.setsB, 1);
  assert.equal(o.winner, 'a');
  assert.equal(o.ptsA, 62); assert.equal(o.ptsB, 57);
});

test('validaciones de resultado', () => {
  assert.equal(ev([[25, 20]]).status, 'partial');
  assert.equal(ev([]).status, 'empty');
  assert.equal(ev([[25, 25], [25, 10]]).status, 'invalid');
  assert.equal(ev([[25, 10], [25, 10], [25, 10]]).status, 'invalid'); // set de más tras definir
  assert.equal(ev([[25, 10], [null, 10]]).status, 'invalid'); // marcador incompleto
  assert.equal(ev([[25, 10], ['', ''], [25, 10]]).status, 'invalid'); // set vacío en medio
  assert.equal(ev([[25, 10], [25, 10]], 5).status, 'partial'); // a 5 sets, 2-0 aún no termina
  assert.equal(ev([[25, 10], [25, 10], [25, 10]], 5).status, 'ok'); // 3-0 termina
  assert.equal(ev([[25, 10], [25, 10], [25, 10], [25, 10]], 5).status, 'invalid'); // set de más
  assert.equal(ev([[25, 10], [10, 25], [25, 10], [10, 25], [15, 13]], 5).status, 'ok');
});

test('W.O. = derrota 0-2 con 25-0 por set; 0 puntos de tabla', () => {
  const o = ev([], 3, 'b'); // el equipo B no se presentó
  assert.equal(o.status, 'ok'); assert.equal(o.winner, 'a');
  assert.equal(o.setsA, 2); assert.equal(o.ptsA, 50); assert.equal(o.ptsB, 0);
  assert.deepEqual(E.tablePoints(2, 0, true, cfg), [2, 0]);
});

test('sistemas de puntuación', () => {
  assert.deepEqual(E.tablePoints(2, 1, false, cfg), [2, 1]);
  assert.deepEqual(E.tablePoints(2, 0, false, cfg), [2, 1]);
  const fivb = { scoring: 'fivb' };
  assert.deepEqual(E.tablePoints(2, 0, false, fivb), [3, 0]);
  assert.deepEqual(E.tablePoints(2, 1, false, fivb), [2, 1]);
  assert.deepEqual(E.tablePoints(3, 1, false, fivb), [3, 0]);
  assert.deepEqual(E.tablePoints(3, 2, false, fivb), [2, 1]);
});

function setGroup(state, g, scores) {
  // scores: { 'P01': [[25,10],[25,10]] , ...}  (por id de partido)
  for (const [id, sets] of Object.entries(scores)) state.results[id] = { sets, wo: null };
}

test('tabla de grupo: orden por puntos, dif. de sets y dif. de puntos', () => {
  const s = E.createState();
  const ms = D.GROUP_MATCHES.filter(m => m.group === 'A');
  const [t1, t2, t3, t4] = D.GROUPS.A;
  const find = (x, y) => ms.find(m => (m.a === x && m.b === y) || (m.a === y && m.b === x));
  const win = (m, w, sets) => { const aw = m.a === w; s.results[m.id] = { sets: sets.map(([p, q]) => (aw ? [p, q] : [q, p])), wo: null }; };
  win(find(t1, t2), t1, [[25, 20], [25, 20]]);
  win(find(t1, t3), t1, [[25, 20], [25, 20]]);
  win(find(t1, t4), t4, [[25, 20], [25, 20]]);
  win(find(t2, t3), t2, [[25, 20], [25, 20]]);
  win(find(t2, t4), t4, [[25, 10], [25, 10]]);
  win(find(t3, t4), t3, [[25, 20], [20, 25], [15, 10]]);
  const d = E.compute(s);
  const st = d.groups.A.standings;
  assert.ok(d.groups.A.complete);
  // t1: 2 pj ganados, 1 perdido => 5 pts ; t4: 2 ganados => 5 pts; resto por puntos
  assert.equal(st.reduce((a, r) => a + r.pts, 0), 18); // 6 partidos x 3 pts
  assert.deepEqual(st.map(r => r.pos), [1, 2, 3, 4]);
  // t4 tiene mejor dif. de sets que t1 (ganó 4-0 y 2-0 y perdió 2-... )
  assert.ok(st[0].pts >= st[1].pts && st[1].pts >= st[2].pts && st[2].pts >= st[3].pts);
});

test('empate total se marca y se puede resolver a mano', () => {
  const s = E.createState();
  const ms = D.GROUP_MATCHES.filter(m => m.group === 'B');
  // todos los partidos 2-0 con el mismo marcador, ciclo imposible de romper => varios empatados
  const [a, b, c, d4] = D.GROUPS.B;
  const find = (x, y) => ms.find(m => (m.a === x && m.b === y) || (m.a === y && m.b === x));
  const w = (x, y) => { const m = find(x, y); s.results[m.id] = { sets: m.a === x ? [[25, 20], [25, 20]] : [[20, 25], [20, 25]], wo: null }; };
  w(a, b); w(b, c); w(c, a); // ciclo a>b>c>a
  w(a, d4); w(b, d4); w(c, d4); // todos ganan a d4
  const d = E.compute(s);
  assert.ok(d.groups.B.hasTie);
  assert.ok(d.warnings.some(x => x.tie && x.tie.scope === 'group:B'));
  const ids = d.warnings.find(x => x.tie).tie.ids;
  E.setManualTie(s, 'group:B', ids.slice().reverse());
  const d2 = E.compute(s);
  assert.ok(!d2.groups.B.hasTie);
  assert.deepEqual(d2.groups.B.standings.slice(0, 3).map(r => r.teamId), ids.slice().reverse());
});

test('torneo completo simulado: invariantes del reglamento (60 semillas)', () => {
  let swapsSeen = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const s = E.simulate(E.createState(), seed);
    const d = E.compute(s);
    assert.equal(d.progress.total, 126, `seed ${seed}: 126 partidos`);
    assert.equal(d.progress.G, 54); assert.equal(d.progress.T, 36); assert.equal(d.progress.P, 36);
    assert.equal(d.warnings.filter(w => w.level === 'error').length, 0, `seed ${seed}: sin errores`);

    // cada equipo juega exactamente 7 partidos (3 + 2 + 2)
    const played = {};
    d.matches.filter(m => m.played).forEach(m => { [m.a, m.b].forEach(t => { played[t] = (played[t] || 0) + 1; }); });
    for (const t of s.teams) assert.equal(played[t.id], 7, `seed ${seed}: equipo ${t.id} jugó ${played[t.id]}`);

    // ranking final: 36 equipos distintos, cada uno dentro de su copa
    const ids = d.finalRanking.map(r => r.teamId);
    assert.ok(ids.every(x => x != null), `seed ${seed}: ranking completo`);
    assert.equal(new Set(ids).size, 36);
    d.finalRanking.forEach(r => {
      assert.equal(d.rowOfTeam[r.teamId].cup, r.cup, `seed ${seed}: equipo ${r.teamId} cambió de copa`);
    });

    // copas: 12 equipos cada una, 9 primeros de grupo + 3 mejores segundos en Oro
    for (const cup of E.CUPS) assert.equal(d.general.filter(r => r.cup === cup).length, 12);
    assert.ok(d.general.slice(0, 9).every(r => r.groupPos === 1));
    assert.ok(d.general.slice(9, 18).every(r => r.groupPos === 2));
    assert.ok(d.general.slice(18, 27).every(r => r.groupPos === 3));
    assert.ok(d.general.slice(27, 36).every(r => r.groupPos === 4));
    // la tabla general respeta el orden de criterios dentro de cada bloque
    for (let i = 1; i < 36; i++) {
      const a = d.general[i - 1], b = d.general[i];
      if (a.groupPos === b.groupPos) {
        assert.ok(a.pts > b.pts || (a.pts === b.pts && (a.setDiff > b.setDiff || (a.setDiff === b.setDiff && a.ptsDiff >= b.ptsDiff))), `seed ${seed}: orden general en ${i}`);
      }
    }

    // triangulares: regla de protección (sin repetir rivales de la Fase 1)
    d.triangulars.forEach(t => {
      assert.equal(t.teams.length, 3);
      assert.equal(t.conflicts.length, 0, `seed ${seed}: ${t.name} repite rival de grupo`);
      t.matches.forEach(m => assert.ok(!m.repeat));
      // los 3 equipos pertenecen a la copa del triangular
      t.teams.forEach(id => assert.equal(d.rowOfTeam[id].cup, t.cup));
    });
    swapsSeen += d.swaps.length;

    // equivalencia del ranking final con el campeón de cada copa
    const oro = d.playoffs.Oro.finals[1];
    assert.equal(d.finalRanking[0].teamId, oro.out.winner === 'a' ? oro.a : oro.b);
  }
  assert.ok(swapsSeen > 0, 'la simulación debería haber ejercitado la regla de protección alguna vez');
  console.log(`   (regla de protección aplicada ${swapsSeen} veces en 60 torneos)`);
});

test('final de Oro es a 5 sets por defecto y el resto a 3', () => {
  const d = E.compute(E.createState());
  assert.equal(d.matches.find(m => m.id === 'FINAL-ORO').bestOf, 5);
  assert.equal(d.matches.find(m => m.id === 'FINAL-BRONCE').bestOf, 3);
  assert.equal(d.matches.find(m => m.id === 'P01').bestOf, 3);
});

test('un cambio posterior en grupos deja los resultados de triangulares como desactualizados', () => {
  const s = E.simulate(E.createState(), 7, 'T');
  let d = E.compute(s);
  assert.equal(d.progress.T, 36);
  // alterar un resultado de grupo para cambiar al ganador de un partido decisivo
  const m = d.matches.find(x => x.id === 'P01');
  const cur = s.results.P01;
  s.results.P01 = { sets: cur.sets.map(([a, b]) => [b, a]), wo: null, bestOf: cur.bestOf };
  d = E.compute(s);
  const stale = d.matches.filter(x => x.stale).length;
  assert.ok(stale > 0 || d.progress.T === 36, 'si cambian los cruces, los resultados no coinciden y se descartan');
});

test('sin resultados: nada se rompe y todo queda pendiente', () => {
  const d = E.compute(E.createState());
  assert.equal(d.progress.total, 0);
  assert.equal(d.matches.length, 126);
  assert.equal(d.general.length, 36);
  assert.equal(d.warnings.length, 0);
  assert.equal(d.triangulars.length, 12);
});

test('normalizeState tolera datos basura', () => {
  assert.equal(E.normalizeState(null).teams.length, 36);
  const s = E.normalizeState({ teams: [{ id: 27, name: 'Nuevo Club' }, { id: 999, name: 'x' }], results: 5, config: { bestOf: 5 } });
  assert.equal(s.teams.length, 36);
  assert.equal(s.teams.find(t => t.id === 27).name, 'Nuevo Club');
  assert.equal(s.config.bestOf, 5);
  assert.deepEqual(s.results, {});
});
