/**
 * POST/GET /api/admin — panel de edición del sitio.
 *
 * Un único endpoint con acciones:
 *   GET  ?action=state                  -> {configurado, autenticado}
 *   POST  action=login  {usuario, clave}
 *   POST  action=logout
 *   GET  ?action=load                   -> datos de proyectos, material y textos
 *   POST  action=save   {fichero, datos, baseSha}
 *
 * Los cambios se guardan como commits en GitHub, así que Vercel los publica
 * solo en ~1 minuto y queda historial de todo lo editado.
 *
 * Variables de entorno en Vercel (Settings > Environment Variables):
 *   ADMIN_PASSWORD   (obligatoria) contraseña del panel
 *   ADMIN_USER       (opcional)    usuario; por defecto "marcos"
 *   SESSION_SECRET   (recomendada) secreto para firmar la sesión
 *   GITHUB_TOKEN     (obligatoria) token con permiso Contents: read/write
 *   GITHUB_REPO      (opcional)    por defecto "LeMorco/markos-films"
 *   GITHUB_BRANCH    (opcional)    por defecto "main"
 *
 * Para probar en local sin token:
 *   ADMIN_LOCAL_ROOT=C:\ruta\al\repo  -> lee y escribe los ficheros del disco
 */

const crypto = require("crypto");
const fsp = require("fs/promises");
const pathMod = require("path");

const COOKIE = "md_admin";
const SESION_MS = 8 * 60 * 60 * 1000; // 8 horas
const MAX_INTENTOS = 8;
const VENTANA_MS = 10 * 60 * 1000;

const FICHEROS = {
  proyectos: { ruta: "assets/js/data.js", marca: "window.MARKOS", tipo: "js" },
  material: { ruta: "assets/js/rental.js", marca: "window.RENTAL", tipo: "js" },
  textos: { ruta: "content/textos.json", marca: null, tipo: "json" }
};

const COLA_CLIPS = "content/cola-clips.json";

const CLAVES_TEXTO = [
  "hero_kicker",
  "hero_sub",
  "proyectos_titulo",
  "proyectos_intro",
  "alquiler_titulo",
  "alquiler_intro",
  "contacto_titulo",
  "sobre_titulo",
  "sobre_bio",
  "sobre_trayectoria",
  "sobre_servicios",
  "sobre_equipo",
  "sobre_contacto"
];

const intentos = new Map();

/* ------------------------------ utilidades ------------------------------ */

function env(nombre) {
  return String(process.env[nombre] || "")
    .trim()
    .replace(/^["'`]|["'`]$/g, "")
    .trim();
}

/* datos del token sin revelarlo: sirve para detectar el error típico al pegarlo */
function infoToken() {
  const t = token();
  if (!t) return { presente: false };
  return {
    presente: true,
    formato: t.indexOf("github_pat_") === 0
      ? "fine-grained"
      : t.indexOf("ghp_") === 0
        ? "clásico"
        : "desconocido",
    longitud: t.length,
    conEspacios: t !== String(process.env.GITHUB_TOKEN || ""),
    empiezaPor: t.slice(0, 4) + "…",
    pareceValido: /^(gh[pousr]_|github_pat_)/.test(t)
  };
}

function usuarioEsperado() {
  return env("ADMIN_USER") || "marcos";
}

function secreto() {
  return env("SESSION_SECRET") || env("ADMIN_PASSWORD");
}

function repo() {
  return env("GITHUB_REPO") || "LeMorco/markos-films";
}

function rama() {
  return env("GITHUB_BRANCH") || "main";
}

function token() {
  return env("GITHUB_TOKEN");
}

function igualSeguro(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb) && String(a) === String(b);
}

function firmar(expira) {
  return crypto.createHmac("sha256", secreto()).update(String(expira)).digest("hex");
}

function crearCookie() {
  const expira = Date.now() + SESION_MS;
  const valor = expira + "." + firmar(expira);
  return (
    COOKIE + "=" + valor + "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=" +
    Math.floor(SESION_MS / 1000)
  );
}

function borrarCookie() {
  return COOKIE + "=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0";
}

function leerCookies(req) {
  const bruto = req.headers.cookie || "";
  const salida = {};
  bruto.split(";").forEach((parte) => {
    const i = parte.indexOf("=");
    if (i > 0) salida[parte.slice(0, i).trim()] = parte.slice(i + 1).trim();
  });
  return salida;
}

function autenticado(req) {
  if (!secreto()) return false;
  const valor = leerCookies(req)[COOKIE];
  if (!valor) return false;
  const [expira, firma] = valor.split(".");
  if (!expira || !firma) return false;
  if (Number(expira) < Date.now()) return false;
  const esperado = firmar(expira);
  if (esperado.length !== firma.length) return false;
  return crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(firma));
}

function ip(req) {
  const cabecera = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "";
  return String(cabecera).split(",")[0].trim() || "local";
}

function limitado(req) {
  const registro = intentos.get(ip(req));
  if (!registro) return false;
  if (Date.now() > registro.hasta) {
    intentos.delete(ip(req));
    return false;
  }
  return registro.n >= MAX_INTENTOS;
}

