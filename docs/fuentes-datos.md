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
| `cbc:StatusCode` | — | Estado de la licitación |

---

## Fuente Secundaria: Portal de Transparencia de la CAM

**URL:** https://www.comunidad.madrid/transparencia/contratacion
**Mantenida por:** Comunidad de Madrid

La Comunidad de Madrid publica sus propios datos de contratación en su portal de transparencia, incluyendo **contratos menores** que no siempre aparecen en PLACSP.

### Cómo acceder

1. Ve a https://www.comunidad.madrid/transparencia
2. Sección **"Contratación"**
3. Busca el enlace de **"Descarga de datos"** o **"Datos abiertos"**

### Formato

- Generalmente en **CSV** con separador `;`
- Codificación: UTF-8 con BOM o ISO-8859-1
- Actualización: variable (mensual o trimestral)

> ⚠️ **Nota:** Las URLs de descarga directa de este portal cambian con frecuencia. Verificar periódicamente que siguen siendo válidas.

---

## Fuente Terciaria: Datos Abiertos CAM

**URL:** https://datos.comunidad.madrid
**Mantenida por:** Comunidad de Madrid

El portal de datos abiertos de la CAM puede tener datasets específicos de contratación, especialmente contratos menores y datos históricos.

### Búsqueda recomendada

1. Ve a https://datos.comunidad.madrid/catalogo
2. Busca: `contratos` o `contratación pública`
3. Filtra por formato: **CSV** o **JSON**
4. Anota el UUID del dataset para construir la URL de descarga directa

### Formato de URL de descarga

```
https://datos.comunidad.madrid/catalogo/dataset/{UUID_DATASET}/resource/{UUID_RECURSO}/download/{NOMBRE_ARCHIVO}.csv
```

> ⚠️ **Nota:** Los UUIDs de los recursos cambian cuando el dataset se actualiza. El pipeline debe verificar periódicamente que las URLs siguen siendo válidas.

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
Prioridad 1: PLACSP (feed Atom)
└── Licitaciones y adjudicaciones de todos los organismos CAM
└── Actualización: diaria (el feed se actualiza continuamente)
└── Automatizado en scripts/download.js

Prioridad 2: Portal Transparencia CAM (CSV)
└── Contratos menores y datos específicos de la CAM
└── Actualización: mensual o trimestral
└── Automatizado en scripts/download.js (verificar URL periódicamente)

Prioridad 3: Datos Abiertos CAM (CSV)
└── Datasets históricos o temáticos específicos
└── Incorporar manualmente cuando se identifiquen datasets relevantes

Deduplicación:
└── Usar NumExpediente + OrganoContratacion como clave de unión entre fuentes
└── En caso de conflicto, PLACSP tiene prioridad sobre las demás fuentes
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
