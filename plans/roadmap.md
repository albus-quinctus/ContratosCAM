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

### FASE 1 — Pipeline ETL Funcional
> El corazón del proyecto son los datos reales

- [ ] Verificar y corregir las URLs de descarga en `scripts/download.js`
  - [ ] Confirmar URL del CSV de contratos menores de la CAM
  - [ ] Confirmar URL del feed Atom de PLACSP filtrado por CAM
- [ ] Implementar `scripts/transform.js`:
  - [ ] Mapear campos de CSV de contratos menores al esquema normalizado
  - [ ] Mapear campos del feed Atom de PLACSP al esquema normalizado
  - [ ] Limpiar importes (texto con comas → float)
  - [ ] Normalizar fechas a ISO 8601 (`YYYY-MM-DD`)
  - [ ] Normalizar nombres de organismos (tabla de equivalencias)
  - [ ] Limpiar NIFs (eliminar guiones y espacios)
  - [ ] Convertir campos vacíos a `null`
  - [ ] Deduplicar por `expediente` + `organismo`
  - [ ] Generar `data/processed/contratos-normalizados.json`
- [ ] Explorar los datos reales: ¿cuántos contratos hay? ¿qué organismos? ¿qué rango de fechas?
- [ ] Documentar problemas de calidad encontrados

**Entregable:** `data/processed/contratos-normalizados.json` con datos reales y limpios.

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

### FASE 3 — Web Pública en GitHub Pages (MVP)
> Que cualquier persona pueda acceder sin instalar nada

- [ ] Verificar que el frontend carga correctamente el JSON real (no los datos de ejemplo)
- [ ] Comprobar que los filtros funcionan con datos reales
- [ ] Comprobar que las gráficas se renderizan correctamente
- [ ] Corregir el artefacto de GitHub Pages en `update-data.yml`:
  - [ ] Cambiar `path: .` por la ruta correcta que incluya `src/web/` y `data/processed/`
- [ ] Configurar GitHub Pages en el repositorio (Settings → Pages → GitHub Actions)
- [ ] Verificar que la web es accesible en `https://albus-quinctus.github.io/ContratosCAM`
- [ ] Comprobar que el enlace a la fuente oficial aparece en cada ficha de contrato
- [ ] Hacer la tabla responsive y verificar en móvil

**Entregable:** Web pública funcional con datos reales accesible sin instalación.

---

### FASE 4 — Visualizaciones y Estadísticas
> Convertir los datos en información comprensible para ciudadanos

- [ ] Verificar que las 4 gráficas existentes funcionan con datos reales:
  - [ ] Contratos por tipo (donut)
  - [ ] Top 10 organismos por número de contratos (barras horizontales)
  - [ ] Evolución mensual de contratos (línea)
  - [ ] Distribución por procedimiento (donut)
- [ ] Añadir estadísticas adicionales si los datos reales lo justifican:
  - [ ] Top 10 adjudicatarios por importe total
  - [ ] Contratos por rango de importe (histograma)
- [ ] Añadir página o sección "Sobre los datos" con explicación de la metodología
- [ ] Añadir nota visible sobre la fuente y fecha de última actualización

**Entregable:** Sección de estadísticas completa y funcional con datos reales.

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
