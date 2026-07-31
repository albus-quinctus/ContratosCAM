# Plan de Mejora de Calidad de Datos — ContratosCAM

**Fecha:** Julio 2026  
**Estado:** Pendiente de implementación  
**Contexto:** 1.640 contratos en `contratos-normalizados.json`, todos de fuente PLACSP

---

## 1. Diagnóstico: Campos con Baja Completitud

### Estimación de completitud actual

| Campo | Completitud estimada | Causa raíz |
|-------|---------------------|------------|
| `adjudicatario` | ~50% | Normal: contratos en estado `publicado`/`en_evaluacion` aún no adjudicados |
| `nif_adjudicatario` | ~40% | PLACSP omite el NIF en el feed Atom; contratos sin adjudicatario tampoco tienen NIF |
| `procedimiento` | ~85% | Algunos contratos carecen de `procedimiento_code` en el XML |
| `tipo` | ~90% | Códigos desconocidos no mapeados en `TIPOS_CONTRATO` |
| `fecha_adjudicacion` | ~50% | Solo disponible cuando el contrato está adjudicado |
| `fecha_formalizacion` | 0% | No disponible en el feed Atom (solo en PLACE histórico) |
| `num_ofertas` | 0% | Solo disponible en TED (integración pendiente de ejecutar) |
| `cpv` | 0% | Campo no extraído del XML aunque está disponible |
| `duracion` | 0% | Campo no extraído del XML aunque está disponible |

### Distinción importante sobre el NIF

El NIF falta por **dos razones distintas** que requieren soluciones distintas:

1. **Contrato no adjudicado** → no hay adjudicatario → no hay NIF → **correcto, no hay nada que buscar**
2. **Contrato adjudicado pero sin NIF** → PLACSP lo omitió en el XML → **aquí hay que buscar**

Solo el caso 2 es accionable. Estimación: ~30-40% de los contratos adjudicados carecen de NIF.

---

## 2. Fuentes de Datos: Revisión Completa

### Fuentes activas

| Fuente | Estado | Qué aporta |
|--------|--------|------------|
| **PLACSP feed Atom** | ✅ Activo | Licitaciones recientes de la CAM |
| **TED-UE API** | ⚠️ Implementado, sin ejecutar | `num_ofertas`, contratos grandes enriquecidos |

### Fuentes para enriquecimiento de NIF (gratuitas)

| Fuente | Cobertura | Gratuita | Método | Límite |
|--------|-----------|----------|--------|--------|
| **PLACSP ficha web** | Alta | ✅ | Scraping HTML de `url_origen` | Sin límite (con delays) |
| **OpenCorporates API** | Alta | ✅ | REST API, busca por nombre | 500 req/día |
| **BORME API (BOE)** | Media | ✅ | API oficial BOE, inscripciones mercantiles | Sin límite documentado |
| **Registro Mercantil Central** | Media | ✅ (consulta básica) | Web scraping | Sin límite (con delays) |
| **AEAT Censo** | Alta | ❌ | Requiere certificado digital | — |
| **einforma.com** | Alta | ❌ | Pago | — |
| **Axesor** | Alta | ❌ | Pago | — |

### Fuentes para nuevos contratos

| Fuente | Estado | Qué aporta | Acción necesaria |
|--------|--------|------------|-----------------|
| **PLACE histórico (Hacienda)** | ❌ URLs 404 | Contratos formalizados 2008-presente | Investigar alternativas |
| **datos.gob.es** | ⚠️ Dataset vacío (julio 2026) | Potencialmente contratos históricos | Re-verificar periódicamente |
| **PLACSP búsqueda avanzada CSV** | 🔜 Sin investigar | Contratos no en el feed Atom | Investigar exportación web |
| **Portal Transparencia Gobierno** | 🔜 Sin investigar | Posibles ficheros PLACE | Verificar URLs |

---

## 3. Campos Disponibles en el XML que No se Extraen

El [`scripts/parse.js`](../scripts/parse.js) actual **no extrae** estos campos que sí están en el XML CODICE de PLACSP:

| Campo nuevo | Ruta XML CODICE | Valor para el proyecto |
|-------------|-----------------|----------------------|
| `cpv` | `cac:RequiredCommodityClassification/cbc:ItemClassificationCode` | Categorizar por sector (sanidad, educación, TI...) |
| `cpv_descripcion` | `cac:RequiredCommodityClassification/cbc:ItemClassificationCode/@_name` | Descripción legible del CPV |
| `duracion_meses` | `cac:PlannedPeriod/cbc:DurationMeasure` | Detectar contratos de larga duración |
| `num_lotes` | Contar `cac:ProcurementProjectLot` | Contratos divididos en lotes |
| `valor_estimado` | `cbc:EstimatedOverallContractAmount` | Ya se extrae pero no se mapea al output |
| `subtipo` | `cbc:SubTypeCode` | Ya se extrae pero no se mapea al output |

