#!/usr/bin/env python3
"""
Procesa la cola de clips que deja el panel (/admin).

El panel no puede descargar de YouTube (Vercel y GitHub Actions reciben el
bloqueo "Sign in to confirm you're not a bot"), así que la descarga se hace
en tu ordenador, que sí puede. Este script:

    1. lee content/cola-clips.json (lo que hayas encolado desde el panel)
    2. descarga cada vídeo y corta su clip de 7 s (usa add_preview.py)
    3. publica: commit y push de los clips y de la cola ya vacía
    4. Vercel redespliega solo en ~1 minuto

Uso:
    python tools/procesar_cola.py            # procesa y publica
    python tools/procesar_cola.py --no-push   # corta los clips sin publicar
    python tools/procesar_cola.py --ver       # solo muestra lo que hay en cola

En Windows basta con doble clic en actualizar-clips.bat (raíz del repo).
"""
import argparse
import json
import os
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-push", action="store_true", help="no hace commit ni push")
    ap.add_argument("--ver", action="store_true", help="solo muestra la cola")
    args = ap.parse_args()

    cola = leer_cola()
    if args.ver or not cola:
        if not cola:
            print("No hay clips en cola. Añádelos desde /admin («Generar clip de 7 s»).")
        else:
            print("En cola (%d):" % len(cola))
            for item in cola:
                print("  -", item.get("slug"), item.get("url"))
        return

    print("Clips en cola:", len(cola))
    pendientes = []

    for item in cola:
        slug = item.get("slug") or "clip"
        url = item.get("url")
        print("\n==>", slug)
        orden = [sys.executable, os.path.join(RAIZ, "tools", "add_preview.py"), url,
                 "--slug", slug, "--force", "--no-push"]
        if item.get("inicio") is not None:
            orden += ["--inicio", str(item["inicio"])]
        resultado = subprocess.run(orden)
        if resultado.returncode != 0:
            print("   fallo: se queda en la cola para reintentarlo")
            pendientes.append(item)

    guardar_cola(pendientes)
    print("\nFallos:", [p.get("slug") for p in pendientes] or "ninguno")

    if args.no_push:
        print("Sin publicar (--no-push). Los clips están en assets/video/preview/.")
        return

    git("add", "assets/video/preview", COLA)
    if git("diff", "--cached", "--quiet").returncode == 0:
        print("No hay cambios que publicar.")
        return

    mensaje = "Clips de vista previa desde el panel"
    if git("commit", "-q", "-m", mensaje).returncode != 0:
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
