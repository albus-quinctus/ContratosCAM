# Plan: Mejora de Cobertura, Calidad y Estado de Contratos — ContratosCAM

**Fecha:** Agosto 2026  
**Estado:** Pendiente de implementación  
**Contexto:** 2.899 contratos en `contratos-normalizados.json`, fuentes PLACSP + TED

---

## Diagnóstico de partida

| Problema | Impacto | Estado actual |
|---|---|---|
| Solo ~2.900 contratos (feed rolling, no histórico) | 🔴 Muy alto | `download:full` implementado pero sin ejecutar |
| `fecha_formalizacion` al 0% | 🔴 Alto | PLACE en 404, sin alternativa activa |
| `estado` existe en el XML pero no se muestra en el frontend | 🟡 Alto | Mapeado en `transform.js` pero sin filtro UI |
| `nif_adjudicatario` al ~40% | 🟡 Medio | `enrich-nif.js` implementado pero sin ejecutar |
| PLACSP CSV avanzado sin investigar | 🟡 Medio | Puede tener campos extra o más cobertura |
| PLACE histórico (2008–presente) en 404 | 🔴 Alto | URLs caducadas, alternativas sin explorar |

---

## Arquitectura del pipeline ampliado

```
PLACSP Feed Atom (modo full)  ──→  download.js --full
PLACSP CSV avanzado (nuevo)   ──→  download-placsp-csv.js (nuevo)
PLACE histórico (por invest.) ──→  download-place.js (nuevo, si accesible)
TED-UE API                    ──→  download-ted.js

         ↓ parse
parse.js / parse-place.js / parse-ted.js

         ↓ transform
transform.js  →  deduplicar + merge  →  contratos-normalizados.json

         ↓ enrich
enrich-nif.js  →  update-estados.js (nuevo)

         ↓ import
import-db.js  →  contratos.db  →  Web
```

---

## Bloque A — Descarga histórica completa

**Impacto:** Pasar de ~2.900 a potencialmente 15.000–30.000 contratos de la CAM.  
**Esfuerzo:** Cero código nuevo — solo ejecutar el script ya implementado.

### Tareas

1. Ejecutar `npm run download:full` (30–60 min, ~1–2 GB de descarga)
2. Ejecutar `npm run parse && npm run transform && npm run validate`
3. Verificar el recuento final y el tamaño del JSON resultante
4. Si el JSON supera 20 MB → evaluar activar migración a Turso (Fase 6 del roadmap)

---

## Bloque B — Investigar PLACSP búsqueda avanzada CSV

La interfaz web de PLACSP permite exportar resultados de búsqueda en CSV. Este CSV puede tener campos adicionales respecto al feed Atom, especialmente `fecha_formalizacion` y datos de adjudicación más completos.

### Resultado de la investigación automatizada (agosto 2026)

❌ **No se puede automatizar directamente.** La web de PLACSP tiene un WAF (Web Application Firewall) que bloquea peticiones programáticas:

- Todas las URLs del dominio `contrataciondelestado.es` devuelven "Request Rejected" (243 bytes)
- Esto incluye el portal web, la búsqueda avanzada y los endpoints de sindicación
- El bloqueo se activa tras descargas masivas (rate limiting temporal) o por falta de cookies de sesión del portal WebSphere
- El feed Atom funciona normalmente cuando no hay rate limiting activo

**Diagnóstico del bloqueo actual (agosto 2026):**

| Causa | Tipo | Duración estimada |
|-------|------|-------------------|
| Rate limiting por descarga masiva de 314 páginas (~4,6 GB) | Temporal | 1–24 horas |
| WAF del portal web / búsqueda avanzada / CSV | Permanente | Siempre requiere navegador |

> 🔁 **Reintentar en ~24h:** El feed Atom y los endpoints de sindicación deberían volver a funcionar. Verificar con:
> ```bash
> node -e "fetch('https://contrataciondelestado.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom').then(r => console.log(r.status, r.headers.get('content-type')))"
> ```
> Si devuelve `200 application/atom+xml` → el bloqueo temporal se levantó. En ese momento se puede reintentar la investigación del CSV avanzado.

**Conclusión técnica:** La exportación CSV de PLACSP requiere interacción manual con un navegador (sesión WebSphere + posible CAPTCHA). No es automatizable de forma fiable.

### Investigación manual pendiente

Para completar este bloque, se necesita acceso manual al portal:

1. **Abrir en navegador:** `https://contrataciondelestado.es/wps/portal/plataforma`
2. **Navegar a:** Búsqueda avanzada de licitaciones
3. **Filtrar por:**
   - Ámbito: Comunidad Autónoma
   - Comunidad: Madrid
   - Estado: Todos (o filtrar por "Formalizado" para obtener `fecha_formalizacion`)
4. **Exportar CSV** (botón de descarga en la tabla de resultados)
5. **Verificar campos disponibles** — comparar con el esquema actual

### Campos de interés a buscar en el CSV

- `fecha_formalizacion` — la más valiosa (actualmente al 0%)
- `importe_definitivo` — puede diferir del presupuesto de licitación
- `duracion_real` — duración ejecutada vs. prevista
- `modificaciones` — si hubo modificados contractuales
- `NIF completo` — puede mejorar el 54% actual

