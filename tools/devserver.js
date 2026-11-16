#!/usr/bin/env node
/**
 * Servidor local para probar el panel sin token de GitHub.
 *
 * Sirve los ficheros del repo como lo haría Vercel (cleanUrls incluido) y
 * delega /api/admin en la función real, pero leyendo y escribiendo los
 * ficheros del disco en vez de crear commits.
 *
 * Uso:
 *   ADMIN_PASSWORD=prueba node tools/devserver.js
 *   -> http://127.0.0.1:8782/admin
 *
 * Si no se define ADMIN_USER, el usuario es "marcos".
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const RAIZ = path.dirname(__dirname);
const PUERTO = Number(process.env.PORT || 8782);

process.env.ADMIN_LOCAL_ROOT = process.env.ADMIN_LOCAL_ROOT || RAIZ;
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "prueba";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "dev-secreto-local";

const handler = require(path.join(RAIZ, "api", "admin.js"));

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".ico": "image/x-icon"
};

http
  .createServer((req, res) => {
    const u = url.parse(req.url, true);

    if (u.pathname === "/api/admin") {
      req.query = u.query;
      return handler(req, res);
    }

    let ruta = decodeURIComponent(u.pathname);
    if (ruta === "/") ruta = "/index.html";
    if (!path.extname(ruta)) ruta += ".html"; // cleanUrls de vercel.json
    const fichero = path.join(RAIZ, ruta);

    if (!fichero.startsWith(RAIZ)) {
      res.statusCode = 403;
      return res.end("403");
    }

    fs.readFile(fichero, (error, datos) => {
      if (error) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        return res.end("404 · " + ruta);
      }
      res.setHeader("Content-Type", TIPOS[path.extname(fichero)] || "application/octet-stream");
      res.end(datos);
    });
  })
  .listen(PUERTO, "127.0.0.1", () => {
    console.log("Panel local: http://127.0.0.1:" + PUERTO + "/admin");
    console.log("Usuario:", process.env.ADMIN_USER || "marcos");
    console.log("Contraseña:", process.env.ADMIN_PASSWORD);
    console.log("Los cambios se escriben en los ficheros del repo (sin commits).");
  });