Estos campos ya están en el XML — solo requieren añadir extracción en `parse.js` y mapeo en `transform.js`.

---

## 4. Plan de Implementación

### Prioridad A — Campos adicionales del XML PLACSP (impacto inmediato, sin dependencias externas)

**Archivos a modificar:**
- [`scripts/parse.js`](../scripts/parse.js) — añadir extracción de CPV, duración, lotes
- [`scripts/transform.js`](../scripts/transform.js) — mapear nuevos campos al output normalizado
- [`scripts/validate.js`](../scripts/validate.js) — añadir validación de nuevos campos opcionales

**Cambios concretos en `parse.js` — función `extraerContrato()`:**

```javascript
// CPV (código de producto/servicio)
const cpvNodes = get(project, 'cac:RequiredCommodityClassification');
const cpvArr = Array.isArray(cpvNodes) ? cpvNodes : (cpvNodes ? [cpvNodes] : []);
const cpvPrincipal = cpvArr[0];
const cpv = texto(get(cpvPrincipal, 'cbc:ItemClassificationCode'));
const cpvDescripcion = cpvPrincipal?.['cbc:ItemClassificationCode']?.['@_name'] || null;

// Duración del contrato
const periodo = get(project, 'cac:PlannedPeriod');
const duracionMeses = texto(get(periodo, 'cbc:DurationMeasure'));

// Número de lotes
const lotes = get(contractFolder, 'cac:ProcurementProjectLot');
const numLotes = Array.isArray(lotes) ? lotes.length : (lotes ? 1 : 0);
```

**Cambios en `transform.js` — función `transformarContrato()`:**

```javascript
// Añadir al objeto retornado:
cpv: limpiarVacio(crudo.cpv),
cpv_descripcion: limpiarVacio(crudo.cpv_descripcion),
duracion_meses: crudo.duracion_meses ? parseInt(crudo.duracion_meses) || null : null,
num_lotes: crudo.num_lotes || null,
valor_estimado: normalizarImporte(crudo.importe_estimado),
subtipo: limpiarVacio(crudo.subtipo_code),
```

**Impacto esperado:** +6 campos nuevos en todos los contratos existentes y futuros.

---

### Prioridad B — Activar integración TED (scripts ya implementados)

Los scripts [`scripts/download-ted.js`](../scripts/download-ted.js) y [`scripts/parse-ted.js`](../scripts/parse-ted.js) ya están completos. Solo falta ejecutarlos.

**Pasos:**
1. `node scripts/download-ted.js` — descarga XMLs de TED (puede tardar 30-60 min)
2. `node scripts/parse-ted.js` — parsea XMLs y genera `parsed-ted.json`
3. `node scripts/transform.js` — integra TED con PLACSP automáticamente

**Añadir al `package.json`:**
```json
"download:ted": "node scripts/download-ted.js",
"parse:ted": "node scripts/parse-ted.js",
"etl:ted": "npm run download:ted && npm run parse:ted && npm run transform && npm run validate"
```

**Impacto esperado:** ~200 contratos/año con `num_ofertas` y datos enriquecidos.

---

### Prioridad C — Script de enriquecimiento de NIF (`scripts/enrich-nif.js`)

**Nuevo script** que opera sobre `contratos-normalizados.json` ya generado.

**Algoritmo:**

```
Para cada contrato donde adjudicatario != null Y nif_adjudicatario == null:

  1. Consultar caché local (data/processed/nif-cache.json)
     → Clave: nombre de empresa normalizado (minúsculas, sin puntuación)
     → Si encontrado en caché: usar ese NIF y continuar

  2. Intentar scraping de la ficha PLACSP (url_origen)
     → Fetch del HTML de la página del contrato
     → Buscar patrón NIF con regex: /[ABCDEFGHJKLMNPQRSUVW]\d{7}[0-9A-J]/g
     → Delay: 2 segundos entre peticiones
     → Si encontrado: guardar en caché, actualizar contrato

  3. Si no encontrado → OpenCorporates API (gratuita, 500 req/día)
     → GET https://api.opencorporates.com/v0.4/companies/search
         ?q={nombre_empresa}&jurisdiction_code=es&inactive=false
     → Extraer company_number del primer resultado
     → Delay: 3 segundos (respetar rate limit)
     → Si encontrado: guardar en caché, actualizar contrato

  4. Si no encontrado → BORME API (BOE oficial)
     → GET https://www.boe.es/borme/dias/{año}/{mes}/{dia}/JSON/
     → Buscar empresa por nombre en inscripciones recientes
     → Delay: 1 segundo

  5. Guardar caché actualizada en data/processed/nif-cache.json
  6. Guardar contratos actualizados en contratos-normalizados.json
```

