/**
 * POST /api/solicitud
 * Envía por correo (Resend) las solicitudes de alquiler del catálogo.
 *
 * Variables de entorno en Vercel:
 *   RESEND_API_KEY  (obligatoria)  API key de https://resend.com/api-keys
 *   RESEND_FROM     (opcional)     remitente verificado, p. ej. "Web Marcos Donate <web@tudominio.com>"
 *   RESEND_TO       (opcional)     destinatario; por defecto markosfilms1@gmail.com
 *
 * Si no hay RESEND_FROM, se usa "onboarding@resend.dev", que solo puede
 * enviar a la dirección con la que se creó la cuenta de Resend.
 */

const RESEND_URL = "https://api.resend.com/emails";

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function clean(value, max) {
  return String(value == null ? "" : value)
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, max || 200);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(value || "").trim());
}

function normalizarMaterial(material) {
  if (!Array.isArray(material)) return [];
  return material
    .slice(0, 60)
    .map((m) => ({
      codigo: clean(m && m.codigo, 12),
      nombre: clean(m && m.nombre, 120),
      cantidad: Math.min(999, Math.max(1, parseInt((m && m.cantidad) || 1, 10) || 1))
    }))
    .filter((m) => m.nombre);
}

function plantilla({ nombre, email, desde, hasta, proyecto, notas, material }) {
  const filas = material
    .map(
      (m) => `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e6ebe7;font-family:Arial,sans-serif;font-size:14px;color:#0c2d22;">
          <strong>${m.cantidad} ×</strong> ${esc(m.nombre)}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #e6ebe7;font-family:monospace;font-size:12px;color:#6d7867;text-align:right;">
          ${esc(m.codigo)}
        </td>
      </tr>`
    )
    .join("");

  const fecha = desde || hasta
    ? `${desde ? esc(desde) : "?"} → ${hasta ? esc(hasta) : "?"}`
    : "Sin fechas indicadas";

  return `<!DOCTYPE html>
<html lang="es"><body style="margin:0;padding:24px;background:#f4f6f4;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #dfe5df;">
    <tr>
      <td style="padding:28px 28px 20px;border-bottom:2px solid #729b93;">
        <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#6d7867;">
          Marcos Donate · Alquiler de material
        </p>
        <h1 style="margin:0;font-family:Arial,sans-serif;font-size:22px;font-weight:600;color:#0c2d22;">
          Nueva solicitud de presupuesto
        </h1>
      </td>
    </tr>
    <tr>
      <td style="padding:22px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial,sans-serif;font-size:14px;color:#18463c;">
          <tr><td style="padding:4px 0;width:130px;color:#6d7867;">Nombre</td><td style="padding:4px 0;"><strong>${esc(nombre)}</strong></td></tr>
          <tr><td style="padding:4px 0;color:#6d7867;">Email</td><td style="padding:4px 0;"><a href="mailto:${esc(email)}" style="color:#11665f;">${esc(email)}</a></td></tr>
          <tr><td style="padding:4px 0;color:#6d7867;">Fechas</td><td style="padding:4px 0;">${fecha}</td></tr>
          <tr><td style="padding:4px 0;color:#6d7867;">Proyecto</td><td style="padding:4px 0;">${proyecto ? esc(proyecto) : "—"}</td></tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:0 28px 8px;">
        <p style="margin:0 0 10px;font-family:Arial,sans-serif;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#6d7867;">
          Material solicitado
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e6ebe7;">
          ${filas || '<tr><td style="padding:14px;font-family:Arial,sans-serif;font-size:14px;color:#6d7867;">Sin material seleccionado</td></tr>'}
        </table>
      </td>
    </tr>
    ${
      notas
        ? `<tr><td style="padding:18px 28px 0;">
            <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#6d7867;">Notas</p>
            <p style="margin:0;padding:12px;background:#f7f9f7;border-left:2px solid #b7cdb8;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#18463c;">${esc(notas)}</p>
          </td></tr>`
        : ""
    }
    <tr>
      <td style="padding:24px 28px 28px;">
        <a href="mailto:${esc(email)}?subject=${encodeURIComponent("Re: solicitud de alquiler")}"
           style="display:inline-block;padding:11px 18px;background:#0c2d22;color:#d8e5de;font-family:Arial,sans-serif;font-size:13px;text-decoration:none;">
          Responder a ${esc(nombre)}
        </a>
        <p style="margin:18px 0 0;font-family:Arial,sans-serif;font-size:11px;color:#91806e;line-height:1.6;">
          Recibido desde la web el ${new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}.
        </p>
      </td>
    </tr>
  </table>
</body></html>`;
}

function texto({ nombre, email, desde, hasta, proyecto, notas, material }) {
  const lineas = [
    "Solicitud de alquiler de material",
    "--------------------------------",
    `Nombre: ${nombre || "—"}`,
    `Email: ${email || "—"}`,
    `Fechas: ${desde || "?"} -> ${hasta || "?"}`,
    `Proyecto: ${proyecto || "—"}`,
    "",
    "Material solicitado:"
  ];
  if (material.length) {
    material.forEach((m) => lineas.push(`  · ${m.cantidad} x ${m.nombre}${m.codigo ? " [" + m.codigo + "]" : ""}`));
  } else {
    lineas.push("  (sin material seleccionado)");
  }
  if (notas) lineas.push("", "Notas: " + notas);
  return lineas.join("\n");
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ ok: false, error: "Método no permitido" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  if (!body || typeof body !== "object") {
    return res.status(400).json({ ok: false, error: "Cuerpo inválido" });
  }

  /* honeypot anti-spam (campo oculto que debe venir vacío) */
  if (body.empresa) {
    return res.status(200).json({ ok: true });
  }

  const datos = {
    nombre: clean(body.nombre, 120),
    email: clean(body.email, 160),
    desde: clean(body.desde, 20),
    hasta: clean(body.hasta, 20),
    proyecto: clean(body.proyecto, 160),
    notas: String(body.notas || "").trim().slice(0, 2000),
    material: normalizarMaterial(body.material)
  };

  if (!datos.nombre) {
    return res.status(400).json({ ok: false, error: "Falta el nombre" });
  }
  if (!isEmail(datos.email)) {
    return res.status(400).json({ ok: false, error: "El email no es válido" });
  }
  if (!datos.material.length) {
    return res.status(400).json({ ok: false, error: "No hay material seleccionado" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[solicitud] falta RESEND_API_KEY");
    return res.status(500).json({
      ok: false,
      error: "El envío no está configurado todavía. Escríbeme a markosfilms1@gmail.com."
    });
  }

  const from = process.env.RESEND_FROM || "Solicitud web <onboarding@resend.dev>";
  const to = (process.env.RESEND_TO || "markosfilms1@gmail.com")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const n = datos.material.reduce((a, m) => a + m.cantidad, 0);
  const asunto = `Solicitud de alquiler — ${datos.nombre} (${n} ${n === 1 ? "equipo" : "equipos"})`;

  try {
    const respuesta = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to,
        subject: asunto,
        reply_to: datos.email,
        html: plantilla(datos),
        text: texto(datos)
      })
    });

    const resultado = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      console.error("[solicitud] Resend:", respuesta.status, resultado);
      return res.status(502).json({
        ok: false,
        error: "No se ha podido enviar el correo. Inténtalo de nuevo o escríbeme directamente."
      });
    }

    return res.status(200).json({ ok: true, id: resultado.id || null });
  } catch (error) {
    console.error("[solicitud] error de red:", error);
    return res.status(502).json({
      ok: false,
      error: "No se ha podido contactar con el servicio de correo."
    });
  }
};
