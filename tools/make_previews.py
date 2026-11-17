#!/usr/bin/env python3
"""
Genera los clips de vista previa (assets/video/preview/<slug>.mp4).

Para cada proyecto de assets/js/data.js con campo "youtube" coge un fragmento
de 7 s (desde "preview", por si no autoelige el tramo más luminoso), lo deja
sin audio y sin controles. Son los clips mudos que se reproducen al pasar el
ratón por una tarjeta.

La fuente puede ser YouTube (se descarga) o una carpeta con los vídeos
originales en buena calidad, mucho mejor opción.

Requisitos:
    pip install imageio-ffmpeg      (y yt-dlp solo si se descarga de YouTube)

Uso:
    # a partir de los vídeos originales en tools/maestros/
    python tools/make_previews.py --local tools/maestros --force --ancho 1280 --crf 19

    # descargando de YouTube (hasta 1080p)
    python tools/make_previews.py              # solo los que faltan
    python tools/make_previews.py --force      # regenera todos
    python tools/make_previews.py --dur 6      # otra duración

En --local el nombre del fichero debe contener el id de YouTube del proyecto
o su slug ("Mina - trailer.mp4", "mina.mp4", "dQw4w9WgXcQ.mp4"...).
"""
import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from yt import descargar, ffmpeg

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA = os.path.join(RAIZ, "assets", "video", "preview")


def proyectos():
    """(slug, id de YouTube, segundo de inicio) de cada proyecto.

    Sirve tanto para data.js escrito a mano (claves sin comillas) como para el
    que reescribe el panel (/admin), que las deja entrecomilladas como JSON.
    """
    src = open(os.path.join(RAIZ, "assets", "js", "data.js"), encoding="utf-8").read()
    marcas = list(re.finditer(r'["\']?slug["\']?\s*:\s*"([^"]+)"', src))
    for i, marca in enumerate(marcas):
        final = marcas[i + 1].start() if i + 1 < len(marcas) else len(src)
        bloque = src[marca.end():final]
        yt = re.search(r'["\']?youtube["\']?\s*:\s*"([^"]*)"', bloque)
        pv = re.search(r'["\']?preview["\']?\s*:\s*(\d+)', bloque)
        if yt and yt.group(1).strip():
            yield marca.group(1), yt.group(1).strip(), int(pv.group(1)) if pv else None


EXTENSIONES = (".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi", ".mts", ".m2ts", ".mpg", ".mpeg", ".wmv")


def normalizar(txt):
    return re.sub(r"[^a-z0-9]+", "", txt.lower())


def maestros(carpeta):
    """[(nombre, ruta)] con los vídeos de una carpeta local."""
    if not os.path.isdir(carpeta):
        sys.exit("No existe la carpeta: " + carpeta)
    lista = []
    for f in sorted(os.listdir(carpeta)):
        if f.lower().endswith(EXTENSIONES):
            lista.append((f, os.path.join(carpeta, f)))
    if not lista:
        sys.exit("No hay vídeos en " + carpeta)
    return lista


def buscar_maestro(lista, slug, vid):
    """Empareja por id de YouTube, luego por slug exacto y luego por parecido."""
    for nombre, ruta in lista:
        if vid and vid in nombre:
            return ruta
    for nombre, ruta in lista:
        if normalizar(os.path.splitext(nombre)[0]) == normalizar(slug):
            return ruta
    clave = normalizar(slug)
    for nombre, ruta in lista:
        if clave and clave in normalizar(os.path.splitext(nombre)[0]):
            return ruta
    return None


def brillo_por_segundo(ff, ruta):
    """Brillo medio (0-255) de un fotograma por segundo."""
    r = subprocess.run([ff, "-v", "error", "-i", ruta,
                        "-vf", "fps=1,scale=16:9,format=gray",
                        "-f", "rawvideo", "-"], capture_output=True)
    datos = r.stdout
    tam = 16 * 9
    return [sum(datos[i:i + tam]) / tam for i in range(0, len(datos) - tam + 1, tam)]


def mejor_inicio(brillos, dur):
    """Ventana de `dur` segundos con mas luz, sin quemar blancos."""
    if len(brillos) < dur + 6:
        return 15
    mejor, mejor_nota = 3, -1
    for inicio in range(3, len(brillos) - dur - 2):
        media = sum(brillos[inicio:inicio + dur]) / dur
        nota = min(media, 95)
        if nota > mejor_nota:
            mejor, mejor_nota = inicio, nota
    return mejor


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="regenera los que ya existen")
    ap.add_argument("--dur", type=int, default=7, help="segundos de clip (7)")
    ap.add_argument("--ancho", type=int, default=960, help="ancho en px (960)")
    ap.add_argument("--alto", type=int, default=0, help="alto máximo en px (por defecto 9/16 del ancho)")
    ap.add_argument("--crf", type=int, default=21, help="calidad x264, menos = mejor (21)")
    ap.add_argument("--local", metavar="CARPETA",
                    help="usa los vídeos originales de esta carpeta en vez de YouTube")
    args = ap.parse_args()
    # encaja dentro de una caja ancho x alto sin deformar (los originales
    # pueden ser 16:9, 4:3 o cinemascope) y sin pasar de 720 px de alto
    alto = args.alto or int(round(args.ancho * 9 / 16))
    ffmpeg_filtro = (
        "scale=%d:%d:force_original_aspect_ratio=decrease:flags=lanczos,"
        "scale=trunc(iw/2)*2:trunc(ih/2)*2,unsharp=5:5:0.6:5:5:0.0"
    ) % (args.ancho, alto)

    ff = ffmpeg()
    os.makedirs(SALIDA, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="previews_")
    lista = maestros(args.local) if args.local else None
    usados = set()

    for slug, vid, inicio in proyectos():
        destino = os.path.join(SALIDA, slug + ".mp4")
        if os.path.exists(destino) and not args.force:
            print("ya existe:", slug)
            continue
        print("==>", slug, vid)
        descargado = False
        if lista is not None:
            origen = buscar_maestro(lista, slug, vid)
            if not origen:
                print("   no hay ningún vídeo original para este proyecto, se omite")
                continue
            usados.add(origen)
            print("   origen:", os.path.basename(origen))
        else:
            base = os.path.join(tmp, vid)
            origen, _, alto = descargar("https://www.youtube.com/watch?v=" + vid, base)
            if not origen:
                print("   error al descargar, se omite")
                continue
            print("   descargado: %dp" % alto)
            descargado = True
        if inicio is None:
            inicio = mejor_inicio(brillo_por_segundo(ff, origen), args.dur)
        print("   tramo desde", inicio, "s")
        r2 = subprocess.run([
            ff, "-y", "-loglevel", "error",
            "-ss", str(inicio), "-t", str(args.dur), "-i", origen,
            "-an", "-vf", ffmpeg_filtro, "-c:v", "libx264", "-preset", "slow",
            "-crf", str(args.crf), "-profile:v", "high", "-pix_fmt", "yuv420p",
            "-movflags", "+faststart", destino,
        ])
        if r2.returncode == 0:
            print("   ok", os.path.getsize(destino) // 1024, "KB")
        else:
            print("   error al recortar")
        if descargado:
            os.remove(origen)

    if lista is not None:
        sobrantes = [os.path.basename(n) for n, r in lista if r not in usados]
        if sobrantes:
            print("Sin proyecto asociado:", ", ".join(sobrantes))
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