**Estructura del caché:**
```json
{
  "limpiezas madrid sl": {
    "nif": "B12345678",
    "fuente": "placsp_scraping",
    "fecha": "2026-07-31"
  }
}
```

**Consideraciones:**
- El script debe ser **idempotente**: si se interrumpe, puede reanudarse sin duplicar consultas
- Respetar `robots.txt` de cada fuente
- Añadir `User-Agent` identificativo del proyecto
- Límite diario: máximo 400 consultas a OpenCorporates (margen de seguridad)
- El caché persiste entre ejecuciones del pipeline

**Añadir al `package.json`:**
```json
"enrich:nif": "node scripts/enrich-nif.js"
```

---

### Prioridad D — Investigar PLACE histórico y nuevas fuentes

**Acciones de investigación (no requieren código):**

1. **Re-verificar datos.gob.es** — el dataset de PLACE estaba vacío en julio 2026 pero puede actualizarse
   ```
   https://datos.gob.es/es/catalogo/e00125901-registro-de-contratos-del-sector-publico
   ```

2. **Portal de Transparencia del Gobierno** — puede tener ficheros XML de PLACE
   ```
   https://transparencia.gob.es/transparencia/transparencia_Home/index/MasSobreTransparencia/Contratacion.html
   ```

3. **PLACSP búsqueda avanzada** — la interfaz web permite exportar CSV con más campos
   ```
   https://contrataciondelestado.es/wps/portal/plataforma
   → Sección "Búsqueda de licitaciones" → Filtrar por CAM → Exportar CSV
   ```
   Investigar si este CSV tiene campos adicionales respecto al feed Atom.

---

## 5. Modelo de Datos Actualizado

### Esquema `contrato` con nuevos campos

```json
{
  "id": 1,
  "expediente": "2024/001234",
  "objeto": "Servicio de limpieza de edificios administrativos",
  "tipo": "servicios",
  "subtipo": null,
  "procedimiento": "abierto",
  "estado": "resuelto",
  "organismo": "Consejería de Sanidad",
  "importe": 125000.00,
  "importe_iva": 151250.00,
  "valor_estimado": 130000.00,
  "cpv": "90910000",
  "cpv_descripcion": "Servicios de limpieza",
  "duracion_meses": 24,
  "num_lotes": 1,
  "adjudicatario": "Limpiezas Madrid S.L.",
  "nif_adjudicatario": "B12345678",
  "nif_fuente": "placsp_scraping",
  "fecha_publicacion": "2024-03-15",
  "fecha_adjudicacion": "2024-04-20",
  "fecha_formalizacion": null,
  "url_origen": "https://contrataciondelestado.es/...",
  "fuente": "placsp",
  "num_ofertas": null,
  "ted_publication_number": null
}
```

**Campos nuevos:**
- `subtipo` — subtipo de contrato (cuando aplica)
- `valor_estimado` — presupuesto estimado (vs. importe de adjudicación)
- `cpv` — código CPV del producto/servicio
- `cpv_descripcion` — descripción legible del CPV
- `duracion_meses` — duración prevista del contrato en meses
- `num_lotes` — número de lotes en que se divide el contrato
- `nif_fuente` — origen del NIF (`placsp_xml`, `placsp_scraping`, `opencorporates`, `borme`)

---

## 6. Orden de Implementación Recomendado

```
Semana 1:
  ├── Tarea A: Extraer campos adicionales del XML (parse.js + transform.js)
  └── Tarea B: Ejecutar integración TED (scripts ya listos)

Semana 2:
  └── Tarea C: Implementar scripts/enrich-nif.js
      ├── Fase C1: Scraping PLACSP (más fiable, misma fuente)
      ├── Fase C2: OpenCorporates fallback
      └── Fase C3: BORME fallback

Semana 3:
  └── Tarea D: Investigar PLACE histórico y PLACSP CSV
```

---

## 7. Impacto Esperado

| Tarea | Contratos afectados | Campos mejorados |
|-------|--------------------|--------------------|
| A: Campos XML adicionales | 1.640 (todos) | +6 campos nuevos (CPV, duración, lotes...) |
| B: Activar TED | ~200/año | `num_ofertas`, datos enriquecidos |
| C: Enriquecimiento NIF | ~200-400 contratos adjudicados sin NIF | `nif_adjudicatario` +20-30% |
| D: PLACE histórico | Potencialmente miles | Cobertura histórica 2008-presente |

---

## 8. Notas Legales

- El scraping de PLACSP está permitido: es un portal de datos públicos bajo Ley 37/2007
- OpenCorporates redistribuye datos del Registro Mercantil bajo licencia abierta
- BORME es publicación oficial del BOE, datos de libre reutilización
- Respetar siempre `robots.txt` y añadir delays entre peticiones
- El `nif_fuente` permite auditar de dónde viene cada NIF enriquecido
