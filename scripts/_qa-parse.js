/**
 * scripts/_qa-parse.js
 *
 * Suite de tests del parseo de los feeds de PLACSP (scripts/parse.js) y de la
 * descarga del histórico (scripts/lib/feeds-placsp.js). Ejecuta de verdad
 * parse, transform y validate sobre una copia de los scripts en una carpeta
 * temporal, con feeds Atom de prueba, sin tocar los datos del proyecto.
 *
 * Comprueba que se conservan solo los contratos de la Comunidad de Madrid,
 * que se guardan todos los lotes adjudicados, que el histórico solo se lee
 * con --historico y que cada feed anota su fuente.
 *
 * Uso: node scripts/_qa-parse.js
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { FEEDS_HISTORICO, feedPorClave, periodosHistorico, urlZip } from './lib/feeds-placsp.js';
import { FUENTE } from './lib/fuentes.js';
import { assert, assertDeep, terminar } from './lib/qa.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────────────────
// Entorno de prueba
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = fs.mkdtempSync(path.join(os.tmpdir(), 'contratoscam-qa-'));
process.on('exit', () => fs.rmSync(RAIZ, { recursive: true, force: true }));
fs.cpSync(__dirname, path.join(RAIZ, 'scripts'), { recursive: true });
fs.symlinkSync(path.join(__dirname, '../node_modules'), path.join(RAIZ, 'node_modules'));
fs.mkdirSync(path.join(RAIZ, 'data/raw'), { recursive: true });

const FEED_AGREGADAS = feedPorClave('agregadas');
const DIR_HISTORICO = path.join(RAIZ, 'data/raw/historico', FEED_AGREGADAS.clave, '2019');
const SALIDA_PARSE = path.join(RAIZ, 'data/raw/parsed-licitaciones.json');

/**
 * Ejecuta un script del pipeline en la copia temporal.
 * @param {string} script - Nombre del fichero en scripts/
 * @param {string[]} [args]
 * @returns {{ codigo: number, salida: string }}
 */
function ejecutar(script, args = []) {
  const r = spawnSync(process.execPath, [path.join(RAIZ, 'scripts', script), ...args], { cwd: RAIZ, encoding: 'utf-8' });
  return { codigo: r.status, salida: r.stdout + r.stderr };
}

/** Contratos que ha dejado parse.js, por expediente */
function parseados() {
  const contratos = JSON.parse(fs.readFileSync(SALIDA_PARSE, 'utf-8'));
  return Object.fromEntries(contratos.map(c => [c.expediente, c]));
}

/** Contratos de la copia de trabajo de transform.js, por expediente */
function transformados() {
  const dir = path.join(RAIZ, 'data/trabajo/contratos');
  const { archivos } = JSON.parse(fs.readFileSync(path.join(dir, 'indice.json'), 'utf-8'));
  const contratos = archivos.flatMap(({ archivo }) => JSON.parse(fs.readFileSync(path.join(dir, archivo), 'utf-8')));
  return Object.fromEntries(contratos.map(c => [c.expediente, c]));
}

// ─────────────────────────────────────────────────────────────────────────────
// Feeds Atom de prueba (estructura CODICE de PLACSP)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resultado de adjudicación de un lote.
 * @param {{lote: string, empresa: string, nif: string, importe: number}} datos
 * @returns {string}
 */
function resultado({ lote, empresa, nif, importe }) {
  return `
      <cac:TenderResult>
        <cbc:ResultCode>8</cbc:ResultCode>
        <cbc:AwardDate>2026-09-01</cbc:AwardDate>
        <cac:WinningParty>
          <cac:PartyIdentification><cbc:ID schemeName="NIF">${nif}</cbc:ID></cac:PartyIdentification>
          <cac:PartyName><cbc:Name>${empresa}</cbc:Name></cac:PartyName>
        </cac:WinningParty>
        <cac:AwardedTenderedProject>
          <cbc:ProcurementProjectLotID>${lote}</cbc:ProcurementProjectLotID>
          <cac:LegalMonetaryTotal>
            <cbc:TaxExclusiveAmount currencyID="EUR">${importe}</cbc:TaxExclusiveAmount>
            <cbc:PayableAmount currencyID="EUR">${importe * 1.21}</cbc:PayableAmount>
          </cac:LegalMonetaryTotal>
        </cac:AwardedTenderedProject>
      </cac:TenderResult>`;
}

/**
 * Entrada de un feed Atom de PLACSP.
 * @param {{expediente: string, jerarquia: string[], identificadores?: {esquema: string, id: string}[], resultados?: object[]}} datos
 * @returns {string}
 */
