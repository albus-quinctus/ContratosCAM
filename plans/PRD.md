# Product Requirements Document (PRD) — ContratosCAM

## 1. Resumen Ejecutivo

**ContratosCAM** es una herramienta cívica de transparencia pública que descarga, procesa y visualiza los datos de contratación pública de la Comunidad de Madrid. Permite a cualquier ciudadano, periodista o investigador buscar, filtrar y analizar contratos públicos sin necesidad de registro, instalación ni conocimientos técnicos.

| Campo | Valor |
|-------|-------|
| **Producto** | ContratosCAM |
| **Tipo** | Aplicación web estática de datos abiertos |
| **Autor** | Albus Quinctus |
| **Licencia** | MIT |
| **URL objetivo** | `https://albus-quinctus.github.io/ContratosCAM` |
| **Estado actual** | Fases 0, 1, 3 y 4 completadas — Web pública con ranking de adjudicatarios |

---

## 2. Problema

### Contexto

La Comunidad de Madrid publica datos de contratación pública en múltiples portales (PLACSP, Portal de Transparencia, Datos Abiertos), pero:

- Los datos están **dispersos** en distintas plataformas con formatos diferentes (CSV, XML, Atom).
- Las interfaces oficiales son **complejas y poco intuitivas** para un ciudadano medio.
- No existe una **vista unificada** que permita buscar por adjudicatario, organismo o importe de forma sencilla.
- Los datos crudos requieren **conocimientos técnicos** para ser procesados y analizados.
- No hay **visualizaciones** que permitan detectar patrones o anomalías a simple vista.

### Impacto

- Los ciudadanos no pueden verificar fácilmente cómo se gasta su dinero.
- Los periodistas de datos deben invertir horas en limpiar y unificar datos antes de poder investigar.
- La opacidad favorece la falta de rendición de cuentas.

---

## 3. Solución Propuesta

Una **web pública, gratuita y sin registro** que:

1. **Descarga automáticamente** los datos de las fuentes oficiales cada semana.
2. **Limpia y normaliza** los datos en un formato unificado y consultable.
3. **Presenta** los contratos en una interfaz accesible con búsqueda, filtros y gráficas.
4. **Enlaza** siempre a la fuente oficial original para verificación.
5. **Permite exportar** los resultados filtrados en CSV para análisis propio.

---

## 4. Usuarios Objetivo

### 4.1 Ciudadano interesado
- **Perfil:** Persona sin conocimientos técnicos que quiere saber cómo se gasta el dinero público.
- **Necesidad:** Buscar contratos por palabra clave, ver importes y adjudicatarios.
- **Frecuencia de uso:** Esporádica (cuando sale una noticia, cuando quiere verificar algo).

### 4.2 Periodista de datos
- **Perfil:** Profesional que investiga contratación pública para publicar reportajes.
- **Necesidad:** Filtrar por adjudicatario, detectar patrones, exportar datos para cruzar con otras fuentes.
- **Frecuencia de uso:** Semanal o mensual, con sesiones intensivas.

### 4.3 Investigador / académico
- **Perfil:** Persona que estudia transparencia, gobernanza o economía pública.
- **Necesidad:** Acceso a datos estructurados, series temporales, estadísticas agregadas.
- **Frecuencia de uso:** Puntual pero con consultas complejas.

### 4.4 Desarrollador / activista cívico
- **Perfil:** Persona técnica que quiere replicar el proyecto para otra comunidad autónoma o contribuir.
- **Necesidad:** Código auditable, documentación clara, pipeline reproducible.
- **Frecuencia de uso:** Puntual (clonar, estudiar, adaptar).

---

## 5. Requisitos Funcionales

### 5.1 Pipeline de Datos (Backend offline)

| ID | Requisito | Prioridad |
|----|-----------|-----------|
| F-01 | Descargar datos de PLACSP (feed Atom filtrado por CAM) | Alta |
| F-02 | Descargar datos del Portal de Transparencia CAM (CSV contratos menores) | Alta |
| F-03 | Descargar datos de Datos Abiertos CAM (CSV/JSON) | Media |
| F-04 | Parsear CSV a JSON intermedio | Alta |
| F-05 | Parsear XML/Atom a JSON intermedio | Alta |
| F-06 | Normalizar campos al esquema unificado | Alta |
| F-07 | Limpiar importes (texto con comas → float) | Alta |
| F-08 | Normalizar fechas a ISO 8601 | Alta |
| F-09 | Normalizar nombres de organismos | Media |
| F-10 | Deduplicar contratos por expediente + organismo | Alta |
| F-11 | Validar schema e integridad del JSON generado | Alta |
| F-12 | Generar `contratos-normalizados.json` para el frontend | Alta |
| F-13 | Importar datos a SQLite local para desarrollo | Media |
| F-14 | Ejecutar pipeline automáticamente cada semana (GitHub Actions) | Alta |

