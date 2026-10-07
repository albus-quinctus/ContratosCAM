/**
 * scripts/_qa-almacen.js
 *
 * Suite de tests de la integración de lotes en el almacén de contratos
 * (scripts/lib/integrar-lote.js). Comprueba las garantías de las que depende
 * poder ir incorporando datos de cualquier año y fuente sin perder nada:
 * idempotencia, independencia del orden de carga, no pérdida de contratos,
 * no sustitución por valores vacíos, prioridad de fuentes e IDs estables.
 *
 * Uso: node scripts/_qa-almacen.js
 */

import { integrarLote, fusionarContrato, ordenarContratos, idDeContrato, esVacio, normalizarFechaVersion, CAMPO_ORIGEN } from './lib/integrar-lote.js';
import { claveContrato } from './lib/clave-contrato.js';
import { FUENTE } from './lib/fuentes.js';
import { assert, assertDeep, terminar } from './lib/qa.js';

// ─────────────────────────────────────────────────────────────────────────────
// Datos de prueba
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea un contrato normalizado de prueba, como lo deja transform.js.
 * @param {number} n - Número de contrato (define su URL y por tanto su identidad)
 * @param {object} [cambios] - Campos que sustituyen a los de por defecto
 * @returns {object}
 */
function contrato(n, cambios = {}) {
  return {
    id: null,
    expediente: `EXP-${n}`,
    objeto: `Objeto ${n}`,
    organismo: 'Consejería de Prueba',
    importe: 1000 * n,
    adjudicatario: null,
    fecha_publicacion: '2026-05-01',
    url_origen: `https://contrataciondelestado.es/contrato/${n}`,
    fuente: FUENTE.PLACSP,
    fuentes: [FUENTE.PLACSP],
    fecha_actualizacion: '2026-05-01T10:00:00Z',
    num_ofertas: null,
    ...cambios,
  };
}

/** Resultado comparable de una integración: contratos ordenados */
function resultado(contratos) {
  return JSON.stringify(ordenarContratos([...contratos]));
}

