/* ============================================================
   MARCOS DONATE — Datos del sitio
   ------------------------------------------------------------
   1) DATOS GENERALES  -> nombre, email, redes
   2) PROYECTOS        -> un objeto por trabajo
   3) CAMPOS VACÍOS    -> se muestran como "Por confirmar"
      (no inventamos director, productora, año ni descripción:
       Marcos los enviará y se rellenan aquí)

   Opcional por proyecto: "preview": 30  -> segundo del vídeo por el
   que empieza la vista previa al pasar el ratón (por defecto 15).
   "previewFin": 37 -> segundo final elegido en el panel; si falta se
   usa preview + 7. El clip se genera online con GitHub Actions.
   ============================================================ */
window.MARKOS = {
  "nombre": "Marcos Donate",
  "rol": "Eléctrico",
  "email": "markosfilms1@gmail.com",
  "instagram": "https://www.instagram.com/marcoss_donate/",
  "base": "Navarra, España",
  "formEndpoint": "/api/solicitud",
  "proyectos": [
    {
      "slug": "cielo-y-mar",
      "titulo": "Cielo y mar",
      "tipo": "videoclip",
      "artista": "Cobardes",
      "youtube": "bPbJyR84kCk",
      "link": "https://www.youtube.com/watch?v=bPbJyR84kCk",
      "director": "Mikel Arraiz",
      "productora": "Dromedario Récords",
      "fotografia": "",
      "year": "2026",
      "rol": "Gaffer",
      "descripcion": "",
      "nota": "",
      "preview": 36,
      "previewFin": 43
    },
    {
      "slug": "en-estado-de-coma",
      "titulo": "En estado de coma",
      "tipo": "videoclip",
      "artista": "Cobardes",
      "youtube": "JiwR-Q_jAGA",
      "link": "https://www.youtube.com/watch?v=JiwR-Q_jAGA",
      "director": "Mikel Arraiz",
      "productora": "Dromedario Récords",
      "fotografia": "Miguel Goñi",
      "year": "2026",
      "rol": "Gaffer",
      "descripcion": "",
      "nota": ""
    },
    {
      "slug": "bere-euskalkik",
      "titulo": "Bere Euskalkik",
      "tipo": "videoclip",
      "artista": "Maruxak · ft. Malentxo",
      "youtube": "0SVJqsfhJ0c",
      "link": "https://youtu.be/0SVJqsfhJ0c",
      "director": "Iker Pérez, Beñat Goia",
      "productora": "Goroabe",
      "fotografia": "Beñat Goia",
      "year": "2026",
      "rol": "Gaffer",
      "descripcion": "",
      "nota": "",
      "preview": 3,
      "thumb": "assets/img/proyectos/bere-euskalkik.jpg"
    },
    {
      "slug": "eskua",
      "titulo": "Eskua",
      "tipo": "videoclip",
      "artista": "Maruxak · Olaia Inziarte, Nerea Erbiti, Leire Letu, Sara Zozaya, Hekthor Folk",
      "youtube": "TP1C-htECmo",
      "link": "https://youtu.be/TP1C-htECmo",
      "director": "Iker Pérez, Beñat Goia",
      "productora": "Goroabe",
      "fotografia": "Beñat Goia",
      "year": "2026",
      "rol": "Gaffer",
      "descripcion": "",
      "nota": ""
    },
    {
      "slug": "dardara-zerrenda",
      "titulo": "Dardara · Zerrenda",
      "tipo": "videoclip",
      "artista": "Maruxak · Fermin Muguruza",
      "youtube": "B-q2Nc0Ukq0",
      "link": "https://youtu.be/B-q2Nc0Ukq0",
      "director": "Iker Pérez, Beñat Goia",
      "productora": "Goroabe, Borrokiñe",
      "fotografia": "Beñat Goia",
      "year": "2026",
      "rol": "Gaffer",
      "descripcion": "",
      "nota": ""
    },
    {
      "slug": "trabestiarrak",
      "titulo": "Trabextiarrak",
      "tipo": "videoclip",
      "artista": "Maruxak",
      "youtube": "W-WRxhbh62o",
      "link": "https://youtu.be/W-WRxhbh62o",
      "director": "",
      "productora": "",
      "fotografia": "",
      "year": "",
      "rol": "Técnico de iluminación (gaffer)",
      "descripcion": "",
      "nota": ""
    },
    {
      "slug": "mina",
      "titulo": "Mina",
      "tipo": "videoclip",
      "artista": "Maruxak",
      "youtube": "iLfWFKyF5EI",
      "link": "https://www.youtube.com/watch?v=iLfWFKyF5EI",
      "director": "Iker Pérez, Beñat Goia",
      "productora": "Goroabe, Borrokiñe",
      "fotografia": "Beñat Goia",
      "year": "2026",
      "rol": "Gaffer",
      "descripcion": "",
      "nota": ""
    },
    {
      "slug": "lekeitio",
      "titulo": "Lekeitio",
      "tipo": "videoclip",
      "artista": "Maruxak · LaWera, Alarma Morea",
      "youtube": "bI_FYUtsoO8",
      "link": "https://www.youtube.com/watch?v=bI_FYUtsoO8",
      "director": "Iker Pérez, Beñat Goia",
      "productora": "Goroabe, Borrokiñe",
      "fotografia": "Beñat Goia",
      "year": "2026",
      "rol": "Gaffer",
      "descripcion": "",
      "nota": ""
    },
    {
      "slug": "tu-piel",
      "titulo": "Tu piel",
      "tipo": "videoclip",
      "artista": "Marmitako Trap Banda",
      "youtube": "RaVcgee5a5A",
      "link": "https://youtu.be/RaVcgee5a5A",
      "director": "",
      "productora": "",
      "fotografia": "",
      "year": "",
      "rol": "Técnico de iluminación (gaffer)",
      "descripcion": "",
      "nota": ""
    },
    {
      "slug": "etxaldea",
      "titulo": "Etxaldea",
      "tipo": "videoclip",
      "artista": "Lore Azpirotz",
      "youtube": "b849-kTSE94",
      "link": "https://youtu.be/b849-kTSE94",
      "director": "",
      "productora": "",
      "fotografia": "",
      "year": "",
      "rol": "Técnico de iluminación (gaffer)",
      "descripcion": "",
      "nota": ""
    },
    {
      "slug": "lo-que-queda-todavia",
      "titulo": "Lo que queda todavía",
      "tipo": "cortometraje",
      "artista": "Shortzinema 2026",
      "youtube": "",
      "link": "https://www.facebook.com/culturagobiernodenavarra/videos/1569445758286819/",
      "director": "",
      "productora": "",
      "fotografia": "",
      "year": "",
      "rol": "Técnico de iluminación (gaffer)",
      "descripcion": "",
      "nota": "Cortometraje no disponible íntegro en abierto. Se enlaza la pieza publicada por el Gobierno de Navarra.",
      "preview": 5,
      "thumb": "assets/img/proyectos/lo-que-queda-todavia.jpg"
    },
    {
      "slug": "oparitu-mundua-aldatzeko-hazi-bat",
      "titulo": "Oparitu mundua aldatzeko hazi bat",
      "tipo": "publicidad",
      "artista": "Txalaparta",
      "youtube": "Uwi6OgivB5U",
      "link": "https://www.youtube.com/watch?v=Uwi6OgivB5U",
      "director": "Ekaitz Bertiz",
      "productora": "Goroabe",
      "fotografia": "",
      "year": "2025",
      "rol": "Gaffer",
      "descripcion": "",
      "nota": "",
      "preview": 5,
      "thumb": "assets/img/proyectos/oparitu-mundua-aldatzeko-hazi-bat.jpg"
    },
    {
      "slug": "timeless",
      "titulo": "Timeless",
      "tipo": "",
      "artista": "The Weeknd, Playboi Carti",
      "youtube": "5EpyN_6dqyk",
      "link": "https://www.youtube.com/watch?v=5EpyN_6dqyk",
      "director": "",
      "productora": "",
      "fotografia": "",
      "year": "",
      "rol": "Técnico de iluminación (gaffer)",
      "descripcion": "",
      "nota": "",
      "preview": 90,
      "previewFin": 97
    }
  ]
};
