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
    if (item.lat != null && item.lon != null) {
      return "https://www.google.com/maps/search/?api=1&query=" + item.lat + "," + item.lon;
    }
    if (item.mapsQuery) {
      return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(item.mapsQuery);
    }
    return null;
  }

  function catClass(item) {
    return item.category === "meal" ? "meal" : item.category === "activity" ? "activity" : "plain";
  }

  function pinIcon(cat) {
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

  function buildMap(containerId, spots) {
    if (!spots.length || typeof L === "undefined") return;
    var map = L.map(containerId, { scrollWheelZoom: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);

    var bounds = [];
    spots.forEach(function (s) {
      var cat = catClass(s);
      var marker = L.marker([s.lat, s.lon], { icon: pinIcon(cat) }).addTo(map);
      var pop = el("div", { class: "map-pop" });
      if (s.img) pop.appendChild(el("img", { src: s.img, alt: "" }));
      pop.appendChild(el("span", { class: "time" }, esc(s.time || "")));
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

    var spots = collectSpots(city.days);
    if (spots.length) {
      var mapId = "map-" + city.id;
      var mapWrap = el("div", { class: "city-map-wrap" });
      var legend = el(
        "div",
        { class: "map-legend" },
        '<span><i class="dot-meal"></i>refeição</span><span><i class="dot-activity"></i>atividade</span><span><i class="dot-plain"></i>ponto turístico</span>'
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

  function renderAntes(items) {
    var sec = el("section", { id: "antes" });
    var head = el("div", { class: "section-head" });
    head.appendChild(el("span", { class: "kicker" }, "Preparativos"));
    head.appendChild(el("h2", null, "Antes de embarcar"));
    head.appendChild(el("p", null, "O que ainda precisa ser resolvido"));
    sec.appendChild(head);
    var ul = el("ul", { class: "check" });
    items.forEach(function (it) {
      var li = el("li");
      var right = el("div");
      right.appendChild(el("b", null, esc(it.title)));
      right.appendChild(el("small", null, it.small_html));
      if (it.docs && it.docs.length) right.appendChild(blockDocs(it.docs));
      li.appendChild(right);
      ul.appendChild(li);
    });
    sec.appendChild(ul);
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

    if (data.antes) main.appendChild(renderAntes(data.antes));
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
