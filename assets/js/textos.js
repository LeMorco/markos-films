/* ============================================================
   MARCOS DONATE — Textos editables
   Aplica content/textos.json sobre los elementos con data-txt.
   Va después de main.js, que envuelve los titulares en
   .mask-inner para la animación de revelado: si existe, se
   cambia solo el texto interior para no romper la máscara.
   ============================================================ */
(function () {
  "use strict";

  function aplicar(elemento, valor) {
    var dentro = elemento.querySelector(".mask-inner");
    if (dentro) dentro.textContent = valor;
    else elemento.textContent = valor;
  }

  if (!window.fetch || !document.querySelector("[data-txt]")) return;

  fetch("content/textos.json", { cache: "no-cache", credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (textos) {
      if (!textos) return;
      Array.prototype.forEach.call(document.querySelectorAll("[data-txt]"), function (elemento) {
        var valor = textos[elemento.dataset.txt];
        if (typeof valor === "string" && valor.trim()) aplicar(elemento, valor);
      });
    })
    .catch(function () { /* si falla, se queda el texto original del HTML */ });
})();
