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

## Movimiento e interacción

- **Portadas rotatorias** en el inicio (5 fotogramas, 4 s cada uno, con barras de progreso clicables y pausa al pasar el ratón).
- **Preview en vídeo** al pasar el ratón por un proyecto del grid (escritorio): reproduce un clip mudo propio (`assets/video/preview/<slug>.mp4`), sin reproductor de YouTube ni botones. Al salir se descarga. Para añadir un proyecto nuevo, ejecuta `python tools/make_previews.py` (ver cabecera del script). Si tienes los vídeos originales en buena calidad, déjalos en `tools/maestros/` (nombre con el slug o el id de YouTube) y genera los clips desde ahí, sin pasar por YouTube: `python tools/make_previews.py --local tools/maestros --force --ancho 1280 --crf 19`. Esa carpeta está en `.gitignore`.
- **Revelado tipográfico**: los titulares suben desde una máscara al entrar en pantalla.
- **Parallax** suave en las portadas del grid (solo escritorio).
- **Scroll con inercia** en ratón/trackpad + **barra de progreso** en el borde derecho.
- **Transición de página** con View Transitions: la portada del proyecto se expande hacia su ficha (Chrome/Edge); en el resto, navegación normal.

Todo respeta `prefers-reduced-motion` (se desactiva la rotación automática, el parallax, la inercia y las transiciones) y en móvil solo se mantiene lo esencial.

## Datos editables

- **`assets/js/data.js`** — datos generales (nombre, email, Instagram) y proyectos.
  Los campos vacíos (`director`, `productora`, `year`, `descripcion`) se muestran como «Por confirmar».
- **`assets/js/rental.js`** — catálogo: categorías y las 42 piezas con código, unidades y ficha.
- **`assets/img/material/`** — foto de cada pieza, nombrada con su código (`A001.jpg`…).
- **`api/solicitud.js`** — función serverless que envía las solicitudes por Resend.

## Cómo funciona la solicitud de presupuesto

El visitante elige material del catálogo (se guarda en `localStorage`), indica fechas y datos, y pulsa **Enviar solicitud**. El navegador hace `POST` a `/api/solicitud`, una función serverless de Vercel que manda el correo con **Resend**.

El correo llega con: nombre, email, fechas, proyecto, notas y la tabla de material (cantidad + nombre + código), con `reply-to` puesto en el email del solicitante. Al enviarse, la cesta se vacía.

### Configurar Resend (una sola vez)

1. Crea una cuenta en https://resend.com y genera una **API key** en *API Keys*.
2. En Vercel → tu proyecto → **Settings → Environment Variables**, añade:

| Variable | Valor |
|---|---|
| `RESEND_API_KEY` | tu API key (`re_…`) |
| `RESEND_FROM` | remitente verificado, p. ej. `Marcos Donate <web@markosfilms.com>` |
| `RESEND_TO` | destinatario (por defecto `markosfilms1@gmail.com`) |

3. Vuelve a desplegar (**Redeploy**) para que las variables se apliquen.

**Importante sobre el remitente:** Resend solo deja enviar desde un dominio verificado (*Domains → Add domain* + registros DNS). Sin dominio propio, deja `RESEND_FROM` vacío y se usará `onboarding@resend.dev`, que **solo puede enviar a la dirección con la que se creó la cuenta de Resend** — es decir, la cuenta debe estar creada con `markosfilms1@gmail.com`.

### Probar en local

```bash
npx vercel dev     # sirve la web y /api/solicitud con las variables de .env.local
```

Si `/api/solicitud` no está disponible o falla, el formulario muestra el error y mantiene la cesta; el botón **Copiar resumen** sigue funcionando como alternativa.

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
