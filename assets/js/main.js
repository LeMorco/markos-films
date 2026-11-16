/* ============================================================
   MARCOS DONATE — lógica común
   nav · menú móvil · reveal · grids · ficha de proyecto · relacionados
   ============================================================ */
(function () {
  "use strict";

  /* ---------------- nav ---------------- */
  var nav = document.querySelector("nav");
  var burger = document.querySelector(".burger");
  var links = document.querySelector(".nav-links");

  if (nav) {
    var onScroll = function () { nav.classList.toggle("solid", window.scrollY > 30); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }
  if (burger && links) {
    burger.addEventListener("click", function () {
      var open = links.classList.toggle("open");
      burger.classList.toggle("open", open);
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });
    links.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        links.classList.remove("open");
        burger.classList.remove("open");
      }
    });
  }

  /* ---------------- reveal ---------------- */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    });
  }, { threshold: 0.06 });
  document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });

  /* ---------------- helpers ---------------- */
  var D = window.MARKOS || {};
  var PROYECTOS = D.proyectos || [];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function tipoLabel(t) {
    var m = { videoclip: "Videoclip", cortometraje: "Cortometraje", spot: "Spot", documental: "Documental", ficcion: "Ficción" };
    return m[t] || t || "";
  }
  function artistaCorto(p) {
    return String(p.artista || "").split("·")[0].trim();
  }
  function thumb(p) {
    return p.youtube ? "https://i.ytimg.com/vi/" + p.youtube + "/maxresdefault.jpg" : "";
  }
  function cardHTML(p) {
    var t = thumb(p);
    var attrs = ' data-yt="' + (p.youtube || "") + '" data-slug="' + esc(p.slug) +
      '" data-start="' + (p.preview || 15) + '"';
    if (!t) {
      return '<a class="card no-img" href="proyecto.html?p=' + encodeURIComponent(p.slug) + '"' + attrs + '>' +
        '<div class="card-body">' +
          '<span class="card-type">' + esc(tipoLabel(p.tipo)) + "</span>" +
          '<span class="card-title">' + esc(p.titulo) + "</span>" +
          (p.artista ? '<span class="card-client">' + esc(artistaCorto(p)) + "</span>" : "") +
        "</div></a>";
    }
    var inner =
      '<div class="card-media">' +
        '<img src="' + t + '" alt="' + esc(p.titulo) + '" loading="lazy" onerror="this.onerror=null;this.src=\'https://i.ytimg.com/vi/' + p.youtube + '/hqdefault.jpg\'">' +
      "</div>" +
      '<div class="card-body">' +
        '<span class="card-type">' + esc(tipoLabel(p.tipo)) + "</span>" +
        '<span class="card-title">' + esc(p.titulo) + "</span>" +
        (p.artista ? '<span class="card-client">' + esc(artistaCorto(p)) + "</span>" : "") +
      "</div>";
    return '<a class="card" href="proyecto.html?p=' + encodeURIComponent(p.slug) + '"' + attrs + '>' + inner + "</a>";
  }

  /* ---------------- preview en vídeo al pasar el ratón ---------------- */
  var previewActivo = null;
  var puedePreview =
    window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
    window.innerWidth > 900 &&
    !(navigator.connection && navigator.connection.saveData) &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* si la pestaña vuelve al frente YouTube puede haber pausado el embed:
     se reanuda la preview activa para que no quede el icono de pausa */
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && previewActivo && previewActivo.reanudar) previewActivo.reanudar();
  });

  function bindPreviews(root) {
    if (!puedePreview || !root) return;
    [].forEach.call(root.querySelectorAll(".card[data-yt]:not([data-preview])"), function (card) {
      var id = card.dataset.yt;
      if (!id) return;
      card.dataset.preview = "1";
      var inicio = parseInt(card.dataset.start, 10);
      if (isNaN(inicio) || inicio < 0) inicio = 15;
      var timer = null;
      var frame = null;
      var golpes = [];
      var oyente = null;

      /* control del reproductor por postMessage (YouTube IFrame API) */
      function mandar(func) {
        if (!frame) return;
        try {
          frame.contentWindow.postMessage(
            JSON.stringify({ event: "command", func: func, args: [] }), "*"
          );
        } catch (e) {}
      }

      /* YouTube pausa el embed en algunos casos (autoplay bloqueado,
         cambio de pestaña, sugerencia al final del clip). Al detectar la
         pausa se vuelve a arrancar: así nunca queda el icono de pausa. */
      function vigilar(win) {
        if (oyente) window.removeEventListener("message", oyente);
        oyente = function (e) {
          if (!frame || e.source !== win) return;
          var dato = e.data;
          if (typeof dato === "string") {
            try { dato = JSON.parse(dato); } catch (err) { return; }
          }
          if (!dato || dato.event !== "onStateChange") return;
          /* 0 = terminado, 2 = en pausa, 5 = cargado sin arrancar */
          if (dato.info === 0 || dato.info === 2 || dato.info === 5) mandar("playVideo");
        };
        window.addEventListener("message", oyente);
      }

      function cargar() {
        if (frame) return;
        /* una sola preview activa a la vez */
        if (previewActivo) previewActivo.cerrar();
        var origen = /^https?:$/.test(location.protocol) ? location.origin : "";
        frame = document.createElement("iframe");
        frame.className = "card-preview";
        frame.setAttribute("tabindex", "-1");
        frame.setAttribute("aria-hidden", "true");
        frame.setAttribute("title", "");
        frame.allow = "autoplay; encrypted-media; picture-in-picture";
        frame.src =
          "https://www.youtube-nocookie.com/embed/" + id +
          "?autoplay=1&mute=1&controls=0&loop=1&playlist=" + id +
          "&playsinline=1&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1" +
          "&fs=0&showinfo=0&cc_load_policy=0&autohide=1&enablejsapi=1" +
          "&start=" + inicio +
          (origen ? "&origin=" + encodeURIComponent(origen) : "");
        var win = null;
        frame.addEventListener("load", function () {
          if (!frame) return;
          win = frame.contentWindow;
          frame.classList.add("visible");
          vigilar(win);
          /* handshake de la IFrame API: sin esto el reproductor no envía
             onReady / onStateChange a la página */
          try {
            frame.contentWindow.postMessage(
              JSON.stringify({ event: "listening", id: id }), "*"
            );
          } catch (e) {}
          /* varios intentos: el reproductor tarda en estar listo y a veces
             ignora el primero (autoplay bloqueado o buffering) */
          mandar("mute");
          mandar("playVideo");
          golpes = [300, 900, 1800, 3200].map(function (ms) {
            return setTimeout(function () { mandar("playVideo"); }, ms);
          });
        });
        card.appendChild(frame);
        previewActivo = { card: card, cerrar: descargar, reanudar: function () { mandar("playVideo"); } };
      }

      function descargar() {
        clearTimeout(timer);
        golpes.forEach(clearTimeout);
        golpes = [];
        if (oyente) { window.removeEventListener("message", oyente); oyente = null; }
        if (previewActivo && previewActivo.card === card) previewActivo = null;
        if (!frame) return;
        var f = frame;
        frame = null;
        f.classList.remove("visible");
        setTimeout(function () {
          if (f.parentNode) f.parentNode.removeChild(f);
        }, 520);
      }

      card.addEventListener("mouseenter", function () {
        timer = setTimeout(cargar, 160);
      });
      card.addEventListener("mouseleave", descargar);
      card.addEventListener("focusout", descargar);
    });
  }

  /* ---------------- carrito: contador global ---------------- */
  var CART_KEY = "markos_cart_v1";
  function readCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); } catch (e) { return []; }
  }
  function paintCartCount() {
    var n = readCart().reduce(function (a, i) { return a + (i.qty || 1); }, 0);
    document.querySelectorAll("[data-cart-count]").forEach(function (el) {
      el.textContent = n;
      el.dataset.empty = n === 0 ? "true" : "false";
    });
  }
  window.MARKOS_CART = { read: readCart, paint: paintCartCount, key: CART_KEY };
  paintCartCount();
  window.addEventListener("storage", paintCartCount);

  /* ---------------- grid de proyectos ---------------- */
  var gridProy = document.getElementById("grid-proyectos");
  if (gridProy) {
    var barraFiltros = document.getElementById("filtros-proyectos");
    var inicial = (new URLSearchParams(location.search).get("tipo") || "todos").toLowerCase();
    var tipos = ["todos"].concat(PROYECTOS.map(function (p) { return p.tipo; })
      .filter(function (t, i, a) { return t && a.indexOf(t) === i; }));

    if (barraFiltros) {
      barraFiltros.innerHTML = tipos.map(function (t) {
        return '<button class="chip' + (t === inicial ? " active" : "") + '" data-tipo="' + t + '">' +
          (t === "todos" ? "Todos" : tipoLabel(t)) + "</button>";
      }).join("");
      barraFiltros.addEventListener("click", function (e) {
        var b = e.target.closest(".chip");
        if (!b) return;
        barraFiltros.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("active"); });
        b.classList.add("active");
        aplicar(b.dataset.tipo);
      });
    }

    function aplicar(tipo) {
      var lista = PROYECTOS.filter(function (p) { return tipo === "todos" || p.tipo === tipo; });
      gridProy.innerHTML = lista.map(cardHTML).join("") ||
        '<p class="rent-empty">No hay proyectos en esta categoría.</p>';
      gridProy.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
      bindPreviews(gridProy);
    }
    aplicar(inicial);
  }

  /* ---------------- destacados ---------------- */
  var destacados = document.getElementById("grid-destacados");
  if (destacados) { destacados.innerHTML = PROYECTOS.slice(0, 6).map(cardHTML).join(""); bindPreviews(destacados); }

  /* ---------------- ficha de proyecto ---------------- */
  var page = document.getElementById("proyecto-page");
  if (page) {
    var slug = new URLSearchParams(location.search).get("p");
    var p = PROYECTOS.filter(function (x) { return x.slug === slug; })[0];

    if (!p) {
      document.getElementById("proyecto-vacio").style.display = "block";
      page.style.display = "none";
    } else {
      document.title = p.titulo + " — " + (D.nombre || "Marcos Donate");

      var pend = function (v) {
        return v ? esc(v) : '<span class="pending">Por confirmar</span>';
      };

      document.getElementById("pj-titulo").innerHTML = esc(p.titulo);
      document.getElementById("pj-sub").innerHTML =
        esc(tipoLabel(p.tipo)) + (p.artista ? " · " + esc(artistaCorto(p)) : "");
      document.getElementById("pj-funcion").innerHTML = pend(p.rol);
      document.getElementById("pj-director").innerHTML = pend(p.director);
      document.getElementById("pj-productora").innerHTML = pend(p.productora || p.artista);
      document.getElementById("pj-anio").innerHTML = pend(p.year);
      document.getElementById("pj-tipo").innerHTML = esc(tipoLabel(p.tipo));

      var desc = document.getElementById("pj-desc");
      if (p.descripcion) {
        desc.textContent = p.descripcion;
      } else {
        desc.innerHTML = '<span class="pending">Descripción del proyecto pendiente.</span>';
      }
      if (p.nota) {
        var nota = document.getElementById("pj-nota");
        nota.style.display = "block";
        nota.textContent = p.nota;
      }

      /* reproductor: se carga al pulsar (mejor rendimiento y sin cookies) */
      var vwrap = document.getElementById("pj-video");
      if (p.youtube) {
        vwrap.innerHTML =
          '<div class="video-poster" id="pj-poster" style="background-image:url(https://i.ytimg.com/vi/' + p.youtube + '/maxresdefault.jpg)" role="button" tabindex="0" aria-label="Reproducir ' + esc(p.titulo) + '">' +
            '<span class="play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>' +
          "</div>";
        var play = function () {
          vwrap.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + p.youtube +
            '?autoplay=1&rel=0" title="' + esc(p.titulo) +
            '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>';
        };
        var poster = document.getElementById("pj-poster");
        poster.addEventListener("click", play);
        poster.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); play(); }
        });
      } else {
        vwrap.innerHTML = "";
        vwrap.style.display = "none";
      }

      /* enlace externo si no hay vídeo incrustado */
      var ext = document.getElementById("pj-externo");
      if (p.link) {
        ext.href = p.link;
        ext.style.display = "inline-flex";
        ext.innerHTML = (p.youtube ? "Ver en YouTube" : "Ver vídeo") + " &#8599;";
      }

      /* relacionados: mismo artista o mismo tipo */
      var base = (p.artista || "").split("·")[0].trim().toLowerCase();
      var rel = PROYECTOS.filter(function (x) { return x.slug !== p.slug; })
        .map(function (x) {
          var score = 0;
          if (base && (x.artista || "").toLowerCase().indexOf(base) === 0) score += 3;
          if (x.tipo === p.tipo) score += 2;
          if (x.tipo === p.tipo && (x.artista || "").toLowerCase().indexOf(base) === 0) score += 1;
          return { p: x, score: score };
        })
        .sort(function (a, b) { return b.score - a.score; })
        .slice(0, 3)
        .map(function (r) { return r.p; });

      var relGrid = document.getElementById("grid-relacionados");
      if (relGrid) relGrid.innerHTML = rel.map(cardHTML).join("");
      if (relGrid) bindPreviews(relGrid);
    }
  }

  /* ---------------- portadas rotatorias del inicio ---------------- */
  var heroBox = document.getElementById("hero-slides");
  if (heroBox) {
    var hSlides = [].slice.call(heroBox.querySelectorAll(".hero-slide"));
    var hDots = [].slice.call(document.querySelectorAll(".hero-dot"));
    var hCaption = document.getElementById("hero-caption");
    var hNav = document.getElementById("hero-nav");
    var DURACION = 4000;
    var hIdx = 0;
    var hTimer = null;
    var hPausado = false;
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    document.documentElement.style.setProperty("--dur", DURACION + "ms");

    function pintarHero(n) {
      hIdx = (n + hSlides.length) % hSlides.length;
      hSlides.forEach(function (s, k) { s.classList.toggle("is-active", k === hIdx); });
      hDots.forEach(function (d, k) {
        var activo = k === hIdx;
        d.classList.toggle("is-active", activo);
        d.setAttribute("aria-selected", activo ? "true" : "false");
        d.setAttribute("tabindex", activo ? "0" : "-1");
        var barra = d.firstElementChild;
        if (barra) {
          barra.style.animation = "none";
          void barra.offsetWidth;
          barra.style.animation = "";
        }
      });
      var actual = hSlides[hIdx];
      if (hCaption && actual) {
        hCaption.href = actual.dataset.href || "#";
        var titulo = hCaption.querySelector(".hc-title");
        var meta = hCaption.querySelector(".hc-meta");
        if (titulo) titulo.textContent = actual.dataset.title || "";
        if (meta) meta.textContent = actual.dataset.meta || "";
      }
    }

    function pararHero() { if (hTimer) { clearInterval(hTimer); hTimer = null; } }
    function arrancarHero() {
      pararHero();
      if (reduceMotion) return;
      hTimer = setInterval(function () {
        if (!hPausado && !document.hidden) pintarHero(hIdx + 1);
      }, DURACION);
    }

    hDots.forEach(function (d, k) {
      d.addEventListener("click", function () { pintarHero(k); arrancarHero(); });
      d.addEventListener("keydown", function (e) {
        if (e.key === "ArrowRight") { e.preventDefault(); pintarHero(hIdx + 1); arrancarHero(); }
        if (e.key === "ArrowLeft") { e.preventDefault(); pintarHero(hIdx - 1); arrancarHero(); }
      });
    });

    if (hNav) {
      hNav.addEventListener("mouseenter", function () { hPausado = true; });
      hNav.addEventListener("mouseleave", function () { hPausado = false; });
      hNav.addEventListener("focusin", function () { hPausado = true; });
      hNav.addEventListener("focusout", function () { hPausado = false; });
    }

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) { pintarHero(hIdx); arrancarHero(); }
    });

    pintarHero(0);
    arrancarHero();
  }

  /* ============================================================
     Movimiento global: revelado tipográfico, parallax,
     barra de progreso y scroll con inercia
     ============================================================ */
  var sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- revelado de titulares (máscara) ---------- */
  var titulares = document.querySelectorAll(
    ".hero h1, .page-head h1, .section-head h2, .proj-head h1, .about h1, .contact h1"
  );
  var maskObserver = null;
  if (!sinMovimiento) {
    maskObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("mask-in"); maskObserver.unobserve(e.target); }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });
  }
  [].forEach.call(titulares, function (h) {
    if (h.dataset.mask === "1") return;
    h.dataset.mask = "1";
    h.innerHTML = '<span class="mask-inner">' + h.innerHTML + "</span>";
    h.classList.add("mask");
    if (sinMovimiento) { h.classList.add("mask-in"); return; }
    var caja = h.getBoundingClientRect();
    if (caja.top < window.innerHeight * 0.95) {
      /* ya está en pantalla al cargar: se revela sin esperar al observer */
      setTimeout(function () { h.classList.add("mask-in"); }, 60);
    } else {
      maskObserver.observe(h);
    }
  });

  /* ---------- barra de progreso de scroll ---------- */
  var barraProgreso = document.createElement("div");
  barraProgreso.className = "scroll-progress";
  barraProgreso.setAttribute("aria-hidden", "true");
  barraProgreso.innerHTML = "<span></span>";
  document.body.appendChild(barraProgreso);
  var barraFill = barraProgreso.firstChild;

  /* ---------- parallax en las portadas de proyecto ---------- */
  var parallaxEls = [];
  function refrescarParallax() {
    parallaxEls = [].slice.call(document.querySelectorAll(".card-media"));
  }
  refrescarParallax();

  var framePendiente = false;
  function enFrame() {
    framePendiente = false;

    var alto = document.documentElement.scrollHeight - window.innerHeight;
    var progreso = alto > 0 ? Math.min(1, Math.max(0, window.scrollY / alto)) : 1;
    barraFill.style.transform = "scaleY(" + progreso.toFixed(4) + ")";

    if (sinMovimiento) return;
    if (window.innerWidth <= 900) return;
    var vh = window.innerHeight;
    for (var i = 0; i < parallaxEls.length; i++) {
      var el = parallaxEls[i];
      var caja = el.parentElement.getBoundingClientRect();
      if (caja.bottom < -80 || caja.top > vh + 80) continue;
      var centro = caja.top + caja.height / 2 - vh / 2;
      var desplazamiento = (-centro / vh) * 16;
      el.style.transform = "translate3d(0," + desplazamiento.toFixed(2) + "px,0)";
    }
  }
  function pedirFrame() {
    if (!framePendiente) { framePendiente = true; requestAnimationFrame(enFrame); }
  }

  window.addEventListener("scroll", pedirFrame, { passive: true });
  window.addEventListener("resize", function () { refrescarParallax(); pedirFrame(); }, { passive: true });
  document.addEventListener("proyectos-renderizados", refrescarParallax);
  enFrame();
  pedirFrame();

  /* ---------- scroll con inercia (solo ratón/trackpad) ---------- */
  var puedeInercia =
    !sinMovimiento &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
    window.innerWidth > 900;

  if (puedeInercia) {
    var objetivo = window.scrollY;
    var actual = window.scrollY;
    var animando = false;
    var SUAVIZADO = 0.14;

    function tope() { return Math.max(0, document.documentElement.scrollHeight - window.innerHeight); }

    function paso() {
      actual += (objetivo - actual) * SUAVIZADO;
      if (Math.abs(objetivo - actual) < 0.5) {
        actual = objetivo;
        animando = false;
        window.scrollTo(0, actual);
        return;
      }
      window.scrollTo(0, actual);
      requestAnimationFrame(paso);
    }

    function arrancar() {
      if (!animando) { animando = true; requestAnimationFrame(paso); }
    }

    window.addEventListener("wheel", function (e) {
      if (e.ctrlKey) return;
      if (document.body.style.overflow === "hidden") return;
      var destino = e.target;
      if (destino && destino.closest && destino.closest("[data-no-inercia], .cart-panel, .modal-box, .modal, .lightbox")) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      var unidad = e.deltaMode === 1 ? 18 : e.deltaMode === 2 ? window.innerHeight : 1;
      e.preventDefault();
      if (!animando) { actual = objetivo = window.scrollY; }
      objetivo = Math.min(tope(), Math.max(0, objetivo + e.deltaY * unidad));
      arrancar();
    }, { passive: false });

    /* si el usuario usa teclado, barra o anclas, resincronizamos */
    window.addEventListener("scroll", function () {
      if (animando) {
        /* alguien ha desplazado fuera de nuestro control (barra, teclado) */
        if (Math.abs(window.scrollY - actual) > 2) {
          animando = false;
          actual = objetivo = window.scrollY;
        }
        return;
      }
      actual = objetivo = window.scrollY;
    }, { passive: true });
  }

  /* ---------- transición de portada a ficha (View Transitions) ---------- */
  if (document.startViewTransition) {
    document.addEventListener("click", function (e) {
      var card = e.target.closest(".card");
      if (!card || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      var media = card.querySelector(".card-media") || card;
      media.style.viewTransitionName = "proyecto-media";
    });
  }

  /* avisar al parallax cuando se repinta un grid */
  var observarGrids = new MutationObserver(function () { refrescarParallax(); pedirFrame(); });
  ["grid-proyectos", "grid-destacados", "grid-relacionados"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) observarGrids.observe(el, { childList: true });
  });
})();
