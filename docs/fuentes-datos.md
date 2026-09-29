# Fuentes de Datos — ContratosCAM

## Introducción

ContratosCAM es una herramienta de transparencia ciudadana. Su valor depende directamente de la calidad y completitud de los datos que procesa. Esta guía documenta las fuentes de datos oficiales utilizadas, cómo acceder a ellas, en qué formato están y qué problemas de calidad presentan.

**Principio fundamental:** Cada contrato que aparece en la web incluye siempre un enlace a su fuente oficial original. Los datos nunca se modifican de forma que induzcan a error; solo se normalizan para facilitar la búsqueda y comparación.

---

## Fuente Principal: Plataforma de Contratación del Sector Público (PLACSP)

**URL:** https://contrataciondelestado.es
**Mantenida por:** Ministerio de Hacienda

Esta es la fuente más completa y estructurada. Contiene contratos de **todas las administraciones públicas españolas**, incluyendo la Comunidad de Madrid. Es la fuente de referencia para licitaciones y adjudicaciones.

### Cómo descargar datos manualmente

1. Ve a https://contrataciondelestado.es/wps/portal/plataforma
2. Sección **"Datos Estadísticos"** → **"Descargas"**
3. Filtra por **Comunidad Autónoma: Madrid**
4. Descarga en formato **CSV** o **XML (CODICE)**

### Feed Atom (usado por el pipeline)

PLACSP publica feeds Atom con las licitaciones más recientes. El pipeline de ContratosCAM usa el feed completo de perfiles de contratante:

```
https://contrataciondelestado.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom
```

> ⚠️ **Nota:** Este feed contiene licitaciones de toda España. El script `transform.js` debe filtrar por los organismos de la Comunidad de Madrid.

### Formato de los datos (CSV)

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| `NumExpediente` | Número de expediente | `CM/2024/001234` |
| `Objeto` | Descripción del contrato | `Suministro de material de oficina` |
| `TipoContrato` | Tipo según LCSP | `Suministros` |
| `Procedimiento` | Procedimiento de adjudicación | `Abierto simplificado` |
| `OrganoContratacion` | Organismo que contrata | `Consejería de Educación` |
| `ImporteAdjudicacion` | Importe sin IVA (€) | `45000.00` |
| `ImporteConIVA` | Importe con IVA (€) | `54450.00` |
| `Adjudicatario` | Empresa o persona adjudicataria | `Empresa S.L.` |
| `NIF` | NIF del adjudicatario | `B12345678` |
| `FechaPublicacion` | Fecha de publicación | `2024-03-15` |
| `FechaAdjudicacion` | Fecha de adjudicación | `2024-04-20` |
| `URLPublicacion` | Enlace al anuncio oficial | `https://...` |

### Formato de los datos (Atom/XML CODICE)

El feed Atom usa el estándar CODICE (Common Data Interface for Contracting Entities), basado en UBL. Los campos relevantes son:

| Campo XML | Campo normalizado | Notas |
|-----------|------------------|-------|
| `cbc:ID` | `expediente` | Número de expediente |
| `cbc:Description` | `objeto` | Descripción del contrato |
| `cbc:ContractTypeCode` | `tipo` | Código de tipo de contrato |
| `cbc:ProcedureCode` | `procedimiento` | Código de procedimiento |
| `cac:PartyName/cbc:Name` | `organismo` | Nombre del órgano de contratación |
| `cbc:TaxExclusiveAmount` | `importe` | Importe sin IVA |
| `cbc:TaxInclusiveAmount` | `importe_iva` | Importe con IVA |
| `cbc:StatusCode` | `estado_xml` | Código de estado original del feed |
| `cbc:CPVCode` | `cpv` | Código CPV de la categoría de compra |
| `cbc:DurationMeasure` | `duracion_meses` | Duración del contrato en meses |
| `cbc:EstimatedOverallContractAmount` | `valor_estimado` | Valor estimado total |

### Estado del contrato (`estado`)

El campo `estado` es un valor **derivado** calculado por `scripts/transform.js` a partir del código XML y los datos disponibles. No se toma directamente del feed; se infiere con la función `derivarEstado()`:

| Código XML (`estado_xml`) | Datos adicionales | Estado derivado |
|--------------------------|-------------------|-----------------|
| `ANUL` | — | `anulado` |
| `RES` | — | `resuelto` |
| cualquiera | `fecha_formalizacion` presente | `formalizado` |
| cualquiera | `adjudicatario` + `fecha_adjudicacion` | `adjudicado` |
| `ADJ` | — | `adjudicado` |
| `PRE` | — | `pre_adjudicado` |
| `EV` | — | `en_evaluacion` |
| `PUB` o vacío | publicado hace >6 meses | `posiblemente_resuelto` |
| `PUB` o vacío | publicado hace ≤6 meses | `en_licitacion` |

El campo `estado_xml` conserva el código original del feed para auditoría. El campo `estado_verificado_en` registra la fecha en que se verificó el estado actual contra la web de PLACSP (mediante `scripts/update-estados.js`).

---

## Fuente Secundaria: Portal de Contratos Públicos de la CAM

**URL:** https://contratos-publicos.comunidad.madrid
**Mantenida por:** Comunidad de Madrid (Dirección General de Patrimonio y Contratación)

Portal informativo de la Comunidad de Madrid sobre contratación pública. Incluye:
- Perfil de contratante
- Publicidad de las contrataciones
- Sistema Licit@ (licitación electrónica)
- Contratación centralizada

### Estado actual (verificado julio 2026)

⚠️ **Este portal NO ofrece datos descargables** (CSV, JSON, XML) de contratos individuales. Es un portal informativo construido con Drupal que enlaza a PLACSP para la publicación de licitaciones.

Los contratos de la CAM (incluidos los menores desde 2018) se publican **a través de PLACSP**, que es la fuente que usa nuestro pipeline.

### Contacto

- Email: contratospublicos@madrid.org
- Subdirección General de Coordinación de la Contratación Pública

---

## Fuente Terciaria: Datos Abiertos CAM

**URL:** https://datos.comunidad.madrid
**Mantenida por:** Comunidad de Madrid
**API CKAN:** https://datos.comunidad.madrid/catalogo/api/3/action/package_search

### Estado actual (verificado julio 2026)

⚠️ **Este portal NO tiene contratos individuales.** Los datasets disponibles sobre contratación son exclusivamente **datos estadísticos agregados**:

| Dataset | Contenido | Útil para nosotros |
|---------|-----------|-------------------|
| Contratos administrativos por tipo de contrato | Importes totales por año y tipo | ❌ No (agregado) |
| Contratos administrativos por formas de adjudicación | Importes totales por año y forma | ❌ No (agregado) |
| Contratos administrativos por procedimientos de adjudicación | Importes totales por año y procedimiento | ❌ No (agregado) |

### Cómo se verificó

```bash
# API CKAN funcional
curl -s -L "https://datos.comunidad.madrid/catalogo/api/3/action/package_search?q=contratacion&rows=20"

# Resultado: solo 3 datasets, todos con datos agregados por año (no contratos individuales)
```

### Formato de URL de descarga (para referencia futura)

```
https://datos.comunidad.madrid/dataset/{UUID_DATASET}/resource/{UUID_RECURSO}/download/{NOMBRE_ARCHIVO}.csv
```

> 💡 **Nota:** Si en el futuro la CAM publica un dataset de contratos individuales en este portal, se puede integrar fácilmente al pipeline añadiendo una fuente CSV en `scripts/download.js`.

---

## Fuente Secundaria: Registro de Contratos del Sector Público (PLACE)

**URL:** https://www.hacienda.gob.es/es-ES/Areas%20Tematicas/Patrimonio%20del%20Estado/Contratacion/Paginas/Registro-de-Contratos.aspx
**Mantenida por:** Ministerio de Hacienda — Intervención General de la Administración del Estado (IGAE)

El Registro de Contratos del Sector Público publica ficheros XML anuales con todos los contratos formalizados por las administraciones públicas españolas. A diferencia del feed Atom de PLACSP (que muestra licitaciones en curso), estos ficheros contienen **contratos ya formalizados** — es decir, el dato definitivo de lo que se adjudicó y pagó.

