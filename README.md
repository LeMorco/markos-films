# Marcos Donate — Portfolio + alquiler de material

Web estática (HTML + CSS + JS, sin build) para el portfolio de Marcos Donate como técnico de iluminación y el catálogo de alquiler de material. Lista para desplegar en Vercel.

## Páginas

| Archivo | Contenido |
|---|---|
| `index.html` | Portada: hero + proyectos destacados + acceso al alquiler |
| `proyectos.html` | Grid de proyectos con filtro por tipo (videoclip / cortometraje) |
| `proyecto.html` | Ficha: función, tipo, dirección, productora/artista, año, vídeo y **proyectos parecidos** (`?p=slug`) |
| `alquiler.html` | Catálogo interactivo con categorías, búsqueda, fotos, fichas y **solicitud de presupuesto** |
| `sobre-mi.html` | Texto pendiente de completar |
| `contacto.html` | Email, Instagram y acceso al alquiler |

## Datos editables

- **`assets/js/data.js`** — datos generales (nombre, email, Instagram) y proyectos.
  Los campos vacíos (`director`, `productora`, `year`, `descripcion`) se muestran como «Por confirmar».
- **`assets/js/rental.js`** — catálogo: categorías y las 42 piezas con código, unidades y ficha.
- **`assets/img/material/`** — foto de cada pieza, nombrada con su código (`A001.jpg`…).

## Cómo funciona la solicitud de presupuesto

Se elige material del catálogo (se guarda en `localStorage`), se rellenan fechas y datos, y al enviar se abre el cliente de correo con el resumen dirigido a `markosfilms1@gmail.com`. También hay un botón para copiar el texto.

Para enviarlo sin depender del cliente de correo, pon en `data.js` un endpoint (`formEndpoint`) de Formspree, Resend o similar: el formulario hará `POST` JSON con los datos y la lista de material.

## Despliegue en Vercel

1. `git add -A && git commit -m "Web portfolio y catálogo" && git push origin main`
2. En https://vercel.com → **Add New → Project** → importa `LeMorco/markos-films`.
3. Framework: **Other**. Sin build ni variables de entorno.

`vercel.json` activa URLs limpias (`/proyectos`, `/alquiler`…).

## Pendiente de completar por Marcos

- Texto y foto de «Sobre mí».
- Director, productora y año de cada proyecto; sinopsis si se quieren.
- Confirmación de los vídeos y créditos.
- Nombre definitivo con el que presentarse y logotipo (si lo hay).
- Teléfono/WhatsApp si se quiere publicar.
