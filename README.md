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
- **Preview en vídeo** al pasar el ratón por un proyecto del grid (escritorio): reproduce un clip mudo propio (`assets/video/preview/<slug>.mp4`), sin reproductor de YouTube ni botones. Al salir se descarga. Para añadir un proyecto nuevo, ejecuta `python tools/make_previews.py` (ver cabecera del script). Si tienes los vídeos originales en buena calidad, déjalos en `tools/maestros/` (nombre con el slug o el id de YouTube) y genera los clips desde ahí, sin pasar por YouTube: `python tools/make_previews.py --local tools/maestros --force --ancho 1280 --crf 19`. Esa carpeta está en `.gitignore`. Para uno o varios proyectos sueltos hay un atajo que hace todo (descarga cada original hasta 1080p en H.264, elige el tramo, saca la **miniatura** en `assets/img/proyectos/<slug>.jpg`, corta el clip mudo y lo publica): `python tools/add_preview.py <url> [<url> ...]`. La URL puede ser de **YouTube o de Facebook** (los vídeos públicos de Facebook no necesitan sesión; los verticales se enmarcan en 16:9 con fondo desenfocado, porque la web usa tarjetas horizontales). Si el vídeo todavía no está en `data.js`, deduce el slug a partir del título y te recuerda añadir la ficha. Opciones útiles: `--inicio 42` fija el segundo del clip, `--miniatura-segundo 1` elige otro fotograma para la miniatura (el 1 suele coger el rótulo del título), `--guardar-master` deja también el vídeo completo en `tools/maestros/` (no va al repo), `--no-push` corta el clip sin publicar y `--cookies-file cookies.txt` si YouTube o Facebook piden sesión. La descarga va con una sola conexión porque YouTube devuelve 403 al pedir fragmentos en paralelo sin sesión.
- **Revelado tipográfico**: los titulares suben desde una máscara al entrar en pantalla.
- **Parallax** suave en las portadas del grid (solo escritorio).
- **Scroll con inercia** en ratón/trackpad + **barra de progreso** en el borde derecho.
- **Transición de página** con View Transitions: la portada del proyecto se expande hacia su ficha (Chrome/Edge); en el resto, navegación normal.

Todo respeta `prefers-reduced-motion` (se desactiva la rotación automática, el parallax, la inercia y las transiciones) y en móvil solo se mantiene lo esencial.

## Datos editables

- **`assets/js/data.js`** — datos generales (nombre, email, Instagram) y proyectos.
  Los campos vacíos (`director`, `productora`, `year`, `descripcion`) se muestran como «Por confirmar».
  Campos opcionales por proyecto: `preview` (segundo por el que empieza el clip del grid) y
  `thumb` (miniatura propia, p. ej. `assets/img/proyectos/<slug>.jpg`); si no hay `thumb`,
  la miniatura sale de YouTube a partir del id.
- **`assets/img/proyectos/`** — miniaturas propias de los proyectos con vídeo fuera de YouTube.
- **`assets/js/rental.js`** — catálogo: categorías y las 42 piezas con código, unidades y ficha.
- **`assets/img/material/`** — foto de cada pieza, nombrada con su código (`A001.jpg`…).
- **`api/solicitud.js`** — función serverless que envía las solicitudes por Resend.

## Añadir un proyecto con solo la URL

En `/admin` → **Proyectos** hay un campo para pegar la URL de YouTube y pulsar **Añadir**:

- Saca el título y el artista del propio vídeo, genera el slug y guarda la ficha con el id, el enlace y la miniatura (la miniatura no se descarga: la web usa la de YouTube a partir del id, así que aparece sola en el grid y en la ficha).
- Añade la ficha **al final** de la lista, sin tocar las que ya hay, y puedes completar tipo, año y descripción después.

El **clip de 7 s** no se puede generar desde el servidor: YouTube bloquea las IPs de datacenter (probado en Vercel y en GitHub Actions con «Sign in to confirm you're not a bot»). Por eso el panel lo deja *en cola* en `content/cola-clips.json` y hay dos formas de generarlo desde tu red:

```
# doble clic en la raíz del repo
actualizar-clips.bat

# o por terminal
python tools/procesar_cola.py
```

El script descarga cada vídeo hasta 1080p, corta el clip, lo guarda en `assets/video/preview/<slug>.mp4`, vacía la cola y hace commit + push. Vercel publica solo.

Si la ficha no tiene id de YouTube sino un enlace de **Facebook** (caso de *Lo que queda todavía*), el panel encola esa URL tal cual y el mismo comando descarga, saca la miniatura y corta el clip. Para ese proyecto se generó con:

```
python tools/add_preview.py "https://www.facebook.com/culturagobiernodenavarra/videos/1569445758286819/" --inicio 5 --miniatura-segundo 1 --guardar-master
```

Eso deja `assets/img/proyectos/lo-que-queda-todavia.jpg`, `assets/video/preview/lo-que-queda-todavia.mp4` y anota `thumb` y `preview` en `data.js`. Al ser un vídeo vertical, la miniatura y el clip van enmarcados en 16:9 con el fondo desenfocado.

## Panel de edición (`/admin`)

Página privada para cambiar el contenido sin tocar código: proyectos, catálogo de alquiler, textos fijos de las páginas y datos de contacto.

Los cambios **se acumulan como borrador**: editas lo que quieras (la barra de abajo indica qué hay sin publicar) y al pulsar **Subir todos los cambios** se hace **un único commit** con todos los ficheros afectados (API de datos de Git: blobs + tree + commit + ref, un solo evento para Vercel), con un mensaje generado automáticamente del tipo «Panel: 1 proyecto nuevo, 2 editados · catálogo: 3 referencias actualizadas · 2 textos», y el detalle de cada cambio en el cuerpo del commit. «Descartar» vuelve a lo que hay en el repositorio.

- `admin.html` — interfaz (login, pestañas de Proyectos, Material, Textos y Ajustes).
- `assets/js/admin.js` — formularios y llamadas al panel.
- `api/admin.js` — función serverless: sesión firmada por cookie, validación y commit vía API de GitHub. El token y la contraseña viven en el servidor, nunca en el navegador.
- `content/textos.json` — literales editables; `assets/js/textos.js` los aplica sobre los elementos con `data-txt` al cargar cada página.

### Configuración (una sola vez, en Vercel)

Settings → Environment Variables:

| Variable | Obligatoria | Para qué |
|---|---|---|
| `ADMIN_PASSWORD` | sí | contraseña del panel |
| `GITHUB_TOKEN` | sí | token con permiso **Contents: Read and write** sobre el repo |
| `ADMIN_USER` | no | usuario; por defecto `marcos` |
| `SESSION_SECRET` | no | secreto para firmar la cookie de sesión (si falta se usa la contraseña) |
| `GITHUB_REPO` | no | por defecto `LeMorco/markos-films` |
| `GITHUB_BRANCH` | no | por defecto `main` |

Después de añadirlas hay que **redesplegar** para que la función las vea. La sesión dura 8 horas y hay límite de intentos por IP.

### Probar en local

Sin token se puede probar contra el disco:

```
ADMIN_LOCAL_ROOT=$PWD ADMIN_PASSWORD=prueba node tools/devserver.js
# y en otra terminal: ver README de tools o usar `vercel dev`
```

Con `ADMIN_LOCAL_ROOT` el panel lee y escribe los ficheros del repo en lugar de hacer commits.

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