### Si el CSV tiene campos nuevos útiles

1. Implementar `scripts/download-placsp-csv.js` con descarga automatizada (si se encuentra un endpoint sin WAF)
2. Actualizar `parse.js` o crear `parse-placsp-csv.js` para procesar el nuevo formato
3. Integrar en `transform.js` como fuente adicional con deduplicación

### Alternativa descubierta: scraping de fichas individuales

El script `scripts/update-estados.js` ya accede a fichas individuales de PLACSP con éxito. Se podría extender este enfoque para extraer `fecha_formalizacion` de cada ficha HTML, similar a como se extrae el estado. Esto evitaría depender del CSV.

---

## Bloque C — Investigar PLACE histórico (fuentes alternativas)

El Registro de Contratos PLACE tiene las URLs directas en 404. Se investigaron tres alternativas.

### Resultado de la investigación (agosto 2026)

❌ **Ninguna fuente alternativa tiene datos descargables del Registro de Contratos.**

### C1 — datos.gob.es

```
https://datos.gob.es/es/catalogo/e00125901-registro-de-contratos-del-sector-publico
```

**Resultado:** ❌ La ficha del catálogo devuelve **404** (ya no existe). El dataset fue eliminado del catálogo de datos.gob.es.

### C2 — Portal de Transparencia del Gobierno

```
https://transparencia.gob.es/transparencia/transparencia_Home/index/PublicidadActiva/Contratos.html
```

**Resultado:** ❌ La página existe (200) pero es un **portal informativo** construido con Adobe Experience Manager. No contiene:
- Ningún enlace a archivos de datos (.csv, .xml, .json, .xlsx)
- Ninguna mención a "Registro de Contratos", "PLACE", "fichero", "descarga", "XML", "CSV" o "CODICE"
- Solo tiene links a registros de actividades de tratamiento (RGPD) y contenido decorativo

La URL original (`/MasSobreTransparencia/Contratacion.html`) devuelve 404 — la sección fue reorganizada.

### C3 — IGAE directamente

```
https://www.igae.pap.hacienda.gob.es/sitios/igae/es-ES/Contabilidad/ContabilidadPublica/CPE/Paginas/rcsp.aspx
```

**Resultado:** ❌ Devuelve **404**. Se probaron también:
- `/Paginas/default.aspx` → 404
- `/BasesDatos/Paginas/default.aspx` → 404
- `/Paginas/igae.aspx` → 404

El sitio web de la IGAE parece haber sido reorganizado completamente. No se encontró ninguna ruta alternativa con datos de contratación.

### Conclusión

El Registro de Contratos del Sector Público (PLACE) **no está accesible por ninguna vía conocida** a fecha de agosto 2026. Las tres fuentes investigadas (datos.gob.es, transparencia.gob.es, IGAE) no ofrecen datos descargables de contratos individuales.

**Implicación para el proyecto:** El feed Atom de PLACSP sigue siendo la **única fuente programática** de contratos individuales de la CAM. La descarga histórica completa (314 páginas, 5.877 contratos) representa el máximo alcanzable por esta vía.

### Si en el futuro se publican los datos

1. Implementar `scripts/download-place.js` con descarga de XMLs anuales
2. El formato CODICE es el mismo que PLACSP → `parse.js` existente es reutilizable con mínimas adaptaciones
3. Actualizar `docs/fuentes-datos.md` con el resultado

---

## Bloque D — Campo `estado` normalizado y completo

### Situación actual

El campo `estado` ya existe en el modelo de datos y está mapeado en `scripts/transform.js`:

```javascript
const ESTADOS = {
  'PUB': 'publicado',
  'EV': 'en_evaluacion',
  'ADJ': 'adjudicado',
  'RES': 'resuelto',
  'ANUL': 'anulado',
  'PRE': 'pre_adjudicacion',
};
```

**Problema:** El estado del feed Atom es el estado en el momento de la descarga, no el estado actual. Un contrato descargado como `publicado` puede estar ya `adjudicado` semanas después.

### Solución: Estado derivado inteligente

Añadir en `transform.js` una función `derivarEstado()` que infiere el estado más probable a partir de los datos disponibles:

```
Si tiene adjudicatario Y fecha_adjudicacion  → "adjudicado"
Si tiene adjudicatario Y fecha_formalizacion → "formalizado"
Si estado_xml == "ANUL"                      → "anulado"
Si estado_xml == "RES"                       → "resuelto"
Si estado_xml == "EV"                        → "en_evaluacion"
Si estado_xml == "PUB" Y fecha > 6 meses    → "posiblemente_resuelto"
Si estado_xml == "PUB"                       → "en_licitacion"
```

### Esquema de estados propuesto