function anotarFallo(req) {
  const clave = ip(req);
  const registro = intentos.get(clave) || { n: 0, hasta: Date.now() + VENTANA_MS };
  registro.n += 1;
  intentos.set(clave, registro);
}

function limpiarIntentos(req) {
  intentos.delete(ip(req));
}

function json(res, codigo, datos) {
  res.statusCode = codigo;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.end(JSON.stringify(datos));
}

async function cuerpo(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const trozos = [];
  for await (const trozo of req) trozos.push(trozo);
  const bruto = Buffer.concat(trozos).toString("utf8");
  if (!bruto) return {};
  try {
    return JSON.parse(bruto);
  } catch (e) {
    return {};
  }
}

function texto(valor, max) {
  return String(valor == null ? "" : valor)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max || 400);
}

function slug(valor) {
  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/* --------------------------- lectura / escritura --------------------------- */

async function leerFichero(ruta) {
  const raiz = env("ADMIN_LOCAL_ROOT");
  if (raiz) {
    try {
      const completo = pathMod.join(raiz, ruta);
      const texto = await fsp.readFile(completo, "utf8");
      const sha = crypto.createHash("sha1").update(texto).digest("hex");
      return { texto, sha, existe: true };
    } catch (e) {
      return { texto: "", sha: null, existe: false };
    }
  }

  const url =
    "https://api.github.com/repos/" + repo() + "/contents/" + ruta + "?ref=" + rama();
  const r = await fetch(url, {
    headers: {
      Authorization: "Bearer " + token(),
      Accept: "application/vnd.github+json",
      "User-Agent": "markos-admin"
    }
  });
  if (r.status === 404) return { texto: "", sha: null, existe: false };
  if (r.status === 401) {
    throw new Error(
      "GitHub rechaza el token (401). Comprueba GITHUB_TOKEN en Vercel: " +
      "que esté completo, sin comillas ni espacios y sin caducar. " +
      "Pulsa «Diagnóstico» para ver más detalle."
    );
  }
  if (r.status === 403) {
    throw new Error(
      "GitHub no da permiso a ese token (403). Necesita Contents: Read and write " +
      "sobre " + repo() + "."
    );
  }
  if (!r.ok) throw new Error("GitHub " + r.status + " al leer " + ruta);
  const datos = await r.json();
  return {
    texto: Buffer.from(datos.content || "", "base64").toString("utf8"),
    sha: datos.sha,
    existe: true
  };
}

async function escribirFichero(ruta, contenido, sha, mensaje) {
  const raiz = env("ADMIN_LOCAL_ROOT");
  if (raiz) {
    const completo = pathMod.join(raiz, ruta);
    await fsp.mkdir(pathMod.dirname(completo), { recursive: true });
    await fsp.writeFile(completo, contenido, "utf8");
    return { commit: "local" };
  }

  const cuerpoPeticion = {
    message: mensaje,
    content: Buffer.from(contenido, "utf8").toString("base64"),
    branch: rama()
  };
  if (sha) cuerpoPeticion.sha = sha;

  const r = await fetch(
    "https://api.github.com/repos/" + repo() + "/contents/" + ruta,
    {
      method: "PUT",
      headers: {
        Authorization: "Bearer " + token(),
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "markos-admin"
      },
      body: JSON.stringify(cuerpoPeticion)
    }
  );
  if (r.status === 409 || r.status === 422) {
    const detalle = await r.text();
    throw new Error(
      "El fichero ha cambiado en GitHub mientras editabas (conflicto). " +
        "Recarga el panel y vuelve a aplicar tus cambios. " +
        detalle.slice(0, 200)
    );
  }
  if (!r.ok) {
    const detalle = await r.text();
    throw new Error("GitHub " + r.status + " al guardar: " + detalle.slice(0, 300));
  }
  const datos = await r.json();
  return { commit: datos.commit && datos.commit.sha ? datos.commit.sha.slice(0, 7) : null };
}

async function ghJson(ruta, opciones) {
  const r = await fetch("https://api.github.com/repos/" + repo() + ruta, Object.assign({
    headers: Object.assign({
      Authorization: "Bearer " + token(),
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "markos-admin"
    }, (opciones && opciones.headers) || {})
  }, opciones || {}));
  if (!r.ok) {
    const detalle = await r.text();
    throw new Error("GitHub " + r.status + " en " + ruta + ": " + detalle.slice(0, 240));
  }
  return r.json();
}

/* un solo commit con varios ficheros (API de datos de Git) */
async function commitMultiple(ficheros, mensaje, cuerpo, baseSha) {
  const raiz = env("ADMIN_LOCAL_ROOT");
  if (raiz) {
    for (const f of ficheros) {
      const completo = pathMod.join(raiz, f.ruta);
      await fsp.mkdir(pathMod.dirname(completo), { recursive: true });
      await fsp.writeFile(completo, f.contenido, "utf8");
    }
    return { commit: "local" };
  }

  const ref = await ghJson("/git/ref/heads/" + rama());
  const actual = ref.object.sha;
  if (baseSha && actual !== baseSha) {
    throw new Error(
      "CONFLICTO: el repositorio ha cambiado desde que abriste el panel. " +
      "Recarga y vuelve a aplicar los cambios."
    );
  }
  const base = await ghJson("/git/commits/" + actual);

  const blobs = [];
  for (const f of ficheros) {
    const blob = await ghJson("/git/blobs", {
      method: "POST",
      body: JSON.stringify({ content: f.contenido, encoding: "utf-8" })
    });
    blobs.push({ path: f.ruta, mode: "100644", type: "blob", sha: blob.sha });
  }

  const arbol = await ghJson("/git/trees", {
    method: "POST",
    body: JSON.stringify({ base_tree: base.tree.sha, tree: blobs })
  });

  const commit = await ghJson("/git/commits", {
    method: "POST",
    body: JSON.stringify({
      message: cuerpo ? mensaje + "\n\n" + cuerpo : mensaje,
      tree: arbol.sha,
      parents: [actual]
    })
  });

  await ghJson("/git/refs/heads/" + rama(), {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false })
  });

  return { commit: commit.sha.slice(0, 7) };
}