function entrada({ expediente, jerarquia, identificadores = [], resultados = [] }) {
  // La jerarquía se anida de abajo arriba: el primer padre es el más cercano
  const padres = [...jerarquia].reverse().reduce((interior, nombre) => `
        <cac-place-ext:ParentLocatedParty>
          <cac:PartyName><cbc:Name>${nombre}</cbc:Name></cac:PartyName>${interior}
        </cac-place-ext:ParentLocatedParty>`, '');

  return `
  <entry>
    <id>https://contrataciondelestado.es/sindicacion/licitacion/${expediente}</id>
    <link href="https://contrataciondelestado.es/qa/${expediente}"/>
    <title>Contrato ${expediente}</title>
    <updated>2026-10-05T09:00:00.000+02:00</updated>
    <cac-place-ext:ContractFolderStatus>
      <cbc:ContractFolderID>${expediente}</cbc:ContractFolderID>
      <cbc-place-ext:ContractFolderStatusCode>ADJ</cbc-place-ext:ContractFolderStatusCode>
      <cac-place-ext:LocatedContractingParty>
        <cac:Party>
${identificadores.map(({ esquema, id }) => `
          <cac:PartyIdentification><cbc:ID schemeName="${esquema}">${id}</cbc:ID></cac:PartyIdentification>`).join('')}
          <cac:PartyName><cbc:Name>Organismo de ${expediente}</cbc:Name></cac:PartyName>
        </cac:Party>${padres}
      </cac-place-ext:LocatedContractingParty>
      <cac:ProcurementProject>
        <cbc:Name>Objeto de ${expediente}</cbc:Name>
        <cbc:TypeCode>2</cbc:TypeCode>
        <cac:BudgetAmount>
          <cbc:TaxExclusiveAmount currencyID="EUR">5000</cbc:TaxExclusiveAmount>
        </cac:BudgetAmount>
      </cac:ProcurementProject>${resultados.map(resultado).join('')}
    </cac-place-ext:ContractFolderStatus>
  </entry>`;
}

/**
 * Feed Atom completo con sus espacios de nombres.
 * @param {string[]} entradas
 * @returns {string}
 */
function feed(entradas) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:cac="urn:dgpe:names:draft:codice:schema:xsd:CommonAggregateComponents-2"
      xmlns:cbc="urn:dgpe:names:draft:codice:schema:xsd:CommonBasicComponents-2"
      xmlns:cac-place-ext="urn:dgpe:names:draft:codice-place-ext:schema:xsd:CommonAggregateComponents-2"
      xmlns:cbc-place-ext="urn:dgpe:names:draft:codice-place-ext:schema:xsd:CommonBasicComponents-2">
  <title>Feed de prueba</title>
  <updated>2026-10-05T09:00:00.000+02:00</updated>${entradas.join('')}