### ¿Qué aporta respecto a PLACSP?

| Aspecto | PLACSP (feed Atom) | PLACE (Registro) |
|---------|-------------------|-----------------|
| Tipo de dato | Licitaciones en curso y recientes | Contratos formalizados |
| Cobertura temporal | Últimas semanas (feed rolling) | 2008–presente |
| Formato | Atom/XML CODICE | XML CODICE |
| Actualización | Diaria | Anual (ficheros por año) |
| Filtrado | Requiere filtrar por CAM | Requiere filtrar por CAM |

### Formato de los datos

Los ficheros XML usan el mismo estándar **CODICE** que el feed Atom de PLACSP. Esto significa que el parser existente (`scripts/parse.js`) puede reutilizarse con mínimas adaptaciones.

**Campos adicionales disponibles en PLACE:**
- Fecha de formalización del contrato
- Importe de adjudicación definitivo (vs. presupuesto de licitación)
- Duración del contrato
- Modificaciones contractuales

### Cómo descargar datos

```bash
# Los ficheros se publican como XML anuales en la web de Hacienda
# URL patrón (verificar anualmente):
https://www.hacienda.gob.es/.../contratos_2024.xml
https://www.hacienda.gob.es/.../contratos_2023.xml
# etc.
```

> ⚠️ **Nota:** Las URLs exactas deben verificarse en la web de Hacienda. Los ficheros son estáticos y no cambian una vez publicados.

### Estado actual (verificado agosto 2026)

❌ **No accesible.** Todas las URLs conocidas de los ficheros XML anuales del Registro de Contratos devuelven **404**. Se investigaron las siguientes fuentes sin éxito:

- `https://www.hacienda.gob.es/...` — URLs de descarga directa: 404
- `https://datos.gob.es/es/catalogo/e00125901-registro-de-contratos-del-sector-publico` — Dataset registrado pero sin distribuciones (items vacío)
- `https://transparencia.gob.es/transparencia/transparencia_Home/index/MasSobreTransparencia/Contratacion.html` — Solo datos estadísticos agregados, no contratos individuales
- `https://www.igae.pap.hacienda.gob.es/sitios/igae/es-ES/Contabilidad/ContabilidadPublica/CPE/Paginas/rcsp.aspx` — Página informativa sin descarga de datos

> 🔜 **Fase 5e (Bloque C)** — Pendiente de re-verificar periódicamente. Si en el futuro se publican los ficheros XML, el parser existente (`scripts/parse.js`) puede reutilizarse con mínimas adaptaciones al ser el mismo formato CODICE.

---

## Fuente Terciaria: TED — Tenders Electronic Daily (UE)

**URL:** https://ted.europa.eu
**API:** https://ted.europa.eu/api/v3.0/notices/search
**Documentación:** https://docs.ted.europa.eu
**Mantenida por:** Oficina de Publicaciones de la Unión Europea

Los contratos que superan los **umbrales europeos** se publican obligatoriamente en el Diario Oficial de la UE a través de TED. Para la Comunidad de Madrid, esto incluye:
- Contratos de servicios > ~221.000€
- Contratos de obras > ~5.538.000€
- Contratos de suministros > ~221.000€

### ¿Qué aporta respecto a PLACSP?

TED no sustituye a PLACSP sino que lo **enriquece** con datos adicionales:

| Campo TED | Descripción | Disponible en PLACSP |
|-----------|-------------|---------------------|
| `num_ofertas` | Número de ofertas recibidas | ❌ No |
| `criterios_adjudicacion` | Criterios y ponderaciones | ❌ No (solo código de procedimiento) |
| `subcontratacion` | Porcentaje subcontratado | ❌ No |
| `ofertas_rechazadas` | Número de ofertas excluidas | ❌ No |
| `pais_adjudicatario` | País de la empresa ganadora | ❌ No |

### API REST v3

La API de TED es pública, gratuita y no requiere autenticación para búsquedas básicas.

```bash
# Buscar contratos de la Comunidad de Madrid (NUTS ES3)
curl -s "https://ted.europa.eu/api/v3.0/notices/search?q=buyer-country%3DESP%20AND%20buyer-nuts-code%3DES3&fields=BT-01-notice,BT-21-Procedure,BT-142-LotResult,BT-27-Procedure&limit=100&page=1"
```

