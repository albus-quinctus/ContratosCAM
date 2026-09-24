# Diseño Técnico: Resolución de UTEs (Uniones Temporales de Empresas)

## 1. Diagnóstico de datos reales

| Métrica | Valor |
|---------|-------|
| Total contratos | 7.172 |
| Contratos con UTE | 158 (2,2%) |
| UTEs únicas | 85 |
| Detectadas por nombre ("UTE ...") | 69 |
| Detectadas por NIF (U...) | 43 |
| Solo por NIF (sin "UTE" en nombre) | 11 |

### Patrones de separadores en nombres de UTEs

| Separador | Cantidad | Ejemplo |
|-----------|----------|---------|
| ` - ` | 20 | `UTE ACEINSA MOVILIDAD, S.A. - ETRALUX, S.A. - URBALUX, S.A` |
| ` Y ` / ` y ` | 13 | `UTE PACSA ... y OBRAS Y SERVICIOS TAGA, S.A., abreviadamente U.T.E. INFRAESTRUCTURAS L2` |
| Nombre propio (sin separador claro) | 52 | `UTE ESPACIOS PUBLICOS CHAMARTIN 2023` |

**Conclusión clave**: el 61% de las UTEs (52/85) usan un **nombre propio** sin listar sus miembros. Esto limita severamente la capacidad de parseo automático.

---

## 2. Enfoque: Modelo híbrido con `es_ute` + `miembros_ute`

### 2.1 Campos nuevos en el contrato

```json
{
  "adjudicatario": "UTE PACSA ... y OBRAS Y SERVICIOS TAGA ...",
  "nif_adjudicatario": "U19360510",
  "entity_id": "U19360510",
  "es_ute": true,
  "miembros_ute": [
    "PACSA SERVICIOS URBANOS Y DEL MEDIO NATURAL, S.L.",
    "OBRAS Y SERVICIOS TAGA, S.A."
  ]
}
```

- `es_ute`: `true` si el adjudicatario es una UTE. Detección por NIF (`U...`) o nombre (`UTE ...`, `U.T.E.`, `UNION TEMPORAL`).
- `miembros_ute`: array de nombres de empresas miembro extraídos del nombre. Puede estar **vacío** si el nombre es propio y no lista miembros.

### 2.2 Función `detectarUTE(nombre, nif)`

```
Entrada: nombre del adjudicatario, NIF
Salida: { esUte: boolean, miembros: string[] }
```

**Algoritmo de detección**:
1. Si `nif` empieza por `U` → `esUte = true`
2. Si `nombre` empieza por `UTE `, `U.T.E.`, contiene ` UTE `, termina en ` UTE`, o contiene `UNION TEMPORAL DE EMPRESAS` → `esUte = true`
3. En otro caso → `esUte = false`

**Algoritmo de extracción de miembros** (solo si `esUte = true`):

```
1. Limpiar prefijo: quitar "UTE ", "U.T.E. "
2. Limpiar sufijo: quitar ", abreviadamente ..." y todo lo que siga
3. Limpiar sufijo: quitar "UTE", "U.T.E.", "UNION TEMPORAL DE EMPRESAS ..."
4. Intentar split por separadores (en orden de prioridad):
   a. " - " (guión con espacios)
   b. "- " (guión pegado a la izquierda)  
   c. " y " / " e " (conjunciones, solo si no están dentro de un nombre de empresa)
5. Si se obtienen ≥2 fragmentos → miembros = fragmentos.map(trim)
6. Si se obtiene 1 fragmento → miembros = [] (nombre propio, no se puede descomponer)
```

**Problema con ` y `**: La conjunción "y" aparece tanto como separador de miembros (`PACSA ... y OBRAS ...`) como dentro de nombres de empresa (`OBRAS Y SERVICIOS TAGA`). La heurística es:
- Si ` y ` está en minúscula → probablemente separador de miembros
- Si ` Y ` está en mayúscula → probablemente parte del nombre de empresa
- Excepción: si el texto contiene `, S.A. y ` o `, S.L. y ` → el ` y ` es separador

### 2.3 Integración en el pipeline

#### Archivo: `scripts/lib/entity-resolver.js`

Nueva función exportada:

```javascript
export function detectarUTE(nombre, nif) {
  // ... lógica descrita arriba
  return { esUte, miembros };
}
```

#### Archivo: `scripts/resolve-entities.js` → función `main()`