async function escribirBinario(ruta, buffer, mensaje) {
  const raiz = env("ADMIN_LOCAL_ROOT");
  if (raiz) {
    const completo = pathMod.join(raiz, ruta);
    await fsp.mkdir(pathMod.dirname(completo), { recursive: true });
    await fsp.writeFile(completo, buffer);
    return { commit: "local" };
  }

  const r = await fetch("https://api.github.com/repos/" + repo() + "/contents/" + ruta, {
    method: "PUT",
    headers: {
      Authorization: "Bearer " + token(),
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "markos-admin"
    },
    body: JSON.stringify({
      message: mensaje,
      content: buffer.toString("base64"),
      branch: rama()
    })
  });
  if (!r.ok) {
    const detalle = await r.text();
    throw new Error("GitHub " + r.status + " al subir la imagen: " + detalle.slice(0, 300));
  }
  const datos = await r.json();
  return { commit: datos.commit && datos.commit.sha ? datos.commit.sha.slice(0, 7) : null };
}

/* ------------------------------- validación ------------------------------- */

function normalizarProyectos(datos) {
  if (!Array.isArray(datos)) throw new Error("Proyectos debe ser una lista");
  const vistos = new Set();
  return datos.map((p) => {
    const proyecto = {
      slug: slug(p && p.slug),
      titulo: texto(p && p.titulo, 120),
      tipo: texto(p && p.tipo, 40),
      artista: texto(p && p.artista, 120),
      youtube: texto(p && p.youtube, 20).replace(/[^A-Za-z0-9_-]/g, ""),
      link: texto(p && p.link, 500),
      director: texto(p && p.director, 120),
      productora: texto(p && p.productora, 160),
      year: texto(p && p.year, 12),
      rol: texto(p && p.rol, 160),
      descripcion: texto(p && p.descripcion, 1200),
      nota: texto(p && p.nota, 600)
    };
    if (p && p.preview !== undefined && p.preview !== null && p.preview !== "") {
      proyecto.preview = Math.min(36000, Math.max(0, parseInt(p.preview, 10) || 0));
    }
    if (p && p.destacado) proyecto.destacado = true;
    if (!proyecto.slug) throw new Error("Hay un proyecto sin slug");
    if (!proyecto.titulo) throw new Error("El proyecto " + proyecto.slug + " no tiene título");
    if (vistos.has(proyecto.slug)) throw new Error("Slug repetido: " + proyecto.slug);
    vistos.add(proyecto.slug);
    // conserva claves desconocidas para no perder datos al guardar
    Object.keys(p || {}).forEach((k) => {
      if (!(k in proyecto) && k !== "destacado") {
        const v = p[k];
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
          proyecto[k] = typeof v === "string" ? texto(v, 1200) : v;
        }
      }
    });
    return proyecto;
  });
}

function normalizarMaterial(datos, categorias) {
  if (!Array.isArray(datos)) throw new Error("Material debe ser una lista");
  const ids = new Set();
  const validas = new Set(categorias.map((c) => c.id));
  return datos.map((m) => {
    const id = texto(m && m.id, 12).toUpperCase();
    const item = {
      id,
      codigo: texto((m && m.codigo) || id, 12) || id,
      nombre: texto(m && m.nombre, 140),
      categoria: texto(m && m.categoria, 40),
      unidades:
        m && (m.unidades === null || m.unidades === "null" || m.unidades === "")
          ? null
          : Math.min(999, Math.max(1, parseInt(m && m.unidades, 10) || 1)),
      notas: texto(m && m.notas, 600),
      foto: texto(m && m.foto, 240)
    };
    if (!item.id) throw new Error("Hay una referencia de material sin código");
    if (ids.has(item.id)) throw new Error("Código repetido en el material: " + item.id);
    if (!item.nombre) throw new Error("La referencia " + item.id + " no tiene nombre");
    if (!validas.has(item.categoria)) {
      throw new Error("Categoría desconocida en " + item.id + ": " + item.categoria);
    }
    if (item.foto && !/^assets\/img\/material\/[A-Za-z0-9._-]+$/.test(item.foto)) {
      throw new Error("Ruta de foto no válida en " + item.id + ": " + item.foto);
    }
    ids.add(item.id);
    return item;
  });
}