### 5.2 Frontend (Aplicación web)

| ID | Requisito | Prioridad |
|----|-----------|-----------|
| F-20 | Cargar datos desde JSON estático (Fase 1) o API (Fase 2) | Alta |
| F-21 | Búsqueda por texto libre (objeto, organismo, adjudicatario) | Alta |
| F-22 | Filtro por tipo de contrato (obras, servicios, suministros, etc.) | Alta |
| F-23 | Filtro por procedimiento (abierto, negociado, menor, etc.) | Alta |
| F-24 | Filtro por rango de importe (mínimo - máximo) | Alta |
| F-25 | Filtro por rango de fechas | Alta |
| F-26 | Tabla de resultados paginada (50 por página) | Alta |
| F-27 | Ficha detallada de cada contrato (modal) | Alta |
| F-28 | Enlace a la fuente oficial original en cada ficha | Alta |
| F-29 | Exportar resultados filtrados a CSV | Media |
| F-30 | Gráfica: contratos por tipo (donut) | Media |
| F-31 | Gráfica: top 10 organismos por nº de contratos (barras) | Media |
| F-32 | Gráfica: evolución mensual de contratos (línea) | Media |
| F-33 | Gráfica: distribución por procedimiento (donut) | Media |
| F-34 | Contador de resultados y resumen de filtros activos | Alta |
| F-35 | Diseño responsive (funcional en móvil y escritorio) | Alta |

### 5.3 Automatización y Deploy

| ID | Requisito | Prioridad |
|----|-----------|-----------|
| F-40 | Deploy automático a GitHub Pages tras cada actualización de datos | Alta |
| F-41 | Cron job semanal en GitHub Actions | Alta |
| F-42 | Validación automática antes de publicar (CI gate) | Alta |
| F-43 | Solo desplegar `src/web/` + `data/processed/` (no scripts internos) | Alta |

---

## 6. Requisitos No Funcionales

| ID | Requisito | Criterio de aceptación |
|----|-----------|------------------------|
| NF-01 | **Accesibilidad** | Funciona sin registro, sin cookies, sin instalación |
| NF-02 | **Rendimiento** | Carga inicial < 3s en conexión 4G con datos < 20 MB |
| NF-03 | **Seguridad** | XSS prevenido (escape de datos), SRI en CDN, sin datos de usuario |
| NF-04 | **Auditabilidad** | Código fuente público, sin minificación, sin transpilación |
| NF-05 | **Reproducibilidad** | Cualquiera con Node.js 20 puede ejecutar el pipeline y obtener los mismos datos |
| NF-06 | **Coste** | $0/mes — solo servicios gratuitos (GitHub Pages, GitHub Actions) |
| NF-07 | **Disponibilidad** | 99.9% (garantizada por CDN de GitHub Pages) |
| NF-08 | **Legalidad** | Cumple Ley 37/2007 y Ley 19/2013; respeta robots.txt |
| NF-09 | **Mantenibilidad** | Sin frameworks, sin build step, código legible por cualquier desarrollador junior |
| NF-10 | **Escalabilidad** | Soporta hasta 50.000 contratos con JSON estático; migración a Turso si supera 20 MB |

---

## 7. Modelo de Datos

### Esquema principal: `contrato`

```json
{
  "id": 1,
  "expediente": "2024/001234",
  "objeto": "Servicio de limpieza de edificios administrativos",
  "tipo": "servicios",
  "procedimiento": "abierto",
  "organismo": "Consejería de Sanidad",
  "importe": 125000.00,
  "importe_iva": 151250.00,
  "adjudicatario": "Limpiezas Madrid S.L.",
  "nif_adjudicatario": "B12345678",
  "fecha_publicacion": "2024-03-15",
  "fecha_adjudicacion": "2024-04-20",
  "fecha_formalizacion": "2024-05-01",
  "url_origen": "https://contrataciondelestado.es/...",
  "fuente": "placsp"
}
```

### Valores permitidos

| Campo | Valores |
|-------|---------|
| `tipo` | `obras`, `servicios`, `suministros`, `administrativo_especial` |
| `procedimiento` | `abierto`, `abierto_simplificado`, `negociado`, `menor` |
| `fuente` | `placsp`, `cam_transparencia`, `cam_datos_abiertos` |

---

