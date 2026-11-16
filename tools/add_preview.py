#!/usr/bin/env python3
"""
Añade o actualiza el clip de vista previa de un proyecto a partir de su URL.

Hace todo el proceso:
    1. deduce el id de YouTube y busca el proyecto en assets/js/data.js
    2. descarga el vídeo en la mejor calidad disponible (hasta 1080p)
    3. elige el tramo de 7 s más luminoso (o el que indiques)
    4. corta el clip mudo en assets/video/preview/<slug>.mp4
    5. opcionalmente guarda el original en tools/maestros/ (no va al repo)
    6. commit + push, y Vercel lo publica solo

Requisitos:
    pip install yt-dlp imageio-ffmpeg

Uso:
    python tools/add_preview.py https://youtu.be/iLfWFKyF5EI
    python tools/add_preview.py <url> --slug mina --inicio 42
    python tools/add_preview.py <url> --guardar-master --no-push
    python tools/add_preview.py <url> --cookies chrome     # si YouTube da 403

Si YouTube bloquea la descarga en alta calidad, el script reintenta solo con
las cookies del navegador (Chrome/Edge/Firefox) y, si aun así no hay 1080p,
avisa de la calidad real que ha conseguido en vez de fallar en silencio.
"""
import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_previews import RAIZ, SALIDA, brillo_por_segundo, ffmpeg, mejor_inicio, proyectos

MAESTROS = os.path.join(RAIZ, "tools", "maestros")


def id_de_url(url):
    m = re.search(r"(?:v=|/embed/|/shorts/|/live/|youtu\.be/)([A-Za-z0-9_-]{11})", url)
    if not m:
        m = re.search(r"^([A-Za-z0-9_-]{11})$", url.strip())
    if not m:
        sys.exit("No sé sacar el id de YouTube de: " + url)
    return m.group(1)


def proyecto_de(vid, slug):
    lista = list(proyectos())
    if slug:
        for s, v, pv in lista:
            if s == slug:
                return s, v, pv
        sys.exit("El slug '%s' no existe en data.js. Slugs: %s"
                 % (slug, ", ".join(s for s, _, _ in lista)))
    for s, v, pv in lista:
        if v == vid:
            return s, v, pv
    sys.exit("Ese vídeo (%s) no está en data.js. Añade antes su ficha o pasa --slug. "
             "Slugs: %s" % (vid, ", ".join(s for s, _, _ in lista)))


