/* España 2026 — renderer. Reads window.ITINERARY (data.js) and builds the page. */
(function () {
  "use strict";

  var esc = function (s) {
    return String(s == null ? "" : s);
  };

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

  function gmapsUrl(item) {
    // mapsCid é o identificador do estabelecimento no Google — abre a ficha
    // do local (nome, fotos, avaliações), não um alfinete solto na coordenada.
    if (item.mapsCid) {
      return "https://maps.google.com/?cid=" + item.mapsCid;
    }
    if (item.lat != null && item.lon != null) {
      return "https://www.google.com/maps/search/?api=1&query=" + item.lat + "," + item.lon;
    }
    if (item.mapsQuery) {
      return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(item.mapsQuery);
    }
    return null;
  }

  function catClass(item) {
    if (item.category === "hotel" || item.category === "hub") return item.category;
    return item.category === "meal" ? "meal" : item.category === "activity" ? "activity" : "plain";
  }

  function pinIcon(cat, glyph) {
    if (glyph) {
      return L.divIcon({
        className: "",
        html: '<span class="pin pin-lg dot-' + cat + '">' + glyph + "</span>",
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        popupAnchor: [0, -14],
      });
    }
    return L.divIcon({
      className: "",
      html: '<span class="pin dot-' + cat + '"></span>',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      popupAnchor: [0, -10],
    });
  }

  /* ---------- timeline row builders ---------- */

  function rowSpot(item) {
    var cat = catClass(item);
    var row = el("div", { class: "trow " + cat });
    var when = el("div", { class: "when" }, item.tbd ? esc(item.time) : esc(item.time));
    row.appendChild(when);
    row.appendChild(el("div", { class: "dot" }));
    var content = el("div", { class: "content" });
    var body = el("div", { class: "body" });
    var tagHtml = item.tag
      ? ' <span class="tag' + (item.tagClasses && item.tagClasses.indexOf("free") > -1 ? " free" : item.tagClasses && item.tagClasses.indexOf("tip") > -1 ? " tip" : "") + '">' + esc(item.tag) + "</span>"
      : "";
    body.appendChild(el("span", { class: "name" }, (item.titleHtml || "") + tagHtml));
    if (item.descHtml) body.appendChild(el("span", { class: "desc" }, item.descHtml));
    var url = gmapsUrl(item);
    if (url) {
      var a = el(
        "a",
        { class: "gmap-link", href: url, target: "_blank", rel: "noopener" },
        "&#128205; abrir no mapa"
      );
      body.appendChild(a);
    }
    if (item.docs && item.docs.length) body.appendChild(blockDocs(item.docs));
    content.appendChild(body);
    if (item.img) {
      content.appendChild(el("img", { class: "thumb", src: item.img, alt: item.imgAlt || "", loading: "lazy" }));
    }
    row.appendChild(content);
    return row;
  }

  function rowLeg(item) {
    var row = el("div", { class: "trow leg" });
    row.appendChild(el("div", { class: "when" }, "" ));
    row.appendChild(el("div", { class: "dot" }));
    var content = el("div", { class: "content" });
    content.appendChild(el("div", { class: "icon" }, item.icon || ""));
    var body = el("div", { class: "body" });
    body.appendChild(el("span", { class: "name" }, item.title_html || ""));
    if (item.meta_html) body.appendChild(el("span", { class: "meta" }, item.meta_html));
    if (item.docs && item.docs.length) body.appendChild(blockDocs(item.docs));
    content.appendChild(body);
    row.appendChild(content);
    return row;
  }

  function blockNote(n) {
    var cls = "note" + (n.kind && n.kind !== "plain" ? " " + n.kind : "");
    var box = el("div", { class: cls });
    if (n.heading) box.appendChild(el("span", { class: "h" }, esc(n.heading)));
    box.appendChild(document.createTextNode(""));
    box.insertAdjacentHTML("beforeend", n.bodyHtml || "");
    return box;
  }

  function blockDocs(links) {
    var wrap = el("div", { class: "docs", style: "display:flex;flex-wrap:wrap;gap:8px 20px;margin:10px 0" });
    links.forEach(function (l) {
      wrap.appendChild(el("a", { class: "doc", href: l.href, target: "_blank", rel: "noopener" }, esc(l.label)));
    });
    return wrap;
  }

  function blockP(html) {
    return el("p", null, html);
  }

  /* renders a day's item list as alternating timeline/plain blocks */
  function renderItems(items) {
    var frag = document.createDocumentFragment();
    var currentTimeline = null;
    function openTimeline() {
      if (!currentTimeline) {
        currentTimeline = el("div", { class: "timeline" });
        frag.appendChild(currentTimeline);
      }
      return currentTimeline;
    }
    function closeTimeline() {
      currentTimeline = null;
    }
    items.forEach(function (it) {
      if (it.type === "leg") {
        openTimeline().appendChild(rowLeg(it));
      } else if (it.type === "spots") {
        var tl = openTimeline();
        it.items.forEach(function (spot) {
          tl.appendChild(rowSpot(spot));
        });
      } else if (it.type === "note") {
        closeTimeline();
        frag.appendChild(blockNote(it));
      } else if (it.type === "doc") {
        closeTimeline();
        frag.appendChild(blockDocs([{ label: it.label, href: it.href }]));
      } else if (it.type === "docs") {
        closeTimeline();
        frag.appendChild(blockDocs(it.links));
      } else if (it.type === "p") {
        closeTimeline();
        frag.appendChild(blockP(it.html));
      }
    });
    return frag;
  }

  function renderDay(day) {
    var det = el("details", { class: "day" }, null);
    if (day.open) det.setAttribute("open", "");
    var summary = el("summary", null, null);
    summary.appendChild(el("span", { class: "dnum" }, esc(day.dnum)));
    summary.appendChild(el("span", { class: "dttl" }, esc(day.dttl)));
    summary.appendChild(el("span", { class: "chev" }));
    det.appendChild(summary);
    var body = el("div", { class: "body" });
    body.appendChild(renderItems(day.items));
    det.appendChild(body);
    return det;
  }

  /* ---------- map ---------- */

  function collectSpots(days) {
    var out = [];
    days.forEach(function (day) {
      day.items.forEach(function (it) {
        if (it.type === "spots") {
          it.items.forEach(function (spot) {
            if (spot.lat != null && spot.lon != null) out.push(spot);
          });
        }
      });
    });
    return out;
  }

  function collectLandmarks(city) {
    var out = [];
    if (city.stay && city.stay.lat != null && city.stay.lon != null) {
      out.push({
        lat: city.stay.lat,
        lon: city.stay.lon,
        titleHtml: esc(city.stay.t),
        category: "hotel",
        kind: "Hospedagem",
      });
    }
    (city.hubs || []).forEach(function (h) {
      if (h.lat != null && h.lon != null) {
        out.push({
          lat: h.lat,
          lon: h.lon,
          titleHtml: h.titleHtml,
          category: "hub",
          kind: h.kind,
        });
      }
    });
    return out;
  }

  function glyphFor(s) {
    if (s.category === "hotel") return "&#127976;";
    if (s.category === "hub") return s.kind === "Aeroporto" ? "&#9992;" : "&#128646;";
    return null;
  }

  function buildMap(containerId, spots) {
    if (!spots.length || typeof L === "undefined") return;
    var map = L.map(containerId, { scrollWheelZoom: false });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      maxZoom: 20,
      subdomains: "abcd",
      attribution: '&copy; OpenStreetMap contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
    }).addTo(map);

    var bounds = [];
    spots.forEach(function (s) {
      var cat = catClass(s);
      var glyph = glyphFor(s);
      var marker = L.marker([s.lat, s.lon], { icon: pinIcon(cat, glyph) }).addTo(map);
      var pop = el("div", { class: "map-pop" });
      if (s.img) pop.appendChild(el("img", { src: s.img, alt: "" }));
      pop.appendChild(el("span", { class: "time" }, esc(s.kind || s.time || "")));
      pop.appendChild(el("span", { class: "name" }, s.titleHtml || ""));
      var url = gmapsUrl(s);
      if (url) pop.appendChild(el("a", { class: "gmaps", href: url, target: "_blank", rel: "noopener" }, "abrir no Google Maps &#8599;"));
      marker.bindPopup(pop);
      bounds.push([s.lat, s.lon]);
    });
    if (bounds.length === 1) {
      map.setView(bounds[0], 14);
    } else {
      map.fitBounds(bounds, { padding: [28, 28] });
    }
    map.on("focus", function () { map.scrollWheelZoom.enable(); });
    map.on("blur", function () { map.scrollWheelZoom.disable(); });
  }

  /* ---------- city section ---------- */

  function renderCity(city) {
    var sec = el("section", { class: "city", id: city.id });

    var spread = el("div", { class: "city-spread" });
    var imgCol = el("div", { class: "img-col" });
    imgCol.appendChild(el("img", { src: city.coverImg, alt: city.coverAlt, loading: "lazy" }));
    spread.appendChild(imgCol);

    var textCol = el("div", { class: "text-col" });
    textCol.appendChild(el("span", { class: "kicker" }, esc(city.kicker)));
    textCol.appendChild(el("h3", null, esc(city.name)));
    textCol.appendChild(el("div", { class: "dates" }, esc(city.dates)));
    if (city.stay) {
      var stay = el("div", { class: "stay" });
      stay.appendChild(el("span", { class: "lbl" }, "Hospedagem"));
      stay.appendChild(el("div", { class: "t" }, esc(city.stay.t)));
      stay.appendChild(el("div", { class: "m" }, city.stay.m_html));
      if (city.stay.doc) {
        stay.appendChild(
          el("a", { class: "doc", href: city.stay.doc.href, target: "_blank", rel: "noopener" }, esc(city.stay.doc.label))
        );
      }
      textCol.appendChild(stay);
    }
    spread.appendChild(textCol);
    sec.appendChild(spread);

    var wrap = el("div", { class: "wrap" });

    (city.preItems || []).forEach(function (n) {
      wrap.appendChild(blockNote(n));
    });

    var spots = collectSpots(city.days).concat(collectLandmarks(city));
    if (spots.length) {
      var mapId = "map-" + city.id;
      var mapWrap = el("div", { class: "city-map-wrap" });
      var legend = el(
        "div",
        { class: "map-legend" },
        '<span><i class="dot-meal"></i>refeição</span><span><i class="dot-activity"></i>atividade</span><span><i class="dot-plain"></i>ponto turístico</span><span class="glyph">&#127976;hospedagem</span><span class="glyph">&#9992;&#65039;aeroporto / estação</span>'
      );
      mapWrap.appendChild(legend);
      mapWrap.appendChild(el("div", { class: "city-map", id: mapId, tabindex: "0" }));
      wrap.appendChild(mapWrap);
      requestAnimationFrame(function () {
        buildMap(mapId, spots);
      });
    }

    city.days.forEach(function (day) {
      wrap.appendChild(renderDay(day));
    });

    sec.appendChild(wrap);
    return sec;
  }

  /* ---------- mini sections (ida / volta) ---------- */

  function renderMiniSection(data, id) {
    var sec = el("section", { id: id, class: "mini-section" });
    var head = el("div", { class: "section-head" });
    head.appendChild(el("span", { class: "kicker" }, esc(data.label)));
    head.appendChild(el("h2", null, esc(data.title)));
    head.appendChild(el("p", null, esc(data.subtitle)));
    sec.appendChild(head);
    data.days.forEach(function (day) {
      sec.appendChild(renderDay(day));
    });
    return sec;
  }

  /* ---------- antes ---------- */

  function slugify(s) {
    return String(s)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  var CHECK_PREFIX = "espanha2026:antes:";
  var CUSTOM_KEY = CHECK_PREFIX + "custom";
  var REMOVED_KEY = CHECK_PREFIX + "removed";

  function isChecked(id) {
    try {
      return localStorage.getItem(CHECK_PREFIX + id) === "1";
    } catch (e) {
      return false;
    }
  }

  function setChecked(id, val) {
    try {
      if (val) localStorage.setItem(CHECK_PREFIX + id, "1");
      else localStorage.removeItem(CHECK_PREFIX + id);
    } catch (e) {
      /* localStorage unavailable (private mode etc.); state just won't persist */
    }
  }

  function lsGetJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function lsSetJSON(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      /* localStorage unavailable; state just won't persist */
    }
  }

  function renderAntes(seedItems) {
    var sec = el("section", { id: "antes" });
    var head = el("div", { class: "section-head" });
    head.appendChild(el("span", { class: "kicker" }, "Preparativos"));
    head.appendChild(el("h2", null, "Antes de embarcar"));
    var progress = el("p", { id: "antesProgress" }, "");
    head.appendChild(progress);
    sec.appendChild(head);

    var openList = el("ul", { class: "check" });
    var doneSummary = el("summary", null, "");
    var doneList = el("ul", { class: "check check-donelist" });
    var doneDetails = el("details", { class: "check-done" });
    doneDetails.appendChild(doneSummary);
    doneDetails.appendChild(doneList);

    var addForm = el("form", { class: "check-add" });
    var addInput = el("input", {
      type: "text",
      placeholder: "Adicionar um item...",
      "aria-label": "Adicionar item ao checklist",
    });
    var addBtn = el("button", { type: "submit" }, "Adicionar");
    addForm.appendChild(addInput);
    addForm.appendChild(addBtn);

    sec.appendChild(openList);
    sec.appendChild(doneDetails);
    sec.appendChild(addForm);

    function loadItems() {
      var removed = lsGetJSON(REMOVED_KEY, []);
      var custom = lsGetJSON(CUSTOM_KEY, []);
      var seed = seedItems
        .map(function (it) {
          return { id: slugify(it.title), title: it.title, small_html: it.small_html, docs: it.docs };
        })
        .filter(function (it) {
          return removed.indexOf(it.id) === -1;
        });
      var extra = custom.filter(function (it) {
        return removed.indexOf(it.id) === -1;
      });
      return seed.concat(extra);
    }

    function removeItem(id) {
      var removed = lsGetJSON(REMOVED_KEY, []);
      if (removed.indexOf(id) === -1) removed.push(id);
      lsSetJSON(REMOVED_KEY, removed);
      var custom = lsGetJSON(CUSTOM_KEY, []);
      lsSetJSON(CUSTOM_KEY, custom.filter(function (c) { return c.id !== id; }));
      setChecked(id, false);
      draw();
    }

    function addItem(title) {
      title = title.trim();
      if (!title) return;
      var custom = lsGetJSON(CUSTOM_KEY, []);
      var id = "custom-" + Date.now().toString(36) + "-" + slugify(title).slice(0, 30);
      custom.push({ id: id, title: title });
      lsSetJSON(CUSTOM_KEY, custom);
      draw();
    }

    function itemRow(it) {
      var checked = isChecked(it.id);
      var li = el("li", { class: checked ? "done" : "" });
      var label = el("label");
      var input = el("input", { type: "checkbox" });
      if (checked) input.checked = true;
      input.addEventListener("change", function () {
        setChecked(it.id, input.checked);
        draw();
      });
      label.appendChild(input);
      var right = el("div");
      right.appendChild(el("b", null, esc(it.title)));
      if (it.small_html) right.appendChild(el("small", null, it.small_html));
      if (it.docs && it.docs.length) right.appendChild(blockDocs(it.docs));
      label.appendChild(right);
      li.appendChild(label);
      var rm = el("button", { type: "button", class: "check-remove", "aria-label": "Remover “" + it.title + "”" }, "&times;");
      rm.addEventListener("click", function () {
        removeItem(it.id);
      });
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
      progress.textContent = total === 0
        ? "Nenhum item ainda — adicione um abaixo"
        : total - open.length === total
        ? "Tudo pronto — " + total + " de " + total + " concluídos"
        : total - open.length + " de " + total + " concluídos";
    }

    addForm.addEventListener("submit", function (e) {
      e.preventDefault();
      addItem(addInput.value);
      addInput.value = "";
      addInput.focus();
    });

    draw();
    return sec;
  }

  /* ---------- reservas ---------- */

  function renderReservas(data) {
    var sec = el("section", { id: "reservas" });
    var head = el("div", { class: "section-head" });
    head.appendChild(el("span", { class: "kicker" }, "Documentos"));
    head.appendChild(el("h2", null, "Todas as reservas"));
    head.appendChild(el("p", null, "Toque em qualquer linha para abrir o comprovante"));
    sec.appendChild(head);
    sec.appendChild(blockNote({ kind: "plain", heading: "Sobre esta página pública", bodyHtml: data.note_html.replace(/^<span class="h">.*?<\/span>/, "") }));

    var scroll = el("div", { class: "scroll" });
    var table = el("table");
    table.appendChild(
      el("tr", null, "<th>Data</th><th>Trecho ou estadia</th><th>Código</th><th>Arquivo</th>")
    );
    data.rows.forEach(function (r) {
      table.appendChild(
        el(
          "tr",
          null,
          "<td>" + esc(r.data) + "</td><td>" + esc(r.trecho) + '</td><td class="mono">' + esc(r.codigo) + "</td><td>" + r.arquivo_html + "</td>"
        )
      );
    });
    scroll.appendChild(table);
    sec.appendChild(scroll);

    sec.appendChild(el("h2", { style: "margin-top:48px" }, "Contatos"));
    var contact = el("div", { class: "contact" });
    var ctable = el("table");
    data.contacts.forEach(function (c) {
      ctable.appendChild(el("tr", null, "<td>" + esc(c.label) + "</td><td>" + c.value_html + "</td>"));
    });
    contact.appendChild(ctable);
    sec.appendChild(contact);
    return sec;
  }

  /* ---------- assemble ---------- */

  function main() {
    var data = window.ITINERARY;
    var main = document.getElementById("app");

    if (data.antes) {
      var antesWrap = el("div", { class: "wrap" });
      antesWrap.appendChild(renderAntes(data.antes));
      main.appendChild(antesWrap);
    }
    main.appendChild(el("div", { class: "wrap" }, '<div class="divider"><span class="mark"></span></div>'));

    if (data.ida) {
      var idaWrap = el("div", { class: "wrap" });
      idaWrap.appendChild(renderMiniSection(data.ida, "ida"));
      main.appendChild(idaWrap);
      main.appendChild(el("div", { class: "wrap" }, '<div class="divider"><span class="mark"></span></div>'));
    }

    data.cities.forEach(function (city, i) {
      main.appendChild(renderCity(city));
      main.appendChild(el("div", { class: "wrap" }, '<div class="divider"><span class="mark"></span></div>'));
    });

    if (data.volta) {
      var voltaWrap = el("div", { class: "wrap" });
      voltaWrap.appendChild(renderMiniSection(data.volta, "volta"));
      main.appendChild(voltaWrap);
      main.appendChild(el("div", { class: "wrap" }, '<div class="divider"><span class="mark"></span></div>'));
    }

    if (data.reservas) {
      var resWrap = el("div", { class: "wrap" });
      resWrap.appendChild(renderReservas(data.reservas));
      main.appendChild(resWrap);
    }

    try {
      initScrollspy();
    } catch (e) {
      /* scrollspy is progressive enhancement; ignore failures */
    }
    try {
      initCountdown();
    } catch (e) {
      /* non-critical */
    }
    try {
      initMobileNav();
    } catch (e) {
      /* non-critical */
    }
  }

  /* ---------- mobile nav ---------- */

  function initMobileNav() {
    var toggle = document.getElementById("navToggle");
    var nav = document.getElementById("site-nav");
    if (!toggle || !nav) return;

    function closeNav() {
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    }
    function openNav() {
      nav.classList.add("open");
      toggle.setAttribute("aria-expanded", "true");
    }

    toggle.addEventListener("click", function () {
      if (nav.classList.contains("open")) closeNav();
      else openNav();
    });
    nav.addEventListener("click", function (e) {
      if (e.target.tagName === "A") closeNav();
    });
    document.addEventListener("click", function (e) {
      if (!nav.classList.contains("open")) return;
      if (nav.contains(e.target) || toggle.contains(e.target)) return;
      closeNav();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeNav();
    });
    window.addEventListener("resize", function () {
      if (window.innerWidth >= 759) closeNav();
    });
  }

  /* ---------- scrollspy ---------- */

  function initScrollspy() {
    if (typeof IntersectionObserver === "undefined") return;
    var links = Array.prototype.slice.call(document.querySelectorAll(".site-nav a"));
    var sections = links
      .map(function (a) {
        return document.getElementById(a.getAttribute("href").slice(1));
      })
      .filter(Boolean);
    if (!sections.length) return;
    var byId = {};
    links.forEach(function (a) {
      byId[a.getAttribute("href").slice(1)] = a;
    });
    var obs = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            links.forEach(function (a) {
              a.classList.remove("active");
            });
            var link = byId[e.target.id];
            if (link) link.classList.add("active");
          }
        });
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: 0 }
    );
    sections.forEach(function (s) {
      obs.observe(s);
    });
  }

  /* ---------- countdown ---------- */

  function initCountdown() {
    var alvo = new Date(2026, 7, 25);
    var volta = new Date(2026, 8, 9);
    var hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    var dias = Math.round((alvo - hoje) / 86400000);
    var el2 = document.getElementById("cd");
    if (!el2) return;
    var txt;
    if (dias > 1) txt = "Faltam " + dias + " dias";
    else if (dias === 1) txt = "É amanhã";
    else if (dias === 0) txt = "É hoje!";
    else if (hoje <= volta) txt = "Na Espanha agora";
    else txt = "España 2026";
    el2.textContent = txt;
  }

  document.addEventListener("DOMContentLoaded", main);
})();
