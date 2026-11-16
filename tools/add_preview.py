#!/usr/bin/env python3
"""
Añade o actualiza el clip de vista previa de un proyecto a partir de su URL.

Hace todo el proceso:
    1. deduce el id de YouTube y busca el proyecto en assets/js/data.js
       (si no está, crea el slug a partir del título del vídeo)
    2. descarga el vídeo en la mejor calidad disponible (hasta 1080p, H.264)
    3. elige el tramo de 7 s más luminoso (o el que indiques)
    4. corta el clip mudo en assets/video/preview/<slug>.mp4
    5. opcionalmente guarda el original en tools/maestros/ (no va al repo)
    6. commit + push, y Vercel lo publica solo

Requisitos:
    pip install yt-dlp imageio-ffmpeg

Uso:
    python tools/add_preview.py https://youtu.be/iLfWFKyF5EI
    python tools/add_preview.py <url1> <url2> <url3>      # varios de golpe
    python tools/add_preview.py <url> --slug mina --inicio 42
    python tools/add_preview.py <url> --guardar-master --no-push
    python tools/add_preview.py <url> --cookies-file cookies.txt   # si YouTube pide sesión

Descarga con una sola conexión porque YouTube devuelve 403 si se piden
varios fragmentos en paralelo sin sesión. Si el vídeo no da 1080p, avisa
de la calidad real que ha conseguido en vez de fallar en silencio.
"""
import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_previews import RAIZ, SALIDA, brillo_por_segundo, mejor_inicio, proyectos
from yt import descargar, ffmpeg, info, slugify

MAESTROS = os.path.join(RAIZ, "tools", "maestros")


def id_de_url(url):
    m = re.search(r"(?:v=|/embed/|/shorts/|/live/|youtu\.be/)([A-Za-z0-9_-]{11})", url)
    if not m:
        m = re.search(r"^([A-Za-z0-9_-]{11})$", url.strip())
    if not m:
        sys.exit("No sé sacar el id de YouTube de: " + url)
    return m.group(1)


def resolver(url, slug, lista):
    """
    Devuelve (slug, id, preview, en_data).
    Si el vídeo no está en data.js y no hay --slug, el slug sale del título.
    """
    vid = id_de_url(url)
    if slug:
        for s, v, pv in lista:
            if s == slug:
                return s, vid, pv, True
        return slug, vid, None, False
    for s, v, pv in lista:
        if v == vid:
            return s, vid, pv, True
    _, titulo_video = info(url)
    return (slugify(titulo_video) if titulo_video else vid), vid, None, False


def cortar(ff, origen, inicio, dur, ancho, alto_max, crf, destino):
    filtro = ("scale=%d:%d:force_original_aspect_ratio=decrease:flags=lanczos,"
              "scale=trunc(iw/2)*2:trunc(ih/2)*2,unsharp=5:5:0.6:5:5:0.0") % (ancho, alto_max)
    r = subprocess.run([
        ff, "-y", "-loglevel", "error",
        "-ss", str(inicio), "-t", str(dur), "-i", origen,
        "-an", "-vf", filtro, "-c:v", "libx264", "-preset", "slow",
        "-crf", str(crf), "-profile:v", "high", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart", destino,
    ])
    return r.returncode == 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("urls", nargs="+", metavar="URL")
    ap.add_argument("--slug", help="slug del proyecto (solo con una URL; si no, se busca por id)")
    ap.add_argument("--inicio", type=int, help="segundo del clip (por defecto, el tramo más luminoso)")
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
    ap.add_argument("--no-push", action="store_true", help="no hace commit ni push")
    ap.add_argument("--force", action="store_true", help="regenera aunque el clip ya exista")
    args = ap.parse_args()

    if args.slug and len(args.urls) > 1:
        sys.exit("--slug solo tiene sentido con una URL. Para varios vídeos, que cada uno esté en data.js.")

    ff = ffmpeg()
    os.makedirs(args.salida, exist_ok=True)
    lista = list(proyectos())
    pendientes = []
    fallos = []

    for url in args.urls:
        print("==>", url)
        slug, vid, preview, en_data = resolver(url, args.slug, lista)
        destino = os.path.join(args.salida, slug + ".mp4")
        if os.path.exists(destino) and not args.force:
            print("   el clip de %s ya existe. Usa --force para rehacerlo." % slug)
            continue

        tmp = tempfile.mkdtemp(prefix="preview_")
        try:
            print("   descargando (%s)..." % vid)
            ruta, _, alto = descargar(
                "https://www.youtube.com/watch?v=" + vid,
                os.path.join(tmp, "master"),
                cookies=args.cookies, cookies_file=args.cookies_file)
            if not ruta:
                print("   no se ha podido descargar (¿privado, restricción de edad o id inexistente?)")
                fallos.append(url)
                continue
            print("   calidad descargada: %dp" % alto)
            if alto and alto < 1080:
                print("   AVISO: YouTube solo ofrece %dp para este vídeo" % alto)
            if alto and alto < 720:
                print("   AVISO: el clip se verá blando; con cookies de sesión suele haber más calidad")

            inicio = args.inicio if args.inicio is not None else preview
            if inicio is None:
                inicio = mejor_inicio(brillo_por_segundo(ff, ruta), args.dur)
            print("   tramo desde %d s" % inicio)

            if not cortar(ff, ruta, inicio, args.dur, args.ancho, args.alto, args.crf, destino):
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

            if not en_data:
                print("   NOTA: '%s' todavía no está en assets/js/data.js; añade su ficha "
                      "con youtube: \"%s\" para que salga en la web." % (slug, vid))
            pendientes.append(destino)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    if pendientes and not args.no_push:
        publicar(pendientes)
    elif pendientes:
        print("\nListo. Sin commit (--no-push).")

    if fallos:
        print("\nNo se pudieron procesar %d de %d." % (len(fallos), len(args.urls)))
        sys.exit(1)


def publicar(destinos):
    rels = [os.path.relpath(d, RAIZ).replace("\\", "/") for d in destinos]
    git = lambda *a: subprocess.run(["git", "-C", RAIZ] + list(a), capture_output=True, text=True)
    git("add", *rels)
    if git("diff", "--cached", "--quiet").returncode == 0:
        print("\nLos clips ya están publicados con ese mismo contenido; no hay nada que subir.")
        return
    slugs = ", ".join(os.path.splitext(os.path.basename(d))[0] for d in destinos)
    # mensaje sin acentos para que git no lo guarde con codificación rara
    r = git("-c", "user.useConfigOnly=false", "commit", "-q", "-m",
            "Preview de %s (desde el video original)" % slugs)
    if r.returncode != 0:
        sys.exit("No se pudo hacer commit: " + (r.stderr or r.stdout).strip())
    if git("push", "-q", "origin", "main").returncode != 0:
        sys.exit("No se pudo hacer push. Los clips quedan listos en local; revisa la conexión.")
    print("\nPublicado. Vercel lo despliega en ~1 minuto:")
    for d in destinos:
        print("  https://markos-films.vercel.app/assets/video/preview/" + os.path.basename(d))


if __name__ == "__main__":
    main()
