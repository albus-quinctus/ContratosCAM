# ContratosCAM 🏛️

> Transparencia en la contratación pública de la Comunidad de Madrid

**ContratosCAM** es una herramienta de transparencia ciudadana que permite buscar, filtrar y explorar todos los contratos públicos adjudicados por la Comunidad de Madrid. Los datos provienen de fuentes oficiales y se actualizan automáticamente.

Inspirado en el trabajo de [Jaime Gómez-Obregón](https://github.com/JaimeObregon) con [contratosdecantabria.es](https://contratosdecantabria.es).

---

## 🌐 Demo

> 🚧 En construcción — Próximamente en `https://github.com/albus-quinctus/contratoscam`

---

## ✨ Funcionalidades

- 🔍 **Búsqueda** por objeto del contrato, organismo o adjudicatario
- 🔎 **Filtros** por tipo de contrato, procedimiento, importe y fecha
- 📊 **Estadísticas** y gráficas de distribución de contratos
- 📄 **Ficha detallada** de cada contrato con enlace a la fuente original
- 📥 **Exportación** de resultados en CSV
- 🔄 **Actualización automática** semanal de los datos

---

## 📂 Estructura del Proyecto

```
contratoscam/
├── .github/workflows/     # GitHub Actions para actualización automática
├── data/
│   ├── raw/               # Datos descargados sin procesar
│   ├── processed/         # Datos limpios en JSON
│   └── db/                # Base de datos SQLite
├── docs/                  # Documentación adicional
├── plans/                 # Arquitectura y hoja de ruta
├── scripts/               # Scripts ETL (descarga, parseo, transformación)
└── src/web/               # Frontend de la aplicación
```

---

## 🚀 Cómo ejecutar el proyecto localmente

### Requisitos previos

- [Node.js](https://nodejs.org) v18 o superior
- [Git](https://git-scm.com)

### Instalación

```bash
# 1. Clona el repositorio
git clone https://github.com/albus-quinctus/ContratosCAM.git
cd contratoscam

# 2. Instala las dependencias
npm install

# 3. Descarga y procesa los datos
npm run download
npm run parse
npm run transform
npm run import-db

# 4. Abre el frontend en el navegador
# Abre src/web/index.html en tu navegador
# O usa un servidor local:
npx serve src/web
```

---

## 🔄 Pipeline de Datos

```
Portal Transparencia CAM
        │
        ▼
  scripts/download.js     ← Descarga archivos CSV/XML
        │
        ▼
   data/raw/              ← Datos crudos con fecha
        │
        ▼
  scripts/parse.js        ← Convierte a JSON
        │
        ▼
  scripts/transform.js    ← Limpia y normaliza
        │
        ▼
  scripts/import-db.js    ← Importa a SQLite
        │
        ▼
   data/db/contratos.db   ← Base de datos lista
        │
        ▼
     src/web/             ← Frontend que consulta los datos
```

---

## 📊 Fuentes de Datos

| Fuente | URL | Formato |
|--------|-----|---------|
| Portal de Transparencia CAM | [comunidad.madrid/transparencia](https://www.comunidad.madrid/transparencia) | CSV |
| Plataforma de Contratación del Estado | [contrataciondelestado.es](https://contrataciondelestado.es) | XML, CSV |
| Datos Abiertos CAM | [datos.comunidad.madrid](https://datos.comunidad.madrid) | CSV, JSON |

Los datos son de **dominio público** y su reutilización está amparada por la [Ley 37/2007](https://www.boe.es/buscar/act.php?id=BOE-A-2007-19814) sobre reutilización de la información del sector público.

---

## 🛠️ Tecnologías

- **Backend/ETL:** Node.js, `csv-parse`, `fast-xml-parser`, `sql.js`
- **Base de datos:** SQLite (via sql.js — WebAssembly, sin compilación nativa)
- **Frontend:** HTML5, CSS3, JavaScript Vanilla
- **Gráficas:** Chart.js
- **Tablas:** DataTables.js
- **Deploy:** GitHub Pages
- **CI/CD:** GitHub Actions

---

## 🗺️ Hoja de Ruta

Ver [`plans/roadmap.md`](plans/roadmap.md) para el plan completo de desarrollo.

- [x] Fase 0 — Preparación y estructura del proyecto
- [ ] Fase 1 — Descarga y procesamiento de datos
- [ ] Fase 2 — Base de datos SQLite
- [ ] Fase 3 — Frontend básico (MVP)
- [ ] Fase 4 — Visualizaciones y estadísticas
- [ ] Fase 5 — Deploy y automatización
- [ ] Fase 6 — Pulido y portfolio

---

## 📖 Documentación

- [`plans/arquitectura.md`](plans/arquitectura.md) — Arquitectura técnica del sistema
- [`plans/roadmap.md`](plans/roadmap.md) — Hoja de ruta del proyecto
- [`docs/fuentes-datos.md`](docs/fuentes-datos.md) — Guía de fuentes de datos

---

## ⚖️ Licencia

Este proyecto está bajo la licencia **MIT**. Los datos utilizados son públicos y de libre reutilización.

---

## 👤 Autor

Proyecto personal de portfolio desarrollado como estudiante de DAM.

- GitHub: [Albus Quinctus](https://github.com/albus-quinctus)

---

## 🙏 Créditos

- [Jaime Gómez-Obregón](https://github.com/JaimeObregon) por la inspiración y el trabajo original en [contratosdecantabria.es](https://contratosdecantabria.es)
- Comunidad de Madrid por publicar los datos en abierto