## 8. Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────────┐
│                        GITHUB ACTIONS (Cron semanal)                 │
│                                                                     │
│  ┌──────────┐   ┌─────────┐   ┌─────────────┐   ┌──────────────┐  │
│  │download.js│──▶│ parse.js │──▶│transform.js │──▶│import-db.js  │  │
│  └──────────┘   └─────────┘   └─────────────┘   └──────────────┘  │
│       │                                                │            │
│       ▼                                                ▼            │
│  ┌─────────┐                                   ┌──────────────┐    │
│  │data/raw/ │                                   │data/processed/│   │
│  │CSV, XML  │                                   │    .json      │   │
│  └─────────┘                                   └──────────────┘    │
│                                                        │            │
│                                              ┌─────────┘            │
│                                              ▼                      │
│                                     ┌────────────────┐              │
│                                     │ validate.js    │              │
│                                     │ (CI gate)      │              │
│                                     └────────────────┘              │
│                                              │                      │
│                                              ▼                      │
│                                     ┌────────────────┐              │
│                                     │ Deploy Pages   │              │
│                                     └────────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
                                               │
                                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        GITHUB PAGES (CDN global)                     │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ src/web/                                                        │ │
│  │  ├── index.html          ← Página principal                    │ │
│  │  ├── css/styles.css      ← Estilos responsive                  │ │
│  │  └── js/app.js           ← Lógica (búsqueda, filtros, charts)  │ │
│  │                                                                 │ │
│  │ data/processed/                                                 │ │
│  │  └── contratos-normalizados.json  ← Datos servidos como CDN    │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                               │
                                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        NAVEGADOR DEL USUARIO                        │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Buscador │  │ Filtros  │  │ Gráficas │  │ Exportar CSV      │  │
│  └──────────┘  └──────────┘  └──────────┘  └───────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              Tabla de resultados paginada                      │  │
│  │  Expediente | Objeto | Organismo | Importe | Fecha | Acción   │  │
│  │  ─────────────────────────────────────────────────────────── │   │
│  │  2024/001   | Limpi..| Sanidad   | 125.000€| 15/03 | [Ver]   │  │
│  │  2024/002   | Obras..| Educación | 890.000€| 20/03 | [Ver]   │  │
│  │  ...                                                          │  │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              Modal: Ficha detallada del contrato               │  │
│  │  + Enlace a fuente oficial original                           │  │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 9. Flujo de Usuario Principal

```
┌─────────────────┐
│ Usuario accede  │
│ a la web        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────────────────┐
│ Se cargan los   │────▶│ JSON descargado desde GitHub  │
│ datos (fetch)   │     │ Pages (CDN, cache del browser)│
└────────┬────────┘     └──────────────────────────────┘
         │
         ▼
┌─────────────────┐
│ Ve la tabla con │
│ todos los       │
│ contratos       │
└────────┬────────┘
         │
         ├──────────────────────────────────────┐
         │                                      │
         ▼                                      ▼
┌─────────────────┐                   ┌─────────────────┐
│ Busca por texto │                   │ Aplica filtros  │
│ (debounce 300ms)│                   │ (tipo, importe, │
└────────┬────────┘                   │  fecha, proc.)  │
         │                            └────────┬────────┘
         │                                     │
         └──────────────┬──────────────────────┘
                        │
                        ▼
              ┌─────────────────┐
              │ Tabla filtrada  │
              │ y paginada      │
              └────────┬────────┘
                       │
         ┌─────────────┼─────────────┐
         │             │             │
         ▼             ▼             ▼
┌──────────────┐ ┌──────────┐ ┌──────────────┐
│ Click en     │ │ Navega   │ │ Exporta a    │
│ contrato     │ │ páginas  │ │ CSV          │
│ → Modal      │ └──────────┘ └──────────────┘
│ detallado    │
│ + enlace     │
│   oficial    │
└──────────────┘
```

---

## 10. Fuentes de Datos

| Fuente | Tipo de datos | Formato | Frecuencia actualización |
|--------|--------------|---------|--------------------------|
| **PLACSP** | Contratos > umbral (todos los procedimientos) | Atom/XML (CODICE) | Diaria |
| **Portal Transparencia CAM** | Contratos menores (< 15.000€ servicios, < 40.000€ obras) | CSV | Trimestral |
| **Datos Abiertos CAM** | Datasets complementarios | CSV / JSON | Variable |

### Cobertura esperada

- **Contratos menores:** Miles por trimestre (la mayoría del volumen).
- **Contratos mayores (PLACSP):** Cientos por mes (los de mayor importe).
- **Rango temporal objetivo:** Últimos 2-3 años disponibles.

---