</feed>`;
}

const JERARQUIA_CAM = ['Sector Público', 'Comunidad de Madrid', 'Consejería de Prueba'];
const JERARQUIA_OTRA = ['Sector Público', 'Comunidad Autónoma de Prueba'];

// En las plataformas agregadas la jerarquía no nombra a la Comunidad: la CAM
// se reconoce por el código de órgano
const JERARQUIA_AGREGADA = ['Consejería de Sanidad', 'Servicio Madrileño de Salud'];

// Feed semanal: un contrato de la CAM con dos lotes y otro de fuera de la CAM
fs.writeFileSync(path.join(RAIZ, 'data/raw/placsp-licitaciones-2026-10-05-p01.atom'), feed([
  entrada({
    expediente: 'CAM-LOTES',
    jerarquia: JERARQUIA_CAM,
    resultados: [
      { lote: '1', empresa: 'Empresa Uno SL', nif: 'B11111111', importe: 1000 },
      { lote: '2', empresa: 'Empresa Dos SA', nif: 'A22222222', importe: 2500.5 },
    ],
  }),
  entrada({ expediente: 'OTRA-CCAA', jerarquia: JERARQUIA_OTRA }),
]), 'utf-8');

// Histórico de plataformas agregadas: un contrato de la CAM con un único resultado
fs.mkdirSync(DIR_HISTORICO, { recursive: true });
fs.writeFileSync(path.join(DIR_HISTORICO, 'historico.atom'), feed([
  entrada({
    expediente: 'CAM-HISTORICO',
    jerarquia: JERARQUIA_CAM,
    resultados: [{ lote: '1', empresa: 'Empresa Tres SL', nif: 'B33333333', importe: 700 }],
  }),
  entrada({
    expediente: 'CAM-CODIGO-ORGANO',
    jerarquia: JERARQUIA_AGREGADA,
    identificadores: [{ esquema: 'ID_OC_PLAT', id: 'A13048312' }],
  }),
  entrada({
    expediente: 'OTRA-CCAA-CODIGO-ORGANO',
    jerarquia: JERARQUIA_AGREGADA,
    identificadores: [{ esquema: 'ID_OC_PLAT', id: 'A07012345' }, { esquema: 'NIF', id: 'A13000000' }],
  }),
]), 'utf-8');

// ─────────────────────────────────────────────────────────────────────────────
// Tests: periodos y URL del histórico
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n📋 Tests: periodos del histórico');

{
  const hoy = new Date('2026-03-15T12:00:00Z');
  assertDeep('años cerrados enteros y meses del año en curso',
    periodosHistorico(2024, 2026, hoy), ['2024', '2025', '202601', '202602', '202603']);
  assertDeep('un rango de años cerrados solo tiene años', periodosHistorico(2017, 2018, hoy), ['2017', '2018']);
  assertDeep('no pide periodos posteriores al año en curso', periodosHistorico(2026, 2027, hoy), ['202601', '202602', '202603']);
  assert('la URL del ZIP lleva el periodo', urlZip(FEED_AGREGADAS, '2019'), `${FEED_AGREGADAS.urlBase}_2019.zip`);
  assert('cada feed tiene su propia fuente', new Set(FEEDS_HISTORICO.map(f => f.fuente)).size, FEEDS_HISTORICO.length);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: parseo del feed semanal
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n📋 Tests: parseo del feed semanal');

{
  assert('parse termina sin errores', ejecutar('parse.js').codigo, 0);
  const contratos = parseados();

  assert('conserva el contrato de la CAM', 'CAM-LOTES' in contratos, true);
  assert('descarta el de otra administración', 'OTRA-CCAA' in contratos, false);
  assert('sin --historico no lee el histórico', 'CAM-HISTORICO' in contratos, false);

  const conLotes = contratos['CAM-LOTES'];
  assert('anota la fuente del feed', conLotes.fuente, FUENTE.PLACSP);
  assert('guarda todas las adjudicaciones', conLotes.adjudicaciones.length, 2);
  assertDeep('…con el lote y el adjudicatario de cada una',
    conLotes.adjudicaciones.map(a => [a.lote, a.adjudicatario, a.nif_adjudicatario]),
    [['1', 'Empresa Uno SL', 'B11111111'], ['2', 'Empresa Dos SA', 'A22222222']]);
  assert('el importe adjudicado es la suma de los lotes', conLotes.importe_adjudicacion, 3500.5);
  assert('el adjudicatario general es el del primer resultado', conLotes.adjudicatario, 'Empresa Uno SL');
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: parseo del histórico y transformación
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n📋 Tests: histórico y transformación');

{
  assert('parse --historico termina sin errores', ejecutar('parse.js', ['--historico']).codigo, 0);
  const contratos = parseados();
  assert('lee también el histórico', 'CAM-HISTORICO' in contratos, true);
  assert('…con la fuente de su feed', contratos['CAM-HISTORICO'].fuente, FEED_AGREGADAS.fuente);
  assert('reconoce la CAM por el código de órgano', 'CAM-CODIGO-ORGANO' in contratos, true);
  assert('…pero no por un NIF con el mismo prefijo', 'OTRA-CCAA-CODIGO-ORGANO' in contratos, false);

  assert('transform termina sin errores', ejecutar('transform.js').codigo, 0);
  const normalizados = transformados();

  const conLotes = normalizados['CAM-LOTES'];
  assert('el contrato con lotes guarda su detalle', conLotes.lotes.length, 2);
  assertDeep('…con el importe de cada lote', conLotes.lotes.map(l => l.importe), [1000, 2500.5]);
  assert('…y como importe la suma', conLotes.importe, 3500.5);

  const historico = normalizados['CAM-HISTORICO'];
  assert('un contrato con un único resultado no lleva detalle de lotes', historico.lotes, null);
  assertDeep('el contrato del histórico conserva su fuente', [historico.fuente, historico.fuentes], [FEED_AGREGADAS.fuente, [FEED_AGREGADAS.fuente]]);

  assert('validate aprueba la copia de trabajo', ejecutar('validate.js').codigo, 0);
}

terminar();
