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
    estado = await api("load");
    pintarTodo();
    marcarLimpio("");
  }

  function pintarTodo() {
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
      lista.appendChild(h("p", { clase: "ayuda", texto: "Todavía no hay proyectos." }));
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

    cuerpo.appendChild(h("div", { clase: "ficha-acciones" }, [
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
      ayuda: "Ruta de la imagen dentro del repo.",
      onInput: function (v) { item.foto = v; pintarMiniatura(); }
    }));
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
    if (!estado) return;
    var cuerpo;
    if (fichero === "proyectos") {
      cuerpo = {
        action: "save",
        fichero: "proyectos",
        datos: { general: estado.proyectos.general, proyectos: estado.proyectos.datos },
        baseSha: estado.proyectos.sha
      };
    } else if (fichero === "material") {
      cuerpo = {
        action: "save",
        fichero: "material",
        datos: { material: estado.material.datos },
        baseSha: estado.material.sha
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
      estado = await api("load");
      pintarTodo();
    } catch (error) {
      marcarLimpio(error.message, "error");
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
