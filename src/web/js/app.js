/**
 * src/web/js/app.js
 *
 * Lógica principal del frontend de ContratosCAM.
 *
 * Carga los datos desde un JSON estático, gestiona búsqueda, filtros,
 * paginación, ordenación, modal de detalle, exportación CSV y gráficas.
 */

;(function () {
'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Configuración
// ─────────────────────────────────────────────────────────────────────────────

// Traducción y locale del idioma de la página (ver js/i18n.js)
const { t, locale } = window.I18n;

const CONFIG = Object.freeze({
  PAGE_SIZE: 25,
  DEBOUNCE_MS: 300,
});

const COLORES = [
  '#c0392b', '#2980b9', '#27ae60', '#e67e22', '#8e44ad',
  '#16a085', '#d35400', '#2c3e50', '#f39c12', '#1abc9c',
];

// ─────────────────────────────────────────────────────────────────────────────
// Estado de la aplicación
// ─────────────────────────────────────────────────────────────────────────────

const estado = {
  datos: [],
  filtrados: [],
  paginaActual: 1,
  ordenCol: 'fecha_publicacion',
  ordenDir: 'desc',
  charts: {},
  terminosBusqueda: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────────────────────────────────────

function formatearImporte(valor) {
  if (valor === null || valor === undefined) return '—';
  return valor.toLocaleString(locale, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });
}

function formatearFecha(fecha) {
  if (!fecha) return '—';
  const partes = fecha.split('-');
  if (partes.length !== 3) return fecha;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function badgeClass(tipo) {
  if (!tipo) return 'badge--default';
  const t = tipo.toLowerCase();
  if (t.includes('obra')) return 'badge--obras';
  if (t.includes('servicio')) return 'badge--servicios';
  if (t.includes('suministro')) return 'badge--suministros';
  return 'badge--default';
}

/**
 * Devuelve la clase CSS y el texto legible para el badge de estado.
 * @param {string|null} estado
 * @returns {{cls: string, label: string}}
 */
function badgeEstado(estadoVal) {
  // Clase CSS de cada estado; la etiqueta sale de locales/*.json (estados.<estado>)
  const ESTADOS_CLASE = {
    'en_licitacion':         'badge--estado-licitacion',
    'en_evaluacion':         'badge--estado-evaluacion',
    'pre_adjudicado':        'badge--estado-evaluacion',
    'pre_adjudicacion':      'badge--estado-evaluacion',
    'adjudicado':            'badge--estado-adjudicado',
    'formalizado':           'badge--estado-formalizado',
    'resuelto':              'badge--estado-resuelto',
    'anulado':               'badge--estado-anulado',
    'posiblemente_resuelto': 'badge--estado-posible',
    'publicado':             'badge--estado-licitacion',
  };
  if (!estadoVal) return { cls: 'badge--default', label: '—' };
  return {
    cls: ESTADOS_CLASE[estadoVal] || 'badge--default',
    label: t('estados.' + estadoVal, { defaultValue: estadoVal }),
  };
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Escapa HTML y resalta los términos de búsqueda con <mark>.
 * Primero escapa para prevenir XSS, luego aplica el resaltado.
 * @param {string} str - Texto a mostrar
 * @returns {string} HTML seguro con términos resaltados
 */
function resaltar(str) {
  if (!str) return '';
  let html = esc(str);
  const terminos = estado.terminosBusqueda;
  if (!terminos || terminos.length === 0) return html;

  // Construir regex con todos los términos (escapando caracteres especiales de regex)
  const escaped = terminos.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp('(' + escaped.join('|') + ')', 'gi');

  // Reemplazar solo fuera de entidades HTML (&...;) para no romper el escapado
  // Estrategia: dividir por entidades, resaltar solo las partes de texto
  return html.replace(/(&[a-zA-Z0-9#]+;)|([^&]+)/g, (match, entity, text) => {
    if (entity) return entity; // No tocar entidades HTML
    return text.replace(regex, '<mark class="search-highlight">$1</mark>');
  });
}

/**
 * Valida que una URL tenga un protocolo seguro (http/https).
 * Previene inyección de javascript: en atributos href.
 * @param {string} url
 * @returns {string} URL segura o cadena vacía
 */
function sanitizarUrl(url) {
  if (!url) return '';
  const urlTrimmed = String(url).trim();
  // Solo permitir http:// y https://
  if (/^https?:\/\//i.test(urlTrimmed)) {
    return urlTrimmed;
  }
  return '';
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function valoresUnicos(datos, campo) {
  return [...new Set(datos.map(d => d[campo]).filter(Boolean))].sort();
}

// ─────────────────────────────────────────────────────────────────────────────
// Carga de datos (ver js/datos.js)
// ─────────────────────────────────────────────────────────────────────────────

function mostrarFechaActualizacion(meta) {
  const el = document.getElementById('data-update-date');
  if (!el) return;
  if (!meta || !meta.generado_en) {
    el.textContent = t('actualizacion.desconocida');
    return;
  }
  const fecha = new Date(meta.generado_en);
  const opciones = { year: 'numeric', month: 'long', day: 'numeric' };
  el.textContent = t('actualizacion.fecha', { fecha: fecha.toLocaleDateString(locale, opciones) });
}

// ─────────────────────────────────────────────────────────────────────────────
// Filtrado y ordenación
// ─────────────────────────────────────────────────────────────────────────────

function obtenerFiltros() {
  return {
    busqueda: document.getElementById('input-busqueda').value.trim().toLowerCase(),
    tipo: document.getElementById('filtro-tipo').value,
    categoria: document.getElementById('filtro-categoria').value,
    organismo: document.getElementById('filtro-organismo').value,
    procedimiento: document.getElementById('filtro-procedimiento').value,
    estadoFiltro: document.getElementById('filtro-estado').value,
    importeMin: parseFloat(document.getElementById('filtro-importe-min').value) || null,
    importeMax: parseFloat(document.getElementById('filtro-importe-max').value) || null,
    fechaDesde: document.getElementById('filtro-fecha-desde').value || null,
    fechaHasta: document.getElementById('filtro-fecha-hasta').value || null,
  };
}

function aplicarFiltros() {
  const f = obtenerFiltros();

  // Búsqueda multi-término: dividir por espacios, todos deben coincidir (AND)
  const terminos = f.busqueda
    ? f.busqueda.split(/\s+/).filter(t => t.length > 0)
    : [];

  // Guardar términos en el estado para resaltado posterior
  estado.terminosBusqueda = terminos;

  estado.filtrados = estado.datos.filter(c => {
    if (terminos.length > 0) {
      // Incluir NIF y miembros de UTE en el texto de búsqueda
      const texto = [c.objeto, c.organismo, c.adjudicatario, c.nif_adjudicatario, c.expediente,
        ...(c.miembros_ute || [])]
        .join(' ').toLowerCase();
      // Todos los términos deben aparecer (AND)
      if (!terminos.every(t => texto.includes(t))) return false;
    }
    if (f.tipo && c.tipo !== f.tipo) return false;
    if (f.categoria && c.categoria_organismo !== f.categoria) return false;
    if (f.organismo && c.organismo !== f.organismo) return false;
    if (f.procedimiento && c.procedimiento !== f.procedimiento) return false;
    if (f.estadoFiltro && c.estado !== f.estadoFiltro) return false;
    if (f.importeMin !== null && (c.importe === null || c.importe < f.importeMin)) return false;
    if (f.importeMax !== null && (c.importe === null || c.importe > f.importeMax)) return false;
    if (f.fechaDesde && (!c.fecha_publicacion || c.fecha_publicacion < f.fechaDesde)) return false;
    if (f.fechaHasta && (!c.fecha_publicacion || c.fecha_publicacion > f.fechaHasta)) return false;
    return true;
  });

  estado.filtrados.sort((a, b) => {
    const va = a[estado.ordenCol] ?? '';
    const vb = b[estado.ordenCol] ?? '';
    const cmp = typeof va === 'number'
      ? va - vb
      : String(va).localeCompare(String(vb), 'es');
    return estado.ordenDir === 'asc' ? cmp : -cmp;
  });

  estado.paginaActual = 1;
  renderizarTerminosBusqueda();
  renderizarTabla();
  renderizarPaginacion();
  actualizarEstadisticas();
  renderizarGraficas();
}

/**
 * Muestra chips con los términos de búsqueda activos.
 */
function renderizarTerminosBusqueda() {
  const container = document.getElementById('search-terms');
  if (!container) return;

  const terminos = estado.terminosBusqueda;
  if (terminos.length === 0) {
    container.hidden = true;
    container.innerHTML = '';
    return;
  }

  container.hidden = false;
  container.innerHTML =
    '<span class="search-terms-label">' + esc(t('indice.buscando')) + '</span> ' +
    terminos.map(termino =>
      '<span class="search-term-chip">' + esc(termino) + '</span>'
    ).join(' ') +
    '<span class="search-terms-mode">' + esc(t('indice.modoBusqueda')) + '</span>';
}

// ─────────────────────────────────────────────────────────────────────────────
// Renderizado de tabla
// ─────────────────────────────────────────────────────────────────────────────

function renderizarTabla() {
  const tbody = document.getElementById('tabla-body');
  const inicio = (estado.paginaActual - 1) * CONFIG.PAGE_SIZE;
  const pagina = estado.filtrados.slice(inicio, inicio + CONFIG.PAGE_SIZE);
  const total = estado.filtrados.length;

  document.getElementById('results-count').textContent =
    total === 0
      ? t('comun.sinResultados')
      : t('indice.contratosEncontrados', { count: total });

  if (pagina.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="7"><div class="empty-state">' +
      '<div class="empty-state-icon">🔍</div>' +
      '<p>' + esc(t('indice.sinContratos')) + '</p>' +
      '</div></td></tr>';
    return;
  }

  tbody.innerHTML = pagina.map((c, i) => {
    const est = badgeEstado(c.estado);
    return '<tr data-idx="' + (inicio + i) + '" tabindex="0" role="button" aria-label="' + esc(t('indice.verDetalle')) + '">' +
    '<td class="col-objeto"><div class="cell-objeto">' + (resaltar(c.objeto) || '—') + '</div></td>' +
    '<td class="col-organismo"><div class="cell-organismo">' + (resaltar(c.organismo) || '—') + '</div></td>' +
    '<td class="col-tipo">' +
      '<span class="badge ' + badgeClass(c.tipo) + '">' + (esc(c.tipo) || '—') + '</span>' +
      (c.ted_publication_number || c.fuente === 'ted_ue' ? ' <span class="badge badge--ted" title="' + esc(t('indice.tedTitulo')) + '">🇪🇺</span>' : '') +
    '</td>' +
    '<td class="col-estado"><span class="badge ' + est.cls + '">' + esc(est.label) + '</span></td>' +
    '<td class="col-importe"><span class="cell-importe">' + formatearImporte(c.importe) + '</span></td>' +
    '<td class="col-fecha"><span class="cell-fecha">' + formatearFecha(c.fecha_publicacion) + '</span></td>' +
    '<td class="col-adjudicatario"><div class="cell-adjudicatario">' + (resaltar(c.adjudicatario) || '—') + (c.es_ute ? ' <span class="badge badge--ute" title="' + esc(t('comun.ute')) + '">UTE</span>' : '') + '</div></td>' +
    '</tr>';
  }).join('');

  tbody.querySelectorAll('tr[data-idx]').forEach(fila => {
    const abrir = () => abrirModal(estado.filtrados[parseInt(fila.dataset.idx)]);
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
  const totalPaginas = Math.ceil(estado.filtrados.length / CONFIG.PAGE_SIZE);
  document.getElementById('btn-anterior').disabled = estado.paginaActual <= 1;
  document.getElementById('btn-siguiente').disabled = estado.paginaActual >= totalPaginas;
  document.getElementById('pagination-info').textContent =
    totalPaginas > 0
      ? t('paginacion.pagina', { actual: estado.paginaActual, total: totalPaginas })
      : t('comun.sinResultados');
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal de detalle
// ─────────────────────────────────────────────────────────────────────────────

function abrirModal(c) {
  const overlay = document.getElementById('modal-overlay');
  const contenido = document.getElementById('modal-content');

  contenido.innerHTML =
    '<div class="modal-field">' +
    '<div class="modal-field-label">' + esc(t('indice.colObjeto')) + '</div>' +
    '<div class="modal-field-value modal-field-value--large">' + (esc(c.objeto) || '—') + '</div>' +
    '</div>' +
    '<hr class="modal-divider" />' +
    '<div class="modal-grid">' +
    '<div class="modal-field"><div class="modal-field-label">' + esc(t('indice.detalle.importeSinIva')) + '</div>' +
    '<div class="modal-field-value modal-field-value--importe">' + formatearImporte(c.importe) + '</div></div>' +
    (c.importe_iva
      ? '<div class="modal-field"><div class="modal-field-label">' + esc(t('indice.detalle.importeConIva')) + '</div>' +
        '<div class="modal-field-value modal-field-value--importe">' + formatearImporte(c.importe_iva) + '</div></div>'
      : '') +
    '</div>' +
    '<div class="modal-grid">' +
    '<div class="modal-field"><div class="modal-field-label">' + esc(t('comun.organismo')) + '</div>' +
    '<div class="modal-field-value">' + (esc(c.organismo) || '—') + '</div></div>' +
    '<div class="modal-field"><div class="modal-field-label">' + esc(t('comun.tipo')) + '</div>' +
    '<div class="modal-field-value"><span class="badge ' + badgeClass(c.tipo) + '">' + (esc(c.tipo) || '—') + '</span></div></div>' +
    '<div class="modal-field"><div class="modal-field-label">' + esc(t('comun.estado')) + '</div>' +
    (function() { const est = badgeEstado(c.estado); return '<div class="modal-field-value"><span class="badge ' + est.cls + '">' + esc(est.label) + '</span>' + (c.estado_xml && c.estado_xml !== c.estado ? ' <span class="modal-estado-xml">(XML: ' + esc(c.estado_xml) + ')</span>' : '') + '</div></div>'; })() +
    '<div class="modal-field"><div class="modal-field-label">' + esc(t('comun.procedimiento')) + '</div>' +
    '<div class="modal-field-value">' + (esc(c.procedimiento) || '—') + '</div></div>' +
    '<div class="modal-field"><div class="modal-field-label">' + esc(t('indice.detalle.expediente')) + '</div>' +
    '<div class="modal-field-value">' + (esc(c.expediente) || '—') + '</div></div>' +
    '</div>' +
    '<hr class="modal-divider" />' +
    '<div class="modal-grid">' +
    '<div class="modal-field"><div class="modal-field-label">' + esc(t('comun.adjudicatario')) + '</div>' +
    '<div class="modal-field-value">' + (esc(c.adjudicatario) || '—') + (c.es_ute ? ' <span class="badge badge--ute">UTE</span>' : '') + '</div></div>' +
    '<div class="modal-field"><div class="modal-field-label">' + esc(t('comun.nif')) + '</div>' +
    '<div class="modal-field-value">' + (esc(c.nif_adjudicatario) || '—') + '</div></div>' +
    '</div>' +
    (c.es_ute && c.miembros_ute && c.miembros_ute.length > 0
      ? '<div class="modal-field"><div class="modal-field-label">' + esc(t('comun.miembrosUte')) + '</div>' +
        '<div class="modal-field-value"><ul class="ute-miembros-list">' +
        c.miembros_ute.map(function(m) { return '<li>' + esc(m) + '</li>'; }).join('') +
        '</ul></div></div>'
      : '') +
    '<div class="modal-grid">' +
    '<div class="modal-field"><div class="modal-field-label">' + esc(t('indice.detalle.fechaPublicacion')) + '</div>' +
    '<div class="modal-field-value">' + formatearFecha(c.fecha_publicacion) + '</div></div>' +
    '<div class="modal-field"><div class="modal-field-label">' + esc(t('indice.detalle.fechaAdjudicacion')) + '</div>' +
    '<div class="modal-field-value">' + formatearFecha(c.fecha_adjudicacion) + '</div></div>' +
    '<div class="modal-field"><div class="modal-field-label">' + esc(t('indice.detalle.fechaFormalizacion')) + '</div>' +
    '<div class="modal-field-value">' + formatearFecha(c.fecha_formalizacion) + '</div></div>' +
    '</div>' +
    // Sección de datos enriquecidos TED-UE (solo si hay datos)
    ((c.num_ofertas || c.criterios_adjudicacion || c.ted_publication_number)
      ? '<hr class="modal-divider" />' +
        '<div class="modal-field"><div class="modal-field-label">' +
        '<span class="badge badge--ted">' + esc(t('indice.detalle.tedBadge')) + '</span></div></div>' +
        '<div class="modal-grid">' +
        (c.num_ofertas
          ? '<div class="modal-field"><div class="modal-field-label">' + esc(t('indice.detalle.ofertas')) + '</div>' +
            '<div class="modal-field-value modal-field-value--importe">' + c.num_ofertas + '</div></div>'
          : '') +
        (c.ted_publication_number
          ? '<div class="modal-field"><div class="modal-field-label">' + esc(t('indice.detalle.numTed')) + '</div>' +
            '<div class="modal-field-value"><a href="https://ted.europa.eu/es/notice/' + esc(c.ted_publication_number) + '/html" target="_blank" rel="noopener noreferrer">' + esc(c.ted_publication_number) + ' ↗</a></div></div>'
          : '') +
        '</div>' +
        (c.criterios_adjudicacion
          ? '<div class="modal-field"><div class="modal-field-label">' + esc(t('indice.detalle.criterios')) + '</div>' +
            '<div class="modal-field-value">' + esc(c.criterios_adjudicacion) + '</div></div>'
          : '')
      : '') +
    (sanitizarUrl(c.url_origen)
      ? '<hr class="modal-divider" />' +
        '<div class="modal-field"><div class="modal-field-label">' + esc(t('indice.detalle.fuente')) + '</div>' +
        '<div class="modal-field-value"><a href="' + esc(sanitizarUrl(c.url_origen)) + '" target="_blank" rel="noopener noreferrer">' + esc(t('indice.detalle.verAnuncio')) + '</a></div></div>'
      : '');

  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  document.getElementById('modal-close').focus();
}

function cerrarModal() {
  document.getElementById('modal-overlay').hidden = true;
  document.body.style.overflow = '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Exportar CSV
// ─────────────────────────────────────────────────────────────────────────────

function exportarCsv() {
  const campos = [
    'expediente', 'objeto', 'tipo', 'procedimiento', 'organismo',
    'importe', 'importe_iva', 'adjudicatario', 'nif_adjudicatario',
    'fecha_publicacion', 'fecha_adjudicacion', 'url_origen',
  ];

  /**
   * Escapa un valor para CSV de forma segura:
   * - Envuelve en comillas si contiene separador, comillas o saltos de línea
   * - Escapa comillas dobles duplicándolas ("")
   * - Previene CSV injection: si empieza con =, +, -, @ se prefija con apóstrofe
   */
  function escaparCsv(valor) {
    let v = String(valor ?? '');
    // Prevenir CSV injection (fórmulas en Excel)
    if (/^[=+\-@\t\r]/.test(v)) {
      v = "'" + v;
    }
    // Si contiene separador, comillas o saltos de línea, envolver en comillas
    if (v.includes(';') || v.includes('"') || v.includes('\n') || v.includes('\r')) {
      return '"' + v.replace(/"/g, '""') + '"';
    }
    return v;
  }

  const filas = [
    campos.join(';'),
    ...estado.filtrados.map(c =>
      campos.map(k => escaparCsv(c[k])).join(';')
    ),
  ];

  const blob = new Blob(['\uFEFF' + filas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'contratoscam-' + new Date().toISOString().split('T')[0] + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Estadísticas y gráficas
// ─────────────────────────────────────────────────────────────────────────────

function actualizarEstadisticas() {
  const datos = estado.filtrados;

  document.getElementById('stat-total').textContent =
    datos.length.toLocaleString(locale);

  const importeTotal = datos.reduce((s, c) => s + (c.importe || 0), 0);
  document.getElementById('stat-importe').textContent =
    importeTotal > 0 ? formatearImporte(importeTotal) : '—';

  document.getElementById('stat-organismos').textContent =
    new Set(datos.map(c => c.organismo).filter(Boolean)).size.toLocaleString(locale);

  document.getElementById('stat-adjudicatarios').textContent =
    new Set(datos.map(c => c.adjudicatario).filter(Boolean)).size.toLocaleString(locale);
}

function crearOActualizarChart(canvasId, tipo, data, opciones) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const opcionesCompletas = Object.assign(
    { responsive: true, maintainAspectRatio: false, animation: { duration: 300 } },
    opciones
  );

  // Destruir chart existente y recrear (necesario cuando cambian labels/datasets)
  if (estado.charts[canvasId]) {
    estado.charts[canvasId].destroy();
  }

  estado.charts[canvasId] = new Chart(canvas, {
    type: tipo,
    data,
    options: opcionesCompletas,
  });
}

function renderizarGraficas() {
  const datos = estado.filtrados;

  // Gráfica 1: Contratos por tipo (donut)
  const conteoTipos = {};
  datos.forEach(c => {
    const tipo = c.tipo || t('comun.sinClasificar');
    conteoTipos[tipo] = (conteoTipos[tipo] || 0) + 1;
  });
  crearOActualizarChart('chart-tipos', 'doughnut', {
    labels: Object.keys(conteoTipos),
    datasets: [{ data: Object.values(conteoTipos), backgroundColor: COLORES, borderWidth: 2, borderColor: '#fff' }],
  }, { plugins: { legend: { position: 'right', labels: { font: { size: 11 } } } } });

  // Gráfica 2: Top 10 organismos (barras horizontales)
  const conteoOrg = {};
  datos.forEach(c => { if (c.organismo) conteoOrg[c.organismo] = (conteoOrg[c.organismo] || 0) + 1; });
  const topOrg = Object.entries(conteoOrg).sort((a, b) => b[1] - a[1]).slice(0, 10);
  crearOActualizarChart('chart-organismos', 'bar', {
    labels: topOrg.map(([k]) => k.length > 35 ? k.substring(0, 35) + '…' : k),
    datasets: [{ label: t('comun.contratos'), data: topOrg.map(([, v]) => v), backgroundColor: COLORES[0], borderRadius: 4 }],
  }, {
    indexAxis: 'y',
    plugins: { legend: { display: false } },
    scales: { x: { grid: { display: false } }, y: { ticks: { font: { size: 10 } } } },
  });

  // Gráfica 3: Evolución mensual (línea)
  const conteoMes = {};
  datos.forEach(c => {
    if (c.fecha_publicacion) {
      const mes = c.fecha_publicacion.substring(0, 7);
      conteoMes[mes] = (conteoMes[mes] || 0) + 1;
    }
  });
  const meses = Object.keys(conteoMes).sort();
  crearOActualizarChart('chart-evolucion', 'line', {
    labels: meses.map(m => { const [a, mo] = m.split('-'); return mo + '/' + a; }),
    datasets: [{
      label: t('indice.graficas.contratosPublicados'),
      data: meses.map(m => conteoMes[m]),
      borderColor: COLORES[0],
      backgroundColor: 'rgba(192,57,43,.1)',
      fill: true,
      tension: 0.3,
      pointRadius: 3,
    }],
  }, {
    plugins: { legend: { display: false } },
    scales: { x: { ticks: { maxTicksLimit: 12, font: { size: 10 } } }, y: { beginAtZero: true } },
  });

  // Gráfica 4: Distribución por procedimiento (donut)
  const conteoProcedimiento = {};
  datos.forEach(c => {
    const p = c.procedimiento || t('comun.sinEspecificar');
    conteoProcedimiento[p] = (conteoProcedimiento[p] || 0) + 1;
  });
  crearOActualizarChart('chart-procedimientos', 'doughnut', {
    labels: Object.keys(conteoProcedimiento),
    datasets: [{ data: Object.values(conteoProcedimiento), backgroundColor: COLORES.slice(1), borderWidth: 2, borderColor: '#fff' }],
  }, { plugins: { legend: { position: 'right', labels: { font: { size: 11 } } } } });
}

// ─────────────────────────────────────────────────────────────────────────────
// Inicialización de selectores
// ─────────────────────────────────────────────────────────────────────────────

function poblarSelect(id, valores) {
  const select = document.getElementById(id);
  const primera = select.querySelector('option');
  select.innerHTML = '';
  select.appendChild(primera);
  valores.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  });
}

/**
 * Etiqueta legible de una categoría de organismo (locales/*.json → categorias.<cat>).
 * Si la categoría no tiene traducción se muestra la clave tal cual.
 */
function etiquetaCategoria(cat) {
  return t('categorias.' + cat, { defaultValue: cat });
}

/**
 * Puebla el selector de organismos con optgroups agrupados por categoría.
 * Cada categoría se convierte en un <optgroup> con sus organismos ordenados.
 */
function poblarSelectOrganismoConOptgroup() {
  const select = document.getElementById('filtro-organismo');
  const primera = select.querySelector('option');
  select.innerHTML = '';
  select.appendChild(primera);

  // Construir mapa categoría → [organismos]
  const mapaCat = {};
  for (const c of estado.datos) {
    if (!c.organismo) continue;
    const cat = c.categoria_organismo || 'otros';
    if (!mapaCat[cat]) mapaCat[cat] = new Set();
    mapaCat[cat].add(c.organismo);
  }

  // Orden de categorías (las que tienen más organismos primero, pero 'otros' al final)
  const categoriasOrdenadas = Object.keys(mapaCat)
    .filter(k => k !== 'otros')
    .sort((a, b) => etiquetaCategoria(a).localeCompare(etiquetaCategoria(b), locale));
  if (mapaCat['otros']) categoriasOrdenadas.push('otros');

  for (const cat of categoriasOrdenadas) {
    const organismos = [...mapaCat[cat]].sort((a, b) => a.localeCompare(b, 'es'));
    const optgroup = document.createElement('optgroup');
    optgroup.label = etiquetaCategoria(cat);
    for (const org of organismos) {
      const opt = document.createElement('option');
      opt.value = org;
      opt.textContent = org;
      optgroup.appendChild(opt);
    }
    select.appendChild(optgroup);
  }
}

/**
 * Puebla el selector de categorías con las categorías presentes en los datos.
 */
function poblarSelectCategoria() {
  const select = document.getElementById('filtro-categoria');
  const primera = select.querySelector('option');
  select.innerHTML = '';
  select.appendChild(primera);

  // Recoger categorías presentes y contar contratos
  const conteo = {};
  for (const c of estado.datos) {
    const cat = c.categoria_organismo || 'otros';
    conteo[cat] = (conteo[cat] || 0) + 1;
  }

  // Ordenar: alfabéticamente por label, 'otros' al final
  const categorias = Object.keys(conteo)
    .filter(k => k !== 'otros')
    .sort((a, b) => etiquetaCategoria(a).localeCompare(etiquetaCategoria(b), locale));
  if (conteo['otros']) categorias.push('otros');

  for (const cat of categorias) {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = etiquetaCategoria(cat) + ' (' + conteo[cat] + ')';
    select.appendChild(opt);
  }
}

/**
 * Filtra el selector de organismos cuando se selecciona una categoría.
 * Si no hay categoría seleccionada, muestra todos los organismos con optgroup.
 */
function filtrarOrganismosPorCategoria(categoriaSeleccionada) {
  const select = document.getElementById('filtro-organismo');
  const valorActual = select.value;
  const primera = select.querySelector('option') || document.createElement('option');
  if (!primera.value) {
    primera.value = '';
    primera.textContent = t('filtros.todosOrganismos');
  }
  select.innerHTML = '';
  select.appendChild(primera);

  if (categoriaSeleccionada) {
    // Mostrar solo organismos de esa categoría (sin optgroup, lista plana)
    const organismos = new Set();
    for (const c of estado.datos) {
      if (c.organismo && (c.categoria_organismo || 'otros') === categoriaSeleccionada) {
        organismos.add(c.organismo);
      }
    }
    const lista = [...organismos].sort((a, b) => a.localeCompare(b, 'es'));
    for (const org of lista) {
      const opt = document.createElement('option');
      opt.value = org;
      opt.textContent = org;
      select.appendChild(opt);
    }
  } else {
    // Sin categoría: mostrar todos con optgroup
    poblarSelectOrganismoConOptgroup();
    return; // poblarSelectOrganismoConOptgroup ya reconstruye el select completo
  }

  // Si el valor anterior ya no existe en las opciones, resetear
  if (valorActual && !select.querySelector('option[value="' + CSS.escape(valorActual) + '"]')) {
    select.value = '';
  }
}

function inicializarFiltros() {
  poblarSelect('filtro-tipo', valoresUnicos(estado.datos, 'tipo'));
  poblarSelectCategoria();
  poblarSelectOrganismoConOptgroup();
  poblarSelect('filtro-procedimiento', valoresUnicos(estado.datos, 'procedimiento'));

  // Poblar selector de estado con etiquetas legibles (en orden lógico del ciclo de vida)
  const ORDEN_ESTADOS = [
    'en_licitacion', 'en_evaluacion', 'pre_adjudicado', 'pre_adjudicacion',
    'adjudicado', 'formalizado', 'resuelto', 'anulado', 'posiblemente_resuelto', 'publicado',
  ];
  const estadosPresentes = new Set(estado.datos.map(d => d.estado).filter(Boolean));
  const estadosOrdenados = ORDEN_ESTADOS.filter(e => estadosPresentes.has(e));
  // Añadir cualquier estado no previsto al final
  estadosPresentes.forEach(e => { if (!ORDEN_ESTADOS.includes(e)) estadosOrdenados.push(e); });

  const selectEstado = document.getElementById('filtro-estado');
  const primeraOpcion = selectEstado.querySelector('option');
  selectEstado.innerHTML = '';
  selectEstado.appendChild(primeraOpcion);
  estadosOrdenados.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = badgeEstado(v).label;
    selectEstado.appendChild(opt);
  });
}

function inicializarOrdenacion() {
  document.querySelectorAll('.contratos-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (estado.ordenCol === col) {
        estado.ordenDir = estado.ordenDir === 'asc' ? 'desc' : 'asc';
      } else {
        estado.ordenCol = col;
        estado.ordenDir = 'asc';
      }
      document.querySelectorAll('.contratos-table th.sortable').forEach(h => {
        h.classList.remove('sorted-asc', 'sorted-desc');
      });
      th.classList.add(estado.ordenDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
      aplicarFiltros();
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Punto de entrada
// ─────────────────────────────────────────────────────────────────────────────

async function init() {
  // 1. Cargar datos, metadatos y traducciones
  let datosRaw, meta;
  try {
    [datosRaw, meta] = await Promise.all([DatosCAM.cargarContratos(), DatosCAM.cargarMeta(), window.I18n.listo]);
  } catch (err) {
    console.error(err);
    await window.I18n.listo;
    DatosCAM.mostrarErrorCarga();
    mostrarFechaActualizacion(null);
    return;
  }
  estado.datos = datosRaw;
  estado.filtrados = [...estado.datos];
  mostrarFechaActualizacion(meta);

  // 2. Inicializar UI
  inicializarFiltros();
  inicializarOrdenacion();
  aplicarFiltros(); // También actualiza estadísticas y gráficas

  // 3. Eventos de búsqueda y filtros
  const debouncedFiltrar = debounce(aplicarFiltros, CONFIG.DEBOUNCE_MS);
  document.getElementById('input-busqueda').addEventListener('input', debouncedFiltrar);
  document.getElementById('filtro-tipo').addEventListener('change', aplicarFiltros);
  document.getElementById('filtro-categoria').addEventListener('change', () => {
    const cat = document.getElementById('filtro-categoria').value;
    filtrarOrganismosPorCategoria(cat);
    aplicarFiltros();
  });
  document.getElementById('filtro-organismo').addEventListener('change', aplicarFiltros);
  document.getElementById('filtro-procedimiento').addEventListener('change', aplicarFiltros);
  document.getElementById('filtro-estado').addEventListener('change', aplicarFiltros);
  document.getElementById('filtro-importe-min').addEventListener('input', debouncedFiltrar);
  document.getElementById('filtro-importe-max').addEventListener('input', debouncedFiltrar);
  document.getElementById('filtro-fecha-desde').addEventListener('change', aplicarFiltros);
  document.getElementById('filtro-fecha-hasta').addEventListener('change', aplicarFiltros);

  // 4. Limpiar filtros
  document.getElementById('btn-limpiar').addEventListener('click', () => {
    ['input-busqueda', 'filtro-tipo', 'filtro-categoria', 'filtro-organismo',
      'filtro-procedimiento', 'filtro-estado', 'filtro-importe-min', 'filtro-importe-max',
      'filtro-fecha-desde', 'filtro-fecha-hasta']
      .forEach(id => { document.getElementById(id).value = ''; });
    filtrarOrganismosPorCategoria('');
    aplicarFiltros();
  });

  // 5. Paginación
  document.getElementById('btn-anterior').addEventListener('click', () => {
    if (estado.paginaActual > 1) {
      estado.paginaActual--;
      renderizarTabla();
      renderizarPaginacion();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  document.getElementById('btn-siguiente').addEventListener('click', () => {
    const totalPaginas = Math.ceil(estado.filtrados.length / CONFIG.PAGE_SIZE);
    if (estado.paginaActual < totalPaginas) {
      estado.paginaActual++;
      renderizarTabla();
      renderizarPaginacion();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  // 6. Exportar CSV
  document.getElementById('btn-exportar').addEventListener('click', exportarCsv);

  // 7. Modal de contrato
  document.getElementById('modal-close').addEventListener('click', cerrarModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) cerrarModal();
  });

  // 8. Modal "Sobre los datos"
  const btnSobre = document.getElementById('btn-sobre-datos');
  const overlayS = document.getElementById('modal-sobre-overlay');
  const closeS   = document.getElementById('modal-sobre-close');
  if (btnSobre && overlayS && closeS) {
    const abrirSobre  = () => { overlayS.hidden = false; document.body.style.overflow = 'hidden'; closeS.focus(); };
    const cerrarSobre = () => { overlayS.hidden = true;  document.body.style.overflow = ''; };
    btnSobre.addEventListener('click', abrirSobre);
    closeS.addEventListener('click', cerrarSobre);
    overlayS.addEventListener('click', e => { if (e.target === e.currentTarget) cerrarSobre(); });
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      cerrarModal();
      const overlayS2 = document.getElementById('modal-sobre-overlay');
      if (overlayS2 && !overlayS2.hidden) { overlayS2.hidden = true; document.body.style.overflow = ''; }
    }
  });
}

// Arrancar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', init);

})();
