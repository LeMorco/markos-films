/* ============================================================
   MARCOS DONATE — Página Sobre mí
   Carga content/sobre-mi.json y aplica el texto, la foto y los
   datos de contacto. Si falla, se queda el contenido del HTML.
   ============================================================ */
(function () {
  "use strict";

  if (!window.fetch) return;

  function setTexto(selector, valor) {
    if (typeof valor !== "string" || !valor.trim()) return;
    var elemento = document.querySelector(selector);
    if (elemento) elemento.textContent = valor.trim();
  }

  function setEnlace(clave, texto, href) {
    var enlace = document.querySelector('[data-sobre-contacto="' + clave + '"]');
    if (!enlace) return;
    if (!texto || !href) {
      enlace.parentElement.hidden = true;
      return;
    }
    enlace.textContent = texto;
    enlace.setAttribute("href", href);
  }

  function handleInstagram(url) {
    var coincidencia = /instagram\.com\/([^/?#]+)/i.exec(String(url || ""));
    return coincidencia ? "@" + coincidencia[1].replace(/\/$/, "") : "Instagram";
  }

  fetch("content/sobre-mi.json", { cache: "no-cache", credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (datos) {
      if (!datos || typeof datos !== "object") return;

      var bio = document.querySelector('[data-sobre="texto"]');
      if (bio && typeof datos.texto === "string" && datos.texto.trim()) {
        bio.innerHTML = "";
        datos.texto.split(/\n\s*\n/).forEach(function (bloque) {
          var parrafo = document.createElement("p");
          parrafo.textContent = bloque.trim();
          bio.appendChild(parrafo);
        });
      }

      var imagen = document.querySelector('[data-sobre="foto"]');
      if (imagen && typeof datos.foto === "string" && datos.foto.trim()) {
        var marco = imagen.parentElement;
        var hueco = marco && marco.querySelector("span");
        imagen.addEventListener("error", function () {
          imagen.hidden = true;
          if (hueco) hueco.hidden = false;
        });
        imagen.src = datos.foto.trim();
        imagen.hidden = false;
        if (hueco) hueco.hidden = true;
      }

      var contacto = datos.contacto || {};
      setEnlace("email", contacto.email, contacto.email ? "mailto:" + contacto.email : "");
      setEnlace(
        "telefono",
        contacto.telefono,
        contacto.telefono ? "tel:" + contacto.telefono.replace(/[^+\d]/g, "") : ""
      );
      setEnlace("whatsapp", contacto.telefono || "WhatsApp", contacto.whatsapp);
      setEnlace("imdb", "Ficha en IMDb", contacto.imdb);
      setEnlace("instagram", handleInstagram(contacto.instagram), contacto.instagram);
    })
    .catch(function () { /* si falla, se queda el contenido del HTML */ });
})();