**Parámetros clave:**
- `buyer-country=ESP` — País del comprador: España
- `buyer-nuts-code=ES3` — Código NUTS: Comunidad de Madrid
- `fields` — Campos a devolver (Business Terms del eForms standard)
- `limit` / `page` — Paginación

**Formato de respuesta:** JSON nativo (no XML). Cada notice contiene los Business Terms (BT) del estándar eForms.

### Campos relevantes del estándar eForms

| Business Term | Campo | Descripción |
|--------------|-------|-------------|
| BT-01 | Procedure Legal Basis | Base legal del procedimiento |
| BT-21 | Procedure Title | Título/objeto del contrato |
| BT-27 | Estimated Value | Valor estimado |
| BT-142 | Winner | Adjudicatario |
| BT-144 | Not Awarded Reason | Motivo de no adjudicación |
| BT-156 | Group Leader | Empresa líder en UTE |
| BT-171 | Tender Rank | Posición de la oferta |
| BT-709 | Subcontracting Value | Valor subcontratado |
| BT-712 | Buyer Review Complaints | Recursos presentados |

### Límites de la API

- **Rate limit:** No documentado explícitamente, pero se recomienda max 1 req/segundo
- **Paginación:** Máximo 100 resultados por página
- **Sin autenticación** para búsquedas (se requiere API key solo para notificaciones push)

### Estado actual (verificado agosto 2026)

✅ **Integrado.** La API v3 de TED está operativa y se usa en el pipeline mediante `scripts/download-ted.js` y `scripts/parse-ted.js`.

**Resultados de la integración (agosto 2026):**
- ~139.735 notices disponibles para Madrid (filtro: `buyer-country=ESP AND buyer-city=Madrid`)
- 599 contratos TED integrados en el dataset (20,2% del total)
- 81% de contratos TED con `criterios_adjudicacion` extraídos
- 61 contratos con `num_ofertas` enriquecido
- Deduplicación multi-fuente funcional: PLACSP como base, TED enriquece campos exclusivos sin sobreescribir

**Campos enriquecidos disponibles en el dataset:**
- `num_ofertas` — número de ofertas recibidas
- `ted_publication_number` — referencia al anuncio en TED (con enlace directo)
- `criterios_adjudicacion` — array con criterios y ponderaciones (precio vs. calidad)

---

## Fuente de Verificación: BOCAM

**URL:** https://www.bocm.es
**Mantenida por:** Comunidad de Madrid

El Boletín Oficial de la Comunidad de Madrid publica los contratos como anuncios oficiales. Útil para:
- Verificar datos de contratos específicos
- Obtener información adicional no disponible en CSV
- Consultar contratos históricos anteriores a la digitalización de las otras fuentes

No se usa como fuente primaria del pipeline por la dificultad de parsear PDFs, pero es la referencia legal definitiva.

---

## Estrategia de Descarga del Pipeline

```
Prioridad 1: PLACSP (feed Atom) ✅ ACTIVO
└── Licitaciones recientes de todos los organismos CAM
└── Actualización: diaria (el feed se actualiza continuamente)
└── Automatizado en scripts/download.js
└── Modo normal: 50 páginas (~4.500 licitaciones CAM)
└── Modo completo: 500 páginas (~225.000 licitaciones, todo el histórico disponible)
└── Acumulación incremental: transform.js combina con histórico existente

Prioridad 2: TED-UE (API REST v3) ✅ ACTIVO
└── Contratos sobre umbrales europeos con datos enriquecidos
└── Actualización: diaria (API en tiempo real)
└── Automatizado en scripts/download-ted.js + parse-ted.js
└── 599 contratos integrados (20,2% del dataset)

Prioridad 3: PLACE — Registro de Contratos (XML anuales) ❌ NO ACCESIBLE
└── Contratos formalizados históricos (2008–presente)
└── Actualización: anual (ficheros estáticos)
└── Estado: todas las URLs conocidas devuelven 404 (verificado agosto 2026)
└── Pendiente de re-verificar en Fase 5e (Bloque C)

DESCARTADAS:
❌ Portal Transparencia CAM — No tiene datos descargables
❌ Datos Abiertos CAM — Solo datos estadísticos agregados
❌ BOCAM — Requiere scraping de PDFs (futura consideración)

Deduplicación:
└── Clave: expediente + organismo (normalizado)
└── Prioridad de datos: PLACSP base + TED enriquece campos exclusivos
└── TED no sobreescribe campos de PLACSP; solo añade num_ofertas, criterios, ted_publication_number
└── Acumulación incremental: cada ejecución semanal añade contratos nuevos sin perder histórico
```