function normalizarTextos(datos) {
  const salida = {};
  CLAVES_TEXTO.forEach((clave) => {
    const valor = texto(datos && datos[clave], 1200);
    if (valor) salida[clave] = valor;
  });
  return salida;
}

/* --------------------------------- lectura de los ficheros --------------------------------- */

function evaluarJs(fuente) {
  const ventana = {};
  // Los ficheros son del propio repo; se evalúan para reconstruir el objeto
  // tal cual, sin reescribir a mano el literal.
  new Function("window", fuente)(ventana);
  return ventana;
}

function extraerJs(fuente, marca) {
  const ventana = evaluarJs(fuente || "");
  return ventana[marca.replace("window.", "")];
}

function serializarJs(fuente, marca, valor) {
  const i = (fuente || "").indexOf(marca);
  const prefijo = i > 0 ? fuente.slice(0, i) : "";
  return prefijo + marca + " = " + JSON.stringify(valor, null, 2) + ";\n";
}

async function cargar() {
  const errores = [];
  const leer = async (ruta) => {
    try {
      return await leerFichero(ruta);
    } catch (error) {
      errores.push(String(error.message));
      return { texto: "", sha: null, existe: false };
    }
  };
  const colaClip = await leer(COLA_CLIPS);
  let enCola = 0;
  if (colaClip.texto) {
    try {
      const parseada = JSON.parse(colaClip.texto);
      enCola = Array.isArray(parseada) ? parseada.length : 0;
    } catch (error) {
      enCola = 0;
    }
  }

  const [proyectos, material, textos] = await Promise.all([
    leer(FICHEROS.proyectos.ruta),
    leer(FICHEROS.material.ruta),
    leer(FICHEROS.textos.ruta)
  ]);

  const markos = extraerJs(proyectos.texto, FICHEROS.proyectos.marca) || {};
  const rental = extraerJs(material.texto, FICHEROS.material.marca) || {};
  let textosPlanos = {};
  if (textos.texto) {
    try {
      textosPlanos = JSON.parse(textos.texto);
    } catch (e) {
      textosPlanos = {};
    }
  }

  let cabeza = null;
  if (!env("ADMIN_LOCAL_ROOT")) {
    try {
      const ref = await ghJson("/git/ref/heads/" + rama());
      cabeza = ref.object.sha;
    } catch (error) {
      cabeza = null;
    }
  }

  return {
    errores,
    cabeza,
    cola: enCola,
    proyectos: {
      datos: markos.proyectos || [],
      general: {
        nombre: markos.nombre || "",
        rol: markos.rol || "",
        email: markos.email || "",
        instagram: markos.instagram || "",
        base: markos.base || ""
      },
      sha: proyectos.sha
    },
    material: {
      categorias: rental.categorias || [],
      datos: rental.material || [],
      sha: material.sha
    },
    textos: { datos: textosPlanos, sha: textos.sha }
  };
}

/* --------------------------------- guardado --------------------------------- */

async function guardar(fichero, datos, baseSha) {
  if (!FICHEROS[fichero]) throw new Error("Fichero desconocido");

  if (fichero === "proyectos") {
    const actual = await leerFichero(FICHEROS.proyectos.ruta);
    if (baseSha && actual.sha && baseSha !== actual.sha) {
      throw new Error("CONFLICTO: el sitio ha cambiado desde que abriste el panel. Recarga.");
    }
    const markos = extraerJs(actual.texto, FICHEROS.proyectos.marca) || {};
    const existentes = Array.isArray(markos.proyectos) ? markos.proyectos.length : 0;
    const nuevos = normalizarProyectos(datos.proyectos);
    if (existentes > 0 && nuevos.length < existentes && !datos.confirmar) {
      throw new Error(
        "PROTECCION: el panel intenta guardar " + nuevos.length + " proyectos y en el " +
        "repositorio hay " + existentes + ". No se ha guardado nada. Recarga el panel; " +
        "si de verdad quieres borrar fichas, vuelve a guardar y confirma el aviso."
      );
    }
    if (datos.general) {
      const nuevo = Object.assign({}, markos);
      // solo se tocan las claves que llegan en la petición
      ["nombre", "rol", "email", "instagram", "base"].forEach((clave) => {
        if (!Object.prototype.hasOwnProperty.call(datos.general, clave)) return;
        const valor = texto(datos.general[clave], clave === "instagram" ? 240 : 160);
        if (clave === "nombre" && !valor) return; // el nombre nunca se queda vacío
        nuevo[clave] = valor;
      });
      nuevo.proyectos = nuevos;
      return escribir(fichero, actual, nuevo, "Panel: proyectos y datos generales");
    }
    const nuevo = Object.assign({}, markos, { proyectos: nuevos });
    return escribir(fichero, actual, nuevo, "Panel: proyectos");
  }

  if (fichero === "material") {
    const actual = await leerFichero(FICHEROS.material.ruta);
    if (baseSha && actual.sha && baseSha !== actual.sha) {
      throw new Error("CONFLICTO: el catálogo ha cambiado desde que abriste el panel. Recarga.");
    }
    const rental = extraerJs(actual.texto, FICHEROS.material.marca) || {};
    const categorias = Array.isArray(rental.categorias) ? rental.categorias : [];
    const existentes = Array.isArray(rental.material) ? rental.material.length : 0;
    const nuevos = normalizarMaterial(datos.material, categorias);
    if (existentes > 0 && nuevos.length < existentes && !datos.confirmar) {
      throw new Error(
        "PROTECCION: el panel intenta guardar " + nuevos.length + " referencias y en el " +
        "repositorio hay " + existentes + ". No se ha guardado nada. Recarga el panel."
      );
    }
    const nuevo = Object.assign({}, rental, { material: nuevos });
    return escribir(fichero, actual, nuevo, "Panel: catálogo de alquiler");
  }

  const actual = await leerFichero(FICHEROS.textos.ruta);
  if (baseSha && actual.sha && baseSha !== actual.sha) {
    throw new Error("CONFLICTO: los textos han cambiado desde que abriste el panel. Recarga.");
  }
  const limpios = normalizarTextos(datos.textos);
  const contenido = JSON.stringify(limpios, null, 2) + "\n";
  if (contenido === actual.texto) return { sinCambios: true };
  const resultado = await escribirFichero(
    FICHEROS.textos.ruta,
    contenido,
    actual.sha,
    "Panel: textos de las páginas"
  );
  return { ok: true, commit: resultado.commit };
}