Después del paso 2b (categorizar organismos), añadir paso 2c:

```javascript
// Paso 2c: Detectar UTEs y extraer miembros
for (const c of resueltos) {
  const { esUte, miembros } = detectarUTE(c.adjudicatario, c.nif_adjudicatario);
  if (esUte) {
    c.es_ute = true;
    if (miembros.length > 0) {
      c.miembros_ute = miembros;
    }
  }
}
```

#### Archivo: `scripts/lib/entity-resolver.js` → función `aplicarResolucion()`

No se modifica. La detección de UTEs es un paso posterior independiente.

---

## 3. Impacto en la UI

### 3.1 Explorador de contratos (`app.js` / `index.html`)

- **Badge UTE**: En la tabla y el modal, mostrar un badge `UTE` junto al nombre del adjudicatario cuando `es_ute === true`.
- **Modal**: Si `miembros_ute` existe, mostrar la lista de empresas miembro.
- **Búsqueda**: Ampliar la búsqueda para que busque también en `miembros_ute`. Así, buscar "PACSA" encontrará contratos de UTEs donde PACSA participa.

### 3.2 Ranking (`ranking.js` / `ranking.html`)

- **Opción futura**: Permitir "expandir" UTEs en el ranking para ver la contribución de cada miembro. Esto es complejo (¿cómo repartir el importe?) y se deja para una fase posterior.
- **Badge UTE**: Mostrar badge en la tabla del ranking.

### 3.3 Filtro UTE

Añadir un checkbox o filtro "Incluir UTEs" / "Solo UTEs" / "Excluir UTEs" en ambas páginas.

---

## 4. Plan de implementación por fases

### Fase 1: Backend (entity-resolver.js + resolve-entities.js)
1. Crear función `detectarUTE(nombre, nif)` en `entity-resolver.js`
2. Crear función `extraerMiembrosUTE(nombre)` en `entity-resolver.js`
3. Integrar en `resolve-entities.js` como paso 2c
4. Ejecutar pipeline con `--rebuild`
5. Verificar campos `es_ute` y `miembros_ute` en JSON de salida

### Fase 2: Frontend - Visualización
1. Badge UTE en tabla de contratos (`app.js`)
2. Sección "Miembros de la UTE" en modal de detalle (`app.js`)
3. Badge UTE en tabla de ranking (`ranking.js`)
4. Sección miembros en modal de ranking (`ranking.js`)

### Fase 3: Frontend - Búsqueda y filtros
1. Ampliar búsqueda para incluir `miembros_ute` (`app.js`, `ranking.js`)
2. Añadir filtro UTE (checkbox) en ambas páginas

---

## 5. Casos edge a manejar

| Caso | Ejemplo | Tratamiento |
|------|---------|-------------|
| UTE con nombre propio | `UTE ESPACIOS PUBLICOS CHAMARTIN 2023` | `es_ute: true`, `miembros_ute: []` (vacío) |
| UTE con "abreviadamente" | `UTE PACSA ... abreviadamente U.T.E. INFRAESTRUCTURAS L2` | Cortar en "abreviadamente", parsear la parte anterior |
| UTE al final del nombre | `UN DIA CUALQUIERA SL TEKILAJAZZ SL UTE` | Detectar por NIF o por "UTE" al final |
| "UNION TEMPORAL DE EMPRESAS" | `ELECTRONIC TRAFIC SA Y PORTILLO ... UNION TEMPORAL DE EMPRESAS` | Detectar por texto, cortar antes de "UNION TEMPORAL" |
| NIF U pero sin "UTE" en nombre | `APAREGRA` (NIF: U02784700) | `es_ute: true`, `miembros_ute: []` |
| Separador `.-` (sin espacio) | `UTE EULEN, S.A.- INLLAMA` | Normalizar `.-` → ` - ` antes de split |
| Separador ` e ` | `Imesapi S.A. e INGENIERIA...` | Tratar como ` y ` |

---

## 6. Estimación de cobertura

De las 85 UTEs únicas:
- ~33 (39%) tienen separadores claros (` - `, ` y `, `.- `) → **miembros extraíbles**
- ~52 (61%) tienen nombre propio → **solo `es_ute: true`**, sin miembros

Esto significa que para el 39% de las UTEs podremos mostrar los miembros. Para el 61% restante, al menos marcaremos el contrato como UTE.
