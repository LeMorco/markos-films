/* ============================================================
   MARCOS DONATE — Página Contacto
   Carga content/contacto.json y aplica el titular, el email y
   los textos de la página. Si falla, se queda el contenido del
   HTML. Los campos vacíos no borran el contenido original.
   ============================================================ */
(function () {
  "use strict";

  if (!window.fetch) return;

  function todos(selector) {
    return Array.prototype.slice.call(document.querySelectorAll(selector));
  }

  function aplicar(elemento, valor) {
    var dentro = elemento.querySelector(".mask-inner");
    if (dentro) dentro.textContent = valor;
    else elemento.textContent = valor;
  }

  function setTexto(clave, valor) {
    if (typeof valor !== "string" || !valor.trim()) return;
    todos('[data-contacto="' + clave + '"]').forEach(function (elemento) {
      aplicar(elemento, valor.trim());
    });
  }

  function setEmail(valor) {
    var correo = typeof valor === "string" ? valor.trim() : "";
    if (!correo) return;
    todos('[data-contacto="email"]').forEach(function (elemento) {
      aplicar(elemento, correo);
      elemento.setAttribute("href", "mailto:" + correo);
    });
  }

  function setEnlace(clave, url) {
    var destino = typeof url === "string" ? url.trim() : "";
    if (!destino) return;
    todos('[data-contacto-href="' + clave + '"]').forEach(function (elemento) {
      elemento.setAttribute("href", destino);
    });
  }

  fetch("content/contacto.json", { cache: "no-cache", credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (datos) {
      if (!datos || typeof datos !== "object") return;

      setTexto("etiqueta", datos.etiqueta);
      setTexto("titulo", datos.titulo);
      setEmail(datos.email);

      setTexto("encargos_titulo", datos.encargos_titulo);
      setTexto("encargos_texto", datos.encargos_texto);

      setTexto("alquiler_titulo", datos.alquiler_titulo);
      setTexto("alquiler_texto", datos.alquiler_texto);

      setTexto("redes_titulo", datos.redes_titulo);
      setTexto("instagram_texto", datos.instagram_texto);
      setEnlace("instagram", datos.instagram);
    })
    .catch(function () { /* si falla, se queda el contenido del HTML */ });
})();