## 11. Métricas de Éxito

### Técnicas
- [x] Pipeline ETL ejecuta sin errores con datos reales
- [x] JSON generado pasa validación de schema al 100%
- [x] Web carga en < 3 segundos
- [x] 0 vulnerabilidades en `npm audit`
- [ ] Actualización semanal automática sin intervención (pendiente verificar cron)

### De producto
- [x] Un usuario puede encontrar un contrato específico en < 30 segundos
- [x] Un periodista puede filtrar todos los contratos de una empresa en < 1 minuto
- [x] Los datos son verificables: cada contrato enlaza a su fuente oficial
- [x] El proyecto es reproducible: `git clone` + `npm install` + `npm run etl` funciona
- [x] Un periodista puede ver el ranking de empresas adjudicatarias ordenado por importe total

### De impacto (largo plazo)
- [ ] Al menos 1 periodista o medio usa los datos para una investigación
- [ ] El proyecto se replica para otra comunidad autónoma
- [ ] Contribuciones externas al repositorio

---

## 12. Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Las URLs de descarga cambian sin aviso | Alta | Alto | Monitorizar en CI; alertar si falla la descarga |
| Los formatos CSV/XML cambian su estructura | Media | Alto | Validación de schema; tests de regresión |
| El volumen de datos supera lo manejable con JSON | Media | Medio | Migración planificada a Turso (Fase 6) |
| GitHub Pages tiene límite de 1 GB | Baja | Medio | Monitorizar tamaño; comprimir JSON si necesario |
| Datos de mala calidad (campos vacíos, duplicados) | Alta | Medio | Pipeline de limpieza robusto; reportes de completitud |
| Cambios legales en reutilización de datos | Muy baja | Alto | Seguir legislación vigente; consultar si hay dudas |

---

## 13. Fases de Entrega

| Fase | Entregable | Criterio de completitud |
|------|-----------|------------------------|
| **0** ✅ | Infraestructura y documentación | Repo público, 0 vulnerabilidades, estructura completa |
| **1** ✅ | Pipeline ETL funcional | `contratos-normalizados.json` con 1.393 contratos reales y limpios |
| **2** | SQLite local | BD consultable con datos importados |
| **3** ✅ | Web pública (MVP) | URL accesible con datos reales, búsqueda, filtros y diseño responsive |
| **4** ✅ | Visualizaciones + Ranking | 4 gráficas + página ranking adjudicatarios con Chart.js, filtros y exportación CSV |
| **5** | Automatización | Actualización semanal sin intervención manual |
| **6** | Turso | Datos históricos completos, búsqueda full-text |
| **7** | Pulido y difusión | Dominio propio, artículo publicado, contacto con medios |

---

## 14. Fuera de Alcance (No se hará)

- ❌ Registro de usuarios o cuentas
- ❌ Almacenamiento de datos personales
- ❌ Modificación o interpretación editorial de los datos
- ❌ Alertas personalizadas por email
- ❌ API pública REST (los datos son accesibles directamente como JSON)
- ❌ App móvil nativa (la web es responsive)
- ❌ Cobertura de otras comunidades autónomas (el código es reutilizable, pero el scope es CAM)

---

## 15. Dependencias Externas

| Dependencia | Riesgo | Alternativa |
|-------------|--------|-------------|
| GitHub Pages | Bajo (servicio estable y gratuito) | Netlify, Cloudflare Pages |
| GitHub Actions | Bajo (2.000 min/mes gratis) | GitLab CI, cron local |
| PLACSP (fuente de datos) | Medio (puede cambiar URLs) | Scraping directo del portal |
| Portal Transparencia CAM | Medio (actualización irregular) | Solicitud formal de datos |
| Chart.js CDN (jsdelivr) | Bajo (CDN redundante) | Servir localmente |

---

## 16. Glosario

| Término | Definición |
|---------|-----------|
| **PLACSP** | Plataforma de Contratación del Sector Público — portal nacional de licitaciones |
| **CAM** | Comunidad Autónoma de Madrid |
| **ETL** | Extract, Transform, Load — proceso de obtención y limpieza de datos |
| **SRI** | Subresource Integrity — verificación de integridad de recursos externos |
| **FTS5** | Full-Text Search 5 — módulo de búsqueda de texto completo de SQLite |
| **Contrato menor** | Contrato < 15.000€ (servicios) o < 40.000€ (obras) que no requiere licitación pública |
| **CODICE** | Componentes y Documentos Interoperables de Comercio Electrónico — estándar XML de PLACSP |
| **Turso** | Servicio de SQLite gestionado en la nube, sin pausas por inactividad |
