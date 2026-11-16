#!/usr/bin/env python3
"""
Genera los clips de vista previa (assets/video/preview/<slug>.mp4).

Para cada proyecto de assets/js/data.js con campo "youtube" descarga un
fragmento de 7 s (desde "preview", por defecto el segundo 15), lo deja sin
audio, a 640 px de ancho y con el mínimo peso posible. Son los clips mudos
que se reproducen al pasar el ratón por una tarjeta.

Requisitos:
    pip install yt-dlp imageio-ffmpeg

Uso:
    python tools/make_previews.py              # solo los que faltan
    python tools/make_previews.py --force      # regenera todos
    python tools/make_previews.py --dur 6      # otra duración
"""
import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA = os.path.join(RAIZ, "assets", "video", "preview")


def ffmpeg():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        ruta = shutil.which("ffmpeg")
        if not ruta:
            sys.exit("Falta ffmpeg: pip install imageio-ffmpeg")
        return ruta


def proyectos():
    src = open(os.path.join(RAIZ, "assets", "js", "data.js"), encoding="utf-8").read()
    for slug, cuerpo in re.findall(r'\{\s*slug:\s*"([^"]+)",(.*?)\n    \}', src, re.S):
        yt = re.search(r'youtube:\s*"([^"]+)"', cuerpo)
        pv = re.search(r'preview:\s*(\d+)', cuerpo)
        if yt and yt.group(1):
            yield slug, yt.group(1), int(pv.group(1)) if pv else None


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
    args = ap.parse_args()

    ff = ffmpeg()
    os.makedirs(SALIDA, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="previews_")

    for slug, vid, inicio in proyectos():
        destino = os.path.join(SALIDA, slug + ".mp4")
        if os.path.exists(destino) and not args.force:
            print("ya existe:", slug)
            continue
        print("==>", slug, vid)
        base = os.path.join(tmp, vid)
        r = subprocess.run([
            sys.executable, "-m", "yt_dlp",
            "--extractor-args", "youtube:player_client=android",
            "-f", "b[height<=480]/b", "-o", base + ".%(ext)s",
            "https://www.youtube.com/watch?v=" + vid,
        ])
        ficheros = [f for f in os.listdir(tmp) if f.startswith(vid + ".")]
        if r.returncode != 0 or not ficheros:
            print("   error al descargar, se omite")
            continue
        origen = os.path.join(tmp, ficheros[0])
        if inicio is None:
            inicio = mejor_inicio(brillo_por_segundo(ff, origen), args.dur)
        print("   tramo desde", inicio, "s")
        r2 = subprocess.run([
            ff, "-y", "-loglevel", "error",
            "-ss", str(inicio), "-t", str(args.dur), "-i", origen,
            "-an", "-vf", "scale=640:-2", "-c:v", "libx264", "-preset", "medium",
            "-crf", "30", "-pix_fmt", "yuv420p", "-movflags", "+faststart", destino,
        ])
        if r2.returncode == 0:
            print("   ok", os.path.getsize(destino) // 1024, "KB")
        else:
            print("   error al recortar")
        os.remove(origen)

    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
