#!/usr/bin/env python3
"""
Procesa la cola de clips que deja el panel (/admin).

El flujo normal es online: al publicar desde el panel se encola la vista
previa y GitHub Actions ejecuta este script, que descarga, corta y publica
los clips sin que tengas que tocar tu ordenador. Si YouTube bloquea la IP
del runner, el workflow falla y la cola se conserva para reintentarlo; se
puede configurar el secreto YT_COOKIES (o YT_PROXY) o, como último recurso,
ejecutar este mismo script en local.

Pasos:
    1. lee content/cola-clips.json (rango inicio/fin elegido en el panel)
    2. descarga cada vídeo y corta el clip exacto (usa add_preview.py)
    3. anota preview/previewFin y la miniatura en data.js
    4. publica: commit y push de los clips y de la cola ya vacía
    5. Vercel redespliega solo en ~1 minuto

Use:
    python tools/procesar_cola.py            # procesa y publica
    python tools/procesar_cola.py --ci        # modo GitHub Actions (mensaje [preview-online])
    python tools/procesar_cola.py --no-push   # corta los clips sin publicar
    python tools/procesar_cola.py --ver       # solo muestra lo que hay en cola

En Windows, si GitHub Actions no puede descargar el vídeo, todavía puedes
usar el comando local: doble clic en actualizar-clips.bat (raíz del repo).
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
    ap.add_argument("--ci", action="store_true", help="modo GitHub Actions (commit con marcador)")
    ap.add_argument("--ver", action="store_true", help="solo muestra la cola")
    args = ap.parse_args()

    cola = leer_cola()
    if args.ver or not cola:
        if not cola:
            print("No hay clips en cola. Añádelos desde /admin (Vista previa · desde/hasta).")
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
        if item.get("fin") is not None:
            orden += ["--fin", str(item["fin"])]
        elif item.get("inicio") is not None:
            orden += ["--dur", "7"]
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
        if pendientes and args.ci:
            sys.exit(1)
        return

    mensaje = "Vistas previas online [preview-online]" if args.ci else "Clips de vista previa desde el panel"
    if git("-c", "user.useConfigOnly=false", "commit", "-q", "-m", mensaje).returncode != 0:
        print("No se pudo hacer commit.")
        return
    empuje = git("push", "-q", "origin", "main")
    if empuje.returncode != 0:
        print("No se pudo hacer push:", empuje.stderr.strip())
        print("Los clips están hechos; vuelve a ejecutar el script cuando tengas conexión.")
        if args.ci:
            sys.exit(1)
        return
    print("\nPublicado. Vercel lo despliega en ~1 minuto.")
    if pendientes and args.ci:
        print("Aviso: quedan %d clips en cola; revisa el error de descarga de arriba." % len(pendientes))
        sys.exit(1)


if __name__ == "__main__":
    main()