| Valor | Descripción | Fuente |
|---|---|---|
| `en_licitacion` | Publicado, plazo abierto | Derivado de XML |
| `en_evaluacion` | Plazo cerrado, evaluando ofertas | XML directo |
| `pre_adjudicado` | Propuesta de adjudicación publicada | XML directo |
| `adjudicado` | Adjudicado, pendiente de formalizar | XML + datos adjudicatario |
| `formalizado` | Contrato firmado y en ejecución | PLACE (cuando esté disponible) |
| `resuelto` | Contrato ejecutado y cerrado | XML directo |
| `anulado` | Licitación anulada o desierta | XML directo |
| `posiblemente_resuelto` | Sin actualización en >6 meses | Derivado por antigüedad |

### Archivos a modificar

- `scripts/transform.js` — añadir `derivarEstado()`, campos `estado_xml` y `estado_verificado_en`
- `scripts/validate.js` — validar los nuevos valores de estado

### Tareas

1. Añadir función `derivarEstado(crudo)` en `scripts/transform.js`
2. Añadir campo `estado_xml` (el código original del feed) para trazabilidad
3. Añadir campo `estado` (el derivado, más fiable) al objeto normalizado
4. Añadir campo `estado_verificado_en` (fecha de la última verificación del estado)
5. Actualizar `scripts/validate.js` para validar los nuevos valores de estado

---

## Bloque E — Filtro de estado en el frontend

### Tareas

1. Añadir selector de estado en `src/web/index.html` (junto a los filtros existentes)
2. Actualizar `src/web/js/app.js` para filtrar por estado
3. Añadir badge de color por estado en la tabla de contratos:
   - 🟢 Verde: `formalizado`, `resuelto`
   - 🟡 Amarillo: `en_licitacion`, `en_evaluacion`, `pre_adjudicado`
   - 🔵 Azul: `adjudicado`
   - 🔴 Rojo: `anulado`
   - ⚫ Gris: `posiblemente_resuelto`
4. Mostrar el estado en el modal de detalle del contrato
5. Añadir estadística de distribución por estado en la sección de gráficas

---

## Bloque F — Script de actualización de estados obsoletos

Para los contratos que llevan más de 30 días sin actualización de estado, se puede consultar la ficha web de PLACSP para obtener el estado actual.

### Nuevo script: `scripts/update-estados.js`

**Criterio de selección de contratos a actualizar:**
```
estado == "en_licitacion" O estado == "en_evaluacion"
Y fecha_publicacion < hace 30 días
Y estado_verificado_en < hace 7 días (o null)
```

**Algoritmo:**
```
1. Fetch de url_origen (ficha PLACSP)
2. Extraer el estado actual del HTML
3. Actualizar estado + estado_verificado_en
4. Delay: 2s entre peticiones
5. Guardar contratos actualizados
```

### Tareas

1. Implementar `scripts/update-estados.js`
2. Añadir `"update:estados": "node scripts/update-estados.js"` al `package.json`
3. Integrar en el pipeline CI/CD como paso opcional (`continue-on-error: true`)

---

## Bloque G — Ejecutar enriquecimiento de NIFs

`scripts/enrich-nif.js` ya está implementado y listo. Solo hay que ejecutarlo.

### Tareas

1. Ejecutar `npm run enrich:nif -- --max=200` (prueba inicial con 200 contratos)
2. Verificar resultados: tasa de éxito, errores, caché generada
3. Si la tasa es aceptable (>30%): ejecutar sin límite `npm run enrich:nif`
4. Programar ejecución semanal en el workflow de GitHub Actions

---

## Bloque H — Documentación

### Tareas

1. Actualizar `plans/roadmap.md` con las nuevas fases (Fase 5d: estados, Fase 5e: PLACSP CSV)
2. Actualizar `docs/fuentes-datos.md` con los resultados de la investigación de PLACE
3. Actualizar `plans/mejora-calidad-datos.md` marcando las tareas completadas

---

## Orden de implementación recomendado

| Orden | Bloque | Razón |
|---|---|---|
| 1º | **A** — `download:full` | Cero código, máximo impacto en cobertura |
| 2º | **D** — campo `estado` | Mejora la calidad sin dependencias externas |
| 3º | **E** — filtro UI estado | Depende de D, alta visibilidad para usuarios |
| 4º | **G** — `enrich-nif` | Ya implementado, solo ejecutar |
| 5º | **B** — PLACSP CSV | Requiere investigación manual primero |
| 6º | **F** — `update-estados.js` | Nuevo script, depende de D |
| 7º | **C** — PLACE histórico | Investigación, resultado incierto |
| 8º | **H** — Documentación | Al final, cuando los cambios estén estables |

---

## Impacto esperado

| Bloque | Contratos afectados | Mejora |
|---|---|---|
| A: Descarga histórica | Todos (x10 estimado) | Cobertura temporal 2018–presente |
| B: PLACSP CSV | Todos | +`fecha_formalizacion` si disponible |
| C: PLACE histórico | Potencialmente miles | Cobertura 2008–2018 |
| D: Estado derivado | Todos | Campo `estado` fiable y trazable |
| E: Filtro UI estado | — | Usabilidad para periodistas y ciudadanos |
| F: Update estados | ~30% (en licitacion >30 días) | Estados actualizados semanalmente |
| G: Enrich NIFs | ~200–400 contratos adjudicados | `nif_adjudicatario` +20–30% |
