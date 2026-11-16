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

const CLAVES_TEXTO = [
  "hero_kicker",
  "hero_sub",
  "proyectos_titulo",
  "proyectos_intro",
  "alquiler_titulo",
  "alquiler_intro",
  "contacto_titulo"
];

const intentos = new Map();

/* ------------------------------ utilidades ------------------------------ */

function env(nombre) {
  return (process.env[nombre] || "").trim();
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
  const [proyectos, material, textos] = await Promise.all([
    leerFichero(FICHEROS.proyectos.ruta),
    leerFichero(FICHEROS.material.ruta),
    leerFichero(FICHEROS.textos.ruta)
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

  return {
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
    if (datos.general) {
      const nuevo = Object.assign({}, markos);
      nuevo.nombre = texto(datos.general.nombre, 120) || markos.nombre;
      nuevo.rol = texto(datos.general.rol, 120);
      nuevo.email = texto(datos.general.email, 160);
      nuevo.instagram = texto(datos.general.instagram, 240);
      nuevo.base = texto(datos.general.base, 120);
      nuevo.proyectos = normalizarProyectos(datos.proyectos);
      return escribir(fichero, actual, nuevo, "Panel: proyectos y datos generales");
    }
    const nuevo = Object.assign({}, markos, { proyectos: normalizarProyectos(datos.proyectos) });
    return escribir(fichero, actual, nuevo, "Panel: proyectos");
  }

  if (fichero === "material") {
    const actual = await leerFichero(FICHEROS.material.ruta);
    if (baseSha && actual.sha && baseSha !== actual.sha) {
      throw new Error("CONFLICTO: el catálogo ha cambiado desde que abriste el panel. Recarga.");
    }
    const rental = extraerJs(actual.texto, FICHEROS.material.marca) || {};
    const categorias = Array.isArray(rental.categorias) ? rental.categorias : [];
    const nuevo = Object.assign({}, rental, {
      material: normalizarMaterial(datos.material, categorias)
    });
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

/* ---------------------------------- handler ---------------------------------- */

module.exports = async function handler(req, res) {
  const configurado = Boolean(env("ADMIN_PASSWORD") && (env("ADMIN_LOCAL_ROOT") || token()));
  // el cuerpo se lee una sola vez: en el runtime de Vercel ya viene parseado,
  // aquí lo leemos del stream si hace falta
  const enviado = req.method === "GET" ? {} : await cuerpo(req);
  const accion =
    (req.query && req.query.action) || enviado.action || "state";

  try {
    if (accion === "state") {
      return json(res, 200, {
        configurado,
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

    if (accion === "save") {
      if (req.method !== "POST") return json(res, 405, { error: "Usa POST" });
      const datos = enviado;
      const resultado = await guardar(datos.fichero, datos.datos || {}, datos.baseSha);
      return json(res, 200, resultado);
    }

    return json(res, 400, { error: "Acción desconocida: " + accion });
  } catch (error) {
    const mensaje = String((error && error.message) || error);
    const conflicto = mensaje.indexOf("CONFLICTO") === 0 || mensaje.indexOf("conflicto") > -1;
    return json(res, conflicto ? 409 : 500, { error: mensaje.replace(/^CONFLICTO:\s*/, "") });
  }
};