/** Generador pseudoaleatorio con semilla, para tests reproducibles */
function aleatorio(semilla) {
  let s = semilla;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

/** Baraja una copia de un array con el generador dado */
function barajar(array, azar) {
  const copia = [...array];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: alta de contratos e IDs
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n📋 Tests: alta de contratos e IDs estables');

{
  const { contratos, resumen } = integrarLote([], [contrato(1), contrato(2)]);
  assertDeep('Integrar en un almacén vacío añade todo',
    resumen, { recibidos: 2, anadidos: 2, modificados: 0, sin_cambios: 0 });
  assert('El id se deriva de la clave del contrato',
    contratos[0].id, idDeContrato(contrato(1)));
  assert('El id no depende de campos que cambian (importe)',
    idDeContrato(contrato(1)), idDeContrato(contrato(1, { importe: 5 })));

  const nueva = contrato(1, { objeto: 'Objeto 1 corregido', fecha_actualizacion: '2026-06-01T00:00:00.000Z' });
  const { contratos: tras } = integrarLote([contratos[0]], [nueva]);
  assert('Una versión más nueva conserva el id almacenado', tras[0].id, contratos[0].id);
  assert('…y aporta sus datos', tras[0].objeto, 'Objeto 1 corregido');
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: idempotencia
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n📋 Tests: idempotencia');

{
  const almacen = integrarLote([], [contrato(1), contrato(2), contrato(3)]).contratos;
  const lote = [
    contrato(2, { adjudicatario: 'Empresa SA', fecha_actualizacion: '2026-06-01T00:00:00Z' }),
    contrato(4),
  ];
  const primera = integrarLote(almacen, lote);
  const segunda = integrarLote(primera.contratos, lote);
  assertDeep('La primera carga añade 1 y modifica 1',
    [primera.resumen.anadidos, primera.resumen.modificados], [1, 1]);
  assertDeep('Repetir la misma carga no cambia nada',
    [segunda.resumen.anadidos, segunda.resumen.modificados], [0, 0]);
  assert('…y el contenido es idéntico', resultado(segunda.contratos), resultado(primera.contratos));
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: versiones (gana la más reciente en origen)
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n📋 Tests: versiones');

{
  const nueva = contrato(1, { objeto: 'Versión 2026', fecha_actualizacion: '2026-06-01T00:00:00Z', importe: null });
  const antigua = contrato(1, { objeto: 'Versión 2019', fecha_actualizacion: '2019-03-01T00:00:00Z', adjudicatario: 'Antigua SL' });

  const almacen = integrarLote([], [nueva]).contratos;
  const { contratos } = integrarLote(almacen, [antigua]);
  assert('Cargar después una versión antigua no pisa la nueva', contratos[0].objeto, 'Versión 2026');
  assert('…pero rellena los campos que la nueva no tiene', contratos[0].adjudicatario, 'Antigua SL');
  assert('Un valor nunca se sustituye por uno vacío (importe)', contratos[0].importe, 1000);
  assert('Se queda la fecha de la versión ganadora',
    contratos[0].fecha_actualizacion, '2026-06-01T00:00:00Z');

  const almacenado = { ...contrato(1), entity_id: 'emp-1', organismo: 'Consejería de Prueba (normalizado)' };
  const mismaVersion = contrato(1, { organismo: 'CONSEJERIA DE PRUEBA' });
  const { contratos: tras, resumen } = integrarLote([{ ...almacenado, id: idDeContrato(almacenado) }], [mismaVersion]);
  assert('La misma versión de origen conserva lo calculado después (organismo normalizado)',
    tras[0].organismo, 'Consejería de Prueba (normalizado)');
  assert('…y los campos derivados (entity_id)', tras[0].entity_id, 'emp-1');
  assert('…sin contar como modificación', resumen.modificados, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: fuentes
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n📋 Tests: prioridad de fuentes');

{
  const placsp = contrato(1, { fecha_actualizacion: '2026-01-01T00:00:00Z' });
  const ted = contrato(1, {
    fuente: FUENTE.TED, fuentes: [FUENTE.TED], objeto: 'Título TED',
    num_ofertas: 7, fecha_actualizacion: '2026-09-01',
  });
  const { contratos } = integrarLote([], [ted, placsp]);
  assert('PLACSP gana a TED aunque TED sea más reciente', contratos[0].objeto, 'Objeto 1');
  assert('…la fuente principal es PLACSP', contratos[0].fuente, FUENTE.PLACSP);
  assert('…y TED aporta sus campos exclusivos', contratos[0].num_ofertas, 7);
  assertDeep('Se registran todas las fuentes', contratos[0].fuentes, [FUENTE.PLACSP, FUENTE.TED]);
}

{
  const desconocida = contrato(1, { fuente: 'fuente_nueva', fuentes: ['fuente_nueva'], fecha_actualizacion: '2026-07-01T00:00:00.000Z' });
  let error = null;
  try {
    integrarLote(integrarLote([], [contrato(1)]).contratos, [desconocida]);
  } catch (err) {
    error = err.message;
  }
  assert('Una fuente sin prioridad asignada detiene la integración en lugar de perder prioridad',
    Boolean(error && error.includes('fuente_nueva')), true);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: duplicados ya almacenados
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n📋 Tests: duplicados en el almacén');

{
  const a = { ...contrato(1), id: 'a' };
  const b = { ...contrato(1, { adjudicatario: 'Empresa SA' }), id: 'a' };
  const { contratos } = integrarLote([a, b], []);
  assert('Dos registros con la misma clave se fusionan en uno', contratos.length, 1);
  assert('…sin perder datos', contratos[0].adjudicatario, 'Empresa SA');
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: propiedades con datos aleatorios
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n📋 Tests: propiedades con cargas aleatorias');

{
  const azar = aleatorio(20261005);
  const FECHAS = ['2019-01-01T00:00:00Z', '2022-06-15T00:00:00Z', '2024-02-01T00:00:00Z', '2026-05-01T10:00:00Z'];
  const CAMPOS_VARIABLES = ['objeto', 'importe', 'adjudicatario', 'num_ofertas'];
  const valorOVacio = (probVacio, valor) => (azar() < probVacio ? null : valor);

  // Cada contrato llega en 1 a 4 versiones de origen, de PLACSP o de TED,
  // y cualquiera de ellas puede traer vacío cualquier campo
  const versiones = [];
  for (let n = 1; n <= 80; n++) {
    const numVersiones = 1 + Math.floor(azar() * FECHAS.length);
    for (let v = 0; v < numVersiones; v++) {
      const deTed = azar() < 0.25;
      versiones.push(contrato(n, {
        fuente: deTed ? FUENTE.TED : FUENTE.PLACSP,
        fuentes: [deTed ? FUENTE.TED : FUENTE.PLACSP],
        fecha_actualizacion: FECHAS[v],
        objeto: valorOVacio(0.2, `Objeto ${n} v${v}${deTed ? ' TED' : ''}`),
        importe: valorOVacio(0.4, 1000 * n + v),
        adjudicatario: valorOVacio(0.5, `Empresa ${n}-${v}`),
        num_ofertas: valorOVacio(0.7, v + 1),
      }));
    }
  }

  // Cargar todas las versiones en lotes de tamaño variable, en el orden dado
  const cargar = orden => {
    let almacen = [];
    let i = 0;
    while (i < orden.length) {
      const tamano = 1 + Math.floor(azar() * 25);
      almacen = integrarLote(almacen, orden.slice(i, i + tamano)).contratos;
      i += tamano;
    }
    return almacen;
  };

  const referencia = cargar(versiones);
  let mismoResultado = true;
  for (let intento = 0; intento < 100; intento++) {
    if (resultado(cargar(barajar(versiones, azar))) !== resultado(referencia)) mismoResultado = false;
  }
  assert('El orden de carga no cambia el resultado (100 órdenes y tamaños de lote distintos)', mismoResultado, true);

  // Cada campo debe tener el valor de la versión de mayor rango que lo traiga
  const rango = c => `${c.fuente === FUENTE.PLACSP ? 2 : 1}|${c.fecha_actualizacion}`;
  let campoCorrecto = true;
  for (const c of referencia) {
    const suyas = versiones.filter(v => v.url_origen === c.url_origen).sort((a, b) => (rango(a) < rango(b) ? 1 : -1));
    for (const campo of CAMPOS_VARIABLES) {
      const esperada = suyas.find(v => !esVacio(v[campo]));
      if ((esperada ? esperada[campo] : null) !== c[campo]) campoCorrecto = false;
    }
    if (c.fecha_actualizacion !== suyas[0].fecha_actualizacion || c.fuente !== suyas[0].fuente) campoCorrecto = false;
  }
  assert('Cada campo tiene el valor de la versión más prioritaria y reciente que lo trae', campoCorrecto, true);

  // Ninguna carga hace desaparecer un contrato ni vacía un campo con valor
  // (origen_campos es una anotación: desaparece cuando ya no hace falta)
  let sinPerdidas = true;
  let almacen = [];
  for (let i = 0; i < versiones.length; i += 11) {
    const antes = new Map(almacen.map(c => [claveContrato(c), c]));
    almacen = integrarLote(almacen, versiones.slice(i, i + 11)).contratos;
    const despues = new Map(almacen.map(c => [claveContrato(c), c]));
    for (const [clave, anterior] of antes) {
      const actual = despues.get(clave);
      if (!actual) { sinPerdidas = false; continue; }
      for (const [campo, valor] of Object.entries(anterior)) {
        if (campo !== CAMPO_ORIGEN && !esVacio(valor) && esVacio(actual[campo])) sinPerdidas = false;
      }
    }
  }
  assert('Ninguna carga elimina contratos ni vacía campos con valor', sinPerdidas, true);
  assert('Hay un contrato por clave', referencia.length, 80);

  const otraVez = integrarLote(referencia, versiones);
  assertDeep('Volver a cargar todas las versiones no cambia nada',
    [otraVez.resumen.anadidos, otraVez.resumen.modificados], [0, 0]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: fusionarContrato y ordenarContratos
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n📋 Tests: fusión y orden');

{
  const existente = { ...contrato(1), id: 'x', entity_id: 'e1' };
  const nuevo = contrato(1, { fecha_actualizacion: '2026-07-01T00:00:00Z' });
  assertDeep('La fusión conserva el orden de campos almacenado',
    Object.keys(fusionarContrato(existente, nuevo)), Object.keys(existente));

  // Un contrato con origen_campos al que después se le añaden campos derivados
  const v2026 = contrato(1, { fecha_actualizacion: '2026-06-01T00:00:00Z', adjudicatario: null });
  const v2019 = contrato(1, { fecha_actualizacion: '2019-01-01T00:00:00Z', adjudicatario: 'Antigua SL' });
  const conOrigen = integrarLote([], [v2026, v2019]).contratos;
  const resuelto = [{ ...conOrigen[0], entity_id: 'emp-1', categoria_organismo: 'consejeria' }];
  const repetido = integrarLote(resuelto, [v2026, v2019]);
  assert('Repetir versiones sobre un contrato ya resuelto no cuenta como modificación',
    repetido.resumen.modificados, 0);
  assert('…y conserva la posición de origen_campos',
    JSON.stringify(repetido.contratos[0]), JSON.stringify(resuelto[0]));

  const desordenados = [
    { id: 'b', fecha_publicacion: '2026-01-01' },
    { id: 'a', fecha_publicacion: '2026-01-01' },
    { id: 'c', fecha_publicacion: '2026-03-01' },
    { id: 'd', fecha_publicacion: null },
  ];
  assertDeep('Orden determinista: fecha descendente, luego id, sin fecha al final',
    ordenarContratos(desordenados).map(c => c.id), ['c', 'a', 'b', 'd']);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: fechas de versión
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n📋 Tests: fechas de versión comparables');

{
  assert('Una fecha con zona horaria se pasa a UTC',
    normalizarFechaVersion('2026-10-04T10:00:00.000+02:00'), '2026-10-04T08:00:00.000Z');
  assert('Una fecha sin hora se deja igual', normalizarFechaVersion('2026-10-04'), '2026-10-04');
  assert('Una fecha no válida queda vacía', normalizarFechaVersion('ayer'), null);

  // El 25/10/2026 a las 02:10 (+01:00) es posterior a las 02:30 (+02:00) del mismo día
  const verano = contrato(1, { objeto: 'Antes del cambio de hora', fecha_actualizacion: normalizarFechaVersion('2026-10-25T02:30:00+02:00') });
  const invierno = contrato(1, { objeto: 'Después del cambio de hora', fecha_actualizacion: normalizarFechaVersion('2026-10-25T02:10:00+01:00') });
  const { contratos: tras } = integrarLote(integrarLote([], [invierno]).contratos, [verano]);
  assert('El cambio de hora no desordena las versiones', tras[0].objeto, 'Después del cambio de hora');

  // Contrato migrado: solo tiene el día. La misma versión llega del feed con hora.
  const migrado = { ...contrato(2, { fecha_actualizacion: '2026-10-04' }), id: idDeContrato(contrato(2)) };
  const delFeed = contrato(2, { fecha_actualizacion: '2026-10-04T08:00:00.000Z' });
  const mismaVersion = integrarLote([migrado], [delFeed]);
  assertDeep('La misma versión con y sin hora no cuenta como modificada',
    mismaVersion.resumen, { recibidos: 1, anadidos: 0, modificados: 0, sin_cambios: 1 });

  const masNueva = contrato(2, { objeto: 'Objeto 2 corregido', fecha_actualizacion: '2026-10-05T08:00:00.000Z' });
  assert('Una versión de un día posterior sí gana',
    integrarLote([migrado], [masNueva]).contratos[0].objeto, 'Objeto 2 corregido');
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: estado comprobado en la ficha web
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n📋 Tests: estado comprobado (update-estados)');

{
  const id = idDeContrato(contrato(1));
  const comprobado = {
    ...contrato(1, { estado: 'adjudicado', fecha_actualizacion: '2026-10-04' }),
    id,
    estado_verificado_en: '2026-10-06',
  };

  const feedAnterior = contrato(1, { estado: 'en_licitacion', estado_verificado_en: null, fecha_actualizacion: '2026-10-04T10:00:00.000Z' });
  const [conservado] = integrarLote([comprobado], [feedAnterior]).contratos;
  assert('Una versión del feed anterior a la comprobación no pisa el estado', conservado.estado, 'adjudicado');
  assert('…ni la fecha de comprobación', conservado.estado_verificado_en, '2026-10-06');
  assert('…ni anota un origen para el estado', (conservado[CAMPO_ORIGEN] || {}).estado, undefined);

  const feedPosterior = contrato(1, { estado: 'anulado', estado_verificado_en: null, fecha_actualizacion: '2026-10-08T10:00:00.000Z' });
  const [actualizado] = integrarLote([comprobado], [feedPosterior]).contratos;
  assert('Una versión del feed posterior a la comprobación aporta su estado', actualizado.estado, 'anulado');
  assert('…y vacía la fecha de comprobación para volver a comprobarlo', actualizado.estado_verificado_en, null);

  assertDeep('La fecha de comprobación conserva su posición en el contrato',
    Object.keys(conservado), Object.keys(comprobado));
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: identidad de contratos sin URL
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n📋 Tests: contratos sin URL de origen');

{
  const crudo = contrato(1, { url_origen: null, organismo: 'CONSEJERIA X' });
  const { contratos: almacenados } = integrarLote([], [crudo]);
  // resolve-entities.js normaliza el nombre del organismo después de guardar
  const resueltos = almacenados.map(c => ({ ...c, organismo: 'Consejería X' }));

  const { contratos, resumen } = integrarLote(resueltos, [crudo]);
  assert('Un contrato sin URL con el organismo resuelto no se duplica', contratos.length, 1);
  assertDeep('…y la recarga no lo cambia',
    resumen, { recibidos: 1, anadidos: 0, modificados: 0, sin_cambios: 1 });
}

{
  const sinSubtipo = { ...contrato(1), subtipo: undefined };
  const { contratos: almacenados } = integrarLote([], [sinSubtipo]);
  const guardados = JSON.parse(JSON.stringify(almacenados));
  assert('Un campo undefined se guarda como null', guardados[0].subtipo, null);
  assertDeep('…y recargar el mismo lote no lo cuenta como cambio',
    integrarLote(guardados, [sinSubtipo]).resumen, { recibidos: 1, anadidos: 0, modificados: 0, sin_cambios: 1 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Resumen
// ─────────────────────────────────────────────────────────────────────────────

terminar();
