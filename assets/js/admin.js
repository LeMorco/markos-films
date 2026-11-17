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

  var TEXTOS = [
    { clave: "hero_kicker", etiqueta: "Portada · antetítulo", ayuda: "La línea pequeña encima del titular del inicio." },
    { clave: "hero_sub", etiqueta: "Portada · párrafo de entrada", ayuda: "El texto bajo «Luz para contar historias»." },
    { clave: "proyectos_titulo", etiqueta: "Proyectos · título", ayuda: "Cabecera de la página de proyectos." },
    { clave: "proyectos_intro", etiqueta: "Proyectos · entradilla", ayuda: "Párrafo bajo ese título." },
    { clave: "alquiler_titulo", etiqueta: "Alquiler · título", ayuda: "Cabecera del catálogo." },
    { clave: "alquiler_intro", etiqueta: "Alquiler · entradilla", ayuda: "Párrafo bajo ese título." },
    { clave: "contacto_titulo", etiqueta: "Contacto · título", ayuda: "Titular de la página de contacto." }
  ];

  var CAMPOS_PROYECTO = [
    { clave: "titulo", etiqueta: "Título", ancho: false },
    { clave: "tipo", etiqueta: "Tipo", ayuda: "cortometraje, videoclip, publicidad…", ancho: false },
    { clave: "artista", etiqueta: "Artista / cliente", ancho: false },
    { clave: "year", etiqueta: "Año", ancho: false },
    { clave: "director", etiqueta: "Dirección", ancho: false },
    { clave: "productora", etiqueta: "Productora", ancho: false },
    { clave: "rol", etiqueta: "Tu función", ancho: false },
    { clave: "youtube", etiqueta: "ID de YouTube", ayuda: "Solo el código, no la URL entera. Vacío si no hay vídeo.", ancho: false },
    { clave: "link", etiqueta: "Enlace del vídeo", ancho: true },
    { clave: "descripcion", etiqueta: "Descripción", ancho: true, largo: true },
    { clave: "nota", etiqueta: "Nota al pie de la ficha", ancho: true, largo: true }
  ];

  /* ------------------------------ utilidades ------------------------------ */

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
      control = h("textarea", { id: id, rows: opciones.largo ? 3 : 2 });
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
      marcarSucio();
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

  function marcarSucio() {
    sucio = true;
    aviso("Cambios sin guardar");
  }

  function marcarLimpio(texto, tipo) {
    sucio = false;
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
      pintarTodo();
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
    });

    cuerpo.appendChild(campo({
      clave: "slug_" + indice,
      etiqueta: "Dirección de la ficha (slug)",
      ayuda: "Aparece en proyecto.html?p=… No lo cambies si ya has compartido el enlace.",
      valor: proyecto.slug || "",
      onInput: function (valor) { proyecto.slug = valor; }
    }));

    var botonClip;
    if (proyecto.youtube) {
      botonClip = h("button", {
        clase: "boton boton-mini", type: "button", texto: "Generar clip de 7 s",
        onclick: async function () {
          botonClip.disabled = true;
          try {
            await api("clip", {
              action: "clip",
              url: "https://www.youtube.com/watch?v=" + proyecto.youtube,
              slug: proyecto.slug,
              inicio: proyecto.preview == null ? null : proyecto.preview
            });
            toast(
              "Clip en cola. GitHub lo genera en ~2 minutos y la web se actualiza sola.\n" +
                "Puedes seguir editando mientras tanto.",
              "ok"
            );
          } catch (error) {
            toast(error.message, "error");
          } finally {
            botonClip.disabled = false;
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
          marcarSucio();
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
      if (conClip) {
        await api("clip", { action: "clip", url: url, slug: r.proyecto.slug });
      }
      entrada.value = "";
      await cargarTodo();
      marcarLimpio("Proyecto añadido", "ok");
      toast(
        "«" + r.proyecto.titulo + "» añadido como " + r.proyecto.slug + "." +
          (conClip ? "\nClip en cola: GitHub lo publica en ~2 minutos." : ""),
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
    marcarSucio();
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
      clave: "codigo_" + indice, etiqueta: "Código", valor: item.codigo || "",
      onInput: function (v) {
        item.codigo = v;
        item.id = v.toUpperCase();
        cabecera.querySelector(".codigo-chip").textContent = v;
        ficha.querySelector(".ficha-meta").textContent = (item.codigo || "") + " · " + (item.unidades == null ? "sin límite" : item.unidades + " ud.");
        if (!item.foto || /^assets\/img\/material\//.test(item.foto) === false) return;
      }
    }));
    cuerpo.appendChild(campo({
      clave: "nombre_" + indice, etiqueta: "Nombre", valor: item.nombre || "",
      onInput: function (v) {
        item.nombre = v;
        cabecera.querySelector(".ficha-titulo").textContent = v || "(sin nombre)";
      }
    }));
    cuerpo.appendChild(campo({
      clave: "categoria_" + indice, etiqueta: "Categoría", tipo: "select",
      valor: item.categoria,
      opciones: estado.material.categorias.map(function (c) {
        return { valor: c.id, etiqueta: c.nombre };
      }),
      onInput: function (v) { item.categoria = v; }
    }));
    cuerpo.appendChild(campo({
      clave: "unidades_" + indice, etiqueta: "Unidades", tipo: "number",
      ayuda: "Vacío = sin límite",
      valor: item.unidades == null ? "" : item.unidades,
      onInput: function (v) {
        item.unidades = v === "" ? null : Math.max(1, parseInt(v, 10) || 1);
        cabecera.querySelectorAll(".ficha-meta")[0].textContent =
          (item.codigo || "") + " · " + (item.unidades == null ? "sin límite" : item.unidades + " ud.");
      }
    }));
    cuerpo.appendChild(campo({
      clave: "notas_" + indice, etiqueta: "Notas / especificaciones", tipo: "textarea", ancho: true,
      valor: item.notas || "",
      onInput: function (v) { item.notas = v; }
    }));
    cuerpo.appendChild(campo({
      clave: "foto_" + indice, etiqueta: "Foto", ancho: true,
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
        pintarMiniatura();
        var campoFoto = cuerpo.querySelector('input[placeholder="assets/img/material/A001.jpg"]');
        if (campoFoto) campoFoto.value = respuesta.foto;
        progresoFoto.textContent = "Subida (" + Math.round(dataUrl.length / 1365) + " KB). Guarda el catálogo para aplicarla.";
        marcarSucio();
        toast("Foto subida. Pulsa «Guardar catálogo» para publicarla.", "ok");
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
          marcarSucio();
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
    marcarSucio();
  });

  document.getElementById("filtro-material").addEventListener("input", function (e) {
    pintarMaterial(e.target.value);
  });

  /* ---------------------------------- textos ---------------------------------- */

  function pintarTextos() {
    var lista = document.getElementById("lista-textos");
    lista.innerHTML = "";
    TEXTOS.forEach(function (def) {
      lista.appendChild(campo({
        clave: "txt_" + def.clave,
        etiqueta: def.etiqueta,
        ayuda: def.ayuda,
        ancho: true,
        tipo: def.clave === "hero_sub" || def.clave === "alquiler_intro" || def.clave === "proyectos_intro" ? "textarea" : "text",
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
        etiqueta: def.etiqueta,
        ancho: def.ancho,
        valor: general[def.clave] || "",
        onInput: function (v) { general[def.clave] = v; }
      }));
    });
  }

  /* --------------------------------- guardado --------------------------------- */

  async function guardar(fichero) {
    if (!estado || !estado.cargado) {
      toast(
        "No se han podido leer los datos del repositorio, así que no se guarda nada " +
        "(así no se puede borrar contenido por accidente). Pulsa «Recargar» y, si sigue " +
        "igual, «Diagnóstico».",
        "error"
      );
      return;
    }

    var confirmar = false;
    var previos = estado.cargados || { proyectos: estado.proyectos.datos.length, material: estado.material.datos.length };
    if (fichero === "proyectos" && estado.proyectos.datos.length < previos.proyectos) {
      confirmar = confirm(
        "Ahora mismo hay " + previos.proyectos + " proyectos en la web y vas a " +
        "guardar " + estado.proyectos.datos.length + ". ¿Seguro que quieres borrar " +
        (previos.proyectos - estado.proyectos.datos.length) + "?"
      );
      if (!confirmar) return;
    }
    if (fichero === "material" && estado.material.datos.length < previos.material) {
      confirmar = confirm(
        "Hay " + previos.material + " referencias en el catálogo y vas a guardar " +
        estado.material.datos.length + ". ¿Seguro?"
      );
      if (!confirmar) return;
    }
    var cuerpo;
    if (fichero === "proyectos") {
      cuerpo = {
        action: "save",
        fichero: "proyectos",
        datos: { general: estado.proyectos.general, proyectos: estado.proyectos.datos },
        baseSha: estado.proyectos.sha,
        confirmar: confirmar
      };
    } else if (fichero === "material") {
      cuerpo = {
        action: "save",
        fichero: "material",
        datos: { material: estado.material.datos },
        baseSha: estado.material.sha,
        confirmar: confirmar
      };
    } else {
      cuerpo = {
        action: "save",
        fichero: "textos",
        datos: { textos: estado.textos.datos },
        baseSha: estado.textos.sha
      };
    }

    Array.prototype.forEach.call(document.querySelectorAll("[data-guardar]"), function (b) {
      b.disabled = true;
    });
    aviso("Guardando y publicando…");
    try {
      var resultado = await api("save", cuerpo);
      if (resultado.sinCambios) {
        marcarLimpio("Sin cambios que guardar", "ok");
      } else {
        marcarLimpio(
          "Guardado ✓ commit " + (resultado.commit || "") + " · la web se actualiza en ~60 s",
          "ok"
        );
      }
      var fresco = await api("load");
      ["proyectos", "material", "textos"].forEach(function (clave) {
        if (fresco[clave]) estado[clave].sha = fresco[clave].sha;
      });
      estado.cargados = {
        proyectos: estado.proyectos.datos.length,
        material: estado.material.datos.length
      };
      toast("Cambios publicados. La web se actualiza en ~60 s.", "ok");
    } catch (error) {
      marcarLimpio(error.message, "error");
      toast(error.message, "error");
      if (error.codigo === 409) {
        estado = await api("load");
        pintarTodo();
      }
    } finally {
      Array.prototype.forEach.call(document.querySelectorAll("[data-guardar]"), function (b) {
        b.disabled = false;
      });
    }
  }

  Array.prototype.forEach.call(document.querySelectorAll("[data-guardar]"), function (boton) {
    boton.addEventListener("click", function () { guardar(boton.dataset.guardar); });
  });

  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (document.getElementById("app").hidden) return;
      guardar(tabActual === "material" ? "material" : tabActual === "textos" ? "textos" : "proyectos");
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
