#!/usr/bin/env python3
"""
Descarga de YouTube compartida por los scripts de tools/.

YouTube devuelve HTTP 403 a mitad de descarga cuando se piden varios
fragmentos en paralelo y la sesión no está identificada, así que aquí se
baja con una sola conexión (-N 1) y reintentos. Se prefiere H.264/AAC en
MP4, que es lo que mejor abren los reproductores y el navegador.

Uso desde otros scripts:
    from yt import descargar, ffmpeg, titulo, slugify

    ruta, ancho, alto = descargar("https://youtu.be/XXXX", "/tmp/master")
    if not ruta:
        ...
"""
import os
import re
import shutil
import subprocess
import sys
import time
import unicodedata

# Hasta 1080p, H.264 primero (máxima compatibilidad) y si no hay, lo mejor disponible.
FORMATO = ("bv*[height<=1080][vcodec^=avc1]+ba[ext=m4a]/"
           "bv*[height<=1080]+ba/"
           "b[height<=1080]/b")

# En Facebook (y otras redes) el vídeo puede venir en vertical: 1080x1920 tiene
# 1920 de alto y el filtro de arriba se quedaría en 960. Ahí se ordena por
# resolución del lado corto, que es lo mismo para horizontal y para vertical.
FORMATO_REDES = "bv*+ba/b/bv*"
ORDEN_REDES = "res:1080,vcodec:h264"


def ffmpeg():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        ruta = shutil.which("ffmpeg")
        if not ruta:
            sys.exit("Falta ffmpeg: pip install imageio-ffmpeg")
        return ruta


def _comando(extra, orden=None):
    base = [sys.executable, "-m", "yt_dlp",
            "--ffmpeg-location", ffmpeg(),
            "--no-playlist", "--no-warnings", "--no-mtime",
            "-N", "1", "--retries", "20", "--fragment-retries", "20",
            "--retry-sleep", "3"]
    # Opciones opcionales para descargas difíciles (proxy, cliente de
    # YouTube concreto) sin tener que tocar el comando a mano.
    proxy = os.environ.get("YTDLP_PROXY", "").strip()
    if proxy:
        base += ["--proxy", proxy]
    extractor = os.environ.get("YTDLP_EXTRACTOR_ARGS", "").strip()
    if extractor:
        base += ["--extractor-args", extractor]
    if orden:
        base += ["-S", orden]
    return base + extra


def _resolucion(ff, ruta):
    """(ancho, alto) del primer stream de vídeo."""
    r = subprocess.run([ff, "-hide_banner", "-i", ruta],
                       capture_output=True, text=True)
    m = re.search(r"Video:.*?(\d{2,5})x(\d{2,5})", r.stderr)
    if not m:
        return 0, 0
    return int(m.group(1)), int(m.group(2))


def descargar(url, destino_sin_ext, intentos=2, cookies=None, cookies_file=None,
              formato=FORMATO, orden=None):
    """
    Descarga el vídeo en `destino_sin_ext` + extensión.

    Devuelve (ruta, ancho, alto); (None, 0, 0) si no se ha podido.
    `cookies` es un navegador ("chrome", "edge"...) y `cookies_file` un
    cookies.txt exportado (la vía fiable en Windows). Para vídeos verticales
    (Facebook) conviene pasar FORMATO_REDES y ORDEN_REDES.
    """
    ff = ffmpeg()
    os.makedirs(os.path.dirname(destino_sin_ext) or ".", exist_ok=True)
    carpeta = os.path.dirname(destino_sin_ext) or "."
    prefijo = os.path.basename(destino_sin_ext)

    extra = []
    cookies_file = cookies_file or os.environ.get("YTDLP_COOKIES_FILE", "").strip()
    if cookies_file:
        extra += ["--cookies", cookies_file]
    elif cookies:
        extra += ["--cookies-from-browser", cookies]

    error = ""
    for intento in range(1, intentos + 1):
        orden_cmd = _comando(extra + [
            "-f", formato, "--merge-output-format", "mp4",
            "-o", destino_sin_ext + ".%(ext)s", url], orden=orden)
        r = subprocess.run(orden_cmd, capture_output=True, text=True)
        if r.returncode == 0:
            ficheros = sorted(f for f in os.listdir(carpeta)
                              if f.startswith(prefijo)
                              and not f.endswith((".part", ".ytdl", ".temp")))
            if ficheros:
                ruta = os.path.join(carpeta, ficheros[0])
                ancho, alto = _resolucion(ff, ruta)
                return ruta, ancho, alto
        error = (r.stderr or r.stdout).strip()
        if intento < intentos:
            print("   reintento %d/%d tras un fallo de descarga..." % (intento + 1, intentos))
            time.sleep(5)
    if error:
        print(error.splitlines()[-1][:300])
    return None, 0, 0


def info(url):
    """Metadatos mínimos sin descargar: (id, título)."""
    r = subprocess.run(
        _comando(["--skip-download", "--print", "%(id)s\t%(title)s", url]),
        capture_output=True, text=True)
    if r.returncode != 0:
        return None, None
    for linea in reversed(r.stdout.splitlines()):
        if "\t" in linea:
            vid, titulo_video = linea.split("\t", 1)
            return vid.strip() or None, titulo_video.strip() or None
    return None, None


def slugify(txt):
    """'Maruxak - Bere Euskalkik' -> 'maruxak-bere-euskalkik'."""
    txt = unicodedata.normalize("NFKD", txt or "")
    txt = "".join(c for c in txt if not unicodedata.combining(c))
    txt = re.sub(r"[^a-zA-Z0-9]+", "-", txt).strip("-").lower()
    return txt or "video"
