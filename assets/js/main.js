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
    if (!t) {
      return '<a class="card no-img" href="proyecto.html?p=' + encodeURIComponent(p.slug) + '">' +
        '<div class="card-body">' +
          '<span class="card-type">' + esc(tipoLabel(p.tipo)) + "</span>" +
          '<span class="card-title">' + esc(p.titulo) + "</span>" +
          (p.artista ? '<span class="card-client">' + esc(artistaCorto(p)) + "</span>" : "") +
        "</div></a>";
    }
    var inner =
      '<img src="' + t + '" alt="' + esc(p.titulo) + '" loading="lazy" onerror="this.onerror=null;this.src=\'https://i.ytimg.com/vi/' + p.youtube + '/hqdefault.jpg\'">' +
      '<div class="card-body">' +
        '<span class="card-type">' + esc(tipoLabel(p.tipo)) + "</span>" +
        '<span class="card-title">' + esc(p.titulo) + "</span>" +
        (p.artista ? '<span class="card-client">' + esc(artistaCorto(p)) + "</span>" : "") +
      "</div>";
    return '<a class="card" href="proyecto.html?p=' + encodeURIComponent(p.slug) + '">' + inner + "</a>";
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
    var barra = document.getElementById("filtros-proyectos");
    var inicial = (new URLSearchParams(location.search).get("tipo") || "todos").toLowerCase();
    var tipos = ["todos"].concat(PROYECTOS.map(function (p) { return p.tipo; })
      .filter(function (t, i, a) { return t && a.indexOf(t) === i; }));

    if (barra) {
      barra.innerHTML = tipos.map(function (t) {
        return '<button class="chip' + (t === inicial ? " active" : "") + '" data-tipo="' + t + '">' +
          (t === "todos" ? "Todos" : tipoLabel(t)) + "</button>";
      }).join("");
      barra.addEventListener("click", function (e) {
        var b = e.target.closest(".chip");
        if (!b) return;
        barra.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("active"); });
        b.classList.add("active");
        aplicar(b.dataset.tipo);
      });
    }

    function aplicar(tipo) {
      var lista = PROYECTOS.filter(function (p) { return tipo === "todos" || p.tipo === tipo; });
      gridProy.innerHTML = lista.map(cardHTML).join("") ||
        '<p class="rent-empty">No hay proyectos en esta categoría.</p>';
      gridProy.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
    }
    aplicar(inicial);
  }

  /* ---------------- destacados ---------------- */
  var destacados = document.getElementById("grid-destacados");
  if (destacados) destacados.innerHTML = PROYECTOS.slice(0, 6).map(cardHTML).join("");

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
})();