async function escribir(fichero, actual, valor, mensaje) {
  const definicion = FICHEROS[fichero];
  const contenido = serializarJs(actual.texto, definicion.marca, valor);
  if (contenido === actual.texto) return { sinCambios: true };
  const resultado = await escribirFichero(definicion.ruta, contenido, actual.sha, mensaje);
  return { ok: true, commit: resultado.commit };
}

function idYoutube(url) {
  const m = /(?:v=|\/embed\/|\/shorts\/|\/live\/|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(String(url || ""));
  if (!m) return null;
  return m[1];
}

function idFacebook(url) {
  const m = /\/videos\/(?:[^/?#]+\/)?(\d+)/.exec(String(url || "")) ||
    /[?&]v=(\d+)/.exec(String(url || ""));
  if (!m) return null;
  return m[1];
}

async function datosYoutube(vid) {
  const enlace = "https://www.youtube.com/watch?v=" + vid;
  const salida = { vid, enlace, titulo: "", autor: "", miniatura: "" };

  try {
    const r = await fetch(
      "https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent(enlace),
      { headers: { "User-Agent": "markos-admin" } }
    );
    if (r.ok) {
      const d = await r.json();
      salida.titulo = texto(d.title, 160);
      salida.autor = texto(d.author_name, 120);
      salida.miniatura = texto(d.thumbnail_url, 300);
    }
  } catch (error) {
    /* si falla, se sigue con los valores por defecto */
  }

  if (!salida.miniatura) salida.miniatura = "https://i.ytimg.com/vi/" + vid + "/maxresdefault.jpg";
  return salida;
}

/* separa "Artista - Título" o "Título // Artista" en artista y título */
function partirTitulo(bruto, autor) {
  const limpio = String(bruto || "").trim();
  const guion = /^(.*?)\s+[-–—]\s+(.+)$/.exec(limpio);
  if (guion) {
    return { artista: texto(guion[1], 120), titulo: texto(guion[2], 160) };
  }
  return { artista: texto(autor, 120), titulo: texto(limpio, 160) };
}

async function importar(datos) {
  const vid = idYoutube(datos.url);
  if (!vid) throw new Error("Esa URL no parece de YouTube (youtu.be/… o watch?v=…)");

  const actual = await leerFichero(FICHEROS.proyectos.ruta);
  const markos = extraerJs(actual.texto, FICHEROS.proyectos.marca) || {};
  const lista = Array.isArray(markos.proyectos) ? markos.proyectos : [];

  const ya = lista.filter((p) => p && p.youtube === vid)[0];
  if (ya) {
    return { ok: true, existente: true, slug: ya.slug, titulo: ya.titulo };
  }

  const info = await datosYoutube(vid);
  const partes = partirTitulo(info.titulo, info.autor);

  let base = slug(partes.titulo) || slug("proyecto-" + vid);
  let candidato = base;
  let n = 2;
  const usados = lista.map((p) => p && p.slug);
  while (usados.indexOf(candidato) > -1) {
    candidato = base + "-" + n;
    n += 1;
  }

  const proyecto = {
    slug: candidato,
    titulo: partes.titulo || info.titulo || "Proyecto",
    tipo: "",
    artista: partes.artista,
    youtube: vid,
    link: info.enlace,
    director: "",
    productora: "",
    year: "",
    rol: markos.rol ? "Técnico de iluminación (gaffer)" : "",
    descripcion: "",
    nota: ""
  };

  const nuevo = Object.assign({}, markos, { proyectos: lista.concat([proyecto]) });
  const contenido = serializarJs(actual.texto, FICHEROS.proyectos.marca, nuevo);
  const resultado = await escribirFichero(
    FICHEROS.proyectos.ruta,
    contenido,
    actual.sha,
    "Panel: nuevo proyecto desde YouTube (" + proyecto.slug + ")"
  );

  return {
    ok: true,
    proyecto,
    miniatura: info.miniatura,
    commit: resultado.commit,
    clip: Boolean(datos.clip)
  };
}

async function subirImagen(datos) {
  const codigo = texto(datos.codigo, 12)
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");
  if (!codigo) throw new Error("Falta el código de la referencia");

  const coincidencia = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(
    String(datos.base64 || "")
  );
  if (!coincidencia) throw new Error("La imagen debe ser JPG, PNG o WebP");

  const buffer = Buffer.from(coincidencia[2], "base64");
  if (!buffer.length) throw new Error("La imagen está vacía");
  if (buffer.length > 4 * 1024 * 1024) {
    throw new Error("La imagen pesa demasiado después de comprimirla (máx. 4 MB)");
  }

  const extension = coincidencia[1] === "jpeg" ? "jpg" : coincidencia[1];
  const sello =
    new Date().toISOString().slice(0, 10).replace(/-/g, "") +
    "-" +
    crypto.randomBytes(2).toString("hex");
  const ruta = "assets/img/material/" + codigo + "-" + sello + "." + extension;
  const resultado = await escribirBinario(
    ruta,
    buffer,
    "Panel: foto de " + codigo + " (" + Math.round(buffer.length / 1024) + " KB)"
  );
  return { ok: true, foto: ruta, commit: resultado.commit };
}

async function encolarClip(datos) {
  const url = texto(datos.url, 300);
  const vid = idYoutube(url);
  const fb = vid ? null : idFacebook(url);
  if (!vid && !fb) throw new Error("Esa URL no parece de YouTube ni de Facebook");
  const nombre = slug(datos.slug) || slug("clip-" + (vid || fb));

  const actual = await leerFichero(COLA_CLIPS);
  let cola = [];
  if (actual.texto) {
    try {
      cola = JSON.parse(actual.texto);
    } catch (error) {
      cola = [];
    }
  }
  if (!Array.isArray(cola)) cola = [];
  cola = cola.filter((c) => c && c.slug !== nombre);
  cola.push({
    slug: nombre,
    url: vid ? "https://www.youtube.com/watch?v=" + vid : url,
    inicio: datos.inicio == null ? null : Math.max(0, parseInt(datos.inicio, 10) || 0)
  });

  const resultado = await escribirFichero(
    COLA_CLIPS,
    JSON.stringify(cola, null, 2) + "\n",
    actual.sha,
    "Panel: en cola el clip de " + nombre
  );
  return { ok: true, enCola: cola.length, commit: resultado.commit };
}

/* ------------------------- publicación conjunta ------------------------- */

function canonico(obj) {
  if (!obj || typeof obj !== "object") return JSON.stringify(obj);
  return JSON.stringify(
    Object.keys(obj)
      .sort()
      .reduce((acc, clave) => {
        acc[clave] = obj[clave];
        return acc;
      }, {})
  );
}

function diferir(viejos, nuevos, clave) {
  const indexar = (lista) => {
    const mapa = new Map();
    (lista || []).forEach((item) => {
      if (item && item[clave] != null) mapa.set(item[clave], item);
    });
    return mapa;
  };
  const antes = indexar(viejos);
  const despues = indexar(nuevos);
  const nuevosItems = [];
  const editados = [];
  const borrados = [];

  despues.forEach((item, id) => {
    if (!antes.has(id)) nuevosItems.push(item);
    else if (canonico(antes.get(id)) !== canonico(item)) editados.push(item);
  });
  antes.forEach((item, id) => {
    if (!despues.has(id)) borrados.push(item);
  });

  return { nuevos: nuevosItems, editados, borrados };
}

function trozoProyectos(diff, generalCambiado) {
  const partes = [];
  if (diff.nuevos.length) {
    partes.push(diff.nuevos.length + (diff.nuevos.length === 1 ? " proyecto nuevo" : " proyectos nuevos"));
  }
  if (diff.editados.length) {
    partes.push(diff.editados.length + (diff.editados.length === 1 ? " proyecto editado" : " proyectos editados"));
  }
  if (diff.borrados.length) {
    partes.push(diff.borrados.length + (diff.borrados.length === 1 ? " proyecto borrado" : " proyectos borrados"));
  }
  if (!partes.length && generalCambiado) partes.push("datos de contacto");
  return partes.join(", ");
}

async function publicar(datos, baseSha) {
  const cambios = datos.cambios || {};
  const confirmar = datos.confirmar === true;
  const ficheros = [];
  const titulos = [];
  const detalle = [];

  if (cambios.proyectos) {
    const actual = await leerFichero(FICHEROS.proyectos.ruta);
    const markos = extraerJs(actual.texto, FICHEROS.proyectos.marca) || {};
    const viejos = Array.isArray(markos.proyectos) ? markos.proyectos : [];
    const nuevos = normalizarProyectos(cambios.proyectos.datos);

    if (viejos.length > 0 && nuevos.length < viejos.length && !confirmar) {
      throw new Error(
        "PROTECCION: se van a guardar " + nuevos.length + " proyectos y en el repositorio hay " +
        viejos.length + ". No se ha guardado nada. Recarga el panel; si de verdad quieres " +
        "borrar fichas, vuelve a publicar y confirma el aviso."
      );
    }

    const diff = diferir(viejos, nuevos, "slug");
    const nuevoObjeto = Object.assign({}, markos);
    let generalCambiado = false;
    if (cambios.proyectos.general) {
      ["nombre", "rol", "email", "instagram", "base"].forEach((clave) => {
        if (!Object.prototype.hasOwnProperty.call(cambios.proyectos.general, clave)) return;
        const valor = texto(cambios.proyectos.general[clave], clave === "instagram" ? 240 : 160);
        if (clave === "nombre" && !valor) return;
        if (nuevoObjeto[clave] !== valor) generalCambiado = true;
        nuevoObjeto[clave] = valor;
      });
    }
    nuevoObjeto.proyectos = nuevos;

    const contenido = serializarJs(actual.texto, FICHEROS.proyectos.marca, nuevoObjeto);
    if (contenido !== actual.texto) {
      ficheros.push({ ruta: FICHEROS.proyectos.ruta, contenido });
      titulos.push(trozoProyectos(diff, generalCambiado));
      diff.nuevos.forEach((p) => detalle.push("+ proyecto: " + p.titulo + " (" + p.slug + ")"));
      diff.editados.forEach((p) => detalle.push("~ proyecto: " + p.titulo + " (" + p.slug + ")"));
      diff.borrados.forEach((p) => detalle.push("- proyecto: " + (p.titulo || p.slug)));
      if (generalCambiado) detalle.push("~ datos generales");
    }
  }

  if (cambios.material) {
    const actual = await leerFichero(FICHEROS.material.ruta);
    const rental = extraerJs(actual.texto, FICHEROS.material.marca) || {};
    const categorias = Array.isArray(rental.categorias) ? rental.categorias : [];
    const viejos = Array.isArray(rental.material) ? rental.material : [];
    const nuevos = normalizarMaterial(cambios.material.datos, categorias);

    if (viejos.length > 0 && nuevos.length < viejos.length && !confirmar) {
      throw new Error(
        "PROTECCION: se van a guardar " + nuevos.length + " referencias y en el repositorio hay " +
        viejos.length + ". No se ha guardado nada. Recarga el panel."
      );
    }

    const diff = diferir(viejos, nuevos, "id");
    const nuevoObjeto = Object.assign({}, rental, { material: nuevos });
    const contenido = serializarJs(actual.texto, FICHEROS.material.marca, nuevoObjeto);
    if (contenido !== actual.texto) {
      ficheros.push({ ruta: FICHEROS.material.ruta, contenido });
      const partes = [];
      const plural = (n, singular, varios) => n + " " + (n === 1 ? singular : varios);
      if (diff.nuevos.length) partes.push(plural(diff.nuevos.length, "referencia nueva", "referencias nuevas"));
      if (diff.editados.length) partes.push(plural(diff.editados.length, "referencia actualizada", "referencias actualizadas"));
      if (diff.borrados.length) partes.push(plural(diff.borrados.length, "referencia borrada", "referencias borradas"));
      titulos.push("catálogo: " + partes.join(", "));
      diff.nuevos.forEach((m) => detalle.push("+ material: " + m.codigo + " " + m.nombre));
      diff.editados.forEach((m) => detalle.push("~ material: " + m.codigo + " " + m.nombre));
      diff.borrados.forEach((m) => detalle.push("- material: " + m.codigo + " " + m.nombre));
    }
  }

  if (cambios.textos) {
    const actual = await leerFichero(FICHEROS.textos.ruta);
    let viejos = {};
    if (actual.texto) {
      try {
        viejos = JSON.parse(actual.texto);
      } catch (error) {
        viejos = {};
      }
    }
    const nuevos = normalizarTextos(cambios.textos.datos);
    const contenido = JSON.stringify(nuevos, null, 2) + "\n";
    if (contenido !== actual.texto) {
      ficheros.push({ ruta: FICHEROS.textos.ruta, contenido });
      const claves = Object.keys(nuevos).filter((k) => viejos[k] !== nuevos[k]);
      titulos.push(claves.length + (claves.length === 1 ? " texto" : " textos"));
      claves.forEach((k) => detalle.push("~ texto: " + k));
    }
  }

  const conTitulo = titulos.filter(Boolean);
  if (!ficheros.length) {
    return { sinCambios: true, mensaje: "No hay cambios que publicar" };
  }

  const mensaje = "Panel: " + (conTitulo.join(" · ") || "cambios de contenido");
  const cuerpo = detalle.length ? detalle.join("\n") : "";
  const resultado = await commitMultiple(ficheros, mensaje, cuerpo, baseSha);
  return { ok: true, commit: resultado.commit, mensaje, ficheros: ficheros.length, detalle };
}

/* ---------------------------------- handler ---------------------------------- */

module.exports = async function handler(req, res) {
  const configurado = Boolean(env("ADMIN_PASSWORD") && (env("ADMIN_LOCAL_ROOT") || token()));
  // el cuerpo se lee una sola vez: en el runtime de Vercel ya viene parseado,
  // aquí lo leemos del stream si hace falta
  const enviado = req.method === "GET" ? {} : await cuerpo(req);
  const accion =
    (req.query && req.query.action) || enviado.action || "state";

  try {
    if (accion === "diagnostico") {
      const pruebas = [];
      for (const clave of Object.keys(FICHEROS)) {
        const def = FICHEROS[clave];
        try {
          const leido = await leerFichero(def.ruta);
          pruebas.push({
            fichero: def.ruta,
            estado: leido.existe ? "ok" : "no existe",
            bytes: leido.texto ? Buffer.byteLength(leido.texto, "utf8") : 0
          });
        } catch (error) {
          pruebas.push({ fichero: def.ruta, estado: "error", detalle: String(error.message) });
        }
      }
      const t = infoToken();
      const aviso = t.presente && !t.pareceValido
        ? "El valor de GITHUB_TOKEN no parece un token de GitHub: tiene que empezar por " +
          "github_pat_ (fine-grained) o ghp_ (clásico) y no llevar la parte «GITHUB_TOKEN=»."
        : "";
      return json(res, 200, {
        configurado,
        aviso,
        origen: env("ADMIN_LOCAL_ROOT") ? "disco local" : "GitHub",
        repo: repo(),
        rama: rama(),
        token: infoToken(),
        pruebas
      });
    }

    if (accion === "state") {
      const t = infoToken();
      const aviso = t.presente && !t.pareceValido
        ? "El valor de GITHUB_TOKEN no parece un token de GitHub: tiene que empezar por " +
          "github_pat_ (fine-grained) o ghp_ (clásico) y no llevar la parte «GITHUB_TOKEN=»."
        : "";
      return json(res, 200, {
        configurado,
        aviso,
        autenticado: configurado && autenticado(req),
        usuario: usuarioEsperado(),
        repo: env("ADMIN_LOCAL_ROOT") ? null : repo()
      });
    }

    if (!configurado) {
      return json(res, 503, {
        error:
          "Falta configurar el panel en Vercel: define ADMIN_PASSWORD y GITHUB_TOKEN " +
          "en Settings > Environment Variables y vuelve a desplegar."
      });
    }

    if (accion === "login") {
      if (req.method !== "POST") return json(res, 405, { error: "Usa POST" });
      if (limitado(req)) {
        return json(res, 429, { error: "Demasiados intentos. Espera unos minutos." });
      }
      const datos = enviado;
      const ok =
        igualSeguro(texto(datos.usuario, 60), usuarioEsperado()) &&
        igualSeguro(texto(datos.clave, 200), env("ADMIN_PASSWORD"));
      if (!ok) {
        anotarFallo(req);
        return json(res, 401, { error: "Usuario o contraseña incorrectos" });
      }
      limpiarIntentos(req);
      res.setHeader("Set-Cookie", crearCookie());
      return json(res, 200, { ok: true });
    }

    if (accion === "logout") {
      res.setHeader("Set-Cookie", borrarCookie());
      return json(res, 200, { ok: true });
    }

    if (!autenticado(req)) return json(res, 401, { error: "Sesión caducada. Entra de nuevo." });

    if (accion === "load") {
      return json(res, 200, await cargar());
    }

    if (accion === "importar") {
      if (req.method !== "POST") return json(res, 405, { error: "Usa POST" });
      return json(res, 200, await importar(enviado));
    }

    if (accion === "clip") {
      if (req.method !== "POST") return json(res, 405, { error: "Usa POST" });
      return json(res, 200, await encolarClip(enviado));
    }

    if (accion === "upload") {
      if (req.method !== "POST") return json(res, 405, { error: "Usa POST" });
      return json(res, 200, await subirImagen(enviado));
    }

    if (accion === "publicar") {
      if (req.method !== "POST") return json(res, 405, { error: "Usa POST" });
      return json(res, 200, await publicar(enviado, enviado.baseSha));
    }

    if (accion === "save") {
      if (req.method !== "POST") return json(res, 405, { error: "Usa POST" });
      const datos = enviado;
      const resultado = await guardar(
        datos.fichero,
        Object.assign({}, datos.datos || {}, { confirmar: datos.confirmar === true }),
        datos.baseSha
      );
      return json(res, 200, resultado);
    }

    return json(res, 400, { error: "Acción desconocida: " + accion });
  } catch (error) {
    const mensaje = String((error && error.message) || error);
    const conflicto = /^(CONFLICTO|PROTECCION)/.test(mensaje) || mensaje.indexOf("conflicto") > -1;
    return json(res, conflicto ? 409 : 500, { error: mensaje.replace(/^CONFLICTO:\s*/, "") });
  }
};