---

## Problemas Conocidos de Calidad de Datos

Estos son los problemas más frecuentes que el script `scripts/transform.js` debe resolver:

| Problema | Frecuencia | Solución implementada |
|----------|-----------|----------------------|
| Importes como texto con comas (`45.000,00 €`) | Alta | Eliminar `.`, reemplazar `,` por `.`, parsear a float |
| Fechas en formato `DD/MM/YYYY` | Alta | Convertir a `YYYY-MM-DD` (ISO 8601) |
| Nombres de organismos inconsistentes | Media | Tabla de equivalencias + normalización de mayúsculas |
| NIF con guiones o espacios (`B-12.345.678`) | Media | Eliminar caracteres no alfanuméricos |
| Campos vacíos como string vacío (`""`) | Alta | Convertir a `null` |
| Duplicados entre fuentes | Baja-Media | Deduplicar por `expediente` + `organismo` |
| Codificación ISO-8859-1 en algunos CSV | Media | Detectar y convertir a UTF-8 al leer |
| Campos con saltos de línea dentro de comillas | Baja | Usar `relax_column_count: true` en csv-parse |
| Importes negativos (correcciones) | Baja | Registrar como `null` con nota en logs |
| Estado obsoleto (feed captura estado al descargar) | Alta | `derivarEstado()` infiere estado con lógica combinada; `update-estados.js` verifica contra web PLACSP |
| NIF del adjudicatario ausente (~61%) | Alta | `scripts/enrich-nif.js` busca NIF en ficha PLACSP y OpenCorporates |
| `cpv` y `duracion_meses` ausentes en contratos antiguos | Media | Extraídos del XML CODICE cuando disponibles; null si no |

---

## Consideraciones Legales

### Marco legal de reutilización

- **Ley 37/2007** de reutilización de la información del sector público
- **Real Decreto 1495/2011** que desarrolla la ley anterior
- **Ley 19/2013** de transparencia, acceso a la información pública y buen gobierno
- **Reglamento (UE) 2019/1024** sobre datos abiertos y reutilización de la información del sector público

### Lo que puedes hacer con estos datos

- ✅ Descargar y almacenar los datos
- ✅ Procesar, transformar y normalizar los datos
- ✅ Publicar los datos procesados con atribución a la fuente
- ✅ Crear aplicaciones basadas en los datos
- ✅ Uso comercial (con atribución)
- ✅ Análisis periodístico e investigación

### Lo que debes hacer siempre

- ✅ Citar la fuente original en cada contrato (enlace al anuncio oficial)
- ✅ No modificar los datos de forma que induzcan a error
- ✅ Respetar el `robots.txt` si se hace scraping web (no aplica a descargas de datos abiertos)
- ✅ Añadir delays entre peticiones para no sobrecargar los servidores públicos
- ✅ Indicar claramente la fecha de última actualización de los datos

---

## Cómo Verificar que las URLs Siguen Siendo Válidas

Las URLs de descarga de datos públicos cambian con frecuencia. Para verificarlas:

```bash
# Verificar que una URL devuelve datos (no un error 404)
curl -I "https://datos.comunidad.madrid/catalogo/dataset/.../download/contratos.csv"

# Descargar manualmente y verificar el contenido
curl -L "https://..." -o test.csv
head -5 test.csv
```

Si una URL deja de funcionar:
1. Busca el dataset en el portal correspondiente
2. Localiza la nueva URL de descarga directa
3. Actualiza `scripts/download.js` con la nueva URL
4. Abre un issue en el repositorio documentando el cambio
