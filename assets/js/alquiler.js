/* ============================================================
   MARCOS DONATE — Catálogo de alquiler + solicitud de presupuesto
   ============================================================ */
(function () {
  "use strict";

  var R = window.RENTAL || { categorias: [], material: [] };
  var D = window.MARKOS || {};
  var CART_KEY = "markos_cart_v1";

  var grid = document.getElementById("rent-grid");
  if (!grid) return;

  var catsEl = document.getElementById("rent-cats");
  var chipsEl = document.getElementById("rent-chips");
  var searchEl = document.getElementById("rent-search");
  var countEl = document.getElementById("rent-count");

  var state = { cat: "todos", q: "" };

  /* ---------------- cesta ---------------- */
  function read() {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); } catch (e) { return []; }
  }
  function write(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    paint();
    if (window.MARKOS_CART) window.MARKOS_CART.paint();
  }
  function findItem(id) {
    return R.material.filter(function (m) { return m.id === id; })[0];
  }
  function add(id) {
    var items = read();
    var cur = items.filter(function (i) { return i.id === id; })[0];
    if (cur) cur.qty += 1;
    else items.push({ id: id, qty: 1 });
    write(items);
  }
  function setQty(id, delta) {
    var items = read();
    items.forEach(function (i) {
      if (i.id === id) i.qty = Math.max(0, i.qty + delta);
    });
    write(items.filter(function (i) { return i.qty > 0; }));
  }
  function removeItem(id) {
    write(read().filter(function (i) { return i.id !== id; }));
  }
  function totalUnits() {
    return read().reduce(function (a, i) { return a + i.qty; }, 0);
  }

  /* ---------------- render catálogo ---------------- */
  function gearCard(m, idx) {
    var inCart = read().some(function (i) { return i.id === m.id; });
    var cat = (R.categorias.filter(function (c) { return c.id === m.categoria; })[0] || {}).nombre || "";
    var spec = m.marca || m.modelo
      ? [m.marca, m.modelo].filter(Boolean).join(" · ")
      : "Marca y modelo por confirmar";

    return '<article class="gear">' +
      '<div class="gear-img">' +
        '<span class="gear-num">' + String(idx + 1).padStart(2, "0") + "</span>" +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6.6 6.6 5.2 5.2M18.8 18.8l-1.4-1.4M6.6 17.4l-1.4 1.4M18.8 5.2l-1.4 1.4"/><circle cx="12" cy="12" r="4"/></svg>' +
      "</div>" +
      '<div class="gear-body">' +
        '<span class="gear-cat">' + cat.replace(/</g, "&lt;") + "</span>" +
        '<h3 class="gear-name">' + m.nombre.replace(/</g, "&lt;") + "</h3>" +
        '<p class="gear-spec' + (m.marca || m.modelo ? "" : " pending") + '">' + spec + "</p>" +
        '<div class="gear-foot">' +
          '<button class="gear-add' + (inCart ? " added" : "") + '" data-add="' + m.id + '">' +
            (inCart ? "Añadido ✓" : "Añadir") + "</button>" +
          '<button class="gear-detail" data-info="' + m.id + '">Ficha</button>' +
        "</div>" +
      "</div></article>";
  }

  function render() {
    var q = state.q.trim().toLowerCase();
    var list = R.material.filter(function (m) {
      var okCat = state.cat === "todos" || m.categoria === state.cat;
      var okQ = !q || (m.nombre + " " + m.marca + " " + m.modelo + " " + m.incluye).toLowerCase().indexOf(q) > -1;
      return okCat && okQ;
    });
    grid.innerHTML = list.map(gearCard).join("") ||
      '<p class="rent-empty">No hay material que coincida con la búsqueda.</p>';
    if (countEl) countEl.textContent = list.length;
    paintChips();
  }

  function paintChips() {
    if (!chipsEl) return;
    chipsEl.querySelectorAll(".chip").forEach(function (c) {
      c.classList.toggle("active", c.dataset.cat === state.cat);
    });
    if (catsEl) {
      catsEl.querySelectorAll("button").forEach(function (b) {
        b.classList.toggle("active", b.dataset.cat === state.cat);
      });
    }
  }

  /* filtros: chips (móvil) y lista lateral */
  var catsList = [{ id: "todos", nombre: "Todo el material" }].concat(R.categorias);
  if (chipsEl) {
    chipsEl.innerHTML = catsList.map(function (c) {
      return '<button class="chip' + (c.id === "todos" ? " active" : "") + '" data-cat="' + c.id + '">' + c.nombre + "</button>";
    }).join("");
  }
  if (catsEl) {
    catsEl.innerHTML = catsList.map(function (c) {
      var n = c.id === "todos" ? R.material.length
        : R.material.filter(function (m) { return m.categoria === c.id; }).length;
      return '<button data-cat="' + c.id + '"' + (c.id === "todos" ? ' class="active"' : "") + ">" +
        c.nombre + '<span class="n">' + n + "</span></button>";
    }).join("");
  }
  document.addEventListener("click", function (e) {
    var c = e.target.closest("[data-cat]");
    if (c) { state.cat = c.dataset.cat; render(); }
  });
  if (searchEl) {
    searchEl.addEventListener("input", function () { state.q = searchEl.value; render(); });
  }

  /* ---------------- añadir desde el catálogo ---------------- */
  grid.addEventListener("click", function (e) {
    var a = e.target.closest("[data-add]");
    if (a) {
      add(a.dataset.add);
      a.classList.add("added");
      a.textContent = "Añadido ✓";
      openCart(true);
      return;
    }
    var i = e.target.closest("[data-info]");
    if (i) showInfo(i.dataset.info);
  });

  /* ---------------- panel de cesta ---------------- */
  var panel = document.getElementById("cart-panel");
  var backdrop = document.getElementById("cart-backdrop");
  var itemsEl = document.getElementById("cart-items");
  var badge = document.getElementById("cart-badge");

  function openCart(focusMail) {
    panel.classList.add("open");
    backdrop.classList.add("open");
    document.body.style.overflow = "hidden";
    if (focusMail) setTimeout(function () {
      var t = document.getElementById("cf-nombre");
      if (t) t.focus();
    }, 420);
  }
  function closeCart() {
    panel.classList.remove("open");
    backdrop.classList.remove("open");
    document.body.style.overflow = "";
  }
  document.querySelectorAll("[data-cart-open]").forEach(function (b) {
    b.addEventListener("click", function () { openCart(false); });
  });
  document.querySelectorAll("[data-cart-close]").forEach(function (b) {
    b.addEventListener("click", closeCart);
  });
  if (backdrop) backdrop.addEventListener("click", closeCart);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { closeCart(); closeInfo(); }
  });

  function paint() {
    var items = read();
    if (badge) {
      badge.textContent = items.length;
      badge.dataset.empty = items.length === 0 ? "true" : "false";
    }
    if (!itemsEl) return;
    if (!items.length) {
      itemsEl.innerHTML = '<p class="cart-empty">Todavía no has seleccionado material.<br>Añade equipos del catálogo y podrás enviar la solicitud de presupuesto con todo incluido.</p>';
      return;
    }
    itemsEl.innerHTML = items.map(function (i) {
      var m = findItem(i.id) || { nombre: i.id };
      return '<div class="cart-item">' +
        '<div class="cart-item-info">' +
          "<strong>" + String(m.nombre).replace(/</g, "&lt;") + "</strong>" +
          "<span>" + (m.marca || "Marca por confirmar") + "</span>" +
          '<div class="qty">' +
            '<button data-dec="' + i.id + '" aria-label="Quitar una unidad">−</button>' +
            "<b>" + i.qty + "</b>" +
            '<button data-inc="' + i.id + '" aria-label="Añadir una unidad">+</button>' +
            '<button data-del="' + i.id + '" aria-label="Quitar del listado" style="margin-left:auto">✕</button>' +
          "</div>" +
        "</div></div>";
    }).join("");
  }

  if (itemsEl) {
    itemsEl.addEventListener("click", function (e) {
      var t = e.target;
      if (t.dataset.inc) setQty(t.dataset.inc, 1);
      if (t.dataset.dec) setQty(t.dataset.dec, -1);
      if (t.dataset.del) removeItem(t.dataset.del);
    });
  }

  /* ---------------- ficha de material ---------------- */
  var info = document.getElementById("info-modal");
  function showInfo(id) {
    var m = findItem(id);
    if (!m || !info) return;
    var cat = (R.categorias.filter(function (c) { return c.id === m.categoria; })[0] || {}).nombre || "";
    var pend = function (v) { return v ? String(v).replace(/</g, "&lt;") : '<span class="pending">Por confirmar</span>'; };
    document.getElementById("info-box").innerHTML =
      '<p class="m-cat">' + cat + "</p>" +
      "<h3>" + String(m.nombre).replace(/</g, "&lt;") + "</h3>" +
      "<dl>" +
        "<div><dt>Marca</dt><dd>" + pend(m.marca) + "</dd></div>" +
        "<div><dt>Modelo</dt><dd>" + pend(m.modelo) + "</dd></div>" +
        "<div><dt>Potencia</dt><dd>" + pend(m.potencia) + "</dd></div>" +
        "<div><dt>Qué incluye</dt><dd>" + pend(m.incluye) + "</dd></div>" +
        "<div><dt>Unidades disponibles</dt><dd>" + pend(m.unidades) + "</dd></div>" +
        (m.nota ? "<div><dt>Notas</dt><dd>" + String(m.nota).replace(/</g, "&lt;") + "</dd></div>" : "") +
      "</dl>" +
      '<div class="modal-actions">' +
        '<button class="btn btn-primary btn-sm" id="info-add">Añadir a la solicitud</button>' +
        '<button class="btn btn-sm" data-info-close>Cerrar</button>' +
      "</div>";
    info.classList.add("open");
    var btn = document.getElementById("info-add");
    if (btn) btn.addEventListener("click", function () {
      add(id);
      closeInfo();
      openCart(true);
    });
    info.querySelectorAll("[data-info-close]").forEach(function (b) {
      b.addEventListener("click", closeInfo);
    });
  }
  function closeInfo() { if (info) info.classList.remove("open"); }
  if (info) info.addEventListener("click", function (e) { if (e.target === info) closeInfo(); });

  /* ---------------- solicitud de presupuesto ---------------- */
  var form = document.getElementById("cart-form");
  var status = document.getElementById("form-status");

  function buildMessage() {
    var items = read();
    var f = {
      nombre: document.getElementById("cf-nombre").value.trim(),
      email: document.getElementById("cf-email").value.trim(),
      desde: document.getElementById("cf-desde").value,
      hasta: document.getElementById("cf-hasta").value,
      proyecto: document.getElementById("cf-proyecto").value.trim(),
      notas: document.getElementById("cf-notas").value.trim()
    };
    var lines = [];
    lines.push("Solicitud de alquiler de material");
    lines.push("--------------------------------");
    lines.push("Nombre: " + (f.nombre || "—"));
    lines.push("Email: " + (f.email || "—"));
    if (f.desde || f.hasta) lines.push("Fechas: " + (f.desde || "?") + " → " + (f.hasta || "?"));
    if (f.proyecto) lines.push("Proyecto: " + f.proyecto);
    lines.push("");
    lines.push("Material solicitado:");
    items.forEach(function (i) {
      var m = findItem(i.id) || { nombre: i.id };
      lines.push("  · " + i.qty + " × " + m.nombre + (m.marca ? " (" + m.marca + ")" : ""));
    });
    if (!items.length) lines.push("  (sin material seleccionado)");
    if (f.notas) { lines.push(""); lines.push("Notas: " + f.notas); }
    lines.push("");
    lines.push("Enviado desde la web de " + (D.nombre || "Marcos Donate"));
    return { subject: "Solicitud de alquiler — " + (f.nombre || "nuevo contacto"), body: lines.join("\n"), data: f };
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!read().length) {
        status.textContent = "Añade al menos un equipo del catálogo.";
        return;
      }
      var msg = buildMessage();
      status.textContent = "Preparando el correo…";

      if (D.formEndpoint) {
        fetch(D.formEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            nombre: msg.data.nombre, email: msg.data.email,
            desde: msg.data.desde, hasta: msg.data.hasta,
            proyecto: msg.data.proyecto, notas: msg.data.notas,
            material: read().map(function (i) {
              var m = findItem(i.id) || {};
              return i.qty + " x " + (m.nombre || i.id);
            }).join(", ")
          })
        }).then(function (r) {
          if (!r.ok) throw new Error("error");
          status.textContent = "Solicitud enviada. Te responderá en breve.";
          write([]);
        }).catch(function () {
          status.textContent = "No se pudo enviar automáticamente. Usa el botón de correo.";
        });
        return;
      }

      var url = "mailto:" + (D.email || "") +
        "?subject=" + encodeURIComponent(msg.subject) +
        "&body=" + encodeURIComponent(msg.body);
      window.location.href = url;
      status.textContent = "Se ha abierto tu cliente de correo con la solicitud preparada.";
    });
  }

  document.querySelectorAll("[data-copy]").forEach(function (b) {
    b.addEventListener("click", function () {
      var msg = buildMessage();
      var text = msg.subject + "\n\n" + msg.body;
      var done = function () { if (status) status.textContent = "Solicitud copiada al portapapeles."; };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () {});
      } else {
        var ta = document.createElement("textarea");
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); document.body.removeChild(ta); done();
      }
    });
  });

  paint();
  render();
})();
