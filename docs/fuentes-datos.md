# Fuentes de Datos — ContratosCAM

## Introducción

Los contratos públicos de la Comunidad de Madrid están disponibles en varias fuentes oficiales. Esta guía explica dónde encontrarlos, en qué formato están y cómo descargarlos.

---

## Fuente Principal: Plataforma de Contratación del Sector Público (PLACSP)

**URL:** https://contrataciondelestado.es

Esta es la fuente más completa y estructurada. Gestiona el Ministerio de Hacienda y contiene contratos de **todas las administraciones públicas españolas**, incluyendo la Comunidad de Madrid.

### Cómo descargar datos

1. Ve a https://contrataciondelestado.es/wps/portal/plataforma
2. Sección **"Datos Estadísticos"** → **"Descargas"**
3. Filtra por **Comunidad Autónoma: Madrid**
4. Descarga en formato **CSV** o **XML (CODICE)**

### Formato de los datos

Los datos en CSV incluyen estos campos principales:

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

### API REST (avanzado)

PLACSP ofrece una API para consultas programáticas:

```
GET https://contrataciondelestado.es/api/v1/contratos?
    comunidadAutonoma=13&    # 13 = Comunidad de Madrid
    fechaDesde=2024-01-01&
    fechaHasta=2024-12-31&
    page=1&
    pageSize=100
```

---

## Fuente Secundaria: Portal de Transparencia de la CAM

**URL:** https://www.comunidad.madrid/transparencia/contratacion

La Comunidad de Madrid publica sus propios datos de contratación en su portal de transparencia.

### Cómo acceder

1. Ve a https://www.comunidad.madrid/transparencia
2. Sección **"Contratación"**
3. Busca el enlace de **"Descarga de datos"** o **"Datos abiertos"**

### Formato

- Generalmente en **CSV** o **Excel (.xlsx)**
- Actualización: variable (mensual o trimestral)

---

## Fuente Terciaria: Datos Abiertos CAM

**URL:** https://datos.comunidad.madrid

El portal de datos abiertos de la CAM puede tener datasets específicos de contratación.

### Búsqueda recomendada

1. Ve a https://datos.comunidad.madrid/catalogo
2. Busca: `contratos` o `contratación pública`
3. Filtra por formato: **CSV** o **JSON**

---

## Diario Oficial de la Comunidad de Madrid (BOCAM)

**URL:** https://www.bocm.es

Los contratos también se publican en el Boletín Oficial de la Comunidad de Madrid. Útil para:
- Verificar datos
- Obtener información adicional no disponible en CSV
- Contratos históricos

---

## Estrategia de Descarga Recomendada

Para este proyecto, la estrategia recomendada es:

```
1. PLACSP (fuente principal)
   └── Descarga CSV mensual filtrado por CAM
   └── Automatizar con GitHub Actions (cron mensual)

2. Portal Transparencia CAM (complementario)
   └── Para datos específicos de la CAM no en PLACSP
   └── Descarga manual o semi-automática

3. Cruzar datos cuando sea posible
   └── Usar NumExpediente como clave de unión
```

---

## Consideraciones Legales

### Marco legal
- **Ley 37/2007** de reutilización de la información del sector público
- **Real Decreto 1495/2011** que desarrolla la ley anterior
- **Ley 19/2013** de transparencia, acceso a la información pública y buen gobierno

### Lo que puedes hacer
- ✅ Descargar y almacenar los datos
- ✅ Procesar, transformar y enriquecer los datos
- ✅ Publicar los datos procesados
- ✅ Crear aplicaciones basadas en los datos
- ✅ Uso comercial (con atribución)

### Lo que debes hacer
- ✅ Citar siempre la fuente original
- ✅ Incluir enlace al anuncio oficial en cada contrato
- ✅ No modificar datos de forma que induzca a error
- ✅ Respetar el `robots.txt` si haces scraping web

---

## Problemas Conocidos de Calidad de Datos

| Problema | Frecuencia | Solución |
|----------|-----------|---------|
| Importes en formato texto con comas | Alta | Reemplazar `,` por `.` y parsear a float |
| Fechas en formato `DD/MM/YYYY` | Alta | Convertir a `YYYY-MM-DD` (ISO 8601) |
| Nombres de organismos inconsistentes | Media | Normalizar con tabla de equivalencias |
| NIF con/sin guiones | Media | Eliminar guiones y espacios |
| Campos vacíos en contratos menores | Alta | Marcar como `null`, no como string vacío |
| Duplicados por múltiples fuentes | Baja | Deduplicar por `NumExpediente` |

---

## Script de Descarga de Ejemplo

```javascript
// scripts/download.js
const fs = require('fs');
const path = require('path');

const PLACSP_URL = 'https://contrataciondelestado.es/...'; // URL real a determinar
const OUTPUT_DIR = path.join(__dirname, '../data/raw');

async function downloadContratos() {
  const fecha = new Date().toISOString().split('T')[0];
  const filename = `contratos-cam-${fecha}.csv`;
  const outputPath = path.join(OUTPUT_DIR, filename);

  console.log(`Descargando contratos de la CAM...`);

  const response = await fetch(PLACSP_URL);
  const data = await response.text();

  fs.writeFileSync(outputPath, data, 'utf-8');
  console.log(`✅ Guardado en: ${outputPath}`);
  console.log(`   Tamaño: ${(data.length / 1024).toFixed(1)} KB`);
}

downloadContratos().catch(console.error);
```
