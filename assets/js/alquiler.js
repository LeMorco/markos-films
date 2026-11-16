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
  function findItem(id) {
    return R.material.filter(function (m) { return m.id === id; })[0];
  }
  /* unidades disponibles: null o 0 = sin límite publicado (a consultar) */
  function stockOf(id) {
    var m = findItem(id);
    return (m && typeof m.unidades === "number" && m.unidades > 0) ? m.unidades : Infinity;
  }
  function clampQty(id, qty) {
    return Math.min(stockOf(id), Math.max(0, qty));
  }
  /* la cesta nunca guarda más unidades de las que hay */
  function normalizar(items) {
    return items.map(function (i) {
      return { id: i.id, qty: clampQty(i.id, i.qty || 0) };
    }).filter(function (i) { return i.qty > 0; });
  }
  function read() {
    var items;
    try { items = JSON.parse(localStorage.getItem(CART_KEY) || "[]"); } catch (e) { items = []; }
    if (!Array.isArray(items)) items = [];
    var norm = normalizar(items);
    if (JSON.stringify(norm) !== JSON.stringify(items)) {
      try { localStorage.setItem(CART_KEY, JSON.stringify(norm)); } catch (e) {}
    }
    return norm;
  }
  function write(items) {
    var norm = normalizar(items);
    localStorage.setItem(CART_KEY, JSON.stringify(norm));
    paint();
    if (window.MARKOS_CART) window.MARKOS_CART.paint();
  }
  /* devuelve false si ya se había alcanzado el máximo disponible */
  function add(id) {
    var items = read();
    var max = stockOf(id);
    var cur = items.filter(function (i) { return i.id === id; })[0];
    var qty = cur ? cur.qty : 0;
    if (qty >= max) return false;
    if (cur) cur.qty += 1;
    else items.push({ id: id, qty: 1 });
    write(items);
    return true;
  }
  function setQty(id, delta) {
    var items = read();
    items.forEach(function (i) {
      if (i.id === id) i.qty = clampQty(id, i.qty + delta);
    });
    write(items);
  }
  function removeItem(id) {
    write(read().filter(function (i) { return i.id !== id; }));
  }
  function totalUnits() {
    return read().reduce(function (a, i) { return a + i.qty; }, 0);
  }

  /* ---------------- render catálogo ---------------- */
  function gearCard(m, idx) {
    var cat = (R.categorias.filter(function (c) { return c.id === m.categoria; })[0] || {}).nombre || "";
    var spec = m.notas || "Ficha pendiente";

    var img = m.foto
      ? '<img src="' + m.foto + '" alt="' + String(m.nombre).replace(/"/g, "&quot;") + '" loading="lazy">'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6.6 6.6 5.2 5.2M18.8 18.8l-1.4-1.4M6.6 17.4l-1.4 1.4M18.8 5.2l-1.4 1.4"/><circle cx="12" cy="12" r="4"/></svg>';

    return '<article class="gear">' +
      '<div class="gear-img" data-info="' + m.id + '" role="button" tabindex="0">' + img +
        '<span class="gear-num">' + m.codigo + "</span>" +
      "</div>" +
      '<div class="gear-body">' +
        '<span class="gear-cat">' + cat.replace(/</g, "&lt;") + "</span>" +
        '<h3 class="gear-name">' + String(m.nombre).replace(/</g, "&lt;") + "</h3>" +
        '<p class="gear-spec">' + spec.replace(/</g, "&lt;") + "</p>" +
        '<div class="gear-foot">' +
          '<button class="gear-add" type="button" data-add="' + m.id + '">Añadir</button>' +
          (m.unidades ? '<span class="gear-stock">' + m.unidades + " ud.</span>" : "") +
        "</div>" +
      "</div></article>";
  }

  function render() {
    var q = state.q.trim().toLowerCase();
    var list = R.material.filter(function (m) {
      var okCat = state.cat === "todos" || m.categoria === state.cat;
      var okQ = !q || (m.nombre + " " + m.codigo + " " + m.notas).toLowerCase().indexOf(q) > -1;
      return okCat && okQ;
    });
    grid.innerHTML = list.map(gearCard).join("") ||
      '<p class="rent-empty">No hay material que coincida con la búsqueda.</p>';
    if (countEl) countEl.textContent = list.length;
    paintChips();
    pintarBotones();
  }

  /* estado de cada botón "Añadir" según lo que ya hay en la cesta y el
     stock real: al llegar al máximo se deshabilita */
  function pintarBotones() {
    var items = read();
    var mapa = {};
    items.forEach(function (i) { mapa[i.id] = i.qty; });
    grid.querySelectorAll("[data-add]").forEach(function (b) {
      var id = b.dataset.add;
      var q = mapa[id] || 0;
      var max = stockOf(id);
      var lleno = q >= max;
      b.classList.toggle("added", q > 0);
      b.classList.toggle("is-max", lleno);
      b.disabled = lleno;
      if (lleno) {
        b.textContent = max === 1 ? "Añadido ✓" : "Máximo (" + max + ")";
        b.setAttribute("title", max === 1
          ? "Solo hay una unidad y ya está en la solicitud"
          : "Ya tienes las " + max + " unidades disponibles");
      } else {
        b.textContent = q > 0 ? "Añadir ✓" : "Añadir";
        b.removeAttribute("title");
      }
    });
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
      if (!add(a.dataset.add)) return;   // ya está al máximo
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
    pintarBotones();
    if (!itemsEl) return;
    if (!items.length) {
      itemsEl.innerHTML = '<p class="cart-empty">Todavía no has seleccionado material.<br>Añade equipos del catálogo y podrás enviar la solicitud de presupuesto con todo incluido.</p>';
      return;
    }
    itemsEl.innerHTML = items.map(function (i) {
      var m = findItem(i.id) || { nombre: i.id };
      var max = stockOf(i.id);
      var tope = i.qty >= max;
      var miniatura = m.foto
        ? '<img src="' + m.foto + '" alt="" loading="lazy" decoding="async">'
        : '<span class="cart-item-sincodigo">' + (m.codigo || "") + "</span>";
      return '<div class="cart-item">' +
        '<div class="cart-item-thumb">' + miniatura + "</div>" +
        '<div class="cart-item-info">' +
          "<strong>" + String(m.nombre).replace(/</g, "&lt;") + "</strong>" +
          "<span>" + (m.codigo || "") +
            (isFinite(max) ? " · máx. " + max : "") + "</span>" +
          '<div class="qty">' +
            '<button data-dec="' + i.id + '" aria-label="Quitar una unidad">−</button>' +
            "<b>" + i.qty + "</b>" +
            '<button data-inc="' + i.id + '" aria-label="Añadir una unidad"' +
              (tope ? ' disabled aria-disabled="true" title="No hay más unidades disponibles"' : "") + ">+</button>" +
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
    var max = stockOf(id);
    var enCesta = read().filter(function (i) { return i.id === id; })[0];
    var qty = enCesta ? enCesta.qty : 0;
    var tope = qty >= max;
    document.getElementById("info-box").innerHTML =
      '<p class="m-cat">' + cat + " · " + m.codigo + "</p>" +
      "<h3>" + String(m.nombre).replace(/</g, "&lt;") + "</h3>" +
      (m.foto ? '<img src="' + m.foto + '" alt="" style="width:100%;margin-top:1.2rem;border:0.5px solid var(--faint)">' : "") +
      "<dl>" +
        "<div><dt>Qué incluye</dt><dd>" + pend(m.notas) + "</dd></div>" +
        "<div><dt>Unidades disponibles</dt><dd>" + pend(m.unidades) + "</dd></div>" +
        "<div><dt>En tu solicitud</dt><dd>" + qty + (isFinite(max) ? " de " + max : "") + "</dd></div>" +
        "<div><dt>Código</dt><dd>" + m.codigo + "</dd></div>" +
      "</dl>" +
      '<div class="modal-actions">' +
        '<button class="btn btn-primary btn-sm" id="info-add"' +
          (tope ? ' disabled aria-disabled="true"' : "") + ">" +
          (tope ? (max === 1 ? "Ya está en la solicitud" : "Máximo alcanzado (" + max + ")") : "Añadir a la solicitud") +
        "</button>" +
        '<button class="btn btn-sm" data-info-close>Cerrar</button>' +
      "</div>";
    info.classList.add("open");
    var btn = document.getElementById("info-add");
    if (btn && !tope) btn.addEventListener("click", function () {
      if (!add(id)) return;
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
      lines.push("  · " + i.qty + " × " + m.nombre + (m.codigo ? " [" + m.codigo + "]" : ""));
    });
    if (!items.length) lines.push("  (sin material seleccionado)");
    if (f.notas) { lines.push(""); lines.push("Notas: " + f.notas); }
    lines.push("");
    lines.push("Enviado desde la web de " + (D.nombre || "Marcos Donate"));
    return { subject: "Solicitud de alquiler — " + (f.nombre || "nuevo contacto"), body: lines.join("\n"), data: f };
  }

  if (form) {
    var submitBtn = form.querySelector('button[type="submit"]');

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!read().length) {
        status.textContent = "Añade al menos un equipo del catálogo.";
        return;
      }

      var msg = buildMessage();
      var material = read().map(function (i) {
        var m = findItem(i.id) || {};
        return { codigo: m.codigo || "", nombre: m.nombre || i.id, cantidad: i.qty };
      });

      if (!D.formEndpoint) {
        window.location.href = "mailto:" + (D.email || "") +
          "?subject=" + encodeURIComponent(msg.subject) +
          "&body=" + encodeURIComponent(msg.body);
        status.textContent = "Se ha abierto tu cliente de correo con la solicitud preparada.";
        return;
      }

      status.className = "form-status";
      status.textContent = "Enviando la solicitud…";
      if (submitBtn) { submitBtn.disabled = true; submitBtn.style.opacity = "0.65"; }

      fetch(D.formEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          nombre: msg.data.nombre,
          email: msg.data.email,
          desde: msg.data.desde,
          hasta: msg.data.hasta,
          proyecto: msg.data.proyecto,
          notas: msg.data.notas,
          material: material,
          empresa: document.getElementById("cf-empresa") ? document.getElementById("cf-empresa").value : ""
        })
      })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (data) {
            return { ok: r.ok && data.ok !== false, error: data.error };
          });
        })
        .then(function (res) {
          if (!res.ok) throw new Error(res.error || "No se ha podido enviar la solicitud.");
          status.textContent = "Solicitud enviada. Recibirás el presupuesto por correo en breve.";
          write([]);
          form.reset();
        })
        .catch(function (err) {
          status.className = "form-status is-error";
          status.textContent = (err && err.message ? err.message : "No se ha podido enviar la solicitud.") +
            " También puedes copiar el resumen y enviarlo por tu cuenta.";
        })
        .then(function () {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = ""; }
        });
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