def descargar(vid, destino, navegador=None, cookies_txt=None):
    """Descarga el mejor archivo hasta 1080p. Devuelve (ruta, alto real)."""
    ff = ffmpeg()
    orden = [
        sys.executable, "-m", "yt_dlp",
        "-f", "bv*[height<=1080]+ba/b[height<=1080]/b",
        "--merge-output-format", "mp4",
        "--ffmpeg-location", ff,
        "--no-playlist", "--no-warnings",
        "-o", destino,
        "https://www.youtube.com/watch?v=" + vid,
    ]
    if navegador:
        orden[3:3] = ["--cookies-from-browser", navegador]
    elif cookies_txt:
        orden[3:3] = ["--cookies", cookies_txt]
    r = subprocess.run(orden, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr.strip()[-800:])
        return None, 0

    ficheros = [f for f in os.listdir(os.path.dirname(destino))
                if f.startswith(os.path.basename(destino))]
    if not ficheros:
        return None, 0
    ruta = os.path.join(os.path.dirname(destino), sorted(ficheros)[0])
    info = subprocess.run([ff, "-hide_banner", "-i", ruta], capture_output=True, text=True)
    m = re.search(r"Video:.*?(\d{3,4})x(\d{3,4})", info.stderr)
    alto = int(m.group(2)) if m else 0
    return ruta, alto


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("--slug", help="slug del proyecto (si no, se busca por id de YouTube)")
    ap.add_argument("--inicio", type=int, help="segundo del clip (por defecto, el tramo más luminoso)")
    ap.add_argument("--dur", type=int, default=7, help="segundos de clip (7)")
    ap.add_argument("--ancho", type=int, default=1280, help="ancho máximo en px (1280)")
    ap.add_argument("--alto", type=int, default=720, help="alto máximo en px (720)")
    ap.add_argument("--crf", type=int, default=19, help="calidad x264, menos = mejor (19)")
    ap.add_argument("--cookies", metavar="NAVEGADOR",
                    help="chrome, edge o firefox para saltar el 403 (en Windows suele fallar por DPAPI)")
    ap.add_argument("--cookies-file", metavar="TXT",
                    help="cookies.txt exportado del navegador; la vía que mejor funciona")
    ap.add_argument("--guardar-master", action="store_true",
                    help="deja el vídeo descargado en tools/maestros/ (no va al repo)")
    ap.add_argument("--no-push", action="store_true", help="no hace commit ni push")
    ap.add_argument("--force", action="store_true", help="regenera aunque el clip ya exista")
    args = ap.parse_args()

    vid = id_de_url(args.url)
    slug, _, preview = proyecto_de(vid, args.slug)
    destino = os.path.join(SALIDA, slug + ".mp4")
    if os.path.exists(destino) and not args.force:
        print("El clip de %s ya existe. Usa --force para rehacerlo." % slug)
        return

    ff = ffmpeg()
    os.makedirs(SALIDA, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="preview_")
    print("==> %s (%s)" % (slug, vid))

    intentos = []
    if args.cookies_file:
        intentos.append((None, args.cookies_file, "cookies.txt"))
    elif args.cookies:
        intentos.append((args.cookies, None, "cookies de " + args.cookies))
    else:
        intentos = [(None, None, "sin cookies"), ("chrome", None, "cookies de chrome"),
                    ("edge", None, "cookies de edge")]

    ruta, alto, ultimo = None, 0, None
    for navegador, txt, etiqueta in intentos:
        print("   descargando (%s)..." % etiqueta)
        ruta, alto = descargar(vid, os.path.join(tmp, "master"), navegador, txt)
        if ruta and alto:
            if alto < 1080 and (navegador, txt) != intentos[-1][:2]:
                print("   solo %dp por esta vía, probando otra" % alto)
                os.remove(ruta)
                ruta, alto = None, 0
                continue
            break
        if ruta:
            os.remove(ruta)
        ruta = None
    if not ruta:
        sys.exit(
            "No se ha podido descargar el vídeo (¿es privado, tiene restricción de edad "
            "o el id ya no existe?).\n"
            "Si el vídeo sí se ve en el navegador:\n"
            "  1. instala la extensión 'Get cookies.txt LOCALLY' y exporta youtube.com\n"
            "  2. python tools/add_preview.py <url> --cookies-file cookies.txt\n"
            "En Windows --cookies chrome suele fallar por el cifrado DPAPI.")

    print("   calidad descargada: %dp" % alto)
    if alto < 720:
        print("   AVISO: menos de 720p, el clip se verá blando (YouTube no da más sin sesión)")

    inicio = args.inicio if args.inicio is not None else preview
    if inicio is None:
        inicio = mejor_inicio(brillo_por_segundo(ff, ruta), args.dur)
    print("   tramo desde %d s" % inicio)

    filtro = ("scale=%d:%d:force_original_aspect_ratio=decrease:flags=lanczos,"
              "scale=trunc(iw/2)*2:trunc(ih/2)*2,unsharp=5:5:0.6:5:5:0.0") % (args.ancho, args.alto)
    r = subprocess.run([
        ff, "-y", "-loglevel", "error",
        "-ss", str(inicio), "-t", str(args.dur), "-i", ruta,
        "-an", "-vf", filtro, "-c:v", "libx264", "-preset", "slow",
        "-crf", str(args.crf), "-profile:v", "high", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart", destino,
    ])
    if r.returncode != 0:
        sys.exit("Error al cortar el clip.")

    kb = os.path.getsize(destino) // 1024
    print("   clip: assets/video/preview/%s.mp4 (%d KB)" % (slug, kb))

    if args.guardar_master:
        os.makedirs(MAESTROS, exist_ok=True)
        final = os.path.join(MAESTROS, "%s [%s].mp4" % (slug, vid))
        shutil.move(ruta, final)
        print("   original guardado en tools/maestros/" + os.path.basename(final))
    else:
        os.remove(ruta)
    shutil.rmtree(tmp, ignore_errors=True)

    if args.no_push:
        print("\nListo. Sin commit (--no-push).")
        return

    rel = os.path.relpath(destino, RAIZ).replace("\\", "/")
    subprocess.run(["git", "-C", RAIZ, "add", rel], check=True)
    subprocess.run(["git", "-C", RAIZ, "commit", "-q", "-m",
                    "Preview de %s desde el vídeo original" % slug], check=True)
    subprocess.run(["git", "-C", RAIZ, "push", "-q", "origin", "main"], check=True)
    print("\nPublicado. Vercel lo despliega en ~1 minuto:")
    print("  https://markos-films.vercel.app/assets/video/preview/%s.mp4" % slug)


if __name__ == "__main__":
    main()
