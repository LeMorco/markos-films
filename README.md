# Markos Films — Portfolio

Portfolio de fotografía y dirección de cine. Web estática (HTML + CSS + JS) lista para desplegar en Vercel sin build.

## Despliegue en Vercel

1. Sube este repositorio a GitHub (origin ya configurado: `LeMorco/markos-films`).
2. En https://vercel.com → **Add New → Project** → importa `LeMorco/markos-films`.
3. Deja el framework en **Other** (estático) y despliega. No necesita build ni variables de entorno.

También puedes desplegar desde local: `npx vercel`.

## Cómo actualizar el contenido

- **Proyectos**: edita `assets/js/data.js` (título, categoria, año, cliente, rol, cámara, descripción, imágenes y, opcionalmente, URL de Vimeo/YouTube en el campo `video`).
- **Imágenes**: sustituye los ficheros de `assets/img/` por tus fotos/fotogramas manteniendo los nombres, o cambia las rutas en `data.js`.
- **Textos**: `sobre-mi.html`, `contacto.html`, el hero de `index.html` y los enlaces de redes (footer y contacto) se editan directamente en su HTML.

## Estructura

```
index.html        portada (hero + proyectos destacados)
proyectos.html    grid con filtros por categoría
proyecto.html     ficha + galería + lightbox (?p=slug)
sobre-mi.html     bio, servicios y equipo
contacto.html     email y redes
assets/img/       imágenes (portadas + galerías + retrato + hero)
assets/js/data.js todos los proyectos (editable)
assets/js/main.js lógica del sitio (filtros, detail, lightbox)
assets/css/style.css
```
