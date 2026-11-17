#!/usr/bin/env python3
"""
Añade o actualiza el clip de vista previa y la miniatura de un proyecto a
partir de su URL (YouTube o Facebook).

Hace todo el proceso:
    1. identifica el vídeo y busca el proyecto en assets/js/data.js (por id de
       YouTube o por el enlace guardado; si no está, crea el slug a partir del
       título del vídeo)
    2. descarga el vídeo en la mejor calidad disponible (hasta 1080p, H.264)
    3. elige el tramo de 7 s más luminoso (o el que indiques)
    4. extrae un fotograma y lo guarda como miniatura en
       assets/img/proyectos/<slug>.jpg (y la anota como "thumb" en data.js)
    5. corta el clip mudo en assets/video/preview/<slug>.mp4
    6. opcionalmente guarda el original en tools/maestros/ (no va al repo)
    7. commit + push, y Vercel lo publica solo

Requisitos:
    pip install yt-dlp imageio-ffmpeg

Uso:
    python tools/add_preview.py https://youtu.be/iLfWFKyF5EI
    python tools/add_preview.py https://www.facebook.com/<pagina>/videos/<id>/
    python tools/add_preview.py <url1> <url2> <url3>      # varios de golpe
    python tools/add_preview.py <url> --slug mina --inicio 42
    python tools/add_preview.py <url> --guardar-master --no-push
    python tools/add_preview.py <url> --cookies-file cookies.txt   # si YouTube pide sesión
    python tools/add_preview.py <url> --sin-publicar-thumb   # no toca data.js

YouTube se descarga con una sola conexión porque devuelve 403 si se piden
varios fragmentos en paralelo sin sesión. Facebook funciona sin sesión en
muchos vídeos públicos; si pide login, exporta las cookies del navegador y
pásalas con --cookies-file. Si el vídeo no da 1080p, avisa de la calidad real
que ha conseguido en vez de fallar en silencio.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_previews import RAIZ, SALIDA, brillo_por_segundo, mejor_inicio, proyectos
from yt import FORMATO_REDES, ORDEN_REDES, descargar, ffmpeg, info, slugify

MAESTROS = os.path.join(RAIZ, "tools", "maestros")
MINIATURAS = os.path.join(RAIZ, "assets", "img", "proyectos")
DATA = os.path.join(RAIZ, "assets", "js", "data.js")

FACEBOOK = ("facebook.com", "fb.watch", "fb.me")


def id_youtube(url):
    m = re.search(r"(?:v=|/embed/|/shorts/|/live/|youtu\.be/)([A-Za-z0-9_-]{11})", url)
    if not m:
        m = re.search(r"^([A-Za-z0-9_-]{11})$", url.strip())
    return m.group(1) if m else None


def identificar(url):
    """(red, id) del vídeo. En Facebook el id es el número de /videos/<id>/."""
    u = url.strip()
    if any(d in u.lower() for d in FACEBOOK):
        m = (re.search(r"/videos/(?:[^/?#]+/)?(\d+)", u)
             or re.search(r"[?&]v=(\d+)", u)
             or re.search(r"/(\d{6,})/?(?:[?#]|$)", u))
        return "facebook", (m.group(1) if m else slugify(u.rsplit("/", 1)[-1]) or "facebook")
    vid = id_youtube(u)
    if not vid:
        sys.exit("No sé sacar el id del vídeo de: " + url)
    return "youtube", vid


def resolver(url, slug, lista):
    """
    Devuelve (slug, id, preview, en_data).
    Empareja por id de YouTube y, si no, por el enlace guardado en data.js
    (así funcionan los vídeos de Facebook, que no tienen id de YouTube).
    Si el vídeo no está en data.js y no hay --slug, el slug sale del título.
    """
    red, vid = identificar(url)
    if slug:
        for s, v, pv, _ in lista:
            if s == slug:
                return s, vid, pv, True
        return slug, vid, None, False
    for s, v, pv, enlace in lista:
        if red == "youtube" and v and v == vid:
            return s, v, pv, True
        if enlace and vid and vid in enlace:
            return s, v, pv, True
    if red == "facebook":
        # sin ficha en data.js: el id numérico ya es un slug válido
        return vid, vid, None, False
    _, titulo_video = info(url)
    return (slugify(titulo_video)[:60] if titulo_video else vid), vid, None, False


def filtro_ventana(ancho, alto):
    """Vídeo vertical dentro de un marco horizontal, con fondo desenfocado.

    La web usa tarjetas 16:9; un vídeo de Facebook en vertical (1080x1920)
    quedaba recortado a una franja. Así se ve entero y el fondo rellena.
    """
    return (
        "[0:v]split=2[bg][fg];"
        "[bg]scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d,"
        "gblur=sigma=45,eq=brightness=-0.18:saturation=0.9[b];"
        "[fg]scale=-2:%d:flags=lanczos,unsharp=5:5:0.5:5:5:0.0[f];"
        "[b][f]overlay=(W-w)/2:(H-h)/2,format=yuv420p"
    ) % (ancho, alto, ancho, alto, alto)


def cortar(ff, origen, inicio, dur, ancho, alto_max, crf, destino, vertical=False):
    base = [ff, "-y", "-loglevel", "error",
            "-ss", str(inicio), "-t", str(dur), "-i", origen, "-an"]
    if vertical:
        base += ["-filter_complex", filtro_ventana(ancho, alto_max)]
    else:
        filtro = ("scale=%d:%d:force_original_aspect_ratio=decrease:flags=lanczos,"
                  "scale=trunc(iw/2)*2:trunc(ih/2)*2,unsharp=5:5:0.6:5:5:0.0") % (ancho, alto_max)
        base += ["-vf", filtro]
    r = subprocess.run(base + [
        "-c:v", "libx264", "-preset", "slow",
        "-crf", str(crf), "-profile:v", "high", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart", destino,
    ])
    return r.returncode == 0


def guardar_miniatura(ff, origen, segundo, destino, ancho=1600, alto=900, vertical=False):
    """Fotograma del segundo indicado, en JPG 16:9, para el grid y la ficha."""
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    base = [ff, "-y", "-loglevel", "error", "-ss", str(segundo), "-i", origen, "-frames:v", "1"]
    if vertical:
        base += ["-filter_complex", filtro_ventana(ancho, alto)]
    else:
        base += ["-vf", "scale=%d:-2" % ancho]
    r = subprocess.run(base + ["-q:v", "3", destino])
    return r.returncode == 0


def anotar_en_data(slug, campos):
    """Añade o actualiza claves del proyecto en data.js (sin reescribir el resto)."""
    with open(DATA, encoding="utf-8") as f:
        src = f.read()
    pat_slug = r'["\']?slug["\']?\s*:\s*"' + re.escape(slug) + '"'
    if not re.search(pat_slug, src):
        return False

    for clave, valor in campos.items():
        m = re.search(pat_slug, src)
        marcas = list(re.finditer(r'["\']?slug["\']?\s*:\s*"', src))
        fin = next((c.start() for c in marcas if c.start() > m.start()), len(src))
        bloque = src[m.start():fin]
        par = '"%s": %s' % (clave, json.dumps(valor, ensure_ascii=False))
        actual = re.search(r'(["\']?)%s\1\s*:\s*(?:"[^"]*"|-?\d+)' % re.escape(clave), bloque)
        if actual:
            a, b = m.start() + actual.start(), m.start() + actual.end()
            src = src[:a] + par + src[b:]
            continue
        # se inserta detrás de "link" (o de "slug") para que la ficha quede ordenada
        ref = re.search(r'["\']?link["\']?\s*:\s*"[^"]*"', bloque)
        salto = src.find("\n", m.start() + (ref.end() if ref else m.end()))
        corte = salto + 1 if salto != -1 else len(src)
        inicio_linea = src.rfind("\n", 0, m.start()) + 1
        sangria = re.match(r"[ \t]*", src[inicio_linea:]).group(0)
        src = src[:corte] + sangria + par + ",\n" + src[corte:]

    with open(DATA, "w", encoding="utf-8", newline="\n") as f:
        f.write(src)
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("urls", nargs="+", metavar="URL")
    ap.add_argument("--slug", help="slug del proyecto (solo con una URL; si no, se busca por id o enlace)")
    ap.add_argument("--inicio", type=int, help="segundo del clip (por defecto, el tramo más luminoso)")
    ap.add_argument("--miniatura-segundo", type=int, metavar="SEG",
                    help="segundo del fotograma de la miniatura (por defecto, inicio + 1; "
                         "para un vídeo con rótulo de título suele ir bien el 1). Si ya hay "
                         "miniatura se mantiene salvo que pases esta opción")
    ap.add_argument("--dur", type=int, default=7, help="segundos de clip (7)")
    ap.add_argument("--ancho", type=int, default=1280, help="ancho máximo en px (1280)")
    ap.add_argument("--alto", type=int, default=720, help="alto máximo en px (720)")
    ap.add_argument("--crf", type=int, default=19, help="calidad x264, menos = mejor (19)")
    ap.add_argument("--salida", metavar="CARPETA", default=SALIDA,
                    help="carpeta de salida (por defecto assets/video/preview)")
    ap.add_argument("--cookies", metavar="NAVEGADOR",
                    help="chrome, edge o firefox para saltar el 403 (en Windows suele fallar por DPAPI)")
    ap.add_argument("--cookies-file", metavar="TXT",
                    help="cookies.txt exportado del navegador; la vía que mejor funciona")
    ap.add_argument("--guardar-master", action="store_true",
                    help="deja el vídeo descargado en tools/maestros/ (no va al repo)")
    ap.add_argument("--sin-publicar-thumb", action="store_true",
                    help="genera la miniatura pero no la anota en data.js")
    ap.add_argument("--no-push", action="store_true", help="no hace commit ni push")
    ap.add_argument("--force", action="store_true", help="regenera aunque el clip ya exista")
    args = ap.parse_args()

    if args.slug and len(args.urls) > 1:
        sys.exit("--slug solo tiene sentido con una URL. Para varios vídeos, que cada uno esté en data.js.")

    ff = ffmpeg()
    os.makedirs(args.salida, exist_ok=True)
    lista = list(proyectos())
    pendientes = []
    extras = []
    fallos = []

    for url in args.urls:
        print("==>", url)
        red, vid = identificar(url)
        slug, _, preview, en_data = resolver(url, args.slug, lista)
        destino = os.path.join(args.salida, slug + ".mp4")
        miniatura = os.path.join(MINIATURAS, slug + ".jpg")
        if os.path.exists(destino) and os.path.exists(miniatura) and not args.force:
            print("   el clip y la miniatura de %s ya existen. Usa --force para rehacerlos." % slug)
            continue

        descarga = url if red == "facebook" else "https://www.youtube.com/watch?v=" + vid
        tmp = tempfile.mkdtemp(prefix="preview_")
        try:
            print("   descargando (%s: %s)..." % (red, vid))
            opciones = {"cookies": args.cookies, "cookies_file": args.cookies_file}
            if red == "facebook":
                opciones.update(formato=FORMATO_REDES, orden=ORDEN_REDES)
            ruta, ancho, alto = descargar(descarga, os.path.join(tmp, "master"), **opciones)
            if not ruta:
                print("   no se ha podido descargar (¿privado, restricción de edad o que pide sesión?)")
                fallos.append(url)
                continue
            vertical = ancho and alto and alto > ancho * 1.05
            print("   calidad descargada: %dx%d%s" % (ancho, alto, " (vertical)" if vertical else ""))
            if alto and alto < 1080:
                print("   AVISO: solo se ha conseguido %dp para este vídeo" % alto)
            if alto and alto < 720:
                print("   AVISO: el clip se verá blando; con cookies de sesión suele haber más calidad")

            inicio = args.inicio if args.inicio is not None else preview
            if inicio is None:
                inicio = mejor_inicio(brillo_por_segundo(ff, ruta), args.dur)
            print("   tramo desde %d s" % inicio)

            if os.path.exists(miniatura) and args.miniatura_segundo is None:
                # se respeta el fotograma elegido a mano en una pasada anterior
                # (para rehacerla, pasa --miniatura-segundo)
                print("   miniatura: se mantiene la que ya hay")
            elif guardar_miniatura(ff, ruta, inicio + 1 if args.miniatura_segundo is None
                                   else args.miniatura_segundo, miniatura, vertical=vertical):
                print("   miniatura: %s (%d KB)" % (os.path.relpath(miniatura, RAIZ).replace("\\", "/"),
                                                    os.path.getsize(miniatura) // 1024))
            else:
                print("   AVISO: no se ha podido extraer la miniatura")
                miniatura = ""

            if not cortar(ff, ruta, inicio, args.dur, args.ancho, args.alto, args.crf, destino,
                          vertical=vertical):
                print("   error al cortar el clip")
                fallos.append(url)
                continue
            print("   clip: %s (%d KB)" % (os.path.relpath(destino, RAIZ).replace("\\", "/"),
                                          os.path.getsize(destino) // 1024))

            if args.guardar_master:
                os.makedirs(MAESTROS, exist_ok=True)
                final = os.path.join(MAESTROS, "%s [%s].mp4" % (slug, vid))
                shutil.move(ruta, final)
                print("   original guardado en tools/maestros/" + os.path.basename(final))

            campos = {"preview": inicio}
            if miniatura:
                campos["thumb"] = os.path.relpath(miniatura, RAIZ).replace("\\", "/")
            if args.sin_publicar_thumb:
                pass
            elif anotar_en_data(slug, campos):
                print("   data.js: %s" % ", ".join('%s=%s' % (k, v) for k, v in campos.items()))
                extras.append(DATA)
            else:
                print("   NOTA: '%s' no está en assets/js/data.js; añade su ficha con "
                      'link: "%s" para que salga en la web.' % (slug, url))

            if miniatura:
                extras.append(miniatura)
            pendientes.append(destino)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    if pendientes and not args.no_push:
        publicar(pendientes, extras)
    elif pendientes:
        print("\nListo. Sin commit (--no-push).")

    if fallos:
        print("\nNo se pudieron procesar %d de %d." % (len(fallos), len(args.urls)))
        sys.exit(1)


def publicar(destinos, extras=()):
    rel = lambda d: os.path.relpath(d, RAIZ).replace("\\", "/")
    todos = [rel(d) for d in list(destinos) + list(extras)]
    git = lambda *a: subprocess.run(["git", "-C", RAIZ] + list(a), capture_output=True, text=True)
    git("add", *todos)
    if git("diff", "--cached", "--quiet").returncode == 0:
        print("\nLos clips ya están publicados con ese mismo contenido; no hay nada que subir.")
        return
    slugs = ", ".join(os.path.splitext(os.path.basename(d))[0] for d in destinos)
    # mensaje sin acentos para que git no lo guarde con codificación rara
    r = git("-c", "user.useConfigOnly=false", "commit", "-q", "-m",
            "Preview y miniatura de %s (desde el video original)" % slugs)
    if r.returncode != 0:
        sys.exit("No se pudo hacer commit: " + (r.stderr or r.stdout).strip())
    if git("push", "-q", "origin", "main").returncode != 0:
        sys.exit("No se pudo hacer push. Los clips quedan listos en local; revisa la conexión.")
    print("\nPublicado. Vercel lo despliega en ~1 minuto:")
    for d in destinos:
        print("  https://markos-films.vercel.app/assets/video/preview/" + os.path.basename(d))


if __name__ == "__main__":
    main()
