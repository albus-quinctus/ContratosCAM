# Arquitectura Técnica — ContratosCAM

## Visión General

**ContratosCAM** es una aplicación web de transparencia pública que descarga, procesa y visualiza los datos de contratación pública de la Comunidad de Madrid, inspirada en [contratosdecantabria.es](https://contratosdecantabria.es) de Jaime Gómez-Obregón.

---

## Diagrama de Arquitectura del Sistema

```mermaid
graph TD
    A[Fuente de Datos\nPortal de Transparencia CAM\nPlataforma de Contratación del Estado] -->|Descarga automática\nCSV / XML / JSON| B[Scraper / ETL]

    B -->|Datos crudos| C[Almacenamiento Raw\n/data/raw/]
    C -->|Procesamiento y limpieza| D[Pipeline de Transformación\nNode.js / Python scripts]
    D -->|Datos normalizados| E[Base de Datos\nSQLite / JSON estático]

    E -->|API o archivos estáticos| F[Frontend Web\nHTML + CSS + JS Vanilla\no Next.js]

    F --> G1[Buscador de contratos]
    F --> G2[Filtros por organismo\nimporte y fecha]
    F --> G3[Fichas de contrato]
    F --> G4[Estadísticas y graficas]
    F --> G5[Exportar datos CSV]

    H[GitHub Actions\nCron Job] -->|Actualización periódica| B
    H -->|Deploy automático| I[GitHub Pages\no Vercel]
    I --> F
```

---

## Stack Tecnológico Recomendado

### Para un estudiante de DAM de 1er año

| Capa | Tecnología | Por qué |
|------|-----------|---------|
| **Scraping / ETL** | Node.js + `node-fetch` + `csv-parse` | Ya conoces JS, fácil de aprender |
| **Base de datos** | SQLite (via `better-sqlite3`) | Sin servidor, un solo archivo, SQL estándar |
| **Backend API** | Express.js (opcional) | Simple y muy documentado |
| **Frontend** | HTML + CSS + JS Vanilla | Control total, sin magia |
| **Gráficas** | Chart.js | Librería sencilla y potente |
| **Tablas** | DataTables.js | Búsqueda y filtros gratis |
| **Deploy** | GitHub Pages + GitHub Actions | Gratis, integrado con tu repo |

### Alternativa más moderna (cuando tengas más experiencia)
- Frontend: **Next.js** (React)
- Base de datos: **Turso** (SQLite en la nube)
- Deploy: **Vercel**

---

## Estructura de Directorios

```
contratoscam/
├── .github/
│   └── workflows/
│       └── update-data.yml       # GitHub Action para actualizar datos
├── data/
│   ├── raw/                      # Datos descargados sin procesar
│   │   └── .gitkeep
│   ├── processed/                # Datos limpios y normalizados
│   │   └── .gitkeep
│   └── db/
│       └── contratos.db          # Base de datos SQLite (gitignored si es grande)
├── docs/
│   ├── fuentes-datos.md          # Documentación de las fuentes
│   └── capturas/                 # Screenshots para el README
├── plans/
│   ├── arquitectura.md           # Este archivo
│   └── roadmap.md                # Hoja de ruta
├── scripts/
│   ├── download.js               # Descarga datos de la fuente
│   ├── parse.js                  # Parsea CSV/XML a JSON
│   ├── transform.js              # Limpia y normaliza datos
│   └── import-db.js              # Importa datos a SQLite
├── src/
│   ├── api/
│   │   └── server.js             # Servidor Express (opcional)
│   └── web/
│       ├── index.html            # Página principal
│       ├── contrato.html         # Ficha de contrato
│       ├── css/
│       │   └── styles.css
│       └── js/
│           ├── app.js            # Lógica principal
│           ├── search.js         # Búsqueda y filtros
│           └── charts.js         # Gráficas
├── .gitignore
├── package.json
└── README.md
```

---

## Flujo de Datos (ETL)

```mermaid
sequenceDiagram
    participant S as Script download.js
    participant API as Portal Transparencia CAM
    participant R as /data/raw/
    participant P as Script parse.js
    participant T as Script transform.js
    participant DB as SQLite DB
    participant W as Web Frontend

    S->>API: GET contratos en formato CSV/XML
    API-->>S: Archivo de datos
    S->>R: Guarda archivo crudo con fecha
    R->>P: Lee archivo crudo
    P->>T: JSON sin normalizar
    T->>DB: INSERT contratos normalizados
    W->>DB: SELECT con filtros
    DB-->>W: Resultados paginados
```

---

## Modelo de Datos

### Tabla `contratos`

```sql
CREATE TABLE contratos (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    expediente      TEXT,
    objeto          TEXT NOT NULL,
    tipo            TEXT,           -- obras, servicios, suministros
    procedimiento   TEXT,           -- abierto, negociado, menor
    organismo       TEXT NOT NULL,
    importe         REAL,
    importe_iva     REAL,
    adjudicatario   TEXT,
    nif_adjudicatario TEXT,
    fecha_publicacion TEXT,
    fecha_adjudicacion TEXT,
    fecha_formalizacion TEXT,
    url_origen      TEXT,
    created_at      TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### Tabla `organismos`

```sql
CREATE TABLE organismos (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre  TEXT NOT NULL,
    tipo    TEXT,   -- consejeria, organismo_autonomo, empresa_publica
    web     TEXT
);
```

---

## Fuentes de Datos Principales

1. **Portal de Transparencia de la Comunidad de Madrid**
   - URL: https://www.comunidad.madrid/transparencia
   - Formato: CSV, XML

2. **Plataforma de Contratación del Sector Público (PLACSP)**
   - URL: https://contrataciondelestado.es
   - Formato: XML (CODICE), CSV descargable
   - API REST disponible

3. **HACIENDA - Registro de Contratos**
   - Datos históricos en formato abierto

---

## Consideraciones Técnicas

### Rendimiento
- Usar **paginación** en todas las consultas (máx. 50 resultados por página)
- **Índices** en SQLite sobre `organismo`, `tipo`, `fecha_publicacion`, `importe`
- Para el frontend estático: generar JSON pre-procesados por organismo

### Legalidad y Ética
- Los datos son **públicos** y de libre reutilización (Ley 37/2007)
- Incluir siempre **enlace a la fuente original**
- Respetar el `robots.txt` de los portales
- No sobrecargar los servidores (añadir delays entre peticiones)

### Escalabilidad
- Empezar con **datos estáticos** (JSON en el repo)
- Escalar a SQLite cuando superes 10.000 contratos
- Escalar a PostgreSQL si llegas a producción real
