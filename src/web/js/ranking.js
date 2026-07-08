/**
 * src/web/js/ranking.js
 *
 * Lógica de la página de ranking de adjudicatarios de ContratosCAM.
 *
 * Carga los datos desde el JSON estático, agrega por adjudicatario y
 * presenta un ranking interactivo con filtros, gráfica y modal de detalle.
 */

;(function () {
'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Configuración
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = Object.freeze({
  DATA_URLS: [
    './data/processed/contratos-normalizados.json',
    '/data/processed/contratos-normalizados.json',
  ],
  PAGE_SIZE: 50,
  DEBOUNCE_MS: 300,
  TOP_CHART: 10,
});

const COLORES = [
  '#c0392b', '#2980b9', '#27ae60', '#e67e22', '#8e44ad',
  '#16a085', '#d35400', '#2c3e50', '#f39c12', '#1abc9c',
];

// Mapa de criterio de ordenación → función comparadora
const ORDENADORES = {
  importe:   (a, b) => b.importeTotal  - a.importeTotal,
  contratos: (a, b) => b.numContratos  - a.numContratos,
  media:     (a, b) => b.importeMedio  - a.importeMedio,
  nombre:    (a, b) => a.nombre.localeCompare(b.nombre, 'es'),
};

// Campo numérico que corresponde a cada criterio de ordenación
// (usado para escalar la barra de progreso de cada fila)
const CAMPO_METRICA = {
  importe:   'importeTotal',
  contratos: 'numContratos',
  media:     'importeMedio',
  nombre:    'importeTotal', // al ordenar por nombre la barra muestra importe
};

// ─────────────────────────────────────────────────────────────────────────────
// Estado de la aplicación
// ─────────────────────────────────────────────────────────────────────────────

const estado = {
  ranking: [],            // Array de entradas agregadas por adjudicatario
  rankingFiltrado: [],    // Subconjunto tras aplicar filtros/búsqueda
  paginaActual: 1,
  metricaGrafica: 'importe',  // 'importe' | 'contratos'
  chartTop10: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────────────────────────────────────

function formatearImporte(valor) {
  if (valor === null || valor === undefined || isNaN(valor)) return '—';
  return valor.toLocaleString('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });
}

function formatearFecha(fecha) {
  if (!fecha) return '—';
  const partes = fecha.split('-');
  if (partes.length !== 3) return fecha;
  return partes[2] + '/' + partes[1] + '/' + partes[0];
}

/** Escapa caracteres HTML para prevenir XSS al insertar en innerHTML. */
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/** Devuelve la URL solo si tiene protocolo http/https; cadena vacía si no. */
function sanitizarUrl(url) {
  if (!url) return '';
  const u = String(url).trim();
  return /^https?:\/\//i.test(u) ? u : '';
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function badgeClass(tipo) {
  if (!tipo) return 'badge--default';
  const t = tipo.toLowerCase();
  if (t.includes('obra'))       return 'badge--obras';
  if (t.includes('servicio'))   return 'badge--servicios';
  if (t.includes('suministro')) return 'badge--suministros';
  return 'badge--default';
}

function medalla(posicion) {
  if (posicion <= 3)  return '<span class="medal medal--gold"   aria-label="Top 3">🥇</span>';
  if (posicion <= 10) return '<span class="medal medal--silver" aria-label="Top 10">🥈</span>';
  if (posicion <= 25) return '<span class="medal medal--bronze" aria-label="Top 25">🥉</span>';
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Carga de datos
// ─────────────────────────────────────────────────────────────────────────────

async function cargarDatos() {
  for (const url of CONFIG.DATA_URLS) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const datos = await res.json();
      if (Array.isArray(datos) && datos.length > 0) return datos;
    } catch (_) {
      // Intentar la siguiente URL
    }
  }
  console.warn('No se encontró el JSON de datos. Usando datos de ejemplo.');
  return generarDatosEjemplo();
}

function generarDatosEjemplo() {
  const organismos = [
    'Consejería de Educación', 'Consejería de Sanidad',
    'Consejería de Transportes', 'Agencia Madrileña de Atención Social',
    'Canal de Isabel II', 'Consejería de Medio Ambiente', 'Consejería de Hacienda',
  ];
  const tipos = ['servicios', 'suministros', 'obras', 'administrativo_especial'];
  const procedimientos = ['abierto', 'abierto_simplificado', 'negociado_sin_publicidad', 'menor'];
  const empresas = [
    'Limpiezas Madrid S.L.', 'Tecnologías Avanzadas S.A.', 'Construcciones Norte S.L.',
    'Servicios Integrales CAM S.A.', 'Mantenimiento Urbano S.L.', 'Consultoría Pública S.A.',
    'Suministros Generales S.L.', 'Obras y Reformas S.A.', 'Seguridad Total S.L.',
    'Transportes Rápidos S.A.', 'Informática Pública S.L.', 'Catering Institucional S.A.',
    'Jardinería Madrileña S.L.', 'Electricidad y Fontanería S.A.', 'Papelería Oficial S.L.',
  ];
  const objetos = [
    'Servicio de limpieza de edificios administrativos',
    'Suministro de material informático',
    'Obras de rehabilitación de centros educativos',
    'Servicio de vigilancia y seguridad',
    'Mantenimiento de instalaciones de climatización',
    'Suministro de mobiliario de oficina',
    'Servicio de transporte adaptado',
    'Obras de acondicionamiento de vías públicas',
    'Servicio de consultoría y asistencia técnica',
    'Suministro de equipos médicos',
  ];

  return Array.from({ length: 300 }, (_, i) => ({
    expediente: 'CM/2024/' + String(i + 1).padStart(5, '0'),
    objeto: objetos[i % objetos.length] + ' (lote ' + (i + 1) + ')',
    tipo: tipos[i % tipos.length],
    procedimiento: procedimientos[i % procedimientos.length],
    organismo: organismos[i % organismos.length],
    importe: Math.round((Math.random() * 500000 + 5000) * 100) / 100,
    importe_iva: null,
    adjudicatario: empresas[i % empresas.length],
    nif_adjudicatario: 'B' + String(10000000 + (i % empresas.length)).substring(0, 8),
    fecha_publicacion: '2024-' + String(Math.floor(i / 25) + 1).padStart(2, '0') + '-' + String((i % 28) + 1).padStart(2, '0'),
    fecha_adjudicacion: null,
    fecha_formalizacion: null,
    url_origen: 'https://contrataciondelestado.es',
    fuente: 'placsp',
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Agregación: construir ranking desde contratos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Agrupa los contratos por adjudicatario (normalizado a mayúsculas) y
 * calcula métricas por empresa en un único recorrido del array.
 * Solo incluye contratos que tienen adjudicatario definido.
 * @param {Array} contratos
 * @returns {Array} ranking ordenado por importe total desc
 */
function construirRanking(contratos) {
  const mapa = new Map();

  for (const c of contratos) {
    if (!c.adjudicatario) continue;

    const clave = c.adjudicatario.trim().toUpperCase();
    if (!mapa.has(clave)) {
      mapa.set(clave, {
        nombre: c.adjudicatario.trim(),
        nif: c.nif_adjudicatario || null,
        contratos: [],
        importeTotal: 0,
        tipos: new Set(),
        organismos: new Set(),
        anios: new Set(),
      });
    }

    const entrada = mapa.get(clave);
    // Conservar el primer NIF no nulo encontrado para esta empresa
    if (!entrada.nif && c.nif_adjudicatario) entrada.nif = c.nif_adjudicatario;
    entrada.contratos.push(c);
    entrada.importeTotal += c.importe || 0;
    if (c.tipo) entrada.tipos.add(c.tipo);
    if (c.organismo) entrada.organismos.add(c.organismo);
    if (c.fecha_publicacion) {
      const anio = c.fecha_publicacion.substring(0, 4);
      if (anio) entrada.anios.add(anio);
    }
  }

  // Convertir el mapa en array y calcular métricas derivadas
  const ranking = [...mapa.values()].map(entrada => {
    const n = entrada.contratos.length;
    return {
      nombre: entrada.nombre,
      nif: entrada.nif,
      numContratos: n,
      importeTotal: entrada.importeTotal,
      importeMedio: n > 0 ? entrada.importeTotal / n : 0,
      tipos: [...entrada.tipos].sort(),
      organismos: [...entrada.organismos].sort(),
      anios: [...entrada.anios].sort(),
      contratos: entrada.contratos,
    };
  });

  ranking.sort(ORDENADORES.importe);
  return ranking;
}

// ─────────────────────────────────────────────────────────────────────────────
// Filtrado y ordenación del ranking
// ─────────────────────────────────────────────────────────────────────────────

function obtenerFiltros() {
  return {
    busqueda:  document.getElementById('input-busqueda').value.trim().toLowerCase(),
    tipo:      document.getElementById('filtro-tipo').value,
    organismo: document.getElementById('filtro-organismo').value,
    anio:      document.getElementById('filtro-anio').value,
    ordenarPor: document.getElementById('ordenar-por').value,
  };
}

function aplicarFiltros() {
  const f = obtenerFiltros();

  const resultado = estado.ranking.filter(entrada => {
    if (f.busqueda) {
      const texto = (entrada.nombre + ' ' + (entrada.nif || '')).toLowerCase();
      if (!texto.includes(f.busqueda)) return false;
    }
    if (f.tipo      && !entrada.tipos.includes(f.tipo))           return false;
    if (f.organismo && !entrada.organismos.includes(f.organismo)) return false;
    if (f.anio      && !entrada.anios.includes(f.anio))           return false;
    return true;
  });

  resultado.sort(ORDENADORES[f.ordenarPor] || ORDENADORES.importe);

  estado.rankingFiltrado = resultado;
  estado.paginaActual = 1;

  renderizarTabla();
  renderizarPaginacion();
  actualizarEstadisticas();
  renderizarGrafica();
}

// ─────────────────────────────────────────────────────────────────────────────
// Renderizado de la tabla de ranking
// ─────────────────────────────────────────────────────────────────────────────

function renderizarTabla() {
  const tbody = document.getElementById('tabla-body');
  const inicio = (estado.paginaActual - 1) * CONFIG.PAGE_SIZE;
  const pagina = estado.rankingFiltrado.slice(inicio, inicio + CONFIG.PAGE_SIZE);
  const total  = estado.rankingFiltrado.length;

  document.getElementById('results-count').textContent =
    total === 0
      ? 'Sin resultados'
      : total.toLocaleString('es-ES') + ' adjudicatario' + (total !== 1 ? 's' : '') + ' encontrado' + (total !== 1 ? 's' : '');

  if (pagina.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="7"><div class="empty-state">' +
      '<div class="empty-state-icon">🔍</div>' +
      '<p>No se encontraron adjudicatarios con los filtros aplicados.</p>' +
      '</div></td></tr>';
    return;
  }

  // La barra de progreso refleja la métrica de ordenación activa
  const f = obtenerFiltros();
  const campoMetrica = CAMPO_METRICA[f.ordenarPor] || 'importeTotal';
  const valorMax = estado.rankingFiltrado.length > 0
    ? estado.rankingFiltrado[0][campoMetrica]
    : 1;

  tbody.innerHTML = pagina.map((entrada, i) => {
    const posicion  = inicio + i + 1;
    const porcentaje = valorMax > 0 ? (entrada[campoMetrica] / valorMax) * 100 : 0;
    const tiposBadges = entrada.tipos
      .slice(0, 3)
      .map(t => '<span class="badge ' + badgeClass(t) + '">' + esc(t) + '</span>')
      .join(' ');

    return (
      '<tr data-idx="' + (inicio + i) + '" tabindex="0" role="button" aria-label="Ver detalle de ' + esc(entrada.nombre) + '">' +
      '<td class="col-pos">' +
        '<div class="pos-wrapper">' +
          '<span class="pos-number">' + posicion + '</span>' +
          medalla(posicion) +
        '</div>' +
      '</td>' +
      '<td class="col-empresa">' +
        '<div class="empresa-nombre">' + esc(entrada.nombre) + '</div>' +
        (entrada.nif ? '<div class="empresa-nif">NIF: ' + esc(entrada.nif) + '</div>' : '') +
        '<div class="ranking-bar-wrapper" aria-hidden="true">' +
          '<div class="ranking-bar" style="width:' + porcentaje.toFixed(1) + '%"></div>' +
        '</div>' +
      '</td>' +
      '<td class="col-ncontratos">' +
        '<span class="num-contratos">' + entrada.numContratos.toLocaleString('es-ES') + '</span>' +
      '</td>' +
      '<td class="col-importe-total">' +
        '<span class="cell-importe">' + formatearImporte(entrada.importeTotal) + '</span>' +
      '</td>' +
      '<td class="col-importe-medio">' +
        '<span class="cell-importe-medio">' + formatearImporte(entrada.importeMedio) + '</span>' +
      '</td>' +
      '<td class="col-tipos">' + (tiposBadges || '—') + '</td>' +
      '<td class="col-acciones">' +
        // El botón dispara el mismo evento que el click en la fila (delegación)
        '<button class="btn btn--sm btn--secondary btn-detalle" type="button" aria-label="Ver contratos de ' + esc(entrada.nombre) + '">Ver →</button>' +
      '</td>' +
      '</tr>'
    );
  }).join('');

  // Un único querySelectorAll: el click en el botón burbujea hasta la fila
  tbody.querySelectorAll('tr[data-idx]').forEach(fila => {
    const idx   = parseInt(fila.dataset.idx);
    const abrir = () => abrirModal(estado.rankingFiltrado[idx]);
    fila.addEventListener('click', abrir);
    fila.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); }
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Paginación
// ─────────────────────────────────────────────────────────────────────────────

function renderizarPaginacion() {
  const totalPaginas = Math.ceil(estado.rankingFiltrado.length / CONFIG.PAGE_SIZE) || 0;
  document.getElementById('btn-anterior').disabled  = estado.paginaActual <= 1;
  document.getElementById('btn-siguiente').disabled = estado.paginaActual >= totalPaginas;
  document.getElementById('pagination-info').textContent =
    totalPaginas > 0
      ? 'Página ' + estado.paginaActual + ' de ' + totalPaginas
      : 'Sin resultados';
}

// ─────────────────────────────────────────────────────────────────────────────
// Estadísticas del encabezado
// ─────────────────────────────────────────────────────────────────────────────

function actualizarEstadisticas() {
  const datos = estado.rankingFiltrado;

  document.getElementById('stat-total-adj').textContent =
    datos.length.toLocaleString('es-ES');

  document.getElementById('stat-total-contratos').textContent =
    datos.reduce((s, e) => s + e.numContratos, 0).toLocaleString('es-ES');

  const importeTotal = datos.reduce((s, e) => s + e.importeTotal, 0);
  document.getElementById('stat-importe-total').textContent =
    importeTotal > 0 ? formatearImporte(importeTotal) : '—';

  const nombre = datos.length > 0 ? datos[0].nombre : null;
  document.getElementById('stat-top-empresa').textContent = nombre
    ? (nombre.length > 22 ? nombre.substring(0, 22) + '…' : nombre)
    : '—';
}

// ─────────────────────────────────────────────────────────────────────────────
// Gráfica Top 10
// ─────────────────────────────────────────────────────────────────────────────

function renderizarGrafica() {
  const canvas = document.getElementById('chart-top10');
  if (!canvas) return;

  const esContratos = estado.metricaGrafica === 'contratos';
  const top10       = estado.rankingFiltrado.slice(0, CONFIG.TOP_CHART);
  const labels      = top10.map(e => e.nombre.length > 30 ? e.nombre.substring(0, 30) + '…' : e.nombre);
  const valores     = top10.map(e => esContratos ? e.numContratos : e.importeTotal);
  const labelEje    = esContratos ? 'Número de contratos' : 'Importe total (€)';
  const formatTick  = val => esContratos ? val.toLocaleString('es-ES') : formatearImporte(val);

  if (estado.chartTop10) {
    estado.chartTop10.destroy();
    estado.chartTop10 = null;
  }

  estado.chartTop10 = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: labelEje,
        data: valores,
        backgroundColor: COLORES,
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => esContratos
              ? ctx.parsed.x.toLocaleString('es-ES') + ' contratos'
              : formatearImporte(ctx.parsed.x),
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 10 }, callback: formatTick },
        },
        y: { ticks: { font: { size: 11 } } },
      },
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal de detalle de empresa
// ─────────────────────────────────────────────────────────────────────────────

function abrirModal(entrada) {
  const overlay   = document.getElementById('modal-overlay');
  const contenido = document.getElementById('modal-content');

  // Actualizar el título accesible del modal con el nombre real de la empresa
  document.getElementById('modal-heading').textContent = entrada.nombre;

  const contratosOrdenados = [...entrada.contratos].sort((a, b) => (b.importe || 0) - (a.importe || 0));

  // Importe acumulado por tipo (un solo bucle)
  const importePorTipo = {};
  for (const c of entrada.contratos) {
    const t = c.tipo || 'Sin clasificar';
    importePorTipo[t] = (importePorTipo[t] || 0) + (c.importe || 0);
  }

  const tiposHtml = Object.entries(importePorTipo)
    .sort((a, b) => b[1] - a[1])
    .map(([tipo, imp]) =>
      '<div class="modal-tipo-row">' +
      '<span class="badge ' + badgeClass(tipo) + '">' + esc(tipo) + '</span>' +
      '<span class="modal-tipo-importe">' + formatearImporte(imp) + '</span>' +
      '</div>'
    ).join('');

  // Tabla de contratos (máx. 20 por importe)
  const contratosHtml = contratosOrdenados.slice(0, 20).map(c => {
    const urlSegura = sanitizarUrl(c.url_origen);
    return (
      '<tr>' +
      '<td class="modal-contrato-objeto">'   + esc(c.objeto   || '—') + '</td>' +
      '<td class="modal-contrato-organismo">' + esc(c.organismo || '—') + '</td>' +
      '<td class="modal-contrato-importe">'  + formatearImporte(c.importe) + '</td>' +
      '<td class="modal-contrato-fecha">'    + formatearFecha(c.fecha_publicacion) + '</td>' +
      '<td class="modal-contrato-link">' +
        (urlSegura
          ? '<a href="' + esc(urlSegura) + '" target="_blank" rel="noopener noreferrer" title="Ver anuncio oficial">↗</a>'
          : '—') +
      '</td>' +
      '</tr>'
    );
  }).join('');

  const masContratos = contratosOrdenados.length > 20
    ? '<p class="modal-more-note">Mostrando los 20 contratos de mayor importe de un total de ' +
      contratosOrdenados.length.toLocaleString('es-ES') + '.</p>'
    : '';

  contenido.innerHTML =
    '<div class="modal-empresa-header">' +
      '<div class="modal-empresa-nombre">' + esc(entrada.nombre) + '</div>' +
      (entrada.nif ? '<div class="modal-empresa-nif">NIF: ' + esc(entrada.nif) + '</div>' : '') +
    '</div>' +
    '<hr class="modal-divider" />' +

    '<div class="modal-metricas">' +
      '<div class="modal-metrica">' +
        '<div class="modal-field-label">Contratos adjudicados</div>' +
        '<div class="modal-metrica-valor">' + entrada.numContratos.toLocaleString('es-ES') + '</div>' +
      '</div>' +
      '<div class="modal-metrica">' +
        '<div class="modal-field-label">Importe total</div>' +
        '<div class="modal-metrica-valor modal-metrica-valor--importe">' + formatearImporte(entrada.importeTotal) + '</div>' +
      '</div>' +
      '<div class="modal-metrica">' +
        '<div class="modal-field-label">Importe medio por contrato</div>' +
        '<div class="modal-metrica-valor">' + formatearImporte(entrada.importeMedio) + '</div>' +
      '</div>' +
    '</div>' +
    '<hr class="modal-divider" />' +

    '<div class="modal-field">' +
      '<div class="modal-field-label">Desglose por tipo de contrato</div>' +
      '<div class="modal-tipos-lista">' + tiposHtml + '</div>' +
    '</div>' +

    '<div class="modal-field">' +
      '<div class="modal-field-label">Organismos contratantes (' + entrada.organismos.length + ')</div>' +
      '<div class="modal-organismos-lista">' +
        entrada.organismos.map(o => '<span class="modal-organismo-tag">' + esc(o) + '</span>').join('') +
      '</div>' +
    '</div>' +
    '<hr class="modal-divider" />' +

    '<div class="modal-field">' +
      '<div class="modal-field-label">Contratos individuales</div>' +
      '<div class="modal-tabla-wrapper">' +
        '<table class="modal-contratos-table">' +
          '<thead><tr>' +
            '<th>Objeto</th><th>Organismo</th><th>Importe</th><th>Fecha</th><th>Enlace</th>' +
          '</tr></thead>' +
          '<tbody>' + contratosHtml + '</tbody>' +
        '</table>' +
      '</div>' +
      masContratos +
    '</div>';

  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  document.getElementById('modal-close').focus();
}

function cerrarModal() {
  document.getElementById('modal-overlay').hidden = true;
  document.body.style.overflow = '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Exportar CSV del ranking
// ─────────────────────────────────────────────────────────────────────────────

function exportarCsv() {
  function escaparCsv(valor) {
    let v = String(valor ?? '');
    if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
    if (v.includes(';') || v.includes('"') || v.includes('\n') || v.includes('\r')) {
      return '"' + v.replace(/"/g, '""') + '"';
    }
    return v;
  }

  const cabecera = ['posicion', 'adjudicatario', 'nif', 'num_contratos', 'importe_total', 'importe_medio', 'tipos', 'organismos'];
  const filas = [
    cabecera.join(';'),
    ...estado.rankingFiltrado.map((e, i) =>
      [
        i + 1,
        e.nombre,
        e.nif || '',
        e.numContratos,
        e.importeTotal.toFixed(2),
        e.importeMedio.toFixed(2),
        e.tipos.join(' | '),
        e.organismos.join(' | '),
      ].map(escaparCsv).join(';')
    ),
  ];

  const blob = new Blob(['\uFEFF' + filas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'ranking-adjudicatarios-' + new Date().toISOString().split('T')[0] + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Inicialización de selectores de filtro
// ─────────────────────────────────────────────────────────────────────────────

function poblarSelect(id, valores) {
  const select  = document.getElementById(id);
  const primera = select.querySelector('option');
  select.innerHTML = '';
  select.appendChild(primera);
  for (const v of valores) {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  }
}

function inicializarFiltros() {
  // Reutiliza estado.ranking (ya construido) para extraer valores únicos
  // sin necesidad de volver a filtrar el array de contratos original.
  const tipos      = [...new Set(estado.ranking.flatMap(e => e.tipos))].sort();
  const organismos = [...new Set(estado.ranking.flatMap(e => e.organismos))].sort();
  const anios      = [...new Set(estado.ranking.flatMap(e => e.anios))].sort().reverse();

  poblarSelect('filtro-tipo',      tipos);
  poblarSelect('filtro-organismo', organismos);
  poblarSelect('filtro-anio',      anios);
}

// ─────────────────────────────────────────────────────────────────────────────
// Punto de entrada
// ─────────────────────────────────────────────────────────────────────────────

async function init() {
  // 1. Cargar datos y construir ranking agregado
  const contratos    = await cargarDatos();
  estado.ranking     = construirRanking(contratos);
  estado.rankingFiltrado = [...estado.ranking];

  // 2. Inicializar filtros con valores únicos del ranking
  inicializarFiltros();

  // 3. Renderizado inicial
  renderizarTabla();
  renderizarPaginacion();
  actualizarEstadisticas();
  renderizarGrafica();

  // 4. Eventos de búsqueda y filtros
  const debouncedFiltrar = debounce(aplicarFiltros, CONFIG.DEBOUNCE_MS);
  document.getElementById('input-busqueda').addEventListener('input', debouncedFiltrar);
  document.getElementById('filtro-tipo').addEventListener('change', aplicarFiltros);
  document.getElementById('filtro-organismo').addEventListener('change', aplicarFiltros);
  document.getElementById('filtro-anio').addEventListener('change', aplicarFiltros);
  document.getElementById('ordenar-por').addEventListener('change', aplicarFiltros);

  // 5. Limpiar filtros
  document.getElementById('btn-limpiar').addEventListener('click', () => {
    ['input-busqueda', 'filtro-tipo', 'filtro-organismo', 'filtro-anio'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('ordenar-por').value = 'importe';
    aplicarFiltros();
  });

  // 6. Exportar CSV
  document.getElementById('btn-exportar').addEventListener('click', exportarCsv);

  // 7. Paginación
  document.getElementById('btn-anterior').addEventListener('click', () => {
    if (estado.paginaActual > 1) {
      estado.paginaActual--;
      renderizarTabla();
      renderizarPaginacion();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  document.getElementById('btn-siguiente').addEventListener('click', () => {
    const totalPaginas = Math.ceil(estado.rankingFiltrado.length / CONFIG.PAGE_SIZE);
    if (estado.paginaActual < totalPaginas) {
      estado.paginaActual++;
      renderizarTabla();
      renderizarPaginacion();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  // 8. Modal
  document.getElementById('modal-close').addEventListener('click', cerrarModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) cerrarModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') cerrarModal();
  });

  // 9. Toggle de métrica en la gráfica
  document.querySelectorAll('.chart-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chart-toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      estado.metricaGrafica = btn.dataset.metric;
      renderizarGrafica();
    });
  });
}

// Arrancar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', init);

})();