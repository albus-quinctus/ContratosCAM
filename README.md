# ContratosCAM 🏛️

> Transparencia en la contratación pública de la Comunidad de Madrid

**ContratosCAM** es una herramienta de transparencia ciudadana de código abierto que permite buscar, filtrar y explorar todos los contratos públicos adjudicados por la Comunidad de Madrid. Su objetivo es hacer accesible a cualquier ciudadano, periodista o investigador la información sobre cómo se gasta el dinero público de los contribuyentes madrileños.

Los datos provienen de fuentes oficiales (PLACSP, Portal de Transparencia CAM) y se actualizan automáticamente cada semana mediante GitHub Actions.

Inspirado en el trabajo de [Jaime Gómez-Obregón](https://github.com/JaimeObregon) con [contratosdecantabria.es](https://contratosdecantabria.es).

---

## 🎯 Objetivo del proyecto

ContratosCAM nace con una misión clara: **hacer que la contratación pública sea auditable por cualquier persona**, sin necesidad de conocimientos técnicos ni de instalar nada.

- **Para ciudadanos** — Saber qué empresas reciben dinero público y por qué concepto.
- **Para periodistas** — Detectar patrones, adjudicatarios recurrentes o contratos inusuales.
- **Para investigadores** — Acceder a datos estructurados y exportables para análisis propios.
- **Para desarrolladores** — Un proyecto open source reproducible que cualquiera puede auditar, replicar o adaptar a otra comunidad autónoma.

El código es completamente abierto. Cualquiera puede revisar cómo se descargan los datos, cómo se procesan y cómo se muestran. La metodología es transparente por diseño.

---

## 🌐 Demo

> 🚧 En construcción — Próximamente en `https://albus-quinctus.github.io/ContratosCAM`

---

## ✨ Funcionalidades

- 🔍 **Búsqueda** por objeto del contrato, organismo o adjudicatario
- 🔎 **Filtros** por tipo de contrato, procedimiento, importe y fecha
- 📊 **Estadísticas** y gráficas de distribución de contratos
- 📄 **Ficha detallada** de cada contrato con enlace a la fuente oficial original
- 📥 **Exportación** de resultados en CSV
- 🔄 **Actualización automática** semanal de los datos
- 🌐 **Acceso público** sin registro ni instalación

---

## 📂 Estructura del Proyecto

```
contratoscam/
├── .github/workflows/     # GitHub Actions para actualización y deploy automático
├── data/
│   ├── raw/               # Datos descargados sin procesar (CSV, XML, Atom)
│   ├── processed/         # Datos limpios en JSON (generados por el pipeline)
│   └── db/                # Base de datos SQLite local (para desarrollo)
├── docs/                  # Documentación adicional
│   └── fuentes-datos.md   # Guía de fuentes de datos oficiales
├── plans/                 # Arquitectura técnica y hoja de ruta
│   ├── arquitectura.md    # Decisiones técnicas y diagramas
│   └── roadmap.md         # Fases del proyecto
├── scripts/               # Pipeline ETL (descarga → parseo → transformación → BD)
│   ├── download.js        # Descarga datos de fuentes oficiales
│   ├── parse.js           # Convierte CSV/XML a JSON
│   ├── transform.js       # Limpia y normaliza los datos
│   ├── import-db.js       # Importa a SQLite / genera JSON para el frontend
│   └── validate.js        # Valida integridad y schema del JSON generado
├── src/web/               # Frontend de la aplicación (HTML + CSS + JS Vanilla)
├── .nvmrc                 # Versión de Node.js del proyecto (20)
└── package.json           # Dependencias y scripts npm
```

---

## 🚀 Cómo ejecutar el proyecto localmente

### Requisitos previos

- [Node.js](https://nodejs.org) v20 o superior (ver `.nvmrc`)
- [Git](https://git-scm.com)

### Instalación

```bash
# 1. Clona el repositorio
git clone https://github.com/albus-quinctus/ContratosCAM.git
cd ContratosCAM

# 2. Instala las dependencias
npm install

# 3. Ejecuta el pipeline completo de datos
npm run etl

# 4. Sirve el frontend localmente
npm run serve
# Abre http://localhost:3000/src/web/ en tu navegador
```

### Scripts disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run download` | Descarga los datos de las fuentes oficiales |
| `npm run parse` | Convierte CSV/XML descargados a JSON |
| `npm run transform` | Limpia y normaliza los datos |
| `npm run import-db` | Importa a SQLite y genera el JSON para el frontend |
| `npm run validate` | Valida integridad y schema del JSON generado |
| `npm run etl` | Ejecuta todo el pipeline (download → parse → transform → import-db) |
| `npm run etl:validate` | Pipeline completo + validación |
| `npm run serve` | Sirve el proyecto en `localhost:3000` (frontend en `/src/web/`) |
| `npm run dev` | Alias de `serve` para desarrollo local |

---

## 🔄 Pipeline de Datos

```
Portal Transparencia CAM / PLACSP
              │
              ▼
    scripts/download.js     ← Descarga archivos CSV/XML/Atom
              │
              ▼
         data/raw/          ← Datos crudos con fecha
              │
              ▼
    scripts/parse.js        ← Convierte a JSON intermedio
              │
              ▼
    scripts/transform.js    ← Limpia, normaliza y deduplica
              │
              ▼
    scripts/import-db.js    ← Genera contratos-normalizados.json
              │
              ▼
    data/processed/         ← JSON listo para el frontend
              │
              ▼
         src/web/           ← Frontend que carga y muestra los datos
```

---

## 🗄️ Arquitectura de Base de Datos

El proyecto sigue una **estrategia de escalado progresivo**:

### Fase actual — JSON estático
Los datos procesados se publican como archivos JSON en el repositorio y se sirven directamente desde GitHub Pages. Sin servidor, sin base de datos en la nube, sin coste.

**Adecuado para:** hasta ~50.000 contratos (~25 MB de JSON).

### Fase futura — Turso (SQLite en la nube)
Cuando el volumen de datos históricos supere lo manejable con JSON estático, se migrará a [Turso](https://turso.tech): SQLite gestionado en la nube, sin pausas por inactividad, con tier gratuito de 9 GB y compatible con el esquema ya diseñado.

**Adecuado para:** millones de contratos, búsqueda full-text avanzada, datos históricos completos.

> Ver [`plans/arquitectura.md`](plans/arquitectura.md) para el análisis técnico completo de esta decisión.

---

## 📊 Fuentes de Datos

| Fuente | URL | Formato |
|--------|-----|---------|
| Plataforma de Contratación del Estado (PLACSP) | [contrataciondelestado.es](https://contrataciondelestado.es) | XML (CODICE), CSV, Atom |
| Portal de Transparencia CAM | [comunidad.madrid/transparencia](https://www.comunidad.madrid/transparencia) | CSV |
| Datos Abiertos CAM | [datos.comunidad.madrid](https://datos.comunidad.madrid) | CSV, JSON |

Los datos son de **dominio público** y su reutilización está amparada por la [Ley 37/2007](https://www.boe.es/buscar/act.php?id=BOE-A-2007-19814) sobre reutilización de la información del sector público y la [Ley 19/2013](https://www.boe.es/buscar/act.php?id=BOE-A-2013-12887) de transparencia.

---

## 🛠️ Tecnologías

- **ETL / Scripts:** Node.js 20+, `csv-parse`, `fast-xml-parser` v5, `sql.js`
- **Base de datos local:** SQLite (via `sql.js` — WebAssembly, sin compilación nativa)
- **Base de datos en la nube (futura):** [Turso](https://turso.tech) (SQLite gestionado)
- **Frontend:** HTML5, CSS3, JavaScript Vanilla (sin frameworks)
- **Gráficas:** Chart.js 4.4 (CDN con SRI)
- **Seguridad:** Subresource Integrity, escape XSS, validación de URLs, protección CSV injection
- **Deploy:** GitHub Pages (solo frontend + datos procesados)
- **CI/CD:** GitHub Actions (actualización semanal automática + validación)

### ¿Por qué JavaScript Vanilla y no React/Vue?

El frontend no usa ningún framework de forma deliberada:
- El deploy en GitHub Pages funciona abriendo directamente `index.html`, sin paso de compilación.
- El estado de la aplicación es simple: una lista de contratos, filtros activos y página actual.
- El código es más fácil de auditar y entender para cualquier persona que quiera replicarlo.
- Reduce la barrera de entrada para contribuidores.

---

## 🗺️ Hoja de Ruta

Ver [`plans/roadmap.md`](plans/roadmap.md) para el plan completo de desarrollo.

- [x] Fase 0 — Preparación, estructura e infraestructura segura
- [x] Fase 1 — Pipeline ETL funcional con datos reales (1.393 contratos CAM)
- [ ] Fase 2 — Base de datos SQLite local y JSON para el frontend
- [ ] Fase 3 — Web pública en GitHub Pages (MVP)
- [ ] Fase 4 — Visualizaciones y estadísticas
- [ ] Fase 5 — Deploy automático y actualización semanal
- [ ] Fase 6 — Migración a Turso para datos históricos completos
- [ ] Fase 7 — Pulido, dominio propio y difusión

---

## 🤝 Cómo contribuir

Este proyecto es open source y acepta contribuciones. Algunas formas de ayudar:

- **Verificar URLs de descarga** — Las fuentes oficiales cambian con frecuencia.
- **Mejorar el parseo** — Los formatos CSV/XML de las fuentes públicas son inconsistentes.
- **Reportar errores en los datos** — Si encuentras un contrato mal procesado, abre un issue.
- **Adaptar el proyecto** — ¿Quieres hacer lo mismo para otra comunidad autónoma? El código está diseñado para ser reutilizable.

---

## 📖 Documentación

- [`plans/arquitectura.md`](plans/arquitectura.md) — Arquitectura técnica y decisiones de diseño
- [`plans/roadmap.md`](plans/roadmap.md) — Hoja de ruta detallada por fases
- [`docs/fuentes-datos.md`](docs/fuentes-datos.md) — Guía de fuentes de datos oficiales

---

## ⚖️ Licencia

Este proyecto está bajo la licencia **MIT**. Los datos utilizados son públicos y de libre reutilización conforme a la legislación española vigente.

---

## 👤 Autor

Proyecto personal de portfolio desarrollado como estudiante de DAM.

- GitHub: [Albus Quinctus](https://github.com/albus-quinctus)

---

## 🙏 Créditos

- [Jaime Gómez-Obregón](https://github.com/JaimeObregon) por la inspiración y el trabajo original en [contratosdecantabria.es](https://contratosdecantabria.es)
- Comunidad de Madrid por publicar los datos en abierto
- Ministerio de Hacienda por mantener la Plataforma de Contratación del Sector Público
