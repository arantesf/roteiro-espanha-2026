/* España 2026 — instrumento de bordo.
   Lê window.ITINERARY (data.js) e monta um navegador de dias:
   régua de 16 dias no topo, um dia por tela, detalhes em painel. */
(function () {
  "use strict";

  var D = window.ITINERARY;

  /* ---------- utilidades ---------- */

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (attrs[k] == null) return;
        if (k === "class") e.className = attrs[k];
        else e.setAttribute(k, attrs[k]);
      });
    }
    if (html != null) e.innerHTML = html;
    return e;
  }

  function esc(s) {
    return String(s == null ? "" : s);
  }

  function stripTags(html) {
    var d = document.createElement("div");
    d.innerHTML = html || "";
    return d.textContent || "";
  }

  function anchorsFrom(html) {
    var d = document.createElement("div");
    d.innerHTML = html || "";
    return Array.prototype.map.call(d.querySelectorAll("a"), function (a) {
      return { label: a.textContent, href: a.getAttribute("href") };
    });
  }

  function gmapsUrl(item) {
    // mapsCid abre a ficha do estabelecimento no Google, não um alfinete solto.
    if (item.mapsCid) return "https://maps.google.com/?cid=" + item.mapsCid;
    if (item.lat != null && item.lon != null)
      return "https://www.google.com/maps/search/?api=1&query=" + item.lat + "," + item.lon;
    if (item.mapsQuery)
      return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(item.mapsQuery);
    return null;
  }

  function catClass(s) {
    return s.category === "meal" ? "meal" : s.category === "activity" ? "activity" : "plain";
  }

  /* ---------- modelo: 16 dias em fila ---------- */

  var ABBR = { ida: "Ida", sevilha: "Sevilha", madrid: "Madrid", barcelona: "Barcelona", menorca: "Menorca", volta: "Volta" };
  var SHORT = { ida: "ida", sevilha: "sev", madrid: "mad", barcelona: "bcn", menorca: "men", volta: "volta" };
  var WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  var MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

  var SECTIONS = [];
  if (D.ida) SECTIONS.push({ id: "ida", name: "Ida", days: D.ida.days, subtitle: D.ida.title });
  (D.cities || []).forEach(function (c) {
    SECTIONS.push({
      id: c.id, name: c.name, days: c.days, subtitle: c.dates,
      kicker: c.kicker, stay: c.stay, hubs: c.hubs, preItems: c.preItems,
    });
  });
  if (D.volta) SECTIONS.push({ id: "volta", name: "Volta", days: D.volta.days, subtitle: D.volta.title });

  var DAYS = [];
  SECTIONS.forEach(function (sec) {
    sec.days.forEach(function (day, i) {
      var m = /(\d{1,2})\/(\d{1,2})/.exec(day.dnum || "");
      DAYS.push({
        n: DAYS.length + 1,
        day: day,
        sec: sec,
        firstOfSection: i === 0,
        date: m ? new Date(2026, +m[2] - 1, +m[1]) : null,
      });
    });
  });

  function todayIndex() {
    var now = new Date();
    now.setHours(0, 0, 0, 0);
    for (var i = 0; i < DAYS.length; i++) {
      if (DAYS[i].date && DAYS[i].date.getTime() === now.getTime()) return i;
    }
    return -1;
  }

  function fmtDate(d) {
    if (!d) return "";
    return WD[d.getDay()] + " " + d.getDate() + " " + MES[d.getMonth()];
  }

  function daysUntilStart() {
    var now = new Date();
    now.setHours(0, 0, 0, 0);
    var first = DAYS[0].date;
    return first ? Math.round((first - now) / 86400000) : null;
  }

  /* ---------- separa compromissos de avisos ---------- */

  function splitDay(entry) {
    var evs = [], notes = [];
    (entry.day.items || []).forEach(function (it) {
      if (it.type === "spots") {
        it.items.forEach(function (s) { evs.push({ kind: "spot", data: s }); });
      } else if (it.type === "leg") {
        evs.push({ kind: "leg", data: it });
      } else if (it.type === "note") {
        notes.push({ kind: it.kind || "plain", heading: it.heading, bodyHtml: it.bodyHtml });
      } else if (it.type === "p") {
        notes.push({ kind: "plain", bodyHtml: it.html });
      } else if (it.type === "doc") {
        notes.push({ kind: "plain", bodyHtml: '<a href="' + it.href + '" target="_blank" rel="noopener">' + esc(it.label) + "</a>" });
      } else if (it.type === "docs") {
        notes.push({
          kind: "plain",
          bodyHtml: it.links.map(function (l) {
            return '<a href="' + l.href + '" target="_blank" rel="noopener">' + esc(l.label) + "</a>";
          }).join(" · "),
        });
      }
    });
    if (entry.firstOfSection && entry.sec.preItems) {
      entry.sec.preItems.forEach(function (n) {
        notes.unshift({ kind: n.kind || "plain", heading: n.heading, bodyHtml: n.bodyHtml });
      });
    }
    return { evs: evs, notes: notes };
  }

  function hasDetail(s) {
    return !!(s.descHtml || s.img || (s.docs && s.docs.length) || gmapsUrl(s));
  }

  /* ============================================================
     Chrome — appbar, régua, barra do dia
     ============================================================ */

  var chrome = document.getElementById("chrome");
  var view = document.getElementById("view");
  var state = { route: "day", index: 0 };
  var ticks = [], segs = [], dbCity, dbDate, arrows = {};

  function buildChrome() {
    chrome.innerHTML = "";

    /* appbar */
    var bar = el("div", { class: "appbar" });
    var brand = el("a", { class: "brand", href: "#/d/1" }, 'España <span class="mono">26</span>');
    bar.appendChild(brand);
    bar.appendChild(el("div", { class: "grow" }));

    var jump = el("button", { class: "today-jump", type: "button" }, "");
    var ti = todayIndex();
    var until = daysUntilStart();
    if (ti >= 0) {
      jump.textContent = "hoje";
      jump.title = "Ir para o dia de hoje";
      jump.addEventListener("click", function () { go(ti); });
    } else if (until != null && until > 0) {
      jump.textContent = until === 1 ? "é amanhã" : "faltam " + until + "d";
      jump.title = "Ir para o primeiro dia";
      jump.addEventListener("click", function () { go(0); });
    } else {
      jump = null;
    }
    if (jump) bar.appendChild(jump);

    var quick = el("nav", { class: "quick" });
    quick.appendChild(el("a", { href: "#/antes", id: "qAntes" }, "Antes"));
    quick.appendChild(el("a", { href: "#/reservas", id: "qReservas" }, "Reservas"));
    bar.appendChild(quick);
    chrome.appendChild(bar);

    /* régua */
    var ruler = el("div", { class: "ruler", role: "tablist", "aria-label": "Dias da viagem" });
    ticks = [];
    segs = [];
    var n = 0;
    SECTIONS.forEach(function (sec) {
      var seg = el("div", { class: "rseg" });
      seg.style.flex = String(sec.days.length);
      var tw = el("div", { class: "rticks" });
      sec.days.forEach(function () {
        var idx = n++;
        var t = el("button", {
          class: "rtick", type: "button", role: "tab",
          "aria-label": "Dia " + (idx + 1) + " · " + fmtDate(DAYS[idx].date),
        }, "<i></i>");
        t.addEventListener("click", function () { go(idx); });
        tw.appendChild(t);
        ticks.push(t);
      });
      seg.appendChild(tw);
      var lbl = el("button", { class: "rlabel", type: "button" },
        '<span class="s">' + esc(SHORT[sec.id] || sec.name) + '</span><span class="l">' + esc(sec.name) + '</span>');
      lbl.addEventListener("click", function () {
        for (var i = 0; i < DAYS.length; i++) if (DAYS[i].sec === sec) return go(i);
      });
      seg.appendChild(lbl);
      seg._sec = sec;
      segs.push(seg);
      ruler.appendChild(seg);
    });
    chrome.appendChild(ruler);

    /* barra do dia */
    var db = el("div", { class: "daybar" });
    arrows.prev = el("button", { class: "arrow", type: "button", "aria-label": "Dia anterior" }, "&#8249;");
    arrows.next = el("button", { class: "arrow", type: "button", "aria-label": "Próximo dia" }, "&#8250;");
    // fora do roteiro, a seta da esquerda volta para o dia de onde se saiu
    arrows.prev.addEventListener("click", function () {
      go(state.route === "day" ? state.index - 1 : state.index);
    });
    arrows.next.addEventListener("click", function () { go(state.index + 1); });
    var mid = el("div", { class: "daybar-mid" });
    dbCity = el("span", { class: "db-city" }, "");
    dbDate = el("span", { class: "db-date" }, "");
    mid.appendChild(dbCity);
    mid.appendChild(dbDate);
    db.appendChild(arrows.prev);
    db.appendChild(mid);
    db.appendChild(arrows.next);
    chrome.appendChild(db);
  }

  function syncChrome() {
    var e = DAYS[state.index];
    var ti = todayIndex();
    ticks.forEach(function (t, i) {
      t.setAttribute("aria-current", i === state.index ? "true" : "false");
      t.classList.toggle("is-today", i === ti);
    });
    segs.forEach(function (s) {
      s.classList.toggle("on", s._sec === e.sec);
    });
    if (state.route === "day") {
      dbCity.textContent = ABBR[e.sec.id] || e.sec.name;
      var flag = ti === state.index ? '<span class="db-flag">hoje</span>' : "";
      dbDate.innerHTML = flag + "<b>" + fmtDate(e.date) + '</b><span class="sep">/</span><span>dia ' + e.n + " de " + DAYS.length + "</span>";
      arrows.prev.disabled = state.index === 0;
      arrows.prev.setAttribute("aria-label", "Dia anterior");
      arrows.next.hidden = false;
      arrows.next.disabled = state.index === DAYS.length - 1;
    } else {
      dbCity.textContent = state.route === "antes" ? "Antes de embarcar" : "Reservas";
      dbDate.innerHTML = "";
      arrows.prev.disabled = false;
      arrows.prev.setAttribute("aria-label", "Voltar ao roteiro");
      arrows.next.hidden = true;
    }
    var qa = document.getElementById("qAntes"), qr = document.getElementById("qReservas");
    if (qa) qa.toggleAttribute("aria-current", state.route === "antes");
    if (qr) qr.toggleAttribute("aria-current", state.route === "reservas");
    chrome.classList.toggle("side", state.route !== "day");
  }

  function setChromeSub(html) {
    if (state.route !== "day") dbDate.innerHTML = html;
  }

  /* ============================================================
     Tela de um dia
     ============================================================ */

  var asideMap = null;

  function evRow(ev, onOpen) {
    if (ev.kind === "leg") {
      var leg = ev.data;
      var hm = /(\d{1,2}:\d{2})/.exec(stripTags(leg.title_html || ""));
      // o horário já vive na coluna da esquerda; não repetir no título
      var ttl = (leg.title_html || "").replace(/^\s*\d{1,2}:\d{2}\s*·\s*/, "");
      var row = el("button", { class: "ev leg", type: "button" });
      row.appendChild(el("span", { class: "ev-time" }, hm ? hm[1] : ""));
      row.appendChild(el("span", { class: "ev-mark" }, "<i>" + esc(leg.icon || "") + "</i>"));
      var b = el("span", { class: "ev-body" });
      b.appendChild(el("span", { class: "ev-name" }, ttl));
      if (leg.meta_html) b.appendChild(el("span", { class: "ev-sub" }, stripTags(leg.meta_html)));
      row.appendChild(b);
      row.appendChild(el("span", { class: "ev-more" }, "&#8250;"));
      row.addEventListener("click", function () { onOpen(ev); });
      return row;
    }

    var s = ev.data;
    var open = hasDetail(s);
    var r = el("button", { class: "ev " + catClass(s) + (open ? "" : " flat"), type: open ? "button" : "button" });
    var isClock = /^\d{1,2}:\d{2}$/.test(s.time || "");
    r.appendChild(el("span", { class: "ev-time" + (isClock ? "" : " soft") }, esc(s.time || "")));
    r.appendChild(el("span", { class: "ev-mark" }, "<i></i>"));
    var body = el("span", { class: "ev-body" });
    var tag = s.tag
      ? ' <span class="ev-tag' + ((s.tagClasses || []).indexOf("free") > -1 ? " free" : (s.tagClasses || []).indexOf("tip") > -1 ? " tip" : "") + '">' + esc(s.tag) + "</span>"
      : "";
    body.appendChild(el("span", { class: "ev-name" }, (s.titleHtml || "") + tag));
    if (s.descHtml) body.appendChild(el("span", { class: "ev-sub" }, stripTags(s.descHtml)));
    r.appendChild(body);
    r.appendChild(el("span", { class: "ev-more" }, open ? "&#8250;" : ""));
    if (open) r.addEventListener("click", function () { onOpen(ev); });
    else r.disabled = true;
    return r;
  }

  function renderDay() {
    var e = DAYS[state.index];
    var parts = splitDay(e);
    var wrap = el("div", { class: "day day-in" });

    var head = el("div", { class: "day-head" });
    head.appendChild(el("h1", { class: "day-title" }, esc(e.day.dttl)));
    wrap.appendChild(head);

    /* chips — atalhos do dia (só no mobile; no desktop viram a coluna lateral) */
    var chips = el("div", { class: "chips" });
    if (e.sec.stay) {
      var cs = el("button", { class: "chip", type: "button" },
        '<span class="g">&#127976;</span><em>' + esc(e.sec.stay.t) + "</em>");
      cs.addEventListener("click", function () { openStay(e.sec); });
      chips.appendChild(cs);
    }
    if (parts.notes.length) {
      var cn = el("button", { class: "chip warn", type: "button" },
        '<span class="g">&#9873;</span>' + (parts.notes.length === 1 ? "1 aviso" : parts.notes.length + " avisos"));
      cn.addEventListener("click", function () { openNotes(e, parts.notes); });
      chips.appendChild(cn);
    }
    var pts = dayPoints(e, parts);
    if (pts.length) {
      var cm = el("button", { class: "chip", type: "button" }, '<span class="g">&#9678;</span>mapa do dia');
      cm.addEventListener("click", function () { openMap(e, pts); });
      chips.appendChild(cm);
    }
    if (chips.childNodes.length) wrap.appendChild(chips);

    /* a espinha */
    var plan = el("div", { class: "plan" });
    parts.evs.forEach(function (ev) {
      plan.appendChild(evRow(ev, function (x) {
        if (x.kind === "leg") openLeg(x.data);
        else openSpot(x.data);
      }));
    });
    plan.appendChild(el("div", { class: "plan-end" }, "<i></i>"));
    if (state.index === DAYS.length - 1) {
      plan.appendChild(el("p", { class: "sig", style: "margin-top:26px;text-align:center" }, "Que seja a primeira de muitas."));
    }
    wrap.appendChild(plan);

    /* coluna lateral — telas largas */
    var aside = el("div", { class: "aside" });
    if (e.sec.stay) {
      var card = el("div", { class: "card" });
      card.appendChild(el("h3", null, "Hospedagem"));
      var inn = el("div", { class: "in" });
      inn.appendChild(el("b", null, esc(e.sec.stay.t)));
      inn.insertAdjacentHTML("beforeend", e.sec.stay.m_html || "");
      if (e.sec.stay.doc) {
        inn.insertAdjacentHTML("beforeend",
          '<br><a href="' + e.sec.stay.doc.href + '" target="_blank" rel="noopener">' + esc(e.sec.stay.doc.label) + " &#8599;</a>");
      }
      card.appendChild(inn);
      aside.appendChild(card);
    }
    parts.notes.forEach(function (n) {
      aside.appendChild(noteBox(n));
    });
    if (pts.length) aside.appendChild(el("div", { class: "map", id: "asideMap" }));
    wrap.appendChild(aside);

    view.innerHTML = "";
    view.appendChild(wrap);
    view.scrollTop = 0;

    if (asideMap) { asideMap.remove(); asideMap = null; }
    if (pts.length && window.matchMedia("(min-width:900px)").matches) {
      requestAnimationFrame(function () {
        asideMap = buildMap("asideMap", pts);
      });
    }
  }

  function noteBox(n) {
    var box = el("div", { class: "note" + (n.kind && n.kind !== "plain" ? " " + n.kind : "") });
    if (n.heading) box.appendChild(el("span", { class: "h" }, esc(n.heading)));
    box.insertAdjacentHTML("beforeend", n.bodyHtml || "");
    return box;
  }

  function dayPoints(e, parts) {
    var out = [];
    parts.evs.forEach(function (ev) {
      if (ev.kind !== "spot") return;
      var s = ev.data;
      if (s.lat != null && s.lon != null) out.push(s);
    });
    var extra = [];
    if (e.sec.stay && e.sec.stay.lat != null) {
      extra.push({ lat: e.sec.stay.lat, lon: e.sec.stay.lon, titleHtml: esc(e.sec.stay.t), category: "hotel", kind: "Hospedagem" });
    }
    (e.sec.hubs || []).forEach(function (h) {
      if (h.lat != null) extra.push({ lat: h.lat, lon: h.lon, titleHtml: h.titleHtml, category: "hub", kind: h.kind });
    });
    return out.length ? out.concat(extra) : [];
  }

  /* ============================================================
     Painel deslizante
     ============================================================ */

  var sheetRoot = document.getElementById("sheetRoot");
  var lastFocus = null;
  var sheetMap = null;

  function closeSheet() {
    if (!sheetRoot.classList.contains("open")) return;
    if (sheetMap) { sheetMap.remove(); sheetMap = null; }
    sheetRoot.classList.remove("open");
    sheetRoot.setAttribute("aria-hidden", "true");
    sheetRoot.innerHTML = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function openSheet(kicker, title, buildBody) {
    lastFocus = document.activeElement;
    sheetRoot.innerHTML = "";
    var back = el("div", { class: "sheet-back" });
    back.addEventListener("click", closeSheet);
    var sheet = el("div", { class: "sheet", role: "dialog", "aria-modal": "true", "aria-label": stripTags(title) });
    var head = el("div", { class: "sheet-head" });
    var t = el("div", { class: "t" });
    if (kicker) t.appendChild(el("span", { class: "sheet-kick" }, esc(kicker)));
    t.appendChild(el("div", { class: "sheet-title" }, title));
    head.appendChild(t);
    var close = el("button", { class: "sheet-close", type: "button", "aria-label": "Fechar" }, "&#10005;");
    close.addEventListener("click", closeSheet);
    head.appendChild(close);
    sheet.appendChild(head);
    var body = el("div", { class: "sheet-body" });
    buildBody(body);
    sheet.appendChild(body);
    sheetRoot.appendChild(back);
    sheetRoot.appendChild(sheet);
    sheetRoot.classList.add("open");
    sheetRoot.setAttribute("aria-hidden", "false");
    close.focus();
    return { sheet: sheet, body: body };
  }

  function actLinks(container, list) {
    if (!list || !list.length) return;
    var acts = el("div", { class: "acts" });
    list.forEach(function (a) {
      acts.appendChild(el("a", {
        class: "act" + (a.primary ? " primary" : ""),
        href: a.href, target: "_blank", rel: "noopener",
      }, esc(a.label)));
    });
    container.appendChild(acts);
  }

  function openSpot(s) {
    openSheet(s.time, s.titleHtml || "", function (body) {
      if (s.img) body.appendChild(el("img", { class: "shot", src: s.img, alt: s.imgAlt || "", loading: "lazy" }));
      if (s.tag) {
        body.appendChild(el("p", null,
          '<span class="ev-tag' + ((s.tagClasses || []).indexOf("free") > -1 ? " free" : (s.tagClasses || []).indexOf("tip") > -1 ? " tip" : "") + '">' + esc(s.tag) + "</span>"));
      }
      if (s.descHtml) body.appendChild(el("p", null, s.descHtml));
      var acts = [];
      var url = gmapsUrl(s);
      if (url) acts.push({ label: "Abrir no mapa ↗", href: url, primary: true });
      (s.docs || []).forEach(function (d) { acts.push({ label: d.label + " ↗", href: d.href }); });
      actLinks(body, acts);
    });
  }

  function openLeg(leg) {
    openSheet("Deslocamento", leg.title_html || "", function (body) {
      if (leg.meta_html) body.appendChild(el("p", null, leg.meta_html));
      actLinks(body, (leg.docs || []).map(function (d) {
        return { label: d.label + " ↗", href: d.href, primary: true };
      }));
    });
  }

  function openStay(sec) {
    openSheet("Hospedagem · " + sec.name, esc(sec.stay.t), function (body) {
      body.appendChild(el("p", null, sec.stay.m_html || ""));
      var acts = [];
      if (sec.stay.doc) acts.push({ label: sec.stay.doc.label + " ↗", href: sec.stay.doc.href, primary: true });
      if (sec.stay.lat != null) {
        acts.push({ label: "Abrir no mapa ↗", href: "https://www.google.com/maps/search/?api=1&query=" + sec.stay.lat + "," + sec.stay.lon });
      }
      actLinks(body, acts);
    });
  }

  function openNotes(e, notes) {
    openSheet(fmtDate(e.date), "Avisos do dia", function (body) {
      notes.forEach(function (n) { body.appendChild(noteBox(n)); });
    });
  }

  function openMap(e, pts) {
    openSheet(fmtDate(e.date), "Mapa do dia", function (body) {
      body.appendChild(el("div", { class: "map-legend" },
        '<span><i class="dot-meal"></i>refeição</span><span><i class="dot-activity"></i>atividade</span><span><i class="dot-plain"></i>ponto</span><span><i class="dot-hotel"></i>hotel · estação</span>'));
      body.appendChild(el("div", { class: "sheet-map", id: "sheetMap" }));
    });
    requestAnimationFrame(function () {
      sheetMap = buildMap("sheetMap", pts);
      if (sheetMap) setTimeout(function () { if (sheetMap) sheetMap.invalidateSize(); }, 60);
    });
  }

  /* ---------- mapa ---------- */

  function pinIcon(cat, num) {
    if (num) {
      return L.divIcon({
        className: "", html: '<span class="pin pin-num dot-' + cat + '">' + num + "</span>",
        iconSize: [20, 20], iconAnchor: [10, 10], popupAnchor: [0, -12],
      });
    }
    return L.divIcon({
      className: "", html: '<span class="pin dot-' + cat + '"></span>',
      iconSize: [12, 12], iconAnchor: [6, 6], popupAnchor: [0, -8],
    });
  }

  function buildMap(id, spots) {
    var node = document.getElementById(id);
    if (!node || !spots.length || typeof L === "undefined") return null;
    var map = L.map(id, { scrollWheelZoom: false, attributionControl: true });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      maxZoom: 20, subdomains: "abcd",
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    }).addTo(map);
    var bounds = [], num = 0;
    spots.forEach(function (s) {
      var isPlace = s.category !== "hotel" && s.category !== "hub";
      var cat = isPlace ? catClass(s) : s.category;
      var marker = L.marker([s.lat, s.lon], { icon: pinIcon(cat, isPlace ? ++num : 0) }).addTo(map);
      var pop = el("div", { class: "map-pop" });
      pop.appendChild(el("span", { class: "time" }, esc(s.kind || s.time || "")));
      pop.appendChild(el("span", { class: "name" }, s.titleHtml || ""));
      var url = gmapsUrl(s);
      if (url) pop.appendChild(el("a", { class: "gmaps", href: url, target: "_blank", rel: "noopener" }, "abrir no Google Maps &#8599;"));
      marker.bindPopup(pop);
      bounds.push([s.lat, s.lon]);
    });
    if (bounds.length === 1) map.setView(bounds[0], 15);
    else map.fitBounds(bounds, { padding: [26, 26] });
    map.on("focus", function () { map.scrollWheelZoom.enable(); });
    map.on("blur", function () { map.scrollWheelZoom.disable(); });
    return map;
  }

  /* ============================================================
     Antes de embarcar
     ============================================================ */

  function slugify(s) {
    return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  var CHECK_PREFIX = "espanha2026:antes:";
  var CUSTOM_KEY = CHECK_PREFIX + "custom";
  var REMOVED_KEY = CHECK_PREFIX + "removed";

  function isChecked(id) {
    try { return localStorage.getItem(CHECK_PREFIX + id) === "1"; } catch (e) { return false; }
  }
  function setChecked(id, val) {
    try {
      if (val) localStorage.setItem(CHECK_PREFIX + id, "1");
      else localStorage.removeItem(CHECK_PREFIX + id);
    } catch (e) { /* modo privado: o estado só não persiste */ }
  }
  function lsGetJSON(key, fallback) {
    try { var raw = localStorage.getItem(key); return raw == null ? fallback : JSON.parse(raw); }
    catch (e) { return fallback; }
  }
  function lsSetJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* idem */ }
  }

  function renderAntes() {
    var seedItems = D.antes || [];
    var screen = el("div", { class: "screen day-in" });

    var openList = el("ul", { class: "check" });
    var doneSummary = el("summary", null, "");
    var doneList = el("ul", { class: "check" });
    var doneDetails = el("details", { class: "check-done" });
    doneDetails.appendChild(doneSummary);
    doneDetails.appendChild(doneList);

    var addForm = el("form", { class: "check-add" });
    var addInput = el("input", { type: "text", placeholder: "Adicionar um item...", "aria-label": "Adicionar item" });
    addForm.appendChild(addInput);
    addForm.appendChild(el("button", { type: "submit" }, "Adicionar"));

    screen.appendChild(openList);
    screen.appendChild(doneDetails);
    screen.appendChild(addForm);

    function loadItems() {
      var removed = lsGetJSON(REMOVED_KEY, []);
      var custom = lsGetJSON(CUSTOM_KEY, []);
      var seed = seedItems.map(function (it) {
        return { id: slugify(it.title), title: it.title, small_html: it.small_html, docs: it.docs };
      }).filter(function (it) { return removed.indexOf(it.id) === -1; });
      return seed.concat(custom.filter(function (it) { return removed.indexOf(it.id) === -1; }));
    }

    function removeItem(id) {
      var removed = lsGetJSON(REMOVED_KEY, []);
      if (removed.indexOf(id) === -1) removed.push(id);
      lsSetJSON(REMOVED_KEY, removed);
      lsSetJSON(CUSTOM_KEY, lsGetJSON(CUSTOM_KEY, []).filter(function (c) { return c.id !== id; }));
      setChecked(id, false);
      draw();
    }

    function addItem(title) {
      title = title.trim();
      if (!title) return;
      var custom = lsGetJSON(CUSTOM_KEY, []);
      custom.push({ id: "custom-" + Date.now().toString(36) + "-" + slugify(title).slice(0, 30), title: title });
      lsSetJSON(CUSTOM_KEY, custom);
      draw();
    }

    function itemRow(it) {
      var checked = isChecked(it.id);
      var li = el("li", { class: checked ? "done" : "" });
      var label = el("label");
      var input = el("input", { type: "checkbox" });
      if (checked) input.checked = true;
      input.addEventListener("change", function () { setChecked(it.id, input.checked); draw(); });
      label.appendChild(input);
      var right = el("div");
      right.appendChild(el("b", null, esc(it.title)));
      if (it.small_html) right.appendChild(el("small", null, it.small_html));
      if (it.docs && it.docs.length) {
        var acts = el("div", { class: "acts" });
        it.docs.forEach(function (d) {
          acts.appendChild(el("a", { class: "act", href: d.href, target: "_blank", rel: "noopener" }, esc(d.label) + " ↗"));
        });
        right.appendChild(acts);
      }
      label.appendChild(right);
      li.appendChild(label);
      var rm = el("button", { type: "button", class: "check-remove", "aria-label": "Remover " + it.title }, "&times;");
      rm.addEventListener("click", function () { removeItem(it.id); });
      li.appendChild(rm);
      return li;
    }

    function draw() {
      var items = loadItems();
      var open = items.filter(function (it) { return !isChecked(it.id); });
      var done = items.filter(function (it) { return isChecked(it.id); });
      openList.innerHTML = "";
      open.forEach(function (it) { openList.appendChild(itemRow(it)); });
      doneList.innerHTML = "";
      done.forEach(function (it) { doneList.appendChild(itemRow(it)); });
      doneDetails.style.display = done.length ? "" : "none";
      doneSummary.textContent = done.length === 1 ? "1 item concluído" : done.length + " itens concluídos";
      var total = items.length;
      setChromeSub(total === 0 ? "<span>nenhum item ainda</span>"
        : done.length === total ? "<b>tudo pronto</b><span class=\"sep\">/</span><span>" + total + " itens</span>"
        : "<b>" + done.length + " de " + total + "</b><span class=\"sep\">/</span><span>concluídos</span>");
    }

    addForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      addItem(addInput.value);
      addInput.value = "";
      addInput.focus();
    });

    draw();
    view.innerHTML = "";
    view.appendChild(screen);
    view.scrollTop = 0;
  }

  /* ============================================================
     Reservas
     ============================================================ */

  function renderReservas() {
    var data = D.reservas || { rows: [], contacts: [] };
    var screen = el("div", { class: "screen day-in" });
    screen.appendChild(el("p", { class: "sub" },
      "Códigos e PINs ficam de fora desta página. Os comprovantes completos estão na pasta privada do OneDrive."));

    var list = el("ul", { class: "rows" });
    data.rows.forEach(function (r) {
      var links = anchorsFrom(r.arquivo_html);
      var li = el("li");
      if (links.length === 1) {
        var a = el("a", { href: links[0].href, target: "_blank", rel: "noopener" });
        a.appendChild(el("span", { class: "d mono" }, esc(r.data)));
        a.appendChild(el("span", { class: "t" }, esc(r.trecho)));
        a.appendChild(el("span", { class: "f" }, esc(links[0].label) + " ↗"));
        li.appendChild(a);
      } else {
        var row = el("div", { class: "norow" });
        row.appendChild(el("span", { class: "d mono" }, esc(r.data)));
        row.appendChild(el("span", { class: "t" }, esc(r.trecho)));
        var multi = el("span", { class: "f multi" });
        links.forEach(function (l, i) {
          if (i) multi.appendChild(document.createTextNode("·"));
          multi.appendChild(el("a", { href: l.href, target: "_blank", rel: "noopener" }, esc(l.label)));
        });
        row.appendChild(multi);
        li.appendChild(row);
      }
      list.appendChild(li);
    });
    screen.appendChild(list);

    screen.appendChild(el("h2", null, "Contatos"));
    var cl = el("ul", { class: "contacts" });
    (data.contacts || []).forEach(function (c) {
      var li = el("li");
      li.appendChild(el("span", { class: "k" }, esc(c.label)));
      li.appendChild(el("span", { class: "v" }, c.value_html));
      cl.appendChild(li);
    });
    screen.appendChild(cl);

    screen.appendChild(el("p", { class: "fine" },
      "Confira horários e ingressos nos sites oficiais antes de viajar.<br>Fotografias: Wikimedia Commons, sob licenças livres · Mapas: OpenStreetMap contributors."));

    view.innerHTML = "";
    view.appendChild(screen);
    view.scrollTop = 0;
  }

  /* ============================================================
     Rotas
     ============================================================ */

  function go(i) {
    if (i < 0 || i >= DAYS.length) return;
    location.hash = "#/d/" + (i + 1);
  }

  function route() {
    closeSheet();
    var h = location.hash.replace(/^#\/?/, "");
    if (h === "antes") {
      state.route = "antes";
      renderAntes();
    } else if (h === "reservas") {
      state.route = "reservas";
      renderReservas();
    } else {
      var m = /^d\/(\d+)/.exec(h);
      var i = m ? Math.min(Math.max(+m[1] - 1, 0), DAYS.length - 1) : defaultIndex();
      state.route = "day";
      state.index = i;
      renderDay();
      if (!m) history.replaceState(null, "", "#/d/" + (i + 1));
    }
    syncChrome();
  }

  function defaultIndex() {
    var ti = todayIndex();
    if (ti >= 0) return ti;
    var now = new Date();
    now.setHours(0, 0, 0, 0);
    if (DAYS[DAYS.length - 1].date && now > DAYS[DAYS.length - 1].date) return DAYS.length - 1;
    return 0;
  }

  /* ---------- gestos e teclado ---------- */

  function initGestures() {
    var x0 = null, y0 = null, t0 = 0;
    view.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 1) { x0 = null; return; }
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now();
    }, { passive: true });
    view.addEventListener("touchend", function (e) {
      if (x0 == null || state.route !== "day") return;
      var t = e.changedTouches[0];
      var dx = t.clientX - x0, dy = t.clientY - y0;
      x0 = null;
      if (Date.now() - t0 > 600) return;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
      go(state.index + (dx < 0 ? 1 : -1));
    }, { passive: true });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") return closeSheet();
      if (state.route !== "day" || sheetRoot.classList.contains("open")) return;
      var tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (e.key === "ArrowRight") go(state.index + 1);
      else if (e.key === "ArrowLeft") go(state.index - 1);
    });
  }

  /* ---------- start ---------- */

  function main() {
    buildChrome();
    initGestures();
    window.addEventListener("hashchange", route);
    var wide = window.matchMedia("(min-width:900px)");
    var onWide = function () { if (state.route === "day") renderDay(); };
    if (wide.addEventListener) wide.addEventListener("change", onWide);
    else if (wide.addListener) wide.addListener(onWide);
    route();
  }

  document.addEventListener("DOMContentLoaded", main);
})();
