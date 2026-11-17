/* ============================================================
   MARCOS DONATE — Panel de edición (/admin)
   Habla con /api/admin (login, lectura y guardado) y pinta los
   formularios de proyectos, catálogo, textos y datos generales.
   ============================================================ */
(function () {
  "use strict";

  var API = "/api/admin";
  var estado = null;
  var tabActual = "proyectos";
  var sucio = false;
  var pendiente = { proyectos: false, material: false, textos: false, sobre: false, contacto: false };

  var TEXTOS = [
    { clave: "hero_kicker", etiqueta: "Portada · antetítulo", ayuda: "La línea pequeña encima del titular del inicio." },
    { clave: "hero_sub", etiqueta: "Portada · párrafo de entrada", ayuda: "El texto bajo «Luz para contar historias».", largo: true },
    { clave: "proyectos_titulo", etiqueta: "Proyectos · título", ayuda: "Cabecera de la página de proyectos." },
    { clave: "proyectos_intro", etiqueta: "Proyectos · entradilla", ayuda: "Párrafo bajo ese título.", largo: true },
    { clave: "alquiler_titulo", etiqueta: "Alquiler · título", ayuda: "Cabecera del catálogo." },
    { clave: "alquiler_intro", etiqueta: "Alquiler · entradilla", ayuda: "Párrafo bajo ese título.", largo: true }
  ];

  var CAMPOS_PROYECTO = [
    { clave: "titulo", etiqueta: "Título", ancho: false },
    { clave: "tipo", etiqueta: "Tipo", ayuda: "cortometraje, videoclip, publicidad…", ancho: false },
    { clave: "artista", etiqueta: "Artista / cliente", ancho: false },
    { clave: "year", etiqueta: "Año", ancho: false },
    { clave: "director", etiqueta: "Dirección", ancho: false },
    { clave: "productora", etiqueta: "Productora", ancho: false },
    { clave: "fotografia", etiqueta: "Dirección de fotografía", ancho: false },
    { clave: "rol", etiqueta: "Tu función", ancho: false },
    { clave: "youtube", etiqueta: "ID de YouTube", ayuda: "Solo el código, no la URL entera. Vacío si no hay vídeo.", ancho: false },
    { clave: "link", etiqueta: "Enlace del vídeo", ancho: true },
    { clave: "descripcion", etiqueta: "Descripción", ancho: true, largo: true },
    { clave: "nota", etiqueta: "Nota al pie de la ficha", ancho: true, largo: true }
  ];

  /* ------------------------------ utilidades ------------------------------ */

  /* Misma normalización que /api/admin: evita que «Videoclip», «videoclip»
     o «Videoclips» acaben creando pestañas duplicadas en proyectos.html. */
  function tipoClave(valor) {
    var limpio = String(valor == null ? "" : valor)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    var alias = {
      videoclip: "videoclip",
      videoclips: "videoclip",
      "video clip": "videoclip",
      "video clips": "videoclip",
      "video musical": "videoclip",
      corto: "cortometraje",
      cortos: "cortometraje",
      cortometrajes: "cortometraje",
      publicidad: "publicidad",
      publicidades: "publicidad",
      spot: "spot",
      spots: "spot",
      documental: "documental",
      documentales: "documental",
      ficcion: "ficcion",
      "video de ficcion": "ficcion"
    };
    return alias[limpio] || limpio;
  }

  /* «1:20», «01:20,5» o «80» -> segundos; null si no es válido. */
  function parseSegundos(valor) {
    var bruto = String(valor == null ? "" : valor).trim().replace(",", ".");
    if (!bruto) return null;
    if (/^\d+(\.\d+)?$/.test(bruto)) return Math.round(Number(bruto));
    var partes = bruto.split(":");
    if (partes.length < 2 || partes.length > 3) return null;
    if (!partes.every(function (p) { return /^\d+(\.\d+)?$/.test(p); })) return null;
    var segundos = 0;
    partes.forEach(function (p) { segundos = segundos * 60 + Number(p); });
    return Math.round(segundos);
  }

  function formatearSegundos(segundos) {
    var s = Math.max(0, Math.round(Number(segundos) || 0));
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var r = s % 60;
    var dos = function (n) { return String(n).padStart(2, "0"); };
    return h ? h + ":" + dos(m) + ":" + dos(r) : m + ":" + dos(r);
  }

  function leerTramo(desde, hasta) {
    var inicio = parseSegundos(desde);
    var fin = parseSegundos(hasta);
    if (inicio == null) {
      throw new Error("Escribe el segundo inicial del clip, por ejemplo 1:20.");
    }
    if (fin == null) fin = inicio + 7;
    if (fin <= inicio) {
      throw new Error("El final (" + formatearSegundos(fin) +
        ") debe ser mayor que el inicio (" + formatearSegundos(inicio) + ").");
    }
    if (fin - inicio > 15) {
      throw new Error("El clip dura " + (fin - inicio) +
        " s. El máximo es 15 s; para la vista previa se recomiendan 7 s (por ejemplo 1:20 – 1:27).");
    }
    return { inicio: inicio, fin: fin };
  }

  function h(tag, props, hijos) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        if (k === "texto") el.textContent = props[k];
        else if (k === "clase") el.className = props[k];
        else if (k === "html") el.innerHTML = props[k];
        else if (k.indexOf("on") === 0) el.addEventListener(k.slice(2), props[k]);
        else if (props[k] === true) el.setAttribute(k, "");
        else if (props[k] !== false && props[k] != null) el.setAttribute(k, props[k]);
      });
    }
    (hijos || []).forEach(function (c) {
      if (c) el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return el;
  }

  function campo(opciones) {
    var id = "f_" + opciones.clave + "_" + Math.random().toString(36).slice(2, 7);
    var control;
    if (opciones.tipo === "textarea") {
      control = h("textarea", { id: id, rows: opciones.filas || (opciones.largo ? 3 : 2) });
    } else if (opciones.tipo === "select") {
      control = h("select", { id: id },
        (opciones.opciones || []).map(function (o) {
          return h("option", { value: o.valor, texto: o.etiqueta });
        }));
    } else {
      control = h("input", {
        id: id,
        type: opciones.tipo || "text",
        inputmode: opciones.tipo === "number" ? "numeric" : null,
        placeholder: opciones.marcador || null
      });
    }
    if (opciones.valor != null) control.value = opciones.valor;
    control.addEventListener("input", function () {
      marcarSucio(opciones.fichero);
      if (opciones.onInput) opciones.onInput(control.value, control);
    });
    var caja = h("div", { clase: "campo" + (opciones.ancho ? " campo-ancho" : "") }, [
      h("label", { for: id, texto: opciones.etiqueta }),
      control
    ]);
    if (opciones.ayuda) caja.appendChild(h("p", { clase: "ayuda", texto: opciones.ayuda }));
    caja.control = control;
    return caja;
  }

  function aviso(texto, tipo) {
    var el = document.getElementById("estado-guardado");
    el.textContent = texto || "";
    el.className = "estado" + (tipo ? " " + tipo : "");
  }

  var toastTimer = null;
  function toast(mensaje, tipo) {
    var el = document.getElementById("toast");
    if (!el) {
      el = h("div", { id: "toast", clase: "toast", role: "status" });
      document.body.appendChild(el);
    }
    el.textContent = mensaje;
    el.className = "toast visible" + (tipo ? " " + tipo : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = "toast"; }, tipo === "error" ? 9000 : 4500);
  }

  function marcarSucio(fichero) {
    if (fichero) pendiente[fichero] = true;
    sucio = true;
    pintarBarra();
  }

  function marcarLimpio(texto, tipo) {
    aviso(texto || "", tipo);
  }

  async function api(accion, datos) {
    var opciones = { credentials: "same-origin", headers: {} };
    var url = API;
    if (datos) {
      opciones.method = "POST";
      opciones.headers["Content-Type"] = "application/json";
      opciones.body = JSON.stringify(datos);
    } else {
      url = API + "?action=" + accion;
    }
    var r = await fetch(url, opciones);
    var cuerpo = null;
    try { cuerpo = await r.json(); } catch (e) { cuerpo = {}; }
    if (!r.ok) {
      var error = new Error((cuerpo && cuerpo.error) || "Error " + r.status);
      error.codigo = r.status;
      throw error;
    }
    return cuerpo;
  }

  /* -------------------------------- arranque -------------------------------- */

  async function iniciar() {
    var config;
    try {
      config = await api("state");
    } catch (e) {
      document.getElementById("aviso-login").hidden = false;
      document.getElementById("aviso-login").textContent =
        "No se pudo contactar con el servidor del panel: " + e.message;
      return;
    }

    if (!config.configurado) {
      var pie = document.getElementById("estado-config");
      pie.hidden = false;
      pie.textContent =
        "Falta configurar el panel en Vercel: define ADMIN_PASSWORD y GITHUB_TOKEN en " +
        "Settings → Environment Variables y vuelve a desplegar. Instrucciones en el README.";
      document.getElementById("usuario").value = config.usuario || "";
      return;
    }

    document.getElementById("usuario").value = config.usuario || "";
    if (config.autenticado) {
      await abrirPanel();
    }
  }

  document.getElementById("form-login").addEventListener("submit", async function (e) {
    e.preventDefault();
    var boton = document.getElementById("btn-login");
    var avisoLogin = document.getElementById("aviso-login");
    avisoLogin.hidden = true;
    boton.disabled = true;
    boton.textContent = "Entrando…";
    try {
      await api("login", {
        action: "login",
        usuario: document.getElementById("usuario").value,
        clave: document.getElementById("clave").value
      });
      document.getElementById("clave").value = "";
      await abrirPanel();
    } catch (error) {
      avisoLogin.hidden = false;
      avisoLogin.textContent = error.message;
    } finally {
      boton.disabled = false;
      boton.textContent = "Entrar";
    }
  });

  document.getElementById("btn-recargar").addEventListener("click", async function () {
    aviso("Recargando…");
    await cargarTodo();
    if (estado && estado.cargado) {
      toast("Recargado: " + estado.proyectos.datos.length + " proyectos y " +
        estado.material.datos.length + " referencias.", "ok");
    }
  });

  document.getElementById("btn-diagnostico").addEventListener("click", async function () {
    toast("Comprobando el servidor…");
    try {
      var d = await api("diagnostico");
      var token = d.token || {};
      var lineasToken = token.presente
        ? "token " + token.formato + " · " + token.longitud + " caracteres" +
          (token.conEspacios ? " · con espacios o comillas" : "")
        : "sin token";
      var lineas = d.pruebas
        .map(function (p) {
          return (p.estado === "ok" ? "✓ " : "✕ ") + p.fichero + " · " + p.estado +
            (p.bytes ? " · " + p.bytes + " B" : "") + (p.detalle ? " · " + p.detalle : "");
        })
        .join("\n");
      toast(
        d.origen + " · " + d.repo + " · rama " + d.rama + "\n" + lineasToken + "\n" + lineas,
        d.pruebas.every(function (p) { return p.estado === "ok"; }) ? "ok" : "error");
    } catch (error) {
      toast("Diagnóstico: " + error.message, "error");
    }
  });

  document.getElementById("btn-salir").addEventListener("click", async function () {
    try { await api("logout", { action: "logout" }); } catch (e) {}
    location.reload();
  });

  async function abrirPanel() {
    document.getElementById("pantalla-acceso").hidden = true;
    document.getElementById("app").hidden = false;
    await cargarTodo();
  }

  async function cargarTodo() {
    aviso("Cargando…");
    try {
      estado = await api("load");
      estado.cargado = !(estado.errores && estado.errores.length);
      estado.colaPendiente = [];
      estado.colaItems = Array.isArray(estado.colaItems) ? estado.colaItems : [];
      pendiente = { proyectos: false, material: false, textos: false, sobre: false, contacto: false };
      sucio = false;
      pintarTodo();
      pintarBarra();
      if (!estado.cargado) {
        marcarLimpio("No se pudo leer el contenido", "error");
        toast(
          "El panel no puede leer los datos del repositorio:\n" +
            estado.errores.join("\n") +
            "\nPulsa «Diagnóstico» para ver el detalle.",
          "error"
        );
      } else {
        marcarLimpio("");
      }
    } catch (error) {
      estado = null;
      marcarLimpio("No se pudo cargar", "error");
      toast("No se pudo cargar el contenido:\n" + error.message, "error");
    }
  }

  function pintarTodo() {
    if (estado) {
      estado.cargados = {
        proyectos: estado.proyectos.datos.length,
        material: estado.material.datos.length
      };
    }
    pintarProyectos();
    pintarMaterial();
    pintarTextos();
    pintarSobre();
    pintarContacto();
    pintarAjustes();
    mostrarTab(tabActual);
  }

  /* --------------------------------- pestañas --------------------------------- */

  function mostrarTab(nombre) {
    tabActual = nombre;
    Array.prototype.forEach.call(document.querySelectorAll(".pestana"), function (b) {
      b.classList.toggle("activa", b.dataset.tab === nombre);
    });
    Array.prototype.forEach.call(document.querySelectorAll(".vista"), function (v) {
      v.hidden = v.dataset.vista !== nombre;
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll(".pestana"), function (boton) {
    boton.addEventListener("click", function () { mostrarTab(boton.dataset.tab); });
  });

  /* -------------------------------- proyectos -------------------------------- */

  function pintarProyectos() {
    var lista = document.getElementById("lista-proyectos");
    lista.innerHTML = "";
    estado.proyectos.datos.forEach(function (proyecto, indice) {
      lista.appendChild(fichaProyecto(proyecto, indice));
    });
    var avisoCola = document.getElementById("aviso-cola");
    if (avisoCola) avisoCola.remove();
    var colaPorSlug = {};
    (estado.colaItems || []).forEach(function (c) { if (c && c.slug) colaPorSlug[c.slug] = c; });
    (estado.colaPendiente || []).forEach(function (c) { if (c && c.slug) colaPorSlug[c.slug] = c; });
    var enCola = Object.keys(colaPorSlug).length;
    if (enCola > 0) {
      var detalleCola = Object.keys(colaPorSlug).map(function (slug) {
        var c = colaPorSlug[slug];
        return slug + (c.inicio != null
          ? " (" + formatearSegundos(c.inicio) +
            (c.fin != null ? "–" + formatearSegundos(c.fin) : "") + ")"
          : "");
      }).join(", ");
      lista.insertBefore(
        h("p", {
          clase: "ayuda aviso-cola",
          id: "aviso-cola",
          texto:
            "Hay " + enCola + (enCola === 1 ? " vista previa" : " vistas previas") +
            " en cola: " + detalleCola + ". Se generan online en GitHub Actions al pulsar " +
            "«Subir todos los cambios» (~3 min). Si el workflow falla porque YouTube pide sesión, " +
            "añade el secreto YT_COOKIES o usa actualizar-clips.bat como último recurso."
        }),
        lista.firstChild
      );
    }
    if (!estado.proyectos.datos.length) {
      lista.appendChild(h("p", {
        clase: "ayuda",
        texto: estado.cargado
          ? "El repositorio no tiene proyectos ahora mismo."
          : "No se han podido leer los proyectos del repositorio. Pulsa «Recargar»."
      }));
    }
  }

  function fichaProyecto(proyecto, indice) {
    var ficha = h("article", { clase: "ficha" + (indice === 0 ? " abierta" : "") });
    var cabecera = h("div", { clase: "ficha-cabecera" }, [
      h("span", { clase: "ficha-flecha", texto: "▸" }),
      h("span", { clase: "ficha-titulo", texto: proyecto.titulo || "(sin título)" }),
      h("span", { clase: "ficha-meta", texto: [proyecto.tipo, proyecto.artista].filter(Boolean).join(" · ") })
    ]);
    cabecera.addEventListener("click", function () { ficha.classList.toggle("abierta"); });

    var cuerpo = h("div", { clase: "ficha-cuerpo" });
    CAMPOS_PROYECTO.forEach(function (def) {
      var c = campo({
        clave: def.clave,
        fichero: "proyectos",
        etiqueta: def.etiqueta,
        ayuda: def.ayuda,
        ancho: def.ancho,
        tipo: def.largo ? "textarea" : "text",
        largo: def.largo,
        valor: proyecto[def.clave] || "",
        onInput: function (valor) {
          proyecto[def.clave] = valor;
          cabecera.querySelector(".ficha-titulo").textContent = proyecto.titulo || "(sin título)";
          cabecera.querySelector(".ficha-meta").textContent =
            [proyecto.tipo, proyecto.artista].filter(Boolean).join(" · ");
        }
      });
      cuerpo.appendChild(c);
      if (def.clave === "tipo") {
        c.control.addEventListener("change", function () {
          var canonico = tipoClave(c.control.value);
          if (c.control.value !== canonico) c.control.value = canonico;
          proyecto.tipo = canonico;
          cabecera.querySelector(".ficha-meta").textContent =
            [proyecto.tipo, proyecto.artista].filter(Boolean).join(" · ");
          marcarSucio("proyectos");
        });
      }
    });

    cuerpo.appendChild(campo({
      clave: "slug_" + indice,
      fichero: "proyectos",
      etiqueta: "Dirección de la ficha (slug)",
      ayuda: "Aparece en proyecto.html?p=… No lo cambies si ya has compartido el enlace.",
      valor: proyecto.slug || "",
      onInput: function (valor) {
        var previo = proyecto.slug;
        proyecto.slug = valor;
        /* si el clip ya estaba programado, que se guarde con el slug nuevo */
        (estado.colaPendiente || []).forEach(function (c) {
          if (c.slug === previo) c.slug = valor;
        });
      }
    }));

    var botonClip = null;
    /* YouTube por id; si el vídeo es de Facebook (u otra red con enlace
       directo), se usa su URL tal cual. */
    var urlClip = proyecto.youtube
      ? "https://www.youtube.com/watch?v=" + proyecto.youtube
      : /(?:facebook\.com|fb\.watch|fb\.me)/i.test(proyecto.link || "")
        ? proyecto.link
        : "";
    if (urlClip) {
      var inicioGuardado = parseSegundos(proyecto.preview);
      var finGuardado = parseSegundos(proyecto.previewFin);
      if (finGuardado == null && inicioGuardado != null) finGuardado = inicioGuardado + 7;

      var idDesde = "clip_desde_" + indice + "_" + Math.random().toString(36).slice(2, 6);
      var idHasta = "clip_hasta_" + indice + "_" + Math.random().toString(36).slice(2, 6);
      var entradaDesde = h("input", {
        id: idDesde, type: "text", inputmode: "numeric", placeholder: "1:20"
      });
      var entradaHasta = h("input", {
        id: idHasta, type: "text", inputmode: "numeric", placeholder: "1:27"
      });
      if (inicioGuardado != null) entradaDesde.value = formatearSegundos(inicioGuardado);
      if (finGuardado != null) entradaHasta.value = formatearSegundos(finGuardado);

      /* Al escribir un tramo válido se guarda en el borrador: al publicar,
         el servidor encola la vista previa automáticamente. */
      var sincronizarRango = function () {
        var ini = parseSegundos(entradaDesde.value);
        var fin = parseSegundos(entradaHasta.value);
        if (ini == null) return;
        if (fin == null) fin = ini + 7;
        if (fin <= ini || fin - ini > 15) return;
        proyecto.preview = ini;
        proyecto.previewFin = fin;
        marcarSucio("proyectos");
      };
      entradaDesde.addEventListener("input", sincronizarRango);
      entradaHasta.addEventListener("input", sincronizarRango);

      cuerpo.appendChild(h("div", { clase: "campo-ancho rango-preview" }, [
        h("div", { clase: "campo" }, [
          h("label", { for: idDesde, texto: "Vista previa · desde" }),
          entradaDesde
        ]),
        h("div", { clase: "campo" }, [
          h("label", { for: idHasta, texto: "Vista previa · hasta" }),
          entradaHasta
        ]),
        h("p", {
          clase: "ayuda",
          texto: "Escribe mm:ss o segundos. Ejemplo: desde 1:20 y hasta 1:27 genera un clip de 7 s. " +
            "Se genera online en GitHub Actions al publicar; no hace falta ejecutar nada en tu ordenador. " +
            "Máximo 15 s."
        })
      ]));

      botonClip = h("button", {
        clase: "boton boton-mini", type: "button", texto: "Programar vista previa",
        onclick: function () {
          try {
            var tramo = leerTramo(entradaDesde.value, entradaHasta.value);
            entradaDesde.value = formatearSegundos(tramo.inicio);
            entradaHasta.value = formatearSegundos(tramo.fin);
            proyecto.preview = tramo.inicio;
            proyecto.previewFin = tramo.fin;

            if (!estado.colaPendiente) estado.colaPendiente = [];
            var item = {
              slug: proyecto.slug,
              url: urlClip,
              inicio: tramo.inicio,
              fin: tramo.fin
            };
            var existente = -1;
            estado.colaPendiente.forEach(function (c, i) {
              if (c.slug === item.slug) existente = i;
            });
            if (existente > -1) estado.colaPendiente[existente] = item;
            else estado.colaPendiente.push(item);

            marcarSucio("proyectos");
            toast(
              "Vista previa programada: " + formatearSegundos(tramo.inicio) + " – " +
                formatearSegundos(tramo.fin) + " («" + (proyecto.titulo || proyecto.slug) + "»).\n" +
                "Pulsa «Subir todos los cambios»: GitHub generará el clip al recibir el push.",
              "ok"
            );
          } catch (error) {
            toast(error.message, "error");
          }
        }
      });
    }

    cuerpo.appendChild(h("div", { clase: "ficha-acciones" }, [
      botonClip,
      h("button", {
        clase: "boton boton-mini boton-peligro",
        type: "button",
        texto: "Eliminar proyecto",
        onclick: function () {
          if (!confirm("¿Eliminar «" + (proyecto.titulo || proyecto.slug) + "» del portfolio?")) return;
          estado.proyectos.datos.splice(indice, 1);
          pintarProyectos();
          marcarSucio("proyectos");
        }
      }),
      h("span", { clase: "ficha-meta", texto: "Recuerda guardar para publicar" })
    ]));

    ficha.appendChild(cabecera);
    ficha.appendChild(cuerpo);
    return ficha;
  }

  async function importarDesdeUrl() {
    var entrada = document.getElementById("url-importar");
    var boton = document.getElementById("btn-importar");
    var url = (entrada.value || "").trim();
    if (!url) {
      entrada.focus();
      return;
    }
    var conClip = document.getElementById("clip-importar").checked;
    boton.disabled = true;
    boton.textContent = "Buscando…";
    aviso("Importando…");
    try {
      var r = await api("importar", { action: "importar", url: url, clip: conClip });
      if (r.existente) {
        toast("Ese vídeo ya está en el portfolio: «" + r.titulo + "».", "error");
        return;
      }
      entrada.value = "";
      await cargarTodo();
      if (conClip) {
        var nuevo = estado.proyectos.datos.filter(function (p) {
          return p.slug === r.proyecto.slug;
        })[0];
        var urlClip = nuevo && nuevo.youtube
          ? "https://www.youtube.com/watch?v=" + nuevo.youtube
          : nuevo && /(?:facebook\.com|fb\.watch|fb\.me)/i.test(nuevo.link || "")
            ? nuevo.link
            : "";
        if (urlClip) {
          estado.colaPendiente.push({ slug: r.proyecto.slug, url: urlClip });
          marcarSucio("proyectos");
        }
      }
      marcarLimpio("Proyecto añadido", "ok");
      toast(
        "«" + r.proyecto.titulo + "» añadido como " + r.proyecto.slug + "." +
          (conClip
            ? "\nVista previa programada: pulsa «Subir todos los cambios» para que GitHub la genere online."
            : ""),
        "ok"
      );
    } catch (error) {
      marcarLimpio(error.message, "error");
      toast(error.message, "error");
    } finally {
      boton.disabled = false;
      boton.textContent = "Añadir";
    }
  }

  document.getElementById("btn-importar").addEventListener("click", importarDesdeUrl);
  document.getElementById("url-importar").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      importarDesdeUrl();
    }
  });

  document.getElementById("btn-nuevo-proyecto").addEventListener("click", function () {
    estado.proyectos.datos.push({
      slug: "nuevo-proyecto-" + (estado.proyectos.datos.length + 1),
      titulo: "",
      tipo: "",
      artista: "",
      youtube: "",
      link: "",
      director: "",
      productora: "",
      fotografia: "",
      year: "",
      rol: "Técnico de iluminación (gaffer)",
      descripcion: "",
      nota: ""
    });
    pintarProyectos();
    var fichas = document.querySelectorAll("#lista-proyectos .ficha");
    if (fichas.length) {
      Array.prototype.forEach.call(fichas, function (f) { f.classList.remove("abierta"); });
      var ultima = fichas[fichas.length - 1];
      ultima.classList.add("abierta");
      ultima.scrollIntoView({ block: "center" });
      var input = ultima.querySelector("input");
      if (input) input.focus();
    }
    marcarSucio("proyectos");
  });

  /* --------------------------------- material --------------------------------- */

  function pintarMaterial(filtro) {
    var lista = document.getElementById("lista-material");
    var texto = (filtro || "").toLowerCase().trim();
    lista.innerHTML = "";
    var visibles = 0;
    estado.material.datos.forEach(function (item, indice) {
      if (texto) {
        var heno = [item.nombre, item.codigo, item.notas].join(" ").toLowerCase();
        if (heno.indexOf(texto) === -1) return;
      }
      visibles += 1;
      lista.appendChild(fichaMaterial(item, indice));
    });
    document.getElementById("cuenta-material").textContent =
      visibles + " de " + estado.material.datos.length + " referencias";
    if (!visibles) lista.appendChild(h("p", { clase: "ayuda", texto: "Ningún resultado." }));
  }

  function comprimirImagen(fichero, maximo) {
    return new Promise(function (resolver, rechazar) {
      if (!/^image\//.test(fichero.type)) return rechazar(new Error("Ese archivo no es una imagen"));
      var lector = new FileReader();
      lector.onerror = function () { rechazar(new Error("No se pudo leer la imagen")); };
      lector.onload = function () {
        var img = new Image();
        img.onerror = function () { rechazar(new Error("La imagen está dañada")); };
        img.onload = function () {
          var escala = Math.min(1, (maximo || 1600) / Math.max(img.width, img.height));
          var lienzo = document.createElement("canvas");
          lienzo.width = Math.round(img.width * escala);
          lienzo.height = Math.round(img.height * escala);
          var ctx = lienzo.getContext("2d");
          ctx.fillStyle = "#0c1f19";
          ctx.fillRect(0, 0, lienzo.width, lienzo.height);
          ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
          resolver(lienzo.toDataURL("image/jpeg", 0.86));
        };
        img.src = lector.result;
      };
      lector.readAsDataURL(fichero);
    });
  }

  function fichaMaterial(item, indice) {
    var ficha = h("article", { clase: "ficha material-ficha abierta" });
    var miniatura = h("div", { clase: "miniatura" });
    function pintarMiniatura() {
      miniatura.innerHTML = "";
      if (item.foto) miniatura.appendChild(h("img", { src: item.foto, alt: "", loading: "lazy" }));
      else miniatura.appendChild(h("span", { texto: item.codigo || "—" }));
    }
    pintarMiniatura();

    var cabecera = h("div", { clase: "ficha-cabecera" }, [
      miniatura,
      h("div", {}, [
        h("div", { clase: "ficha-titulo", texto: item.nombre || "(sin nombre)" }),
        h("div", { clase: "ficha-meta", texto: (item.codigo || "") + " · " + (item.unidades == null ? "sin límite" : item.unidades + " ud.") })
      ]),
      h("span", { clase: "codigo-chip", texto: item.codigo || "" })
    ]);
    cabecera.addEventListener("click", function (e) {
      if (e.target.closest("input,select,textarea,button")) return;
      ficha.classList.toggle("abierta");
    });

    var cuerpo = h("div", { clase: "ficha-cuerpo material-campos" });
    cuerpo.appendChild(campo({
      clave: "codigo_" + indice, fichero: "material", etiqueta: "Código", valor: item.codigo || "",
      onInput: function (v) {
        item.codigo = v;
        item.id = v.toUpperCase();
        cabecera.querySelector(".codigo-chip").textContent = v;
        ficha.querySelector(".ficha-meta").textContent = (item.codigo || "") + " · " + (item.unidades == null ? "sin límite" : item.unidades + " ud.");
        if (!item.foto || /^assets\/img\/material\//.test(item.foto) === false) return;
      }
    }));
    cuerpo.appendChild(campo({
      clave: "nombre_" + indice, fichero: "material", etiqueta: "Nombre", valor: item.nombre || "",
      onInput: function (v) {
        item.nombre = v;
        cabecera.querySelector(".ficha-titulo").textContent = v || "(sin nombre)";
      }
    }));
    cuerpo.appendChild(campo({
      clave: "categoria_" + indice, fichero: "material", etiqueta: "Categoría", tipo: "select",
      valor: item.categoria,
      opciones: estado.material.categorias.map(function (c) {
        return { valor: c.id, etiqueta: c.nombre };
      }),
      onInput: function (v) { item.categoria = v; }
    }));
    cuerpo.appendChild(campo({
      clave: "unidades_" + indice, fichero: "material", etiqueta: "Unidades", tipo: "number",
      ayuda: "Vacío = sin límite",
      valor: item.unidades == null ? "" : item.unidades,
      onInput: function (v) {
        item.unidades = v === "" ? null : Math.max(1, parseInt(v, 10) || 1);
        cabecera.querySelectorAll(".ficha-meta")[0].textContent =
          (item.codigo || "") + " · " + (item.unidades == null ? "sin límite" : item.unidades + " ud.");
      }
    }));
    cuerpo.appendChild(campo({
      clave: "notas_" + indice, fichero: "material", etiqueta: "Notas / especificaciones", tipo: "textarea", ancho: true,
      valor: item.notas || "",
      onInput: function (v) { item.notas = v; }
    }));
    cuerpo.appendChild(campo({
      clave: "foto_" + indice, fichero: "material", etiqueta: "Foto", ancho: true,
      marcador: "assets/img/material/A001.jpg",
      valor: item.foto || "",
      ayuda: "Puedes subir una foto nueva o escribir la ruta de una que ya exista.",
      onInput: function (v) { item.foto = v; pintarMiniatura(); }
    }));

    var entradaFoto = h("input", { type: "file", accept: "image/*", hidden: true });
    var botonFoto = h("button", {
      clase: "boton boton-mini", type: "button", texto: "Subir foto…",
      onclick: function () { entradaFoto.click(); }
    });
    var progresoFoto = h("span", { clase: "ayuda", texto: "" });

    entradaFoto.addEventListener("change", async function () {
      var fichero = entradaFoto.files && entradaFoto.files[0];
      if (!fichero) return;
      botonFoto.disabled = true;
      progresoFoto.textContent = "Comprimiendo y subiendo…";
      try {
        var codigo = (item.codigo || "").toUpperCase();
        if (!codigo) throw new Error("Pon primero el código de la referencia");
        var dataUrl = await comprimirImagen(fichero, 1600);
        var respuesta = await api("upload", {
          action: "upload",
          codigo: codigo,
          base64: dataUrl
        });
        item.foto = respuesta.foto;
        estado.cabeza = respuesta.cabeza || null;
        pintarMiniatura();
        var campoFoto = cuerpo.querySelector('input[placeholder="assets/img/material/A001.jpg"]');
        if (campoFoto) campoFoto.value = respuesta.foto;
        progresoFoto.textContent = "Foto subida (" + Math.round(dataUrl.length / 1365) + " KB).";
        marcarSucio("material");
        toast("Foto subida. Se aplicará al pulsar «Subir todos los cambios».", "ok");
      } catch (error) {
        progresoFoto.textContent = "";
        toast(error.message, "error");
      } finally {
        botonFoto.disabled = false;
        entradaFoto.value = "";
      }
    });

    cuerpo.appendChild(h("div", { clase: "campo-ancho subida" }, [botonFoto, entradaFoto, progresoFoto]));
    cuerpo.appendChild(h("div", { clase: "ficha-acciones" }, [
      h("button", {
        clase: "boton boton-mini boton-peligro", type: "button", texto: "Eliminar referencia",
        onclick: function () {
          if (!confirm("¿Quitar «" + (item.nombre || item.codigo) + "» del catálogo?")) return;
          estado.material.datos.splice(indice, 1);
          pintarMaterial(document.getElementById("filtro-material").value);
          marcarSucio("material");
        }
      })
    ]));

    ficha.appendChild(cabecera);
    ficha.appendChild(cuerpo);
    return ficha;
  }

  document.getElementById("btn-nueva-referencia").addEventListener("click", function () {
    var usados = {};
    estado.material.datos.forEach(function (i) { usados[String(i.codigo).toUpperCase()] = true; });
    var letra = (estado.material.categorias[0] || { id: "x" }).id.charAt(0).toUpperCase();
    var numero = 1;
    while (usados[letra + String(numero).padStart(3, "0")] && numero < 999) numero += 1;
    var codigo = letra + String(numero).padStart(3, "0");
    estado.material.datos.unshift({
      id: codigo,
      codigo: codigo,
      nombre: "",
      categoria: (estado.material.categorias[0] || {}).id,
      unidades: 1,
      notas: "",
      foto: "assets/img/material/" + codigo + ".jpg"
    });
    pintarMaterial();
    mostrarTab("material");
    var primera = document.querySelector("#lista-material .ficha");
    if (primera) {
      primera.querySelectorAll("input")[1].focus();
      primera.scrollIntoView({ block: "center" });
    }
    marcarSucio("material");
  });

  document.getElementById("filtro-material").addEventListener("input", function (e) {
    pintarMaterial(e.target.value);
  });

  /* ---------------------------------- sobre mí ---------------------------------- */

  function bloqueRetratoSobre() {
    var datos = estado.sobre.datos;
    var caja = h("div", { clase: "retrato-editor" });
    var vista = h("div", { clase: "retrato-preview" });
    var acciones = h("div", { clase: "retrato-acciones" });
    var entrada = h("input", { type: "file", accept: "image/*", hidden: true });
    var boton = h("button", {
      clase: "boton boton-principal boton-mini", type: "button", texto: "Subir foto…",
      onclick: function () { entrada.click(); }
    });
    var quitar = h("button", {
      clase: "boton boton-mini boton-peligro", type: "button", texto: "Quitar foto",
      onclick: function () {
        delete datos.foto;
        marcarSucio("sobre");
        pintar();
        toast("Foto quitada del borrador. Se aplicará al publicar.", "ok");
      }
    });
    var progreso = h("span", { clase: "ayuda", texto: "" });

    function pintar() {
      vista.innerHTML = "";
      if (datos.foto) vista.appendChild(h("img", { src: datos.foto, alt: "Retrato de Sobre mí" }));
      else vista.appendChild(h("span", { texto: "Sin foto" }));
      quitar.disabled = !datos.foto;
    }

    entrada.addEventListener("change", async function () {
      var fichero = entrada.files && entrada.files[0];
      if (!fichero) return;
      boton.disabled = true;
      progreso.textContent = "Comprimiendo y subiendo…";
      try {
        var dataUrl = await comprimirImagen(fichero, 1600);
        var respuesta = await api("upload", {
          action: "upload",
          destino: "sobre",
          base64: dataUrl
        });
        datos.foto = respuesta.foto;
        estado.cabeza = respuesta.cabeza || null;
        marcarSucio("sobre");
        pintar();
        progreso.textContent = "Foto subida (" + Math.round(dataUrl.length / 1365) + " KB).";
        toast("Foto subida. Se aplicará al pulsar «Subir todos los cambios».", "ok");
      } catch (error) {
        progreso.textContent = "";
        toast(error.message, "error");
      } finally {
        boton.disabled = false;
        entrada.value = "";
      }
    });

    pintar();
    acciones.appendChild(boton);
    acciones.appendChild(quitar);
    acciones.appendChild(entrada);
    acciones.appendChild(progreso);
    caja.appendChild(vista);
    caja.appendChild(h("div", { clase: "retrato-texto" }, [
      h("strong", { texto: "Foto de Sobre mí" }),
      h("p", {
        clase: "ayuda",
        texto: "Retrato que aparece junto a la presentación. Se recomienda una foto vertical. " +
          "Al elegirla se sube al repositorio; la referencia se publica con el resto de cambios."
      }),
      acciones
    ]));
    return caja;
  }

  function pintarSobre() {
    var lista = document.getElementById("lista-sobre");
    lista.innerHTML = "";
    if (!estado.sobre) estado.sobre = { datos: {} };
    var datos = estado.sobre.datos;
    if (!datos || typeof datos !== "object") datos = estado.sobre.datos = {};
    if (!datos.contacto || typeof datos.contacto !== "object") datos.contacto = {};

    lista.appendChild(bloqueRetratoSobre());
    lista.appendChild(campo({
      clave: "sobre_texto",
      fichero: "sobre",
      etiqueta: "Presentación",
      ayuda: "El único texto de la página. Separa los párrafos con una línea en blanco.",
      ancho: true,
      tipo: "textarea",
      filas: 14,
      valor: datos.texto || "",
      onInput: function (v) { datos.texto = v; }
    }));

    [
      { clave: "email", etiqueta: "Email", tipo: "email", ayuda: "Se usa en el enlace de correo." },
      { clave: "telefono", etiqueta: "Teléfono", ayuda: "El número tal y como quieres que se vea." },
      { clave: "whatsapp", etiqueta: "WhatsApp (URL)", tipo: "url", ayuda: "Por ejemplo: https://wa.me/34640834663" },
      { clave: "imdb", etiqueta: "IMDb (URL)", tipo: "url" },
      { clave: "instagram", etiqueta: "Instagram (URL)", tipo: "url" }
    ].forEach(function (def) {
      lista.appendChild(campo({
        clave: "sobre_contacto_" + def.clave,
        fichero: "sobre",
        etiqueta: def.etiqueta,
        ayuda: def.ayuda,
        ancho: true,
        tipo: def.tipo || "text",
        valor: datos.contacto[def.clave] || "",
        onInput: function (v) { datos.contacto[def.clave] = v; }
      }));
    });

    lista.appendChild(h("p", {
      clase: "ayuda",
      texto: "Los enlaces vacíos no se muestran en la página."
    }));
  }

  /* --------------------------------- contacto --------------------------------- */

  var CAMPOS_CONTACTO = [
    { clave: "etiqueta", etiqueta: "Antetítulo", ayuda: "La línea pequeña encima del titular." },
    { clave: "titulo", etiqueta: "Titular", ancho: true },
    { clave: "email", etiqueta: "Email", tipo: "email", ancho: true, ayuda: "Se usa en el enlace de correo y en el pie de la página." },
    { clave: "encargos_titulo", etiqueta: "Encargos · título" },
    { clave: "encargos_texto", etiqueta: "Encargos · texto", ancho: true, largo: true },
    { clave: "alquiler_titulo", etiqueta: "Alquiler · título" },
    { clave: "alquiler_texto", etiqueta: "Alquiler · texto del enlace", ancho: true, ayuda: "El enlace siempre lleva al catálogo de alquiler." },
    { clave: "redes_titulo", etiqueta: "Redes · título" },
    { clave: "instagram_texto", etiqueta: "Redes · texto del enlace", ancho: true },
    { clave: "instagram", etiqueta: "Instagram (URL)", tipo: "url", ancho: true }
  ];

  function pintarContacto() {
    var lista = document.getElementById("lista-contacto");
    if (!lista) return;
    lista.innerHTML = "";
    if (!estado.contacto) estado.contacto = { datos: {} };
    var datos = estado.contacto.datos;
    if (!datos || typeof datos !== "object") datos = estado.contacto.datos = {};

    CAMPOS_CONTACTO.forEach(function (def) {
      lista.appendChild(campo({
        clave: "contacto_" + def.clave,
        fichero: "contacto",
        etiqueta: def.etiqueta,
        ayuda: def.ayuda,
        ancho: def.ancho,
        tipo: def.largo ? "textarea" : (def.tipo || "text"),
        largo: def.largo,
        valor: datos[def.clave] || "",
        onInput: function (v) { datos[def.clave] = v; }
      }));
    });

    lista.appendChild(h("p", {
      clase: "ayuda",
      texto: "Si dejas un campo vacío se mantiene el contenido original de la página. " +
        "Los enlaces vacíos no se muestran."
    }));
  }

  function pintarTextos() {
    var lista = document.getElementById("lista-textos");
    lista.innerHTML = "";
    TEXTOS.forEach(function (def) {
      lista.appendChild(campo({
        clave: "txt_" + def.clave,
        fichero: "textos",
        etiqueta: def.etiqueta,
        ayuda: def.ayuda,
        ancho: true,
        tipo: def.largo ? "textarea" : "text",
        largo: true,
        valor: estado.textos.datos[def.clave] || "",
        onInput: function (v) { estado.textos.datos[def.clave] = v; }
      }));
    });
    lista.appendChild(h("p", {
      clase: "ayuda",
      texto: "Si dejas un campo vacío se mantiene el texto original de la web."
    }));
  }

  /* --------------------------------- ajustes --------------------------------- */

  function pintarAjustes() {
    var lista = document.getElementById("lista-ajustes");
    lista.innerHTML = "";
    var general = estado.proyectos.general;
    [
      { clave: "nombre", etiqueta: "Nombre", ancho: false },
      { clave: "rol", etiqueta: "Oficio", ancho: false },
      { clave: "email", etiqueta: "Email", ancho: false },
      { clave: "instagram", etiqueta: "Instagram (URL)", ancho: false },
      { clave: "base", etiqueta: "Base", ancho: false }
    ].forEach(function (def) {
      lista.appendChild(campo({
        clave: "gen_" + def.clave,
        fichero: "proyectos",
        etiqueta: def.etiqueta,
        ancho: def.ancho,
        valor: general[def.clave] || "",
        onInput: function (v) { general[def.clave] = v; }
      }));
    });
  }

  /* ------------------------------- publicación ------------------------------- */

  function pintarBarra() {
    var barra = document.getElementById("barra-publicar");
    var cuenta = document.getElementById("pendientes");
    if (!barra) return;
    var partes = [];
    if (pendiente.proyectos) partes.push("proyectos");
    if (pendiente.material) partes.push("catálogo");
    if (pendiente.textos) partes.push("textos");
    if (pendiente.sobre) partes.push("Sobre mí");
    if (pendiente.contacto) partes.push("Contacto");
    if (!partes.length) {
      barra.hidden = true;
      sucio = false;
      return;
    }
    barra.hidden = false;
    cuenta.textContent = "Sin publicar: " + partes.join(", ");
  }

  async function publicar() {
    if (!estado || !estado.cargado) {
      toast(
        "No se han podido leer los datos del repositorio, así que no se publica nada. " +
          "Pulsa «Recargar» y, si sigue igual, «Diagnóstico».",
        "error"
      );
      return;
    }
    var tieneCola = estado.colaPendiente && estado.colaPendiente.length > 0;
    if (!pendiente.proyectos && !pendiente.material && !pendiente.textos && !pendiente.sobre && !pendiente.contacto && !tieneCola) {
      toast("No hay cambios pendientes.", "error");
      return;
    }

    var confirmar = false;
    var previos = estado.cargados || {
      proyectos: estado.proyectos.datos.length,
      material: estado.material.datos.length
    };
    if (pendiente.proyectos && estado.proyectos.datos.length < previos.proyectos) {
      confirmar = confirm(
        "Hay " + previos.proyectos + " proyectos en la web y vas a dejar " +
          estado.proyectos.datos.length + ". ¿Seguro que quieres borrar " +
          (previos.proyectos - estado.proyectos.datos.length) + "?"
      );
      if (!confirmar) return;
    }
    if (pendiente.material && estado.material.datos.length < previos.material) {
      confirmar = confirm(
        "Hay " + previos.material + " referencias en el catálogo y vas a dejar " +
          estado.material.datos.length + ". ¿Seguro?"
      );
      if (!confirmar) return;
    }

    var cambios = {};
    if (pendiente.proyectos || tieneCola) {
      cambios.proyectos = {
        general: estado.proyectos.general,
        datos: estado.proyectos.datos
      };
    }
    if (pendiente.material) cambios.material = { datos: estado.material.datos };
    if (pendiente.textos) cambios.textos = { datos: estado.textos.datos };
    if (pendiente.sobre) cambios.sobre = { datos: estado.sobre.datos };
    if (pendiente.contacto) cambios.contacto = { datos: estado.contacto.datos };

    var boton = document.getElementById("btn-publicar");
    boton.disabled = true;
    boton.textContent = "Publicando…";
    aviso("Publicando…");
    try {
      var resultado = await api("publicar", {
        action: "publicar",
        cambios: cambios,
        cola: tieneCola ? estado.colaPendiente : undefined,
        baseSha: estado.cabeza || null,
        confirmar: confirmar
      });
      if (resultado.sinCambios) {
        marcarLimpio("No había cambios reales que publicar", "ok");
        toast("Nada que publicar: el contenido es idéntico al de la web.", "ok");
      } else {
        marcarLimpio("Publicado ✓ " + resultado.commit, "ok");
        toast(
          "Publicado en un solo commit (" + resultado.commit + "):\n" +
            (resultado.mensaje || "") +
            (tieneCola
              ? "\n\nGitHub Actions generará la vista previa online en unos minutos. No cierres nada: " +
                "la web se actualiza sola cuando termine."
              : "\n\nLa web se actualiza en ~60 s."),
          "ok"
        );
      }
      pendiente = { proyectos: false, material: false, textos: false, sobre: false, contacto: false };
      estado.colaPendiente = [];
      sucio = false;
      pintarBarra();
      var fresco = await api("load");
      estado.cabeza = fresco.cabeza || estado.cabeza;
      estado.cola = typeof fresco.cola === "number" ? fresco.cola : estado.cola;
      estado.colaItems = Array.isArray(fresco.colaItems) ? fresco.colaItems : [];
      estado.cargados = {
        proyectos: estado.proyectos.datos.length,
        material: estado.material.datos.length
      };
    } catch (error) {
      marcarLimpio(error.message, "error");
      toast(error.message, "error");
      if (error.codigo === 409) {
        toast("Recargando el contenido del repositorio…", "error");
        await cargarTodo();
        pendiente = { proyectos: false, material: false, textos: false, sobre: false, contacto: false };
        pintarBarra();
      }
    } finally {
      boton.disabled = false;
      boton.textContent = "Subir todos los cambios";
    }
  }

  document.getElementById("btn-publicar").addEventListener("click", publicar);

  document.getElementById("btn-descartar").addEventListener("click", async function () {
    if (!confirm("¿Descartar todos los cambios sin publicar?")) return;
    pendiente = { proyectos: false, material: false, textos: false, sobre: false, contacto: false };
    sucio = false;
    pintarBarra();
    await cargarTodo();
    toast("Cambios descartados.", "ok");
  });

  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (document.getElementById("app").hidden) return;
      publicar();
    }
  });

  window.addEventListener("beforeunload", function (e) {
    if (sucio) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  iniciar();
})();
