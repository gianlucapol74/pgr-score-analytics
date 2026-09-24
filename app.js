/* PGRScore // NFL Analytics — lógica do front-end
 * Consome os dados gerados por pipeline_nflverse.py (window.PGRSCORE_DATA ou data.json).
 * Sem frameworks: JS puro. Três views: Head-to-Head, Equipes, Gráficos. */
(function () {
  "use strict";

  var DATA = null;
  var SEASON = "";            // rótulo da temporada (lido de meta), ex.: "2022"
  var view = "h2h";
  var h2h = { home: null, away: null, pos: "QB" };        // head-to-head
  var nav = { team: null, group: null };                  // drill-down equipes
  var chart = { kind: "team", teamA: null, teamB: null, playerId: null, metric: null };
  function isReal() { return DATA && DATA.meta && DATA.meta.statMode === "real"; }

  // ---- util --------------------------------------------------------------
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function svgEl(tag, attrs) {
    var e = document.createElementNS("http://www.w3.org/2000/svg", tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function setStatus(msg, isErr) {
    var s = $("status");
    s.textContent = msg || "";
    s.className = "status" + (isErr ? " err" : "");
  }
  function textOn(hex) {
    var c = (hex || "#000").replace("#", "");
    if (c.length === 3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
    var r = parseInt(c.substr(0,2),16), g = parseInt(c.substr(2,2),16), b = parseInt(c.substr(4,2),16);
    return (0.299*r + 0.587*g + 0.114*b) > 150 ? "#0a0e17" : "#ffffff";
  }
  function heightStr(inches) {
    if (!inches) return "—";
    return Math.floor(inches/12) + "'" + (inches%12) + '"';
  }
  // ---- animação / transições --------------------------------------------
  var _reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // re-dispara uma animação CSS num elemento (remove+readiciona a classe)
  function animate(node, cls) {
    if (!node || _reduceMotion) return;
    node.classList.remove(cls);
    void node.offsetWidth;         // força reflow p/ reiniciar a animação
    node.classList.add(cls);
  }
  // marca os filhos com --i para o efeito cascata (stagger)
  function stagger(container) {
    if (!container || _reduceMotion) return;
    var kids = container.children, i;
    for (i = 0; i < kids.length; i++) kids[i].style.setProperty("--i", i);
    animate(container, "anim-stagger");
  }
  // efeito de "press" + ripple no clique
  function pressFX(node, ev) {
    if (!node || _reduceMotion) return;
    node.classList.add("is-pressed");
    setTimeout(function () { node.classList.remove("is-pressed"); }, 120);
    var rect = node.getBoundingClientRect();
    var size = Math.max(rect.width, rect.height);
    var r = document.createElement("span");
    r.className = "ripple";
    r.style.width = r.style.height = size + "px";
    var x = (ev && ev.clientX != null) ? ev.clientX - rect.left : rect.width / 2;
    var y = (ev && ev.clientY != null) ? ev.clientY - rect.top : rect.height / 2;
    r.style.left = (x - size / 2) + "px";
    r.style.top = (y - size / 2) + "px";
    node.appendChild(r);
    setTimeout(function () { if (r.parentNode) r.parentNode.removeChild(r); }, 620);
  }
  function teamList() {
    return DATA.standings.map(function (s) { return DATA.teams[s.abbr]; });
  }

  // ---- boot --------------------------------------------------------------
  function boot(data) {
    DATA = data;
    var m = DATA.meta || {};
    // temporada: usa meta.season; se faltar, extrai o ano de coverage/source
    SEASON = (m.season != null ? m.season : "").toString();
    if (!SEASON) {
      var mm = ((m.coverage || "") + " " + (m.source || "")).match(/\b(19|20)\d{2}\b/g);
      if (mm) SEASON = mm[mm.length - 1];   // pega o ano mais provável da temporada
    }
    $("seasonPill").textContent = "NFL " + SEASON + " · SEM " + m.weekMin + "–" + m.weekMax;
    $("footMeta").textContent =
      (m.source || ("NFL " + SEASON)) + " · " + (m.playersInRosters || "?") + " jogadores · " + (m.coverage || "");
    var cap = $("h2hCaption");
    if (cap) cap.textContent =
      "Clique em dois times. A colocação é a classificação real da temporada " + SEASON + " da NFL.";
    var fn = $("footNote");
    if (fn) fn.textContent = "PGRScore · protótipo · " +
      (m.statMode === "real" ? "estatísticas oficiais (nflverse)" : "métricas derivadas de tracking posicional");
    setStatus("");
    // default de charts
    chart.teamA = DATA.standings[0].abbr;
    chart.teamB = DATA.standings[1].abbr;
    bindUI();
    renderTeamGrid();
    switchView("h2h");
  }
  function loadData() {
    if (window.PGRSCORE_DATA) { boot(window.PGRSCORE_DATA); return; }
    setStatus("Carregando dados…");
    fetch("data.json")
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(boot)
      .catch(function () {
        setStatus("Não consegui carregar os dados. Rode `python pipeline_nflverse.py` para gerar data.js/data.json, " +
          "ou sirva a pasta com `python -m http.server` e abra http://localhost:8000", true);
      });
  }

  // ---- navegação principal ----------------------------------------------
  function switchView(v) {
    view = v;
    $("view-h2h").classList.toggle("hidden", v !== "h2h");
    $("view-teams").classList.toggle("hidden", v !== "teams");
    $("view-charts").classList.toggle("hidden", v !== "charts");
    var btns = document.querySelectorAll(".navbtn");
    for (var i = 0; i < btns.length; i++)
      btns[i].classList.toggle("active", btns[i].dataset.view === v);
    if (v === "teams") renderTeams();
    if (v === "charts") renderCharts();
    animate($("view-" + v), "anim-view");     // transição de entrada da tela
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---- logo / cards ------------------------------------------------------
  function teamLogo(team, size) {
    var d = el("div", "logo");
    if (size) { d.style.width = size+"px"; d.style.height = size+"px"; d.style.fontSize = (size*0.4)+"px"; }
    // escudo real da NFL (CDN ESPN). Fallback: iniciais + gradiente das cores do time.
    function fallback() {
      d.classList.remove("has-img");
      d.textContent = team.abbr;
      d.style.background = "linear-gradient(135deg," + team.colors.primary + " 0%," + team.colors.secondary + " 100%)";
      d.style.color = textOn(team.colors.primary);
    }
    var img = new Image();
    img.alt = team.name;
    img.loading = "lazy";
    img.onerror = fallback;
    img.src = "https://a.espncdn.com/i/teamlogos/nfl/500/" + team.abbr.toLowerCase() + ".png";
    d.classList.add("has-img");
    d.appendChild(img);
    return d;
  }
  // ---- tint global do documento (o site "veste" a cor do time em hover) ----
  var _tintTimer = null;
  function applyTeamTint(team) {
    if (_tintTimer) { clearTimeout(_tintTimer); _tintTimer = null; }
    var root = document.documentElement;
    root.style.setProperty("--team-tint", team.colors.primary);
    root.style.setProperty("--team-tint-2", team.colors.secondary || team.colors.primary);
    root.style.setProperty("--team-strength", "1");
  }
  function resetTeamTint() {
    // pequeno atraso evita "piscar" ao mover o mouse entre cards vizinhos
    if (_tintTimer) clearTimeout(_tintTimer);
    _tintTimer = setTimeout(function () {
      // se já há um time selecionado no H2H, volta para a cor dele em vez do padrão
      if (DATA && h2h.home) { applyTeamTint(DATA.teams[h2h.home]); return; }
      var root = document.documentElement;
      root.style.setProperty("--team-tint", "#7b5bff");
      root.style.setProperty("--team-tint-2", "#a48bff");
      root.style.setProperty("--team-strength", "0");
    }, 120);
  }

  function teamCard(team, onClick, selected) {
    var card = el("div", "team-card" + (selected ? " selected" : ""));
    card.style.setProperty("--tc1", team.colors.primary);
    card.style.setProperty("--tc2", team.colors.secondary || team.colors.primary);
    card.dataset.abbr = team.abbr;
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", team.name + ", colocação " + team.rank);
    card.appendChild(el("div", "rank", "#" + team.rank));
    card.appendChild(teamLogo(team));
    card.appendChild(el("div", "tname", team.name));
    card.appendChild(el("div", "tmeta", team.record + " · " + team.rosterCount + " atletas"));
    card.appendChild(el("span", "badge-div", team.conf + " " + team.div));
    card.addEventListener("click", onClick);
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); }
    });
    // veste a cor do time no site inteiro ao passar o mouse / focar
    card.addEventListener("mouseenter", function () { applyTeamTint(team); });
    card.addEventListener("mouseleave", resetTeamTint);
    card.addEventListener("focus", function () { applyTeamTint(team); });
    card.addEventListener("blur", resetTeamTint);
    return card;
  }

  // =======================================================================
  // VIEW 1: HEAD-TO-HEAD
  // =======================================================================
  function renderTeamGrid() {
    var grid = $("teamGridH2H");
    grid.innerHTML = "";
    teamList().forEach(function (team) {
      grid.appendChild(teamCard(team, function () { pickTeam(team.abbr); },
        team.abbr === h2h.home || team.abbr === h2h.away));
    });
    stagger(grid);
    refreshSelection();
  }
  function pickTeam(abbr) {
    if (h2h.home === abbr) h2h.home = null;
    else if (h2h.away === abbr) h2h.away = null;
    else if (!h2h.home) h2h.home = abbr;
    else if (!h2h.away) h2h.away = abbr;
    else { h2h.home = abbr; h2h.away = null; }
    refreshSelection();
  }
  function fillSlot(slotId, abbr) {
    var slot = $(slotId);
    slot.innerHTML = "";
    if (!abbr) {
      slot.className = "slot";
      slot.appendChild(el("div", "slot-empty", slotId === "slotHome" ? "TIME 1" : "TIME 2"));
      return;
    }
    var team = DATA.teams[abbr];
    slot.className = "slot filled";
    slot.style.setProperty("--slot-c", team.colors.primary);
    var box = el("div", "slot-team");
    box.appendChild(teamLogo(team, 44));
    var info = el("div");
    info.appendChild(el("div", "tname", team.name));
    info.appendChild(el("div", "tmeta", "#" + team.rank + " · " + team.record));
    box.appendChild(info);
    slot.appendChild(box);
  }
  function refreshSelection() {
    fillSlot("slotHome", h2h.home);
    fillSlot("slotAway", h2h.away);
    $("btnCompare").disabled = !(h2h.home && h2h.away);
    var cards = $("teamGridH2H").querySelectorAll(".team-card");
    for (var i = 0; i < cards.length; i++) {
      var a = cards[i].dataset.abbr;
      cards[i].classList.toggle("selected", a === h2h.home || a === h2h.away);
    }
    // tint persistente: assim que um time é escolhido, o site já veste a cor dele
    if (h2h.home) applyTeamTint(DATA.teams[h2h.home]);
    else resetTeamTint();
  }
  function showH2HCompare() {
    $("h2hSelect").classList.add("hidden");
    $("h2hCompare").classList.remove("hidden");
    animate($("h2hCompare"), "anim-swap");
    // tint duplo: cor de um time de cada lado da tela durante a comparação
    if (_tintTimer) { clearTimeout(_tintTimer); _tintTimer = null; }
    var root = document.documentElement;
    root.style.setProperty("--team-tint", DATA.teams[h2h.home].colors.primary);
    root.style.setProperty("--team-tint-2", DATA.teams[h2h.away].colors.primary);
    root.style.setProperty("--team-strength", "1");
    renderHero();
    renderPosTabs();
    renderCompareBody();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function showH2HSelect() {
    $("h2hCompare").classList.add("hidden");
    $("h2hSelect").classList.remove("hidden");
    animate($("h2hSelect"), "anim-swap");
    refreshSelection(); // restaura o tint conforme a seleção atual
  }
  function heroSide(team, side) {
    var wrap = el("div", "hero-team " + side);
    wrap.appendChild(teamLogo(team, 70));
    var info = el("div", "hero-info");
    info.appendChild(el("h2", null, team.name));
    info.appendChild(el("div", "rec", team.record + " · " + team.conf + " " + team.div));
    var rankEl = el("div", "hero-rank", "Colocação " + SEASON + ": #" + team.rank);
    rankEl.style.color = (team.colors.secondary === "#101820" || team.colors.secondary === "#000000")
      ? "#8792ab" : team.colors.secondary;
    info.appendChild(rankEl);
    wrap.appendChild(info);
    return wrap;
  }
  function renderHero() {
    var h = DATA.teams[h2h.home], a = DATA.teams[h2h.away];
    var hero = $("h2hHero");
    hero.innerHTML = "";
    hero.style.background =
      "linear-gradient(100deg," + h.colors.primary + "22 0%, transparent 40%, transparent 60%, " + a.colors.primary + "22 100%), var(--panel)";
    hero.appendChild(heroSide(h, "home"));
    var vs = el("div", "hero-vs", "VS");
    var better = h.rank < a.rank ? h : a;
    vs.appendChild(el("span", "better", "MELHOR NA TABELA: " + better.abbr));
    hero.appendChild(vs);
    hero.appendChild(heroSide(a, "away"));
  }
  function renderPosTabs() {
    var tabs = $("posTabs");
    tabs.innerHTML = "";
    var labels = DATA.meta.groupLabels || {};
    DATA.meta.positionGroups.forEach(function (g) {
      var t = el("button", "tab" + (g === h2h.pos ? " active" : ""), (labels[g] || g));
      t.addEventListener("click", function () { h2h.pos = g; renderPosTabs(); renderCompareBody(); });
      tabs.appendChild(t);
    });
  }
  function playerCard(team, player, side, clickable) {
    if (!player) return el("div", "pcard empty " + side, "Não há atletas na posição.");
    var card = el("div", "pcard " + side);
    card.style.setProperty("--pc", team.colors.primary);
    var head = el("div", "pc-head");
    var num = el("div", "pc-num", player.jersey != null ? player.jersey : "–");
    num.style.background = team.colors.primary;
    num.style.color = textOn(team.colors.primary);
    head.appendChild(num);
    var meta = el("div");
    meta.appendChild(el("div", "pc-name", player.name));
    meta.appendChild(el("div", "pc-sub", player.position + " · " + heightStr(player.heightIn) +
      (player.weight ? " · " + Math.round(player.weight) + " lb" : "")));
    head.appendChild(meta);
    var score = el("div", "pc-score");
    score.appendChild(el("b", null, player.pgrScore));
    score.appendChild(el("span", null, "PGRSCORE"));
    head.appendChild(score);
    card.appendChild(head);
    (player.props || []).forEach(function (p) {
      var row = el("div", "prop");
      row.appendChild(el("div", "prop-label", p.label));
      row.appendChild(el("div", "prop-line", p.line + (p.unit ? '<span class="prop-unit">' + p.unit + "</span>" : "")));
      var over = (p.actual != null && p.actual >= p.line);
      row.appendChild(el("span", "prop-pick " + (over ? "pick-over" : "pick-under"), over ? "OVER" : "UNDER"));
      card.appendChild(row);
    });
    if (clickable) card.addEventListener("click", function () { openPlayerModal(team, player); });
    return card;
  }
  function renderCompareBody() {
    var h = DATA.teams[h2h.home], a = DATA.teams[h2h.away];
    var body = $("compareBody");
    body.innerHTML = "";
    var g = h2h.pos;
    var hp = (h.groups[g] || []), ap = (a.groups[g] || []);
    var n = Math.max(hp.length, ap.length);
    if (n === 0) { body.appendChild(el("div", "pcard empty", "Não há atletas na posição.")); return; }
    for (var i = 0; i < n; i++) {
      var ph = hp[i] || null, pa = ap[i] || null;
      var row = el("div", "matchup-row");
      var ch = playerCard(h, ph, "home", true), ca = playerCard(a, pa, "away", true);
      if (ph && pa) {
        if (ph.pgrScore > pa.pgrScore) { ch.classList.add("win"); ch.appendChild(el("div","crown","♛")); }
        else if (pa.pgrScore > ph.pgrScore) { ca.classList.add("win"); ca.appendChild(el("div","crown","♛")); }
      }
      row.appendChild(ch);
      row.appendChild(el("div", "mid-tag", "#" + (i + 1)));
      row.appendChild(ca);
      body.appendChild(row);
    }
    stagger(body);   // linhas de confronto entram em cascata ao trocar de posição
  }

  // =======================================================================
  // VIEW 2: EQUIPES (drill-down times -> posição -> jogadores)
  // =======================================================================
  function renderTeams() {
    var crumbs = $("teamsCrumbs"), body = $("teamsBody");
    crumbs.innerHTML = ""; body.innerHTML = "";

    // breadcrumb
    var cHome = el("button", "crumb" + (!nav.team ? " now" : ""), "Todas as equipes");
    cHome.addEventListener("click", function () { nav.team = null; nav.group = null; renderTeams(); });
    crumbs.appendChild(cHome);
    if (nav.team) {
      crumbs.appendChild(el("span", "crumb-sep", "›"));
      var t = DATA.teams[nav.team];
      var cTeam = el("button", "crumb" + (!nav.group ? " now" : ""), t.name);
      cTeam.addEventListener("click", function () { nav.group = null; renderTeams(); });
      crumbs.appendChild(cTeam);
      if (nav.group) {
        crumbs.appendChild(el("span", "crumb-sep", "›"));
        crumbs.appendChild(el("button", "crumb now", (DATA.meta.groupLabels[nav.group] || nav.group)));
      }
    }

    if (!nav.team) {
      body.appendChild(el("h1", "screen-title", 'Equipes <span>&amp; Elencos</span>'));
      body.appendChild(el("p", "screen-caption", "Clique numa equipe para ver o elenco por posição."));
      var head = el("h2", "section-head", "32 times <span class='hint'>— ordenados pela tabela " + SEASON + "</span>");
      body.appendChild(head);
      var grid = el("div", "team-grid");
      teamList().forEach(function (team) {
        grid.appendChild(teamCard(team, function () { nav.team = team.abbr; nav.group = null; renderTeams(); }, false));
      });
      body.appendChild(grid);
      stagger(grid);
      return;
    }

    var team = DATA.teams[nav.team];
    // header da equipe
    var hero = el("div", "h2h-hero");
    hero.style.gridTemplateColumns = "auto 1fr";
    hero.appendChild(teamLogo(team, 70));
    var hi = el("div", "hero-info");
    hi.appendChild(el("h2", null, team.name));
    hi.appendChild(el("div", "rec", "#" + team.rank + " na tabela · " + team.record + " · " + team.conf + " " + team.div + " · " + team.rosterCount + " atletas"));
    hero.appendChild(hi);
    body.appendChild(hero);

    // tabs de posição
    var tabs = el("div", "tabs");
    DATA.meta.positionGroups.forEach(function (g) {
      var count = (team.groups[g] || []).length;
      var active = (nav.group || DATA.meta.positionGroups[0]) === g;
      var t = el("button", "tab" + (active ? " active" : ""), (DATA.meta.groupLabels[g] || g) + " (" + count + ")");
      t.addEventListener("click", function () { nav.group = g; renderTeams(); });
      tabs.appendChild(t);
    });
    body.appendChild(tabs);

    var g = nav.group || DATA.meta.positionGroups[0];
    var players = team.groups[g] || [];
    if (!players.length) { body.appendChild(el("div", "pcard empty", "Sem atletas nesta posição.")); return; }
    var grid = el("div", "player-grid");
    players.forEach(function (pl) { grid.appendChild(playerCard(team, pl, "home", true)); });
    body.appendChild(grid);
    stagger(grid);
  }

  // =======================================================================
  // VIEW 3: GRÁFICOS
  // =======================================================================
  function renderCharts() {
    var tabs = document.querySelectorAll("#chartTabs .tab");
    for (var i = 0; i < tabs.length; i++)
      tabs[i].classList.toggle("active", tabs[i].dataset.chart === chart.kind);
    if (chart.kind === "team") renderTeamChart();
    else renderPlayerChart();
  }

  function selectControl(label, options, current, onChange) {
    // "options" = [{value,text}]; devolve um grupo de tabs
    var wrap = el("div", "tabs");
    wrap.appendChild(el("span", "leg", label));
    options.forEach(function (o) {
      var b = el("button", "tab" + (o.value === current ? " active" : ""), o.text);
      b.addEventListener("click", function () { onChange(o.value); });
      wrap.appendChild(b);
    });
    return wrap;
  }

  // ---- Gráfico 1: Equipe casa vs fora -----------------------------------
  function renderTeamChart() {
    var controls = $("chartControls"), area = $("chartArea");
    controls.innerHTML = ""; area.innerHTML = "";
    var teamOpts = DATA.standings.map(function (s) { return { value: s.abbr, text: s.abbr }; });
    controls.appendChild(selectControl("Equipe A:", teamOpts, chart.teamA, function (v) { chart.teamA = v; renderTeamChart(); }));
    controls.appendChild(selectControl("Equipe B:", teamOpts, chart.teamB, function (v) { chart.teamB = v; renderTeamChart(); }));

    var A = DATA.teams[chart.teamA], B = DATA.teams[chart.teamB];
    var real = isReal();

    // card 1: casa vs fora (pontos/jogo no modo real; jardas/snap no modo tracking)
    var unit1 = real ? "pts/jogo" : "yd/snap";
    var card = el("div", "chart-card");
    card.appendChild(el("div", "chart-title",
      (real ? "Pontos por jogo — Casa vs Fora — " : "Desempenho Casa vs Fora — ") + A.abbr + " x " + B.abbr));
    card.appendChild(el("div", "chart-desc", real
      ? "Média de pontos marcados por jogo, separada entre jogos em CASA e FORA. Fonte: nflverse."
      : "Jardas médias percorridas por snap (esforço físico da equipe), em CASA e FORA."));
    var legend = el("div", "chart-legend");
    var l1 = el("span", "leg", A.abbr); l1.prepend(colorChip(A.colors.primary));
    var l2 = el("span", "leg", B.abbr); l2.prepend(colorChip(B.colors.primary));
    legend.appendChild(l1); legend.appendChild(l2);
    card.appendChild(legend);
    var groups = [
      { label: "CASA (" + A.splitHomeAway.home.games + "/" + B.splitHomeAway.home.games + " jogos)",
        a: A.splitHomeAway.home.avgDistPerSnap, b: B.splitHomeAway.home.avgDistPerSnap },
      { label: "FORA (" + A.splitHomeAway.away.games + "/" + B.splitHomeAway.away.games + " jogos)",
        a: A.splitHomeAway.away.avgDistPerSnap, b: B.splitHomeAway.away.avgDistPerSnap },
    ];
    card.appendChild(groupedBarChart(groups, A.colors.primary, B.colors.primary, unit1));
    area.appendChild(card);

    // card 2: no modo real -> produção ofensiva total do time (jardas de passe/corrida/recepção)
    //         no modo tracking -> velocidade máxima
    var card2 = el("div", "chart-card");
    if (real) {
      card2.appendChild(el("div", "chart-title", "Produção ofensiva total (jardas) — " + A.abbr + " x " + B.abbr));
      card2.appendChild(el("div", "chart-desc",
        "Soma das jardas de passe, corrida e recepção de todos os atletas do elenco na temporada."));
    } else {
      card2.appendChild(el("div", "chart-title", "Velocidade máxima registrada (mph)"));
      card2.appendChild(el("div", "chart-desc", "Pico de velocidade de qualquer jogador da equipe, em casa e fora."));
    }
    var legend2 = el("div", "chart-legend");
    var m1 = el("span", "leg", A.abbr); m1.prepend(colorChip(A.colors.primary));
    var m2 = el("span", "leg", B.abbr); m2.prepend(colorChip(B.colors.primary));
    legend2.appendChild(m1); legend2.appendChild(m2);
    card2.appendChild(legend2);
    var groups2, unit2;
    if (real) {
      unit2 = "jardas";
      groups2 = [
        { label: "PASSE", a: teamStat(A, "passing_yards"), b: teamStat(B, "passing_yards") },
        { label: "CORRIDA", a: teamStat(A, "rushing_yards"), b: teamStat(B, "rushing_yards") },
        { label: "RECEPÇÃO", a: teamStat(A, "receiving_yards"), b: teamStat(B, "receiving_yards") },
      ];
    } else {
      unit2 = "mph";
      groups2 = [
        { label: "CASA", a: A.splitHomeAway.home.topSpeedMph, b: B.splitHomeAway.home.topSpeedMph },
        { label: "FORA", a: A.splitHomeAway.away.topSpeedMph, b: B.splitHomeAway.away.topSpeedMph },
      ];
    }
    card2.appendChild(groupedBarChart(groups2, A.colors.primary, B.colors.primary, unit2));
    area.appendChild(card2);
  }

  // soma um stat (dos totals) de todos os jogadores de um time
  function teamStat(team, key) {
    var sum = 0;
    DATA.meta.positionGroups.forEach(function (g) {
      (team.groups[g] || []).forEach(function (p) {
        if (p.totals) {
          var map = { passing_yards: "Jardas passe", rushing_yards: "Jardas corrida", receiving_yards: "Jardas recebidas" };
          var v = p.totals[map[key]];
          if (typeof v === "number") sum += v;
        }
      });
    });
    return sum;
  }

  function colorChip(color) {
    var i = document.createElement("i");
    i.style.background = color;
    return i;
  }

  // gráfico de barras agrupadas (SVG). groups: [{label,a,b}]
  function groupedBarChart(groups, colorA, colorB, unit) {
    var W = 720, H = 300, pad = { l: 54, r: 20, t: 40, b: 46 };
    var innerW = W - pad.l - pad.r, innerH = H - pad.t - pad.b;
    var maxV = 0;
    groups.forEach(function (g) { maxV = Math.max(maxV, g.a, g.b); });
    maxV = maxV * 1.15 || 1;
    var svg = svgEl("svg", { class: "chart", viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "xMidYMid meet" });
    // gridlines + eixo Y
    for (var t = 0; t <= 4; t++) {
      var val = maxV * t / 4;
      var y = pad.t + innerH - (val / maxV) * innerH;
      svg.appendChild(svgEl("line", { class: "gridline", x1: pad.l, y1: y, x2: pad.l + innerW, y2: y }));
      var lbl = svgEl("text", { class: "axis-label", x: pad.l - 8, y: y + 4, "text-anchor": "end" });
      lbl.textContent = val.toFixed(0);
      svg.appendChild(lbl);
    }
    svg.appendChild(svgEl("line", { class: "axis", x1: pad.l, y1: pad.t + innerH, x2: pad.l + innerW, y2: pad.t + innerH }));

    var groupW = innerW / groups.length;
    var barW = Math.min(58, groupW * 0.3);
    groups.forEach(function (g, i) {
      var cx = pad.l + groupW * i + groupW / 2;
      var pairs = [{ v: g.a, c: colorA, off: -barW - 4 }, { v: g.b, c: colorB, off: 4 }];
      pairs.forEach(function (p) {
        var h = (p.v / maxV) * innerH;
        var x = cx + p.off, y = pad.t + innerH - h;
        var rect = svgEl("rect", { x: x, y: pad.t + innerH, width: barW, height: 0, rx: 4, fill: p.c });
        svg.appendChild(rect);
        // animação simples
        setTimeout(function () {
          rect.setAttribute("y", y); rect.setAttribute("height", Math.max(h, 0));
          rect.style.transition = "y .5s ease, height .5s ease";
        }, 30);
        var val = svgEl("text", { class: "bar-val", x: x + barW / 2, y: y - 6, "text-anchor": "middle" });
        val.textContent = p.v;
        svg.appendChild(val);
      });
      var lbl = svgEl("text", { class: "axis-label", x: cx, y: pad.t + innerH + 20, "text-anchor": "middle" });
      lbl.textContent = g.label;
      svg.appendChild(lbl);
    });
    // rótulo da unidade: acima do gráfico, alinhado à esquerda, com folga
    var uni = svgEl("text", { class: "axis-unit", x: pad.l, y: 18, "text-anchor": "start" });
    uni.textContent = unit;
    svg.appendChild(uni);
    return svg;
  }

  // ---- Gráfico 2: Jogador por partida -----------------------------------
  function allPlayersFlat() {
    var out = [];
    teamList().forEach(function (team) {
      DATA.meta.positionGroups.forEach(function (g) {
        (team.groups[g] || []).forEach(function (pl) {
          if (pl.perGame && pl.perGame.length >= 2) out.push({ team: team, pl: pl });
        });
      });
    });
    return out;
  }
  // métricas de gráfico que fazem sentido para a posição do jogador
  // (evita, por ex., mostrar "Jardas de passe" para um WR — que daria tudo zerado)
  function metricsForPlayer(pl) {
    if (!isReal()) {
      return [
        { value: "topSpeedMph", text: "Velocidade (mph)" },
        { value: "distPerSnap", text: "Jardas / snap" },
        { value: "snaps", text: "Snaps no jogo" },
      ];
    }
    var g = pl.group;
    var byGroup = {
      QB: [["pass_yds", "Jardas de passe"], ["rush_yds", "Jardas corridas"], ["fantasy", "Fantasy (PPR)"]],
      RB: [["rush_yds", "Jardas corridas"], ["rec_yds", "Jardas recebidas"], ["fantasy", "Fantasy (PPR)"]],
      WR: [["rec_yds", "Jardas recebidas"], ["fantasy", "Fantasy (PPR)"]],
      TE: [["rec_yds", "Jardas recebidas"], ["fantasy", "Fantasy (PPR)"]],
    };
    var pairs = byGroup[g] || [["fantasy", "Fantasy (PPR)"]];   // defesa/OL: fantasy
    return pairs.map(function (p) { return { value: p[0], text: p[1] }; });
  }
  function renderPlayerChart() {
    var controls = $("chartControls"), area = $("chartArea");
    controls.innerHTML = ""; area.innerHTML = "";

    var flat = allPlayersFlat();
    // default: jogador de maior pgrScore com série
    if (!chart.playerId) {
      var best = flat.slice().sort(function (a, b) { return b.pl.pgrScore - a.pl.pgrScore; })[0];
      if (best) chart.playerId = best.pl.nflId;
    }
    // seletor de time -> jogador (dropdown nativo pra caber 1679)
    var teamSel = el("select", "tab");
    teamSel.style.padding = "8px 12px";
    teamList().forEach(function (team) {
      var o = document.createElement("option");
      o.value = team.abbr; o.textContent = team.name;
      teamSel.appendChild(o);
    });
    // achar time do jogador atual
    var cur = flat.filter(function (x) { return x.pl.nflId === chart.playerId; })[0] || flat[0];
    if (!cur) { area.appendChild(el("div", "pcard empty", "Sem jogadores com série suficiente.")); return; }
    teamSel.value = cur.team.abbr;

    var playerSel = el("select", "tab");
    playerSel.style.padding = "8px 12px";
    function fillPlayers(teamAbbr, selectId) {
      playerSel.innerHTML = "";
      var list = flat.filter(function (x) { return x.team.abbr === teamAbbr; })
        .sort(function (a, b) { return b.pl.pgrScore - a.pl.pgrScore; });
      list.forEach(function (x) {
        var o = document.createElement("option");
        o.value = x.pl.nflId;
        o.textContent = "#" + (x.pl.jersey != null ? x.pl.jersey : "-") + " " + x.pl.name + " (" + x.pl.position + ")";
        playerSel.appendChild(o);
      });
      if (selectId) playerSel.value = selectId;
      else if (list[0]) { chart.playerId = list[0].pl.nflId; }
    }
    fillPlayers(cur.team.abbr, chart.playerId);
    teamSel.addEventListener("change", function () { fillPlayers(teamSel.value, null); renderPlayerChart(); });
    playerSel.addEventListener("change", function () { chart.playerId = playerSel.value; renderPlayerChart(); });

    var wrapSel = el("div", "tabs");
    wrapSel.appendChild(el("span", "leg", "Time:")); wrapSel.appendChild(teamSel);
    wrapSel.appendChild(el("span", "leg", "Jogador:")); wrapSel.appendChild(playerSel);
    controls.appendChild(wrapSel);

    // jogador selecionado (precisa vir ANTES do seletor de métrica,
    // porque as métricas disponíveis dependem da posição do jogador)
    var sel = flat.filter(function (x) { return x.pl.nflId === chart.playerId; })[0] || cur;
    var team = sel.team, pl = sel.pl;

    // seletor de métrica relevante para a POSIÇÃO do jogador (evita gráfico zerado)
    var metricOpts = metricsForPlayer(pl);
    // garante métrica válida; se a atual não se aplica ao jogador, usa a principal dele
    var hasMetric = metricOpts.some(function (m) { return m.value === chart.metric; });
    if (!hasMetric) chart.metric = (isReal() ? (pl.metricKey || metricOpts[0].value) : metricOpts[0].value);
    controls.appendChild(selectControl("Métrica:", metricOpts, chart.metric, function (v) { chart.metric = v; renderPlayerChart(); }));

    var card = el("div", "chart-card");
    card.appendChild(el("div", "chart-title", "#" + (pl.jersey != null ? pl.jersey : "-") + " " + pl.name + " · " + pl.position + " · " + team.abbr));
    var metricLabel = metricOpts.filter(function (m) { return m.value === chart.metric; })[0].text;
    var weeksTxt = "semanas " + (DATA.meta.weekMin || 1) + "–" + (DATA.meta.weekMax || 18);
    card.appendChild(el("div", "chart-desc", metricLabel + " ao longo das partidas disputadas (" + weeksTxt + "). Cada ponto é um jogo, com o adversário."));
    card.appendChild(lineChart(pl.perGame, chart.metric, team.colors.primary));
    area.appendChild(card);
  }

  // gráfico de linha por partida (SVG). series: perGame[]
  function lineChart(series, metric, color) {
    var W = 720, H = 300, pad = { l: 48, r: 20, t: 20, b: 46 };
    var innerW = W - pad.l - pad.r, innerH = H - pad.t - pad.b;
    var vals = series.map(function (s) { return s[metric] || 0; });
    var maxV = Math.max.apply(null, vals) * 1.15 || 1;
    var minV = 0;
    var n = series.length;
    var svg = svgEl("svg", { class: "chart", viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "xMidYMid meet" });
    for (var t = 0; t <= 4; t++) {
      var val = maxV * t / 4;
      var y = pad.t + innerH - (val / maxV) * innerH;
      svg.appendChild(svgEl("line", { class: "gridline", x1: pad.l, y1: y, x2: pad.l + innerW, y2: y }));
      var lbl = svgEl("text", { class: "axis-label", x: pad.l - 8, y: y + 4, "text-anchor": "end" });
      lbl.textContent = val.toFixed(1);
      svg.appendChild(lbl);
    }
    svg.appendChild(svgEl("line", { class: "axis", x1: pad.l, y1: pad.t + innerH, x2: pad.l + innerW, y2: pad.t + innerH }));

    function xOf(i) { return n === 1 ? pad.l + innerW / 2 : pad.l + (innerW * i / (n - 1)); }
    function yOf(v) { return pad.t + innerH - (v / maxV) * innerH; }

    // area + linha
    var dLine = "", dArea = "";
    series.forEach(function (s, i) {
      var x = xOf(i), y = yOf(s[metric] || 0);
      dLine += (i === 0 ? "M" : "L") + x + " " + y + " ";
      dArea += (i === 0 ? ("M" + x + " " + (pad.t + innerH) + " L") : "L") + x + " " + y + " ";
    });
    dArea += "L" + xOf(n - 1) + " " + (pad.t + innerH) + " Z";
    svg.appendChild(svgEl("path", { d: dArea, fill: color, "fill-opacity": "0.12" }));
    svg.appendChild(svgEl("path", { d: dLine, fill: "none", stroke: color, "stroke-width": "2.5" }));

    // pontos + labels de eixo X (semana/adversário)
    series.forEach(function (s, i) {
      var x = xOf(i), y = yOf(s[metric] || 0);
      var dot = svgEl("circle", { class: "dot", cx: x, cy: y, r: 5, fill: color });
      var tip = svgEl("title");
      var sideTxt = s.side === "home" ? " (casa)" : (s.side === "away" ? " (fora)" : "");
      tip.textContent = "Semana " + s.week + " vs " + s.opp + sideTxt + ": " + (s[metric] || 0);
      dot.appendChild(tip);
      svg.appendChild(dot);
      var vlbl = svgEl("text", { class: "bar-val", x: x, y: y - 10, "text-anchor": "middle" });
      vlbl.textContent = s[metric] || 0;
      svg.appendChild(vlbl);
      var xlbl = svgEl("text", { class: "axis-label", x: x, y: pad.t + innerH + 18, "text-anchor": "middle" });
      xlbl.textContent = "S" + s.week;
      svg.appendChild(xlbl);
      var olbl = svgEl("text", { class: "axis-label", x: x, y: pad.t + innerH + 32, "text-anchor": "middle" });
      olbl.textContent = (s.side === "home" ? "vs " : (s.side === "away" ? "@ " : "")) + s.opp;
      svg.appendChild(olbl);
    });
    return svg;
  }

  // =======================================================================
  // MODAL DE JOGADOR (com mini-gráfico por partida)
  // =======================================================================
  function openPlayerModal(team, pl) {
    var root = $("modalRoot");
    root.innerHTML = "";
    var bg = el("div", "modal-bg");
    bg.addEventListener("click", function (e) { if (e.target === bg) root.innerHTML = ""; });
    var modal = el("div", "modal");
    var close = el("button", "modal-close", "×");
    close.addEventListener("click", function () { root.innerHTML = ""; });
    modal.appendChild(close);

    var head = el("div", "modal-head");
    head.appendChild(teamLogo(team, 56));
    var hi = el("div");
    hi.appendChild(el("h2", "screen-title", "#" + (pl.jersey != null ? pl.jersey : "-") + " " + pl.name));
    hi.querySelector("h2").style.fontSize = "28px";
    hi.appendChild(el("div", "chart-desc", pl.position + " · " + team.name + " · " + heightStr(pl.heightIn) +
      (pl.weight ? " · " + Math.round(pl.weight) + " lb" : "") + (pl.college && pl.college !== "NA" ? " · " + pl.college : "")));
    head.appendChild(hi);
    modal.appendChild(head);

    var chips = el("div", "stat-row");
    chips.appendChild(statChip(pl.pgrScore, "PGRSCORE"));
    if (isReal()) {
      // dois stats de destaque conforme a posição, a partir de pl.totals
      var hi1 = highlightStats(pl);
      chips.appendChild(statChip(hi1[0][1], hi1[0][0]));
      chips.appendChild(statChip(hi1[1][1], hi1[1][0]));
      chips.appendChild(statChip(pl.snaps, "JOGOS"));
    } else {
      chips.appendChild(statChip(pl.topSpeedMph != null ? pl.topSpeedMph : "—", "VEL MÁX (mph)"));
      chips.appendChild(statChip(pl.snaps, "SNAPS TOTAIS"));
      chips.appendChild(statChip(pl.perGame ? pl.perGame.length : 0, "JOGOS"));
    }
    modal.appendChild(chips);

    if (pl.perGame && pl.perGame.length >= 2) {
      var mKey = isReal() ? (pl.metricKey || "fantasy") : "topSpeedMph";
      var mLabel = isReal() ? (pl.metricLabel || "Fantasy (PPR)") : "Velocidade máxima";
      modal.appendChild(el("div", "chart-title", mLabel + " por partida"));
      modal.appendChild(lineChart(pl.perGame, mKey, team.colors.primary));
    } else {
      modal.appendChild(el("div", "chart-desc", "Sem série suficiente por partida para este atleta na amostra."));
    }

    bg.appendChild(modal);
    root.appendChild(bg);
  }
  function statChip(val, label) {
    var c = el("div", "stat-chip");
    c.appendChild(el("b", null, val));
    c.appendChild(el("span", null, label));
    return c;
  }
  // escolhe 2 stats de destaque por grupo de posição (para o modal, modo real)
  function highlightStats(pl) {
    var t = pl.totals || {};
    var byGroup = {
      QB: [["JD PASSE", t["Jardas passe"]], ["TD PASSE", t["TDs passe"]]],
      RB: [["JD CORRIDA", t["Jardas corrida"]], ["TD CORRIDA", t["TDs corrida"]]],
      WR: [["JD RECEB", t["Jardas recebidas"]], ["RECEPÇÕES", t["Recepcoes"]]],
      TE: [["JD RECEB", t["Jardas recebidas"]], ["RECEPÇÕES", t["Recepcoes"]]],
      DL: [["SACKS", t["Sacks"]], ["TACKLES", t["Tackles solo"]]],
      LB: [["TACKLES", t["Tackles solo"]], ["SACKS", t["Sacks"]]],
      DB: [["TACKLES", t["Tackles solo"]], ["INTS", t["INTs"]]],
      OL: [["FANTASY", t["Fantasy PPR"]], ["JOGOS", pl.snaps]],
    };
    var pair = byGroup[pl.group] || [["FANTASY", t["Fantasy PPR"]], ["JOGOS", pl.snaps]];
    return pair.map(function (p) { return [p[0], (p[1] != null ? p[1] : "—")]; });
  }

  // ---- eventos -----------------------------------------------------------
  function bindUI() {
    var btns = document.querySelectorAll(".navbtn");
    for (var i = 0; i < btns.length; i++)
      btns[i].addEventListener("click", function () { switchView(this.dataset.view); });
    $("brandHome").addEventListener("click", function () { switchView("h2h"); });
    $("btnCompare").addEventListener("click", function () { if (h2h.home && h2h.away) showH2HCompare(); });
    $("btnBackH2H").addEventListener("click", showH2HSelect);
    var ctabs = document.querySelectorAll("#chartTabs .tab");
    for (var j = 0; j < ctabs.length; j++)
      ctabs[j].addEventListener("click", function () { chart.kind = this.dataset.chart; renderCharts(); });

    // feedback de clique (press + ripple) delegado: vale para qualquer
    // botão/card clicável, inclusive os criados dinamicamente depois.
    document.addEventListener("pointerdown", function (ev) {
      var hit = ev.target.closest(".navbtn,.tab,.cta,.back,.team-card,.pcard:not(.empty)");
      if (hit && !hit.disabled) pressFX(hit, ev);
    });
  }

  loadData();
})();
