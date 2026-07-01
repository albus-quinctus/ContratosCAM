# Hoja de Ruta — ContratosCAM

## Objetivo del Proyecto

Crear una web de transparencia pública que permita a cualquier ciudadano buscar, filtrar y explorar los contratos públicos de la Comunidad de Madrid de forma sencilla e intuitiva.

---

## Fases del Proyecto

### FASE 0 — Preparación y Aprendizaje
> Antes de escribir código, entiende el problema

- [ ] Estudiar el proyecto de referencia: [contratosdecantabria.es](https://contratosdecantabria.es) y su [código fuente](https://github.com/JaimeObregon/contratoscantabria)
- [ ] Explorar manualmente el Portal de Transparencia de la CAM
- [ ] Explorar la Plataforma de Contratación del Estado (PLACSP)
- [ ] Descargar manualmente un CSV/XML de muestra y abrirlo en Excel
- [ ] Entender la estructura de los datos: qué campos existen, qué significa cada uno
- [ ] Crear cuenta en GitHub y configurar el repositorio

**Entregable:** Repositorio creado en GitHub con este README

---

### FASE 1 — Datos: Descarga y Exploración
> El corazón del proyecto son los datos

- [ ] Identificar la URL exacta de descarga de datos de contratos de la CAM
- [ ] Escribir `scripts/download.js` que descargue el archivo automáticamente
- [ ] Escribir `scripts/parse.js` que convierta CSV/XML a JSON
- [ ] Explorar los datos: ¿cuántos contratos hay? ¿qué organismos aparecen? ¿qué rango de fechas?
- [ ] Identificar problemas de calidad: valores nulos, formatos inconsistentes, duplicados
- [ ] Escribir `scripts/transform.js` que limpie y normalice los datos

**Entregable:** Carpeta `data/processed/` con JSON limpio y un script que lo genera

---

### FASE 2 — Base de Datos
> Organiza los datos para poder consultarlos eficientemente

- [ ] Instalar SQLite y `better-sqlite3`
- [ ] Diseñar el esquema de la base de datos (ver `plans/arquitectura.md`)
- [ ] Escribir `scripts/import-db.js` que importe el JSON a SQLite
- [ ] Crear índices para búsqueda rápida
- [ ] Probar consultas SQL básicas: buscar por organismo, filtrar por importe, ordenar por fecha

**Entregable:** Archivo `data/db/contratos.db` con datos importados y consultables

---

### FASE 3 — Frontend Básico (MVP)
> Que se pueda ver algo en el navegador

- [ ] Crear `src/web/index.html` con estructura básica
- [ ] Mostrar una tabla con los primeros 50 contratos
- [ ] Añadir búsqueda por texto (objeto del contrato)
- [ ] Añadir filtro por organismo
- [ ] Añadir filtro por tipo de contrato
- [ ] Añadir filtro por rango de importe
- [ ] Hacer la tabla responsive (que se vea bien en móvil)
- [ ] Crear página de detalle de contrato (`src/web/contrato.html`)

**Entregable:** Web funcional que se puede abrir en el navegador localmente

---

### FASE 4 — Visualizaciones y Estadísticas
> Convierte los datos en información comprensible

- [ ] Instalar Chart.js
- [ ] Gráfica: contratos por tipo (tarta/donut)
- [ ] Gráfica: evolución temporal de contratos (línea por mes/año)
- [ ] Gráfica: top 10 organismos por número de contratos
- [ ] Gráfica: top 10 organismos por importe total
- [ ] Estadísticas generales: total contratos, importe total, número de organismos
- [ ] Página de estadísticas dedicada

**Entregable:** Sección de estadísticas con al menos 4 gráficas

---

### FASE 5 — Deploy y Automatización
> Que esté en internet y se actualice solo

- [ ] Configurar GitHub Pages para servir el frontend
- [ ] Generar archivos JSON estáticos desde SQLite (para no necesitar servidor)
- [ ] Crear `.github/workflows/update-data.yml` con GitHub Actions
- [ ] Configurar el cron job para actualizar datos semanalmente
- [ ] Probar que el deploy automático funciona
- [ ] Configurar dominio personalizado (opcional)

**Entregable:** Web publicada en `tu-usuario.github.io/contratoscam`

---

### FASE 6 — Pulido y Portfolio
> Que quede bien para enseñarlo

- [ ] Diseño visual cuidado (colores, tipografía, espaciado)
- [ ] Añadir logo y nombre del proyecto
- [ ] Página "Sobre este proyecto" con explicación de la metodología
- [ ] Enlace siempre visible a la fuente de datos original
- [ ] Meta tags para redes sociales (Open Graph)
- [ ] README completo con capturas de pantalla
- [ ] Añadir licencia (MIT o Creative Commons)
- [ ] Escribir un post/artículo explicando el proyecto (para LinkedIn/blog)

**Entregable:** Proyecto listo para presentar en entrevistas y portfolio

---

## Tecnologías que Aprenderás

| Tecnología | Para qué la usarás | Dificultad |
|-----------|-------------------|-----------|
| **Node.js** | Scripts de descarga y procesamiento | ⭐⭐ |
| **CSV/XML parsing** | Leer datos de fuentes públicas | ⭐⭐ |
| **SQLite** | Almacenar y consultar datos | ⭐⭐ |
| **SQL** | Consultas, filtros, agregaciones | ⭐⭐⭐ |
| **HTML/CSS** | Interfaz de usuario | ⭐⭐ |
| **JavaScript DOM** | Interactividad en el navegador | ⭐⭐⭐ |
| **Chart.js** | Visualizaciones de datos | ⭐⭐ |
| **GitHub Actions** | Automatización y CI/CD | ⭐⭐⭐ |
| **GitHub Pages** | Deploy gratuito | ⭐ |

---

## Recursos de Aprendizaje

### Datos Abiertos
- [Portal de Transparencia CAM](https://www.comunidad.madrid/transparencia)
- [Plataforma de Contratación del Estado](https://contrataciondelestado.es)
- [Datos Abiertos CAM](https://datos.comunidad.madrid)

### Referencia del Proyecto
- [Código de contratosdecantabria.es](https://github.com/JaimeObregon/contratoscantabria)
- [Hilo de Twitter de Jaime explicando el proyecto](https://twitter.com/JaimeObregon)

### Tutoriales
- [Node.js para principiantes - freeCodeCamp](https://www.freecodecamp.org)
- [SQLite con Node.js - better-sqlite3 docs](https://github.com/WiseLibs/better-sqlite3)
- [Chart.js - Documentación oficial](https://www.chartjs.org/docs/)
- [GitHub Actions - Documentación oficial](https://docs.github.com/es/actions)

---

## Métricas de Éxito

Al terminar el proyecto deberías poder decir:

- ✅ "Descargué y procesé datos reales de contratación pública"
- ✅ "Diseñé y poblé una base de datos relacional"
- ✅ "Construí una interfaz web funcional con búsqueda y filtros"
- ✅ "Automaticé la actualización de datos con CI/CD"
- ✅ "Publiqué el proyecto en internet de forma gratuita"
- ✅ "El código está en GitHub con documentación clara"
