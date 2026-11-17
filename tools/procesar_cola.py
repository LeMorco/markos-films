#!/usr/bin/env python3
"""
Procesa la cola de clips que deja el panel (/admin).

El panel solo guarda la URL del vídeo y el slug. Al ejecutar este script en
el ordenador te pregunta el tramo exacto de cada clip (por ejemplo
1:20 - 1:27), descarga justo esos segundos, genera la miniatura si falta,
anota preview/previewFin en data.js y publica el resultado.

Pasos:
    1. lee content/cola-clips.json
    2. te pregunta inicio y fin para cada vídeo
    3. descarga el vídeo y corta exactamente ese tramo (add_preview.py)
    4. anota preview/previewFin y la miniatura en data.js
    5. commit + push; Vercel lo publica solo en ~1 minuto

Uso:
    python tools/procesar_cola.py            # pregunta los tramos y publica
    python tools/procesar_cola.py --no-push  # corta los clips sin publicar
    python tools/procesar_cola.py --ver      # solo muestra la cola
    python tools/procesar_cola.py --sin-preguntar  # usa el tramo guardado o el automático

En Windows basta con doble clic en actualizar-clips.bat (raíz del repo).
"""
import argparse
import json
import os
import re
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COLA = os.path.join("content", "cola-clips.json")


def leer_cola():
    ruta = os.path.join(RAIZ, COLA)
    if not os.path.exists(ruta):
        return []
    with open(ruta, encoding="utf-8") as f:
        datos = json.load(f)
    return datos if isinstance(datos, list) else []


def guardar_cola(items):
    ruta = os.path.join(RAIZ, COLA)
    with open(ruta, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(items, ensure_ascii=False, indent=2) + "\n")


def git(*args):
    return subprocess.run(["git", "-C", RAIZ] + list(args), capture_output=True, text=True)


def parse_tiempo(valor):
    """«1:20», «01:20,5» o «80» -> segundos. None si no es válido."""
    if valor is None:
        return None
    bruto = str(valor).strip().replace(",", ".")
    if not bruto:
        return None
    if re.fullmatch(r"\d+(?:\.\d+)?", bruto):
        return int(round(float(bruto)))
    partes = bruto.split(":")
    if not 2 <= len(partes) <= 3:
        return None
    if not all(re.fullmatch(r"\d+(?:\.\d+)?", p) for p in partes):
        return None
    segundos = 0.0
    for parte in partes:
        segundos = segundos * 60 + float(parte)
    return int(round(segundos))


def parse_tramo(valor):
    """«1:20 - 1:27», «80-87» o «80» (80 + 7 s) -> (inicio, fin)."""
    texto = str(valor or "").strip().replace("–", "-").replace("—", "-")
    if not texto:
        return None
    partes = [p for p in re.split(r"\s*(?:-|,|/|\ba\b|\bto\b|\s+)\s*", texto) if p]
    if not partes or len(partes) > 2:
        return None
    inicio = parse_tiempo(partes[0])
    if inicio is None:
        return None
    fin = parse_tiempo(partes[1]) if len(partes) == 2 else inicio + 7
    if fin is None or fin <= inicio or fin - inicio > 30:
        return None
    return inicio, fin


def formatear(segundos):
    s = max(0, int(round(segundos)))
    h, resto = divmod(s, 3600)
    m, r = divmod(resto, 60)
    return ("%d:%02d:%02d" % (h, m, r)) if h else ("%d:%02d" % (m, r))


def pedir_tramo(item, sin_preguntar=False):
    """Pregunta el tramo por consola. Devuelve (inicio, fin) o (None, None)."""
    inicio = item.get("inicio")
    fin = item.get("fin")
    if sin_preguntar:
        return inicio, fin
    try:
        if not sys.stdin.isatty():
            return inicio, fin
    except Exception:
        return inicio, fin

    sugerencia = ""
    if inicio is not None:
        sugerencia = " [actual: %s" % formatear(inicio)
        if fin is not None:
            sugerencia += " - %s" % formatear(fin)
        sugerencia += "]"

    while True:
        try:
            texto = input(
                "   Segundos para «%s» (ej. 1:20 - 1:27, Enter = automático)%s: "
                % (item.get("slug") or "clip", sugerencia)
            )
        except (EOFError, KeyboardInterrupt):
            print()
            return inicio, fin
        if not texto.strip():
            return inicio, fin
        tramo = parse_tramo(texto)
        if tramo:
            return tramo
        print("   No válido. Escribe inicio y fin, por ejemplo 1:20 - 1:27 (máximo 30 s).")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-push", action="store_true", help="no hace commit ni push")
    ap.add_argument("--ci", action="store_true", help="modo no interactivo para automatizaciones")
    ap.add_argument("--sin-preguntar", action="store_true", help="no pregunta: usa el tramo guardado o el automático")
    ap.add_argument("--ver", action="store_true", help="solo muestra la cola")
    args = ap.parse_args()

    cola = leer_cola()
    if args.ver or not cola:
        if not cola:
            print("No hay clips en cola. Añádelos desde /admin («Añadir vista previa a la cola»).")
        else:
            print("En cola (%d):" % len(cola))
            for item in cola:
                tramo = ""
                if item.get("inicio") is not None:
                    tramo = " [%s" % formatear(item["inicio"])
                    if item.get("fin") is not None:
                        tramo += " - %s" % formatear(item["fin"])
                    tramo += "]"
                print("  -", item.get("slug"), item.get("url") or "", tramo)
        return

    print("Clips en cola:", len(cola))
    pendientes = []

    for item in cola:
        slug = item.get("slug") or "clip"
        url = item.get("url")
        print("\n==>", slug)
        inicio, fin = pedir_tramo(item, args.sin_preguntar or args.ci)
        if inicio is not None:
            item["inicio"] = inicio
            item["fin"] = fin
            print("   tramo: %s - %s (%d s)" % (formatear(inicio), formatear(fin), fin - inicio))
        else:
            print("   tramo: se elige el más luminoso (7 s)")

        orden = [sys.executable, os.path.join(RAIZ, "tools", "add_preview.py"), url,
                 "--slug", slug, "--force", "--no-push"]
        if inicio is not None:
            orden += ["--inicio", str(inicio), "--fin", str(fin)]
        resultado = subprocess.run(orden)
        if resultado.returncode != 0:
            print("   fallo: se queda en la cola para reintentarlo")
            pendientes.append(item)

    guardar_cola(pendientes)
    print("\nFallos:", [p.get("slug") for p in pendientes] or "ninguno")

    if args.no_push:
        print("Sin publicar (--no-push). Los clips están en assets/video/preview/.")
        return

    git("add", "assets/video/preview", "assets/img/proyectos", "assets/js/data.js", COLA)
    if git("diff", "--cached", "--quiet").returncode == 0:
        print("No hay cambios que publicar.")
        return

    mensaje = "Clips de vista previa desde el panel"
    if git("-c", "user.useConfigOnly=false", "commit", "-q", "-m", mensaje).returncode != 0:
        print("No se pudo hacer commit.")
        return
    empuje = git("push", "-q", "origin", "main")
    if empuje.returncode != 0:
        print("No se pudo hacer push:", empuje.stderr.strip())
        print("Los clips están hechos; vuelve a ejecutar el script cuando tengas conexión.")
        return
    print("\nPublicado. Vercel lo despliega en ~1 minuto.")


if __name__ == "__main__":
    main()
