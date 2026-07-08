# Hoja de Ruta — ContratosCAM

## Objetivo del Proyecto

Crear una **herramienta cívica de transparencia pública** que permita a cualquier ciudadano, periodista o investigador buscar, filtrar y explorar los contratos públicos de la Comunidad de Madrid de forma sencilla e intuitiva, **sin necesidad de registro ni instalación**.

El proyecto es open source por diseño: cualquiera puede auditar cómo se obtienen los datos, cómo se procesan y cómo se muestran. La metodología es transparente y reproducible.

---

## Fases del Proyecto

### FASE 0 — Preparación, Estructura e Infraestructura Segura ✅
> Sentar las bases antes de escribir código de producción

- [x] Estudiar el proyecto de referencia: [contratosdecantabria.es](https://contratosdecantabria.es)
- [x] Explorar el Portal de Transparencia de la CAM y PLACSP
- [x] Definir el objetivo del proyecto (herramienta cívica, no solo portfolio)
- [x] Diseñar la arquitectura técnica y el modelo de datos
- [x] Crear el repositorio en GitHub con estructura de directorios
- [x] Documentar fuentes de datos y consideraciones legales
- [x] Crear el pipeline ETL esqueleto (`download.js`, `parse.js`, `transform.js`, `import-db.js`)
- [x] Crear el frontend base (`index.html`, `styles.css`, `app.js`)
- [x] Configurar GitHub Actions para CI/CD
- [x] Auditoría de seguridad e infraestructura:
  - [x] Actualizar `fast-xml-parser` a v5 (eliminar vulnerabilidad CVE)
  - [x] Añadir SRI (Subresource Integrity) a Chart.js CDN
  - [x] Añadir meta headers de seguridad (`X-Content-Type-Options`, `referrer`)
  - [x] Corregir GitHub Actions para desplegar solo frontend + datos (no todo el repo)
  - [x] Refactorizar `import-db.js` a ESM nativo (eliminar `createRequire`)
  - [x] Mejorar `download.js` con timeout, validación de contenido y delays
  - [x] Crear `scripts/validate.js` para validación de schema post-ETL
  - [x] Añadir `.nvmrc` para fijar Node.js 20
  - [x] Limpiar `.gitignore` y eliminar `.gitkeep` redundantes
  - [x] Eliminar `postinstall` innecesario del `package.json`

**Entregable:** Repositorio público con estructura completa, documentación, código base funcional, 0 vulnerabilidades y pipeline validado.

---

### FASE 1 — Pipeline ETL Funcional ✅
> El corazón del proyecto son los datos reales

- [x] Verificar y corregir las URLs de descarga en `scripts/download.js`
  - [x] ~~Confirmar URL del CSV de contratos menores de la CAM~~ — No disponible como datos individuales en datos.comunidad.madrid (solo datos agregados)
  - [x] Confirmar URL del feed Atom de PLACSP — ✅ Funciona con paginación
- [x] Implementar `scripts/download.js` con descarga paginada del feed Atom (10 páginas, ~135 MB)
- [x] Implementar `scripts/parse.js` con fast-xml-parser v5 para extraer datos del feed CODICE
- [x] Implementar `scripts/transform.js`:
  - [x] Filtrar contratos por jerarquía "Comunidad de Madrid" en ParentLocatedParty
  - [x] Mapear campos del feed Atom de PLACSP al esquema normalizado
  - [x] Mapear códigos de tipo (1=suministros, 2=servicios, 3=obras, etc.)
  - [x] Mapear códigos de procedimiento (1=abierto, 9=negociado_sin_publicidad, etc.)
  - [x] Limpiar importes (texto con comas → float)
  - [x] Normalizar fechas a ISO 8601 (`YYYY-MM-DD`)
  - [x] Normalizar nombres de organismos (tabla de equivalencias)
  - [x] Limpiar NIFs (eliminar guiones y espacios)
  - [x] Convertir campos vacíos a `null`
  - [x] Deduplicar por `expediente` + `organismo`
  - [x] Generar `data/processed/contratos-normalizados.json`
- [x] Implementar `scripts/validate.js` con validación de schema, completitud y coherencia
- [x] Explorar los datos reales (50 páginas, 24.572 licitaciones de toda España):
  - **1.393 contratos únicos de la CAM** (tras deduplicar 1.698 filtrados)
  - Tipos: servicios (696), suministros (372), obras (227), privado (48), otros (26)
  - Procedimientos: abierto (763), negociado_sin_publicidad (468), negociado (80), restringido (39)
  - Importes: 0,41€ — 558M€ (media: 1,65M€)
  - Completitud: 100% en campos críticos, 49.1% en adjudicatario (normal para licitaciones en curso)
- [x] Investigar fuentes adicionales:
  - ❌ **datos.comunidad.madrid** — Solo tiene datos estadísticos/agregados (importes totales por año y tipo), NO contratos individuales
  - ❌ **contratos-publicos.comunidad.madrid** — Portal informativo Drupal sin datos descargables (CSV/JSON)
  - ❌ **Portal de Transparencia CAM** — No tiene URLs de descarga directa de contratos menores
  - ✅ **PLACSP** — Es la ÚNICA fuente con contratos individuales accesibles programáticamente (la CAM publica aquí sus contratos desde 2018 por Ley 9/2017)

**Entregable:** `data/processed/contratos-normalizados.json` con 1.393 contratos reales y limpios (1.03 MB). ✅

---

### FASE 2 — Base de Datos SQLite Local
> Organizar los datos para consultas eficientes en desarrollo

- [ ] Implementar `scripts/import-db.js`:
  - [ ] Crear la base de datos SQLite con el esquema definido en `arquitectura.md`
  - [ ] Importar el JSON normalizado a la tabla `contratos`
  - [ ] Crear índices sobre `organismo`, `tipo`, `fecha_publicacion`, `importe`, `adjudicatario`
  - [ ] Crear tabla virtual FTS5 para búsqueda full-text (opcional en esta fase)
- [ ] Probar consultas SQL básicas: buscar por organismo, filtrar por importe, ordenar por fecha
- [ ] Medir el tamaño del JSON resultante para decidir estrategia de BD en la nube

**Entregable:** `data/db/contratos.db` con datos importados y consultables localmente.

---

### FASE 3 — Web Pública en GitHub Pages (MVP) ✅
> Que cualquier persona pueda acceder sin instalar nada

- [x] Verificar que el frontend carga correctamente el JSON real (no los datos de ejemplo)
- [x] Comprobar que los filtros funcionan con datos reales
- [x] Comprobar que las gráficas se renderizan correctamente
- [x] Configurar GitHub Pages en el repositorio (Settings → Pages → GitHub Actions)
- [x] Verificar que la web es accesible en `https://albus-quinctus.github.io/ContratosCAM`
- [x] Comprobar que el enlace a la fuente oficial aparece en cada ficha de contrato
- [x] Hacer la tabla responsive y verificar en móvil (breakpoints 900/600/400px)

**Entregable:** Web pública funcional con datos reales accesible sin instalación. ✅

---

### FASE 4 — Visualizaciones y Estadísticas ✅
> Convertir los datos en información comprensible para ciudadanos

- [x] 4 gráficas en la página principal con datos reales:
  - [x] Contratos por tipo (donut)
  - [x] Top 10 organismos por número de contratos (barras horizontales)
  - [x] Evolución mensual de contratos (línea)
  - [x] Distribución por procedimiento (donut)
- [x] **Página de ranking de adjudicatarios** (`ranking.html` + `ranking.js`):
  - [x] Tabla paginada con medallas (🥇🥈🥉) y barras de progreso
  - [x] Ordenación por importe total, nº de contratos, importe medio o nombre
  - [x] Filtros por tipo de contrato y organismo
  - [x] Búsqueda por nombre de empresa
  - [x] Gráfica Chart.js de top 10 adjudicatarios con métrica seleccionable
  - [x] Modal de detalle por empresa con lista de contratos
  - [x] Exportación CSV con protección contra CSV injection
  - [x] Diseño responsive (breakpoints 900/600/400px)
- [x] QA completo (10 issues detectados y corregidos)
- [ ] Añadir página o sección "Sobre los datos" con explicación de la metodología
- [ ] Añadir nota visible sobre la fuente y fecha de última actualización

**Entregable:** Sección de estadísticas completa y funcional con datos reales. ✅

---

### FASE 5 — Automatización y Actualización Semanal
> Que los datos se actualicen solos sin intervención manual

- [ ] Verificar que el cron job de GitHub Actions se ejecuta correctamente
- [ ] Verificar que el auto-commit de `data/processed/` funciona
- [ ] Verificar que el deploy a GitHub Pages se lanza tras cada actualización
- [ ] Añadir notificación de error si el pipeline falla (email o issue automático)
- [ ] Documentar el proceso de actualización para que sea auditable

**Entregable:** Pipeline completamente automatizado que actualiza la web cada lunes.

---

### FASE 6 — Migración a Turso (cuando el volumen lo justifique)
> Escalar la base de datos para datos históricos completos

Esta fase se activa cuando el JSON de datos supere ~20 MB o se quieran incorporar datos históricos de varios años.

- [ ] Evaluar el volumen real de datos tras varios meses de operación
- [ ] Crear cuenta en [Turso](https://turso.tech) y configurar base de datos
- [ ] Añadir `@libsql/client` como dependencia
- [ ] Modificar `scripts/import-db.js` para insertar en Turso
- [ ] Modificar `cargarDatos()` en `src/web/js/app.js` para usar el cliente libsql
- [ ] Configurar el token de solo lectura como variable de entorno en GitHub Actions
- [ ] Implementar paginación server-side para datasets grandes
- [ ] Implementar búsqueda full-text con FTS5 de SQLite
- [ ] Cargar datos históricos (años anteriores) en la base de datos

**Entregable:** Web con acceso a datos históricos completos, búsqueda full-text y sin límite de tamaño.

---

### FASE 7 — Pulido, Difusión y Portfolio
> Que quede bien para enseñarlo y que llegue a quien lo necesita

- [ ] Diseño visual cuidado (revisar tipografía, espaciado, colores)
- [ ] Añadir página "Sobre este proyecto" con:
  - [ ] Explicación del objetivo cívico
  - [ ] Metodología de obtención y procesamiento de datos
  - [ ] Cómo contribuir o reportar errores
  - [ ] Marco legal de reutilización de datos
- [ ] Añadir meta tags Open Graph completos para redes sociales
- [ ] Registrar dominio propio (ej. `contratoscam.es`) — opcional
- [ ] README completo con capturas de pantalla de la web en producción
- [ ] Escribir un artículo explicando el proyecto (para LinkedIn, blog o prensa)
- [ ] Contactar con periodistas de datos o medios interesados en transparencia
- [ ] Publicar en comunidades de datos abiertos y periodismo de datos

**Entregable:** Proyecto listo para presentar en entrevistas, portfolio y para uso real por ciudadanos y periodistas.

---

## Tecnologías que Aprenderás

| Tecnología | Para qué la usarás | Dificultad |
|-----------|-------------------|-----------|
| **Node.js** | Scripts de descarga y procesamiento ETL | ⭐⭐ |
| **CSV/XML/Atom parsing** | Leer datos de fuentes públicas en distintos formatos | ⭐⭐ |
| **SQLite** | Almacenar y consultar datos localmente | ⭐⭐ |
| **SQL** | Consultas, filtros, agregaciones, índices, FTS | ⭐⭐⭐ |
| **HTML/CSS** | Interfaz de usuario accesible y responsive | ⭐⭐ |
| **JavaScript DOM** | Interactividad sin frameworks | ⭐⭐⭐ |
| **Chart.js** | Visualizaciones de datos para ciudadanos | ⭐⭐ |
| **GitHub Actions** | Automatización, CI/CD, cron jobs | ⭐⭐⭐ |
| **GitHub Pages** | Deploy gratuito de sitios estáticos | ⭐ |
| **Turso / libsql** | Base de datos SQLite en la nube (fase futura) | ⭐⭐⭐ |

---

## Métricas de Éxito

Al terminar el proyecto deberías poder decir:

- ✅ "Descargué y procesé datos reales de contratación pública de la CAM"
- ✅ "Cualquier persona puede consultar los contratos desde su navegador sin instalar nada"
- ✅ "El código es público y cualquiera puede verificar que los datos no han sido manipulados"
- ✅ "Los datos se actualizan automáticamente cada semana sin intervención manual"
- ✅ "Un periodista puede buscar todos los contratos adjudicados a una empresa concreta"
- ✅ "El proyecto es reproducible: cualquiera puede clonarlo y ejecutarlo"

---

## Recursos de Aprendizaje

### Datos Abiertos y Transparencia
- [Portal de Transparencia CAM](https://www.comunidad.madrid/transparencia)
- [Plataforma de Contratación del Estado (PLACSP)](https://contrataciondelestado.es)
- [Datos Abiertos CAM](https://datos.comunidad.madrid)
- [Open Contracting Data Standard (OCDS)](https://standard.open-contracting.org)

### Referencia del Proyecto
- [Código de contratosdecantabria.es](https://github.com/JaimeObregon/contratoscantabria)
- [OpenSpending](https://openspending.org) — referencia internacional de transparencia fiscal

### Tutoriales Técnicos
- [Node.js para principiantes — freeCodeCamp](https://www.freecodecamp.org)
- [SQLite con Node.js — better-sqlite3 docs](https://github.com/WiseLibs/better-sqlite3)
- [Chart.js — Documentación oficial](https://www.chartjs.org/docs/)
- [GitHub Actions — Documentación oficial](https://docs.github.com/es/actions)
- [Turso — Documentación oficial](https://docs.turso.tech)
