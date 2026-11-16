/* Interfaz — Copa Internacional Murano 2026 U16
 * Todo se guarda en el navegador (localStorage). Los cálculos viven en engine.js.
 */
(function () {
  'use strict';
  const D = window.MuranoData;
  const E = window.Engine;

  const KEY = { real: 'murano2026.real', demo: 'murano2026.demo', mode: 'murano2026.mode' };
  const TABS = [
    ['resumen', 'Resumen'], ['partidos', 'Partidos'], ['grupos', 'Grupos'], ['general', 'Tabla general'],
    ['triangulares', 'Triangulares'], ['playoffs', 'Play-offs'], ['final', 'Posiciones finales'], ['ajustes', 'Ajustes'],
  ];
  const COUNTRIES = { CL: 'Chile', AR: 'Argentina', UY: 'Uruguay', '': '—' };

  let mode = 'real';
  let state;
  let d;
  let saveFailed = false;
  const ui = { tab: 'resumen', f: { phase: 'all', scope: 'all', court: 'all', status: 'all', q: '' }, ed: null, tie: null, tri: null };

  // ------------------------------------------------------------ utilidades
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sign = n => (n > 0 ? '+' + n : String(n));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  };
  const T = id => d.teamById.get(id);
  const isPending = t => /^por confirmar/i.test(t.name);
  const tname = (id, label) => {
    if (id == null) return `<span class="ph">${esc(label || 'Por definir')}</span>`;
    const t = T(id);
    return `<span class="tn${isPending(t) ? ' pend' : ''}${t.fav ? ' fav' : ''}">${t.fav ? '★ ' : ''}${esc(t.name)}</span>`;
  };
  const plain = id => (id == null ? 'Por definir' : T(id).name);
  const cc = id => { const c = T(id).country; return c ? `<span class="cc" title="${esc(COUNTRIES[c])}">${c}</span>` : ''; };
  const cupPill = cup => `<span class="pill ${cup.toLowerCase()}">${E.CUP_NAME[cup]}</span>`;
  const cupRange = cup => `${E.CUP_OFFSET[cup] + 1}° al ${E.CUP_OFFSET[cup] + 12}°`;
  const dateStamp = () => { const n = new Date(); const p = x => String(x).padStart(2, '0'); return `${n.getFullYear()}${p(n.getMonth() + 1)}${p(n.getDate())}-${p(n.getHours())}${p(n.getMinutes())}`; };

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  // ------------------------------------------------------------ persistencia
  function load() {
    mode = store.get(KEY.mode) === 'demo' ? 'demo' : 'real';
    let raw = null;
    try { raw = JSON.parse(store.get(KEY[mode])); } catch (e) { raw = null; }
    state = E.normalizeState(raw);
    d = E.compute(state);
  }

  function save() {
    state.updatedAt = new Date().toISOString();
    saveFailed = !store.set(KEY[mode], JSON.stringify(state));
    paintSaveState();
  }

  function paintSaveState() {
    const el = $('#saveState');
    if (saveFailed) { el.textContent = '⚠ No se pudo guardar en este navegador — descarga un respaldo'; el.className = 'save-state bad'; return; }
    const t = state.updatedAt ? new Date(state.updatedAt) : null;
    el.className = 'save-state';
    el.textContent = t ? `Guardado ${t.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}` : 'Sin cambios aún';
  }

  function commit(opts) {
    save();
    d = E.compute(state);
    if (!opts || opts.render !== false) render();
    else { paintTabs(); }
  }

  // ------------------------------------------------------------ piezas de UI
  function matchRow(m, o) {
    o = o || {};
    const wa = m.played && m.out.winner === 'a';
    const wb = m.played && m.out.winner === 'b';
    const score = m.played ? `<b class="sc">${m.out.setsA}<i>–</i>${m.out.setsB}</b>` : '<span class="vs">vs</span>';
    const where = m.court === 'Central' ? 'Cancha Central' : `Cancha ${m.court}`;
    const turn = m.turn === 99 ? 'último partido' : `turno ${m.turn}`;
    const meta = `<b>${esc(m.id)}</b>${esc(where)} · ${turn}${m.time ? ' · ' + esc(m.time) + ' h' : ''}`;
    let sets = '';
    if (m.played) sets = m.out.wo ? `W.O. de ${esc(plain(m.out.wo === 'a' ? m.a : m.b))}` : m.out.sets.map(s => s.join('-')).join(' · ');
    else if (m.status === 'stale') sets = '⚠ Resultado desactualizado — vuelve a ingresarlo';
    else if (m.status === 'invalid') sets = '⚠ Resultado inválido';
    else if (o.showScope) sets = esc(m.title);
    const act = !m.editable ? 'Esperando equipos' : m.played ? 'Editar' : m.status === 'stale' ? 'Corregir' : 'Ingresar';
    return `<button type="button" class="mrow st-${m.status}${m.editable ? '' : ' locked'}" data-action="edit" data-id="${esc(m.id)}"${m.editable ? '' : ' disabled'}>
      <span class="m-meta">${meta}</span>
      <span class="m-main"><span class="m-team${wa ? ' w' : ''}">${tname(m.a, m.aLabel)}</span>${score}<span class="m-team r${wb ? ' w' : ''}">${tname(m.b, m.bLabel)}</span></span>
      <span class="m-sets">${sets}</span>
      <span class="m-act">${act}</span></button>`;
  }

  function standRows(rows, o) {
    o = o || {};
    return rows.map(r => {
      const gr = d.rowOfTeam[r.teamId];
      const t = T(r.teamId);
      const showCup = o.cup && d.progress.G > 0 && r.pj > 0;
      const cls = [showCup ? 'cup-' + gr.cup.toLowerCase() : '', t.fav ? 'fav' : '', o.dim && !groupDone(r.teamId) ? 'prov' : ''].join(' ');
      const tag = (r.tie ? '<span class="tag tie">⚠ empate</span>' : '') + (r.manualTie ? '<span class="tag man">orden manual</span>' : '');
      return `<tr class="${cls}"><td class="pos l">${r.pos}</td><td class="team l">${tname(r.teamId)}${cc(r.teamId)}${tag}${showCup ? ` <span class="pill ${gr.cup.toLowerCase()}">${gr.cup}</span>` : ''}</td>
        <td>${r.pj}</td><td>${r.pg}</td><td>${r.pp}</td><td class="hide-sm">${r.sf}</td><td class="hide-sm">${r.sc}</td><td>${sign(r.setDiff)}</td>
        <td class="hide-sm">${r.pf}</td><td class="hide-sm">${r.pc}</td><td>${sign(r.ptsDiff)}</td><td class="pts">${r.pts}</td></tr>`;
    }).join('');
  }
  const groupDone = id => d.groups[d.groupOf[id]].complete;

  const STAND_HEAD = `<thead><tr><th class="l">#</th><th class="l">Equipo</th><th title="Partidos jugados">PJ</th><th title="Ganados">G</th><th title="Perdidos">P</th>
    <th class="hide-sm" title="Sets a favor">SF</th><th class="hide-sm" title="Sets en contra">SC</th><th title="Diferencia de sets">DS</th>
    <th class="hide-sm" title="Puntos a favor">PF</th><th class="hide-sm" title="Puntos en contra">PC</th><th title="Diferencia de puntos">DP</th><th title="Puntos de tabla">Pts</th></tr></thead>`;

  function tieBtn(scope, ids, label) {
    return `<button type="button" class="btn sm" data-action="tie" data-scope="${esc(scope)}" data-ids="${ids.join(',')}">${esc(label || 'Resolver')}</button>`;
  }

  // ------------------------------------------------------------ vistas
  function viewResumen() {
    const p = d.progress;
    const stat = (label, n, tot, hint) => `<div class="card stat"><div class="stat-h"><span>${label}</span><b>${n}<small> / ${tot}</small></b></div>
      <div class="bar" role="progressbar" aria-valuenow="${n}" aria-valuemin="0" aria-valuemax="${tot}"><i style="width:${(n / tot * 100).toFixed(1)}%"></i></div><p class="hint">${hint}</p></div>`;
    const g = stat('Fase 1 · Grupos', p.G, 54, d.groupsComplete ? '✔ Completa: la tabla general es definitiva' : `${54 - p.G} partidos por jugar`);
    const t = stat('Fase 2 · Triangulares', p.T, 36, p.T === 36 ? '✔ Completa' : d.groupsComplete ? `${36 - p.T} partidos por jugar` : 'Se habilita al cerrar la Fase 1');
    const po = stat('Fase 3 · Play-offs', p.P, 36, p.P === 36 ? '✔ Completa' : 'Se habilita al cerrar los triangulares');

    const alerts = d.warnings.length
      ? `<div class="section"><h3>Avisos <span class="pill warn">${d.warnings.length}</span></h3><div class="alerts">${d.warnings.map(w => {
        let btn = '';
        if (w.tie) btn = tieBtn(w.tie.scope, w.tie.ids);
        else if (w.matchId) btn = `<button type="button" class="btn sm" data-action="edit" data-id="${esc(w.matchId)}">Revisar</button>`;
        return `<div class="alert ${w.level}"><span>${esc(w.text)}</span>${btn}</div>`;
      }).join('')}</div></div>`
      : '';

    const favs = state.teams.filter(x => x.fav);
    const mine = favs.length
      ? `<div class="section"><h3>Mis equipos</h3><div class="grid g2">${favs.map(x => myTeamCard(x.id)).join('')}</div></div>`
      : '';

    const next = d.matches.filter(m => m.status === 'pending' && m.editable).slice(0, 8);
    const nextHtml = next.length
      ? `<div class="section"><h3>Próximos partidos por registrar</h3><div class="list">${next.map(m => matchRow(m, { showScope: true })).join('')}</div>
         <p style="margin-top:10px"><a class="btn" href="#/partidos">Ver todos los partidos</a></p></div>`
      : p.total === d.matches.length ? '<div class="section card empty">🏆 Torneo completo. Revisa las posiciones finales.</div>' : '';

    return `<div class="view-title"><h2>Resumen</h2><p>${p.total} de ${d.matches.length} partidos registrados</p></div>
      <div class="grid g3">${g}${t}${po}</div>${alerts}${mine}${nextHtml}`;
  }

  function myTeamCard(id) {
    const row = d.rowOfTeam[id];
    const gs = d.groups[row.group].standings.find(r => r.teamId === id);
    const tri = d.triangulars.find(x => x.teams.includes(id));
    const fin = d.finalRanking.find(r => r.teamId === id);
    const pend = d.matches.filter(m => (m.a === id || m.b === id) && m.status === 'pending' && m.editable).slice(0, 2);
    let proj;
    if (d.progress.G === 0) proj = '<span class="muted">Sin datos todavía</span>';
    else proj = `${row.rank}° general (${esc(row.seedLabel)}) → ${cupPill(row.cup)}${row.groupComplete ? '' : ' <span class="pill neutral">provisorio</span>'}`;
    let triTxt = '<span class="muted">Se define al cerrar la Fase 1</span>';
    if (d.groupsComplete) {
      triTxt = esc(tri.name);
      if (tri.complete) triTxt += ` · terminó <b>${tri.standings.findIndex(r => r.teamId === id) + 1}°</b>`;
    }
    return `<article class="card myteam"><h3>${tname(id)}${cc(id)}</h3>
      <dl class="kv"><dt>Grupo ${row.group}</dt><dd>${d.progress.G === 0 ? '—' : `${gs.pos}° · ${gs.pts} pts · ${gs.pg}G-${gs.pp}P (${sign(gs.setDiff)} sets)`}</dd>
      <dt>Proyección</dt><dd>${proj}</dd><dt>Triangular</dt><dd>${triTxt}</dd>
      <dt>Posición final</dt><dd>${fin ? `<b>${fin.pos}° general</b> · ${cupPill(fin.cup)}` : '<span class="muted">Por definir</span>'}</dd></dl>
      ${pend.length ? `<div class="list">${pend.map(m => matchRow(m, { showScope: true })).join('')}</div>` : ''}</article>`;
  }

  // ---- partidos
  function filteredMatches() {
    const f = ui.f;
    const q = f.q.trim().toLowerCase();
    return d.matches.filter(m => {
      if (f.phase !== 'all' && m.phase !== f.phase) return false;
      if (f.scope !== 'all') {
        if (f.scope.startsWith('grp:') && m.group !== f.scope.slice(4)) return false;
        if (f.scope.startsWith('cup:') && m.cup !== f.scope.slice(4)) return false;
      }
      if (f.court !== 'all' && String(m.court) !== f.court) return false;
      if (f.status === 'pending' && m.played) return false;
      if (f.status === 'played' && !m.played) return false;
      if (f.status === 'issues' && !(m.status === 'stale' || m.status === 'invalid')) return false;
      if (q) {
        const hay = [m.id, plain(m.a), plain(m.b), m.aLabel, m.bLabel, m.scope].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function matchListHtml() {
    const list = filteredMatches();
    if (!list.length) return '<div class="card empty">No hay partidos con esos filtros.</div>';
    let out = `<p class="muted" style="margin-bottom:6px">${list.length} partido${list.length === 1 ? '' : 's'}</p>`;
    let day = '';
    let open = false;
    for (const m of list) {
      if (m.dayLabel !== day) {
        if (open) out += '</div>';
        day = m.dayLabel;
        out += `<h3 class="day-h">${esc(day)}</h3><div class="list">`;
        open = true;
      }
      out += matchRow(m, { showScope: true });
    }
    return out + '</div>';
  }

  function viewPartidos() {
    const f = ui.f;
    const opt = (v, l, cur) => `<option value="${v}"${cur === v ? ' selected' : ''}>${l}</option>`;
    const scopes = opt('all', 'Todos', f.scope)
      + '<optgroup label="Grupos">' + E.GROUP_KEYS.map(g => opt('grp:' + g, 'Grupo ' + g, f.scope)).join('') + '</optgroup>'
      + '<optgroup label="Copas (triangulares y play-offs)">' + E.CUPS.map(c => opt('cup:' + c, E.CUP_NAME[c], f.scope)).join('') + '</optgroup>';
    return `<div class="view-title"><h2>Partidos</h2><p>Toca un partido para ingresar o corregir el resultado.</p></div>
      <div class="card filters">
        <label>Buscar<input type="search" id="fq" placeholder="Equipo o N° de partido" value="${esc(f.q)}"></label>
        <label>Fase<select data-filter="phase">${opt('all', 'Todas', f.phase)}${opt('G', 'Grupos', f.phase)}${opt('T', 'Triangulares', f.phase)}${opt('P', 'Play-offs', f.phase)}</select></label>
        <label>Grupo / Copa<select data-filter="scope">${scopes}</select></label>
        <label>Cancha<select data-filter="court">${opt('all', 'Todas', f.court)}${[1, 2, 3, 4, 5].map(c => opt(String(c), 'Cancha ' + c, f.court)).join('')}${opt('Central', 'Central', f.court)}</select></label>
        <label>Estado<select data-filter="status">${opt('all', 'Todos', f.status)}${opt('pending', 'Pendientes', f.status)}${opt('played', 'Jugados', f.status)}${opt('issues', 'Con problemas', f.status)}</select></label>
      </div><div id="match-list">${matchListHtml()}</div>`;
  }

  // ---- grupos
  function viewGrupos() {
    const cards = E.GROUP_KEYS.map(g => {
      const grp = d.groups[g];
      return `<section class="card gcard"><header><h3>Grupo ${g}</h3><span class="pill ${grp.complete ? 'ok' : 'neutral'}">${grp.complete ? 'Completo' : `${grp.played}/6 jugados`}</span></header>
        <div class="scroll"><table class="tbl">${STAND_HEAD}<tbody>${standRows(grp.standings, { cup: true })}</tbody></table></div>
        <div class="matches">${grp.matches.sort((a, b) => a.ord - b.ord).map(m => matchRow(m)).join('')}</div></section>`;
    }).join('');
    return `<div class="view-title"><h2>Fase 1 · Grupos</h2><p>Todos contra todos. Orden: puntos, diferencia de sets, diferencia de puntos y resultado directo.</p></div>
      ${legend()}<div class="grid g2">${cards}</div>`;
  }

  function legend() {
    return `<p class="muted" style="margin-bottom:12px">Franja de color y etiqueta = copa a la que va clasificando hoy ·
      <span class="pill oro">Oro</span> <span class="pill plata">Plata</span> <span class="pill bronce">Bronce</span>
      ${d.groupsComplete ? '' : ' · <b>Provisorio</b> hasta cerrar los 54 partidos'}</p>`;
  }

  // ---- tabla general
  function viewGeneral() {
    let body = '';
    let cup = '';
    for (const r of d.general) {
      if (r.cup !== cup) {
        cup = r.cup;
        body += `<tr class="sep ${cup.toLowerCase()}"><td colspan="10">${E.CUP_NAME[cup].toUpperCase()} · puestos ${cupRange(cup)}</td></tr>`;
      }
      const t = T(r.teamId);
      const tag = (r.tie ? '<span class="tag tie">⚠ empate</span>' : '') + (r.manualTie ? '<span class="tag man">orden manual</span>' : '');
      const tieIds = r.tie ? d.general.filter(x => x.tie && x.groupPos === r.groupPos && x.pts === r.pts && x.setDiff === r.setDiff && x.ptsDiff === r.ptsDiff).map(x => x.teamId) : [];
      body += `<tr class="cup-${cup.toLowerCase()}${t.fav ? ' fav' : ''}${r.groupComplete ? '' : ' prov'}"><td class="pos l">${r.rank}°</td>
        <td class="team l">${tname(r.teamId)}${cc(r.teamId)}${tag}${r.tie ? ' ' + tieBtn('general', tieIds) : ''}</td>
        <td>${r.group}</td><td>${r.groupPos}°</td><td>${r.pj}</td><td class="pts">${r.pts}</td><td>${r.sf}–${r.sc} (${sign(r.setDiff)})</td><td class="hide-sm">${r.pf}–${r.pc}</td><td>${sign(r.ptsDiff)}</td>
        <td class="l hide-sm muted">${esc(r.seedLabel)}</td></tr>`;
    }
    const note = d.groupsComplete
      ? '<div class="alert info">✔ Fase 1 completa: esta tabla es definitiva y define las copas y los triangulares.</div>'
      : `<div class="alert info">Proyección provisoria con ${d.progress.G} de 54 partidos jugados. Las filas atenuadas pertenecen a grupos que aún no terminan.</div>`;
    return `<div class="view-title"><h2>Tabla general · 1° al 36°</h2><p>Se ordena por posición en el grupo, luego puntos, diferencia de sets y diferencia de puntos.</p></div>
      ${note}
      <div class="card section" style="margin-top:12px"><div class="scroll"><table class="tbl"><thead><tr><th class="l">#</th><th class="l">Equipo</th><th>Gr.</th><th>Pos.</th><th>PJ</th><th>Pts</th><th>Sets</th><th class="hide-sm">Puntos</th><th>DP</th><th class="l hide-sm">Sembrado</th></tr></thead>
      <tbody>${body}</tbody></table></div></div>`;
  }

  // ---- triangulares
  function triCard(tri) {
    const notes = [];
    tri.swaps.forEach(s => notes.push(`<div class="note">🔁 Protección de rival: ${esc(plain(s.teamId))} (${s.from}°) se permutó con ${esc(plain(s.otherId))} (${s.to}°) para no repetir un cruce de la Fase 1.</div>`));
    if (tri.overridden) notes.push('<div class="note">✎ Integrantes fijados a mano.</div>');
    tri.conflicts.forEach(c => notes.push(`<div class="note bad">⚠ ${esc(plain(tri.teams[c[0]]))} y ${esc(plain(tri.teams[c[1]]))} ya se enfrentaron en la Fase 1 (la protección no pudo evitarlo).</div>`));
    const status = tri.provisional ? '<span class="pill neutral">provisorio</span>' : tri.complete ? '<span class="pill ok">Completo</span>' : `<span class="pill neutral">${tri.played}/3</span>`;
    const seeds = tri.teams.map((id, i) => `<div><b>${'ABC'[i]}</b><span>${tname(id)}${cc(id)}</span><span class="rk">${d.rowOfTeam[id].rank}° gral · Gr. ${d.groupOf[id]}</span></div>`).join('');
    const tie = tri.hasTie ? `<div class="note bad">⚠ Empate sin resolver. ${tieBtn('tri:' + tri.key, tri.standings.filter(r => r.tie).map(r => r.teamId))}</div>` : '';
    return `<section class="card tcard"><header><h3>${esc(tri.name)}</h3><span class="row">${status}<button type="button" class="btn sm" data-action="tri-edit" data-key="${tri.key}">Cambiar integrantes</button></span></header>
      <div class="seeds">${seeds}</div>${notes.join('')}
      <div class="scroll"><table class="tbl">${STAND_HEAD}<tbody>${standRows(tri.standings, {})}</tbody></table></div>${tie}
      <div class="matches">${tri.matches.map(m => matchRow(m)).join('')}</div></section>`;
  }

  function viewTriangulares() {
    const warn = d.groupsComplete ? '' : `<div class="alert warn" style="margin-bottom:12px">Los cruces son provisorios: se confirman al terminar los 54 partidos de la Fase 1 (van ${d.progress.G}).</div>`;
    const parts = E.CUPS.map(c => `<div class="cup-head ${c.toLowerCase()}">${E.CUP_NAME[c]} <small>· puestos ${cupRange(c)}</small></div>
      <div class="grid g2">${d.triangulars.filter(t => t.cup === c).map(triCard).join('')}</div>`).join('');
    return `<div class="view-title"><h2>Fase 2 · Triangulares</h2><p>Siembra en serpentina. Rondas: A vs C, B vs C y A vs B (A = mejor sembrado).</p></div>${warn}${parts}`;
  }

  // ---- play-offs
  function viewPlayoffs() {
    const parts = E.CUPS.map(cup => {
      const po = d.playoffs[cup];
      const block = (title, codes, fins) => `<div class="card po-block"><h4>${title}</h4><div class="list">${codes.map(c => matchRow(po.semis[c], { showScope: false })).concat(fins.map(n => matchRow(po.finals[n]))).join('')}</div></div>`;
      const off = E.CUP_OFFSET[cup];
      return `<div class="cup-head ${cup.toLowerCase()}">${E.CUP_NAME[cup]}</div><div class="grid g3">
        ${block(`Puestos ${off + 1}° al ${off + 4}°`, ['A', 'B'], [1, 3])}
        ${block(`Puestos ${off + 5}° al ${off + 8}°`, ['C', 'D'], [5, 7])}
        ${block(`Puestos ${off + 9}° al ${off + 12}°`, ['E', 'F'], [9, 11])}</div>`;
    }).join('');
    const warn = d.triangulars.every(t => t.complete) ? '' : '<div class="alert info" style="margin-bottom:12px">Los cruces se completan a medida que terminan los triangulares.</div>';
    return `<div class="view-title"><h2>Fase 3 · Play-offs</h2><p>Semifinales cruzadas (1° T1 vs 1° T4, 1° T2 vs 1° T3, y lo mismo con 2° y 3°) y finales de posición.</p></div>${warn}${parts}`;
  }

  // ---- posiciones finales
  function viewFinal() {
    const ch = E.CUPS.map(c => {
      const r = d.finalRanking[E.CUP_OFFSET[c]];
      return `<div class="champ ${c.toLowerCase()}"><small>Campeón ${E.CUP_NAME[c]}</small><b>${r.teamId ? tname(r.teamId) : '<span class="ph">Por definir</span>'}</b></div>`;
    }).join('');
    const label = n => (n === 1 ? 'Campeón' : n === 2 ? 'Subcampeón' : `${n}° lugar`);
    let body = '';
    let cup = '';
    for (const r of d.finalRanking) {
      if (r.cup !== cup) { cup = r.cup; body += `<tr class="sep ${cup.toLowerCase()}"><td colspan="3">${E.CUP_NAME[cup].toUpperCase()}</td></tr>`; }
      const fav = r.teamId && T(r.teamId).fav;
      body += `<tr class="cup-${cup.toLowerCase()}${fav ? ' fav' : ''}${r.cupPos <= 3 ? ' top' : ''}"><td class="pos l">${r.pos}°</td><td class="l">${esc(label(r.cupPos))}</td>
        <td class="team l">${r.teamId ? tname(r.teamId) + cc(r.teamId) : '<span class="ph">Por definir</span>'}</td></tr>`;
    }
    return `<div class="view-title"><h2>Posiciones finales · 1° al 36°</h2><p>Cada partido de la última jornada define un puesto exacto.</p></div>
      <div class="champs">${ch}</div>
      <div class="card"><div class="scroll"><table class="tbl"><thead><tr><th class="l">Puesto general</th><th class="l">En su copa</th><th class="l">Equipo</th></tr></thead><tbody>${body}</tbody></table></div></div>`;
  }

  // ---- ajustes
  function viewAjustes() {
    const c = state.config;
    const sel = (v, l, cur) => `<option value="${v}"${String(cur) === String(v) ? ' selected' : ''}>${l}</option>`;
    const rows = state.teams.map(t => `<tr><td class="pos l">${t.id}</td>
      <td class="l"><input class="fld" data-team="${t.id}" data-field="name" value="${esc(t.name)}" aria-label="Nombre del equipo ${t.id}"></td>
      <td class="l"><input class="fld" data-team="${t.id}" data-field="city" value="${esc(t.city)}" aria-label="Ciudad del equipo ${t.id}" placeholder="Ciudad"></td>
      <td class="l"><select class="fld" data-team="${t.id}" data-field="country" aria-label="País del equipo ${t.id}">${Object.entries(COUNTRIES).map(([k, v]) => sel(k, v, t.country)).join('')}</select></td>
      <td class="l">Grupo ${d.groupOf[t.id]}</td>
      <td><input type="checkbox" data-team="${t.id}" data-field="fav" ${t.fav ? 'checked' : ''} aria-label="Destacar equipo ${t.id}"></td></tr>`).join('');
    const isDemo = mode === 'demo';
    return `<div class="view-title"><h2>Ajustes</h2><p>Equipos, reglas y respaldo de datos.</p></div>
      <section class="card card-pad"><h3 style="margin-bottom:8px">Reglas del torneo</h3>
        <div class="form-grid">
          <label>Puntos de tabla por partido<select class="fld-select fld" data-config="scoring">${sel('2-1-0', 'Victoria 2 · Derrota 1 · W.O. 0 (Excel)', c.scoring)}${sel('fivb', 'FIVB: 3-0 y 3-1 = 3/0 · 3-2 = 2/1', c.scoring)}</select>
            <small>El dossier no lo define; se tomó del Excel. Se recalcula todo al cambiarlo.</small></label>
          <label>Sets máximos por partido<select class="fld" data-config="bestOf">${sel(1, 'Un set', c.bestOf)}${sel(3, 'Mejor de 3', c.bestOf)}${sel(5, 'Mejor de 5', c.bestOf)}</select>
            <small>Valor por defecto; se puede cambiar en cada partido.</small></label>
          <label>Gran Final de Oro<select class="fld" data-config="bestOfFinalOro">${sel(3, 'Mejor de 3', c.bestOfFinalOro)}${sel(5, 'Mejor de 5', c.bestOfFinalOro)}</select>
            <small>El Excel la marca como "5 SET".</small></label>
          <label>Puntos por set en un W.O.<input class="fld" type="number" min="1" max="99" data-config="woSetPoints" value="${c.woSetPoints}">
            <small>Un W.O. cuenta como derrota 0-2 (o 0-3) con ese marcador en cada set.</small></label>
        </div></section>
      <section class="card card-pad section"><h3 style="margin-bottom:8px">Respaldo de datos</h3>
        <p class="muted" style="margin-bottom:10px">Los datos viven en este navegador. Descarga un respaldo al terminar cada jornada, o para abrir la app en otro computador.</p>
        <div class="row">
          <button type="button" class="btn primary" data-action="export">⬇ Descargar respaldo (.json)</button>
          <button type="button" class="btn" data-action="import">⬆ Cargar respaldo</button>
          <button type="button" class="btn" data-action="csv">⬇ Resultados en CSV (Excel)</button>
          <button type="button" class="btn" data-action="print">🖨 Imprimir esta página</button>
          <input type="file" id="importFile" accept="application/json,.json" hidden>
        </div></section>
      <section class="card card-pad section"><h3 style="margin-bottom:8px">Modo demo</h3>
        <p class="muted" style="margin-bottom:10px">Carga resultados inventados para probar la app. <b>Tus datos reales no se tocan</b>: son un espacio aparte al que puedes volver cuando quieras.</p>
        <div class="row">${isDemo
          ? '<button type="button" class="btn primary" data-action="demo-exit">Salir del modo demo</button>'
          : `<button type="button" class="btn" data-action="demo" data-upto="G">Demo: Fase 1 completa</button>
             <button type="button" class="btn" data-action="demo" data-upto="T">Demo: hasta triangulares</button>
             <button type="button" class="btn" data-action="demo" data-upto="P">Demo: torneo completo</button>`}</div></section>
      <section class="card section"><div class="card-pad"><h3>Equipos</h3><p class="muted">Cambia aquí los nombres cuando se confirmen (por ejemplo el Cupo 27). Los resultados ya ingresados se conservan. La estrella destaca al equipo en todas las vistas.</p></div>
        <div class="scroll settings-tbl"><table class="tbl"><thead><tr><th class="l">N°</th><th class="l">Nombre</th><th class="l">Ciudad</th><th class="l">País</th><th class="l">Grupo</th><th>★</th></tr></thead><tbody>${rows}</tbody></table></div></section>
      <section class="card card-pad section"><h3 style="margin-bottom:8px">Zona de cuidado</h3>
        <p class="muted" style="margin-bottom:10px">Borra todos los resultados y desempates${isDemo ? ' del demo' : ''}. Los nombres de equipos se mantienen.</p>
        <button type="button" class="btn danger" data-action="reset">Borrar todos los resultados</button></section>`;
  }

  // ------------------------------------------------------------ modal genérico
  function openModal(html) {
    const root = $('#modal-root');
    root.innerHTML = `<div class="modal-bg" data-action="bg">${html}</div>`;
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    $('#modal-root').innerHTML = '';
    document.body.style.overflow = '';
    ui.ed = ui.tie = ui.tri = null;
  }
  function askConfirm(title, text, okLabel) {
    return new Promise(res => {
      openModal(`<div class="modal-card" role="alertdialog" aria-modal="true" aria-labelledby="cfT"><header><h2 id="cfT">${esc(title)}</h2></header>
        <div class="modal-body"><p>${text}</p></div><footer><button class="btn" data-action="cf-no">Cancelar</button><button class="btn danger" data-action="cf-yes">${esc(okLabel || 'Aceptar')}</button></footer></div>`);
      const root = $('#modal-root');
      const h = e => {
        const a = e.target.closest('[data-action]');
        if (!a) return;
        if (a.dataset.action === 'cf-yes') { e.stopPropagation(); root.removeEventListener('click', h, true); closeModal(); res(true); }
        else if (a.dataset.action === 'cf-no' || a.dataset.action === 'bg' || a.dataset.action === 'close') { e.stopPropagation(); root.removeEventListener('click', h, true); closeModal(); res(false); }
      };
      root.addEventListener('click', h, true);
    });
  }

  // ---- editor de resultado
  function openEditor(id, fromList) {
    const m = d.matches.find(x => x.id === id);
    if (!m || !m.editable) return;
    const res = m.stale ? null : m.result;
    ui.ed = {
      id, fromList: !!fromList, bestOf: m.bestOf, wo: res && res.wo ? res.wo : null,
      sets: Array.from({ length: 5 }, (_, i) => (res && res.sets && res.sets[i] ? [String(res.sets[i][0]), String(res.sets[i][1])] : ['', ''])),
    };
    renderEditor();
    const first = $('#modal-root .ed-row input:not(:disabled)');
    const firstEmpty = Array.from(document.querySelectorAll('#modal-root .ed-row input:not(:disabled)')).find(i => i.value === '');
    (firstEmpty || first || $('#modal-root button')).focus();
  }

  function edEval() {
    const ed = ui.ed;
    return E.evaluateResult({ sets: ed.sets.slice(0, ed.bestOf), wo: ed.wo }, ed.bestOf, state.config);
  }

  function renderEditor() {
    const ed = ui.ed;
    const m = d.matches.find(x => x.id === ed.id);
    const rows = Array.from({ length: ed.bestOf }, (_, i) => `<div class="ed-row"><label for="s${i}a">Set ${i + 1}</label>
      <input id="s${i}a" inputmode="numeric" maxlength="2" autocomplete="off" data-set="${i}" data-side="0" value="${esc(ed.sets[i][0])}" aria-label="Set ${i + 1}, puntos de ${esc(plain(m.a))}"${ed.wo ? ' disabled' : ''}>
      <span>–</span>
      <input id="s${i}b" inputmode="numeric" maxlength="2" autocomplete="off" data-set="${i}" data-side="1" value="${esc(ed.sets[i][1])}" aria-label="Set ${i + 1}, puntos de ${esc(plain(m.b))}"${ed.wo ? ' disabled' : ''}></div>`).join('');
    const where = m.court === 'Central' ? 'Cancha Central' : `Cancha ${m.court}`;
    openModal(`<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="edT">
      <header><div><small>${esc(m.id)} · ${esc(m.scope)} · ${esc(where)}</small><h2 id="edT">${esc(m.title)}</h2></div><button class="close" data-action="close" aria-label="Cerrar">×</button></header>
      <div class="modal-body">
        <div class="ed-teams"><span>${esc(plain(m.a))}</span><i>vs</i><span>${esc(plain(m.b))}</span></div>
        <div class="ed-sets">${rows}</div>
        <div class="ed-opts">
          <label>Formato<select class="fld" data-ed="bestOf">${[1, 3, 5].map(n => `<option value="${n}"${ed.bestOf === n ? ' selected' : ''}>${n === 1 ? 'Un set' : 'Mejor de ' + n}</option>`).join('')}</select></label>
          <label>W.O. (no se presentó)<select class="fld" data-ed="wo"><option value="">Ninguno</option><option value="a"${ed.wo === 'a' ? ' selected' : ''}>${esc(plain(m.a))}</option><option value="b"${ed.wo === 'b' ? ' selected' : ''}>${esc(plain(m.b))}</option></select></label>
        </div>
        <div id="edPreview" class="ed-preview" aria-live="polite"></div>
      </div>
      <footer>
        ${m.result ? '<button class="btn danger" data-action="ed-del" style="margin-right:auto">Borrar resultado</button>' : ''}
        <button class="btn" data-action="close">Cancelar</button>
        <button class="btn primary" data-action="ed-save" id="edSave">Guardar</button>
        ${ed.fromList ? '<button class="btn primary" data-action="ed-next" id="edNext">Guardar y siguiente</button>' : ''}
      </footer></div>`);
    updatePreview();
  }

  function updatePreview() {
    const ed = ui.ed;
    if (!ed) return;
    const m = d.matches.find(x => x.id === ed.id);
    const out = edEval();
    const box = $('#edPreview');
    let html = '';
    let cls = '';
    const win = out.winner ? esc(plain(out.winner === 'a' ? m.a : m.b)) : '';
    if (out.status === 'ok') {
      cls = 'ok';
      const [pw, pl] = E.tablePoints(Math.max(out.setsA, out.setsB), Math.min(out.setsA, out.setsB), !!out.wo, state.config);
      html = `<b>Sets ${out.setsA} – ${out.setsB}</b> · Gana ${win}<br><span class="muted">Puntos del partido ${out.ptsA} – ${out.ptsB} · Tabla: +${pw} para el ganador, +${pl} para el otro${out.wo ? ' (W.O.)' : ''}</span>`;
    } else if (out.status === 'invalid') {
      // mientras se tipea un set a medias es normal que falte un marcador: aviso neutro, no rojo
      cls = out.errors.every(x => /falta el puntaje/.test(x)) ? '' : 'bad';
      html = out.errors.map(esc).join('<br>');
    }
    else if (out.status === 'partial') { html = `Van ${out.setsA} – ${out.setsB} en sets: nadie llegó a ${Math.floor(ed.bestOf / 2) + 1} sets todavía. Completa los sets que faltan.`; }
    else html = 'Ingresa los puntos de cada set. Los sets ganados se calculan solos.';
    box.className = 'ed-preview ' + cls;
    box.innerHTML = html;
    const ok = out.status === 'ok';
    const s = $('#edSave'); if (s) s.disabled = !ok;
    const n = $('#edNext'); if (n) n.disabled = !ok;
  }

  function saveEditor(next) {
    const ed = ui.ed;
    if (!ed || edEval().status !== 'ok') return;
    const m = d.matches.find(x => x.id === ed.id);
    const sets = ed.wo ? [] : ed.sets.slice(0, ed.bestOf).filter(s => s[0] !== '' || s[1] !== '').map(s => [Number(s[0]), Number(s[1])]);
    // calcular el "siguiente" con el orden actual antes de guardar
    const list = filteredMatches();
    const idx = list.findIndex(x => x.id === ed.id);
    state.results[m.id] = { sets, wo: ed.wo || null, bestOf: ed.bestOf, a: m.a, b: m.b };
    const hadIssues = d.warnings.filter(w => w.level === 'error').length;
    commit();
    closeModal();
    const issues = d.warnings.filter(w => w.level === 'error').length;
    toast(issues > hadIssues ? '⚠ Se guardó, pero hay resultados desactualizados (ver Resumen)' : '✔ Resultado guardado');
    if (next) {
      const after = filteredMatches();
      // buscar el primer pendiente editable que siga a este partido en el orden filtrado
      const order = list.slice(idx + 1).map(x => x.id);
      const target = order.map(id => after.find(x => x.id === id)).find(x => x && x.editable && !x.played);
      if (target) openEditor(target.id, true); else toast('✔ Guardado. No quedan más partidos pendientes en esta lista.');
    }
  }

  // ---- empates manuales
  function openTie(scope, ids) {
    const cur = ids.slice();
    ui.tie = { scope, ids: cur };
    renderTie();
  }
  function renderTie() {
    const t = ui.tie;
    const hasManual = !!state.manualTie[t.scope];
    openModal(`<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="tieT"><header><div><small>Desempate manual</small><h2 id="tieT">Ordena los equipos empatados</h2></div><button class="close" data-action="close" aria-label="Cerrar">×</button></header>
      <div class="modal-body"><p class="muted">Estos equipos están igualados en todos los criterios del dossier. Ordénalos según el sorteo o la decisión del comité (el primero queda mejor ubicado).</p>
        <ol class="tie-list">${t.ids.map((id, i) => `<li><b>${i + 1}°</b><span>${esc(plain(id))}</span>
          <button class="btn sm" data-action="tie-up" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Subir">▲</button>
          <button class="btn sm" data-action="tie-down" data-i="${i}" ${i === t.ids.length - 1 ? 'disabled' : ''} aria-label="Bajar">▼</button></li>`).join('')}</ol></div>
      <footer>${hasManual ? '<button class="btn danger" data-action="tie-clear" style="margin-right:auto">Quitar orden manual</button>' : ''}<button class="btn" data-action="close">Cancelar</button><button class="btn primary" data-action="tie-save">Guardar orden</button></footer></div>`);
  }

  // ---- integrantes de triangular
  function openTriEdit(key) {
    const tri = d.triangulars.find(t => t.key === key);
    ui.tri = { key, ids: tri.teams.slice() };
    const cupTeams = d.general.filter(r => r.cup === tri.cup).map(r => r.teamId);
    const opts = cur => cupTeams.map(id => `<option value="${id}"${cur === id ? ' selected' : ''}>${esc(plain(id))} (${d.rowOfTeam[id].rank}°)</option>`).join('');
    const has = !!state.triOverride[key];
    openModal(`<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="trT"><header><div><small>${esc(tri.name)}</small><h2 id="trT">Cambiar integrantes</h2></div><button class="close" data-action="close" aria-label="Cerrar">×</button></header>
      <div class="modal-body"><p class="muted">Úsalo sólo si el comité decide un cruce distinto al automático. Si ya hay resultados de este triangular, quedarán marcados como desactualizados.</p>
        <div class="form-grid" style="margin-top:10px">${[0, 1, 2].map(i => `<label>Equipo ${'ABC'[i]}<select class="fld" data-tri="${i}">${opts(tri.teams[i])}</select></label>`).join('')}</div>
        <div id="triErr" class="muted" style="margin-top:8px" aria-live="polite"></div></div>
      <footer>${has ? '<button class="btn danger" data-action="tri-clear" style="margin-right:auto">Volver al automático</button>' : ''}<button class="btn" data-action="close">Cancelar</button><button class="btn primary" data-action="tri-save">Guardar</button></footer></div>`);
  }

  // ------------------------------------------------------------ exportar / importar
  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function exportJson() {
    download(`copa-murano-2026-respaldo-${dateStamp()}${mode === 'demo' ? '-DEMO' : ''}.json`, JSON.stringify(state, null, 1), 'application/json');
    toast('Respaldo descargado');
  }
  function exportCsv() {
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const head = ['Partido', 'Fase', 'Grupo/Triangular/Copa', 'Dia', 'Cancha', 'Turno', 'Equipo A', 'Equipo B', 'Sets A', 'Sets B', 'Detalle de sets', 'Estado'];
    const lines = [head.map(q).join(';')];
    for (const m of d.matches) {
      const ph = m.phase === 'G' ? 'Grupos' : m.phase === 'T' ? 'Triangulares' : 'Play-offs';
      lines.push([m.id, ph, m.scope, m.dayLabel, m.court, m.turn === 99 ? 'último' : m.turn, m.a != null ? plain(m.a) : m.aLabel, m.b != null ? plain(m.b) : m.bLabel,
        m.played ? m.out.setsA : '', m.played ? m.out.setsB : '', m.played ? (m.out.wo ? 'W.O.' : m.out.sets.map(s => s.join('-')).join(' ')) : '', m.played ? 'Jugado' : 'Pendiente'].map(q).join(';'));
    }
    download(`copa-murano-2026-resultados-${dateStamp()}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  }

  async function importJson(file) {
    try {
      const raw = JSON.parse(await file.text());
      if (!raw || typeof raw !== 'object' || !raw.results) throw new Error('formato');
      const incoming = E.normalizeState(raw);
      const n = Object.keys(incoming.results).length;
      const ok = await askConfirm('Cargar respaldo', `Se reemplazarán los datos actuales${mode === 'demo' ? ' del demo' : ''} por los del archivo (<b>${n} resultados</b>). Esta acción no se puede deshacer.`, 'Reemplazar datos');
      if (!ok) return;
      state = incoming;
      commit();
      toast('✔ Respaldo cargado');
    } catch (e) {
      toast('No se pudo leer el archivo: no parece un respaldo válido');
    }
  }

  // ------------------------------------------------------------ render general
  function paintTabs() {
    const bad = d.warnings.filter(w => w.level !== 'info').length;
    $('#tabs').innerHTML = TABS.map(([k, l]) => `<a href="#/${k}"${ui.tab === k ? ' aria-current="page"' : ''}>${l}${k === 'resumen' && bad ? `<span class="badge" title="Avisos pendientes">${bad}</span>` : ''}</a>`).join('');
    const bar = $('#demoBar');
    if (mode === 'demo') {
      bar.hidden = false;
      bar.innerHTML = 'MODO DEMO — datos inventados para probar. Tus resultados reales no se tocan. <button type="button" data-action="demo-exit">Salir del demo</button>';
    } else bar.hidden = true;
    paintSaveState();
  }

  const VIEWS = { resumen: viewResumen, partidos: viewPartidos, grupos: viewGrupos, general: viewGeneral, triangulares: viewTriangulares, playoffs: viewPlayoffs, final: viewFinal, ajustes: viewAjustes };

  function render() {
    paintTabs();
    const y = window.scrollY;
    $('#view').innerHTML = VIEWS[ui.tab]();
    window.scrollTo(0, y);
  }

  function route() {
    const k = (location.hash || '').replace(/^#\/?/, '');
    ui.tab = VIEWS[k] ? k : 'resumen';
    render();
    window.scrollTo(0, 0);
    document.title = `${TABS.find(t => t[0] === ui.tab)[1]} · Copa Murano 2026`;
  }

  // ------------------------------------------------------------ eventos
  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    switch (a) {
      case 'edit': openEditor(el.dataset.id, ui.tab === 'partidos'); break;
      case 'close': closeModal(); break;
      case 'bg': if (e.target === el) closeModal(); break;
      case 'ed-save': saveEditor(false); break;
      case 'ed-next': saveEditor(true); break;
      case 'ed-del': {
        const id = ui.ed.id;
        delete state.results[id];
        closeModal(); commit(); toast('Resultado borrado');
        break;
      }
      case 'tie': openTie(el.dataset.scope, el.dataset.ids.split(',').map(Number)); break;
      case 'tie-up': case 'tie-down': {
        const i = Number(el.dataset.i); const j = a === 'tie-up' ? i - 1 : i + 1;
        const ids = ui.tie.ids; [ids[i], ids[j]] = [ids[j], ids[i]];
        const keep = ui.tie; closeModalKeep(); ui.tie = keep; renderTie();
        break;
      }
      case 'tie-save': E.setManualTie(state, ui.tie.scope, ui.tie.ids); closeModal(); commit(); toast('✔ Orden guardado'); break;
      case 'tie-clear': delete state.manualTie[ui.tie.scope]; closeModal(); commit(); toast('Orden manual eliminado'); break;
      case 'tri-edit': openTriEdit(el.dataset.key); break;
      case 'tri-save': {
        const ids = Array.from(document.querySelectorAll('[data-tri]')).map(s => Number(s.value));
        if (new Set(ids).size !== 3) { $('#triErr').textContent = '⚠ Elige tres equipos distintos.'; break; }
        state.triOverride[ui.tri.key] = ids; closeModal(); commit(); toast('✔ Integrantes actualizados');
        break;
      }
      case 'tri-clear': delete state.triOverride[ui.tri.key]; closeModal(); commit(); toast('Triangular restablecido'); break;
      case 'export': exportJson(); break;
      case 'csv': exportCsv(); break;
      case 'print': window.print(); break;
      case 'import': $('#importFile').click(); break;
      case 'demo': {
        const ok = await askConfirm('Entrar al modo demo', 'Se cargarán resultados inventados en un espacio aparte. Tus datos reales no se modifican y puedes volver cuando quieras.', 'Entrar al demo');
        if (!ok) break;
        const s = E.createState();
        s.teams = state.teams.map(t => Object.assign({}, t));
        E.simulate(s, 2026, el.dataset.upto);
        store.set(KEY.demo, JSON.stringify(s));
        store.set(KEY.mode, 'demo');
        load(); render(); toast('Modo demo activado');
        break;
      }
      case 'demo-exit': store.set(KEY.mode, 'real'); load(); render(); toast('Volviste a tus datos reales'); break;
      case 'reset': {
        const ok = await askConfirm('Borrar todos los resultados', `Se eliminarán los <b>${Object.keys(state.results).length} resultados</b> y los desempates manuales${mode === 'demo' ? ' del demo' : ''}. <b>No se puede deshacer.</b> Descarga un respaldo antes si tienes dudas.`, 'Sí, borrar todo');
        if (!ok) break;
        state.results = {}; state.manualTie = {}; state.triOverride = {};
        commit(); toast('Resultados borrados');
        break;
      }
      default: break;
    }
  });

  function closeModalKeep() { $('#modal-root').innerHTML = ''; }

  document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'fq') { ui.f.q = t.value; $('#match-list').innerHTML = matchListHtml(); return; }
    if (t.dataset && t.dataset.set !== undefined && ui.ed) {
      t.value = t.value.replace(/\D/g, '').slice(0, 2);
      ui.ed.sets[Number(t.dataset.set)][Number(t.dataset.side)] = t.value;
      updatePreview();
      if (t.value.length === 2) {
        const all = Array.from(document.querySelectorAll('#modal-root .ed-row input:not(:disabled)'));
        const nx = all[all.indexOf(t) + 1];
        if (nx) { nx.focus(); nx.select(); }
      }
    }
  });

  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.filter) { ui.f[t.dataset.filter] = t.value; $('#match-list').innerHTML = matchListHtml(); return; }
    if (t.dataset.ed && ui.ed) {
      if (t.dataset.ed === 'bestOf') { ui.ed.bestOf = Number(t.value); closeModalKeep(); renderEditor(); }
      else if (t.dataset.ed === 'wo') { ui.ed.wo = t.value || null; closeModalKeep(); renderEditor(); }
      return;
    }
    if (t.dataset.config) {
      const k = t.dataset.config;
      state.config[k] = k === 'scoring' ? t.value : Number(t.value) || E.DEFAULT_CONFIG[k];
      commit(); toast('Regla actualizada: todo se recalculó');
      return;
    }
    if (t.dataset.team) {
      const tm = state.teams.find(x => x.id === Number(t.dataset.team));
      const f = t.dataset.field;
      if (f === 'fav') tm.fav = t.checked;
      else if (f === 'name') { const v = t.value.trim(); if (!v) { t.value = tm.name; toast('El nombre no puede quedar vacío'); return; } tm.name = v; }
      else tm[f] = t.value.trim();
      commit({ render: false });
      toast('✔ Equipo actualizado');
      return;
    }
    if (t.id === 'importFile' && t.files[0]) { importJson(t.files[0]); t.value = ''; }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('#modal-root').firstChild) { closeModal(); return; }
    if (e.key === 'Enter' && ui.ed && e.target.matches('.ed-row input')) {
      e.preventDefault();
      if (edEval().status === 'ok') saveEditor(ui.ed.fromList);
    }
  });

  window.addEventListener('hashchange', route);
  window.addEventListener('storage', ev => { if (ev.key === KEY[mode] && !$('#modal-root').firstChild) { load(); render(); } });

  // ------------------------------------------------------------ arranque
  load();
  route();
})();
