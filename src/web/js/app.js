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

const CONFIG = Object.freeze({
  // Rutas posibles al JSON de datos (se prueban en orden)
  // - Producción (GitHub Pages): data/ está al mismo nivel que index.html
  // - Desarrollo local (serve desde raíz): data/ está en la raíz del proyecto
  DATA_URLS: [
    './data/processed/contratos-normalizados.json',
    '/data/processed/contratos-normalizados.json',
  ],
  PAGE_SIZE: 50,
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
};

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────────────────────────────────────

function formatearImporte(valor) {
  if (valor === null || valor === undefined) return '—';
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
// Carga de datos
// ─────────────────────────────────────────────────────────────────────────────

async function cargarDatos() {
  // Intentar cada URL en orden hasta encontrar los datos
  for (const url of CONFIG.DATA_URLS) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const datos = await res.json();
      if (Array.isArray(datos) && datos.length > 0) return datos;
    } catch {
      // Intentar la siguiente URL
    }
  }
  console.warn('No se encontró el JSON de datos. Usando datos de ejemplo.');
  return generarDatosEjemplo();
}

function generarDatosEjemplo() {
  const organismos = [
    'Consejería de Educación',
    'Consejería de Sanidad',
    'Consejería de Transportes',
    'Agencia Madrileña de Atención Social',
    'Canal de Isabel II',
    'Consejería de Medio Ambiente',
    'Consejería de Hacienda',
  ];
  const tipos = ['Servicios', 'Suministros', 'Obras', 'Administrativo especial'];
  const procedimientos = ['Abierto', 'Abierto simplificado', 'Negociado sin publicidad', 'Menor'];
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

  return Array.from({ length: 200 }, (_, i) => ({
    expediente: 'CM/2024/' + String(i + 1).padStart(5, '0'),
    objeto: objetos[i % objetos.length] + ' (lote ' + (i + 1) + ')',
    tipo: tipos[i % tipos.length],
    procedimiento: procedimientos[i % procedimientos.length],
    organismo: organismos[i % organismos.length],
    importe: Math.round((Math.random() * 500000 + 5000) * 100) / 100,
    importe_iva: null,
    adjudicatario: 'Empresa Adjudicataria ' + (i + 1) + ', S.L.',
    nif_adjudicatario: 'B' + String(10000000 + i).substring(0, 8),
    fecha_publicacion: '2024-' + String(Math.floor(i / 17) + 1).padStart(2, '0') + '-' + String((i % 28) + 1).padStart(2, '0'),
    fecha_adjudicacion: null,
    fecha_formalizacion: null,
    url_origen: 'https://contrataciondelestado.es',
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Filtrado y ordenación
// ─────────────────────────────────────────────────────────────────────────────

function obtenerFiltros() {
  return {
    busqueda: document.getElementById('input-busqueda').value.trim().toLowerCase(),
    tipo: document.getElementById('filtro-tipo').value,
    organismo: document.getElementById('filtro-organismo').value,
    procedimiento: document.getElementById('filtro-procedimiento').value,
    importeMin: parseFloat(document.getElementById('filtro-importe-min').value) || null,
    importeMax: parseFloat(document.getElementById('filtro-importe-max').value) || null,
    fechaDesde: document.getElementById('filtro-fecha-desde').value || null,
    fechaHasta: document.getElementById('filtro-fecha-hasta').value || null,
  };
}

function aplicarFiltros() {
  const f = obtenerFiltros();

  estado.filtrados = estado.datos.filter(c => {
    if (f.busqueda) {
      const texto = [c.objeto, c.organismo, c.adjudicatario].join(' ').toLowerCase();
      if (!texto.includes(f.busqueda)) return false;
    }
    if (f.tipo && c.tipo !== f.tipo) return false;
    if (f.organismo && c.organismo !== f.organismo) return false;
    if (f.procedimiento && c.procedimiento !== f.procedimiento) return false;
    if (f.importeMin !== null && (c.importe === null || c.importe < f.importeMin)) return false;
    if (f.importeMax !== null && (c.importe === null || c.importe > f.importeMax)) return false;
    if (f.fechaDesde && c.fecha_publicacion && c.fecha_publicacion < f.fechaDesde) return false;
    if (f.fechaHasta && c.fecha_publicacion && c.fecha_publicacion > f.fechaHasta) return false;
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
  renderizarTabla();
  renderizarPaginacion();
  actualizarEstadisticas();
  renderizarGraficas();
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
      ? 'Sin resultados'
      : total.toLocaleString('es-ES') + ' contrato' + (total !== 1 ? 's' : '') + ' encontrado' + (total !== 1 ? 's' : '');

  if (pagina.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6"><div class="empty-state">' +
      '<div class="empty-state-icon">🔍</div>' +
      '<p>No se encontraron contratos con los filtros aplicados.</p>' +
      '</div></td></tr>';
    return;
  }

  tbody.innerHTML = pagina.map((c, i) =>
    '<tr data-idx="' + (inicio + i) + '" tabindex="0" role="button" aria-label="Ver detalle">' +
    '<td class="col-objeto"><div class="cell-objeto">' + (esc(c.objeto) || '—') + '</div></td>' +
    '<td class="col-organismo"><div class="cell-organismo">' + (esc(c.organismo) || '—') + '</div></td>' +
    '<td class="col-tipo"><span class="badge ' + badgeClass(c.tipo) + '">' + (esc(c.tipo) || '—') + '</span></td>' +
    '<td class="col-importe"><span class="cell-importe">' + formatearImporte(c.importe) + '</span></td>' +
    '<td class="col-fecha"><span class="cell-fecha">' + formatearFecha(c.fecha_publicacion) + '</span></td>' +
    '<td class="col-adjudicatario"><div class="cell-adjudicatario">' + (esc(c.adjudicatario) || '—') + '</div></td>' +
    '</tr>'
  ).join('');

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
      ? 'Página ' + estado.paginaActual + ' de ' + totalPaginas
      : 'Sin resultados';
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal de detalle
// ─────────────────────────────────────────────────────────────────────────────

function abrirModal(c) {
  const overlay = document.getElementById('modal-overlay');
  const contenido = document.getElementById('modal-content');

  contenido.innerHTML =
    '<div class="modal-field">' +
    '<div class="modal-field-label">Objeto del contrato</div>' +
    '<div class="modal-field-value modal-field-value--large">' + (esc(c.objeto) || '—') + '</div>' +
    '</div>' +
    '<hr class="modal-divider" />' +
    '<div class="modal-grid">' +
    '<div class="modal-field"><div class="modal-field-label">Importe (sin IVA)</div>' +
    '<div class="modal-field-value modal-field-value--importe">' + formatearImporte(c.importe) + '</div></div>' +
    (c.importe_iva
      ? '<div class="modal-field"><div class="modal-field-label">Importe (con IVA)</div>' +
        '<div class="modal-field-value modal-field-value--importe">' + formatearImporte(c.importe_iva) + '</div></div>'
      : '') +
    '</div>' +
    '<div class="modal-grid">' +
    '<div class="modal-field"><div class="modal-field-label">Organismo</div>' +
    '<div class="modal-field-value">' + (esc(c.organismo) || '—') + '</div></div>' +
    '<div class="modal-field"><div class="modal-field-label">Tipo</div>' +
    '<div class="modal-field-value"><span class="badge ' + badgeClass(c.tipo) + '">' + (esc(c.tipo) || '—') + '</span></div></div>' +
    '<div class="modal-field"><div class="modal-field-label">Procedimiento</div>' +
    '<div class="modal-field-value">' + (esc(c.procedimiento) || '—') + '</div></div>' +
    '<div class="modal-field"><div class="modal-field-label">Expediente</div>' +
    '<div class="modal-field-value">' + (esc(c.expediente) || '—') + '</div></div>' +
    '</div>' +
    '<hr class="modal-divider" />' +
    '<div class="modal-grid">' +
    '<div class="modal-field"><div class="modal-field-label">Adjudicatario</div>' +
    '<div class="modal-field-value">' + (esc(c.adjudicatario) || '—') + '</div></div>' +
    '<div class="modal-field"><div class="modal-field-label">NIF</div>' +
    '<div class="modal-field-value">' + (esc(c.nif_adjudicatario) || '—') + '</div></div>' +
    '</div>' +
    '<div class="modal-grid">' +
    '<div class="modal-field"><div class="modal-field-label">Fecha publicación</div>' +
    '<div class="modal-field-value">' + formatearFecha(c.fecha_publicacion) + '</div></div>' +
    '<div class="modal-field"><div class="modal-field-label">Fecha adjudicación</div>' +
    '<div class="modal-field-value">' + formatearFecha(c.fecha_adjudicacion) + '</div></div>' +
    '<div class="modal-field"><div class="modal-field-label">Fecha formalización</div>' +
    '<div class="modal-field-value">' + formatearFecha(c.fecha_formalizacion) + '</div></div>' +
    '</div>' +
    (sanitizarUrl(c.url_origen)
      ? '<hr class="modal-divider" />' +
        '<div class="modal-field"><div class="modal-field-label">Fuente oficial</div>' +
        '<div class="modal-field-value"><a href="' + esc(sanitizarUrl(c.url_origen)) + '" target="_blank" rel="noopener noreferrer">Ver anuncio original ↗</a></div></div>'
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
    datos.length.toLocaleString('es-ES');

  const importeTotal = datos.reduce((s, c) => s + (c.importe || 0), 0);
  document.getElementById('stat-importe').textContent =
    importeTotal > 0 ? formatearImporte(importeTotal) : '—';

  document.getElementById('stat-organismos').textContent =
    new Set(datos.map(c => c.organismo).filter(Boolean)).size.toLocaleString('es-ES');

  document.getElementById('stat-adjudicatarios').textContent =
    new Set(datos.map(c => c.adjudicatario).filter(Boolean)).size.toLocaleString('es-ES');
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
    const t = c.tipo || 'Sin clasificar';
    conteoTipos[t] = (conteoTipos[t] || 0) + 1;
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
    datasets: [{ label: 'Contratos', data: topOrg.map(([, v]) => v), backgroundColor: COLORES[0], borderRadius: 4 }],
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
      label: 'Contratos publicados',
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
    const p = c.procedimiento || 'Sin especificar';
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

function inicializarFiltros() {
  poblarSelect('filtro-tipo', valoresUnicos(estado.datos, 'tipo'));
  poblarSelect('filtro-organismo', valoresUnicos(estado.datos, 'organismo'));
  poblarSelect('filtro-procedimiento', valoresUnicos(estado.datos, 'procedimiento'));
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
  // 1. Cargar datos
  estado.datos = await cargarDatos();
  estado.filtrados = [...estado.datos];

  // 2. Inicializar UI
  inicializarFiltros();
  inicializarOrdenacion();
  aplicarFiltros(); // También actualiza estadísticas y gráficas

  // 3. Eventos de búsqueda y filtros
  const debouncedFiltrar = debounce(aplicarFiltros, CONFIG.DEBOUNCE_MS);
  document.getElementById('input-busqueda').addEventListener('input', debouncedFiltrar);
  document.getElementById('filtro-tipo').addEventListener('change', aplicarFiltros);
  document.getElementById('filtro-organismo').addEventListener('change', aplicarFiltros);
  document.getElementById('filtro-procedimiento').addEventListener('change', aplicarFiltros);
  document.getElementById('filtro-importe-min').addEventListener('input', debouncedFiltrar);
  document.getElementById('filtro-importe-max').addEventListener('input', debouncedFiltrar);
  document.getElementById('filtro-fecha-desde').addEventListener('change', aplicarFiltros);
  document.getElementById('filtro-fecha-hasta').addEventListener('change', aplicarFiltros);

  // 4. Limpiar filtros
  document.getElementById('btn-limpiar').addEventListener('click', () => {
    ['input-busqueda', 'filtro-tipo', 'filtro-organismo', 'filtro-procedimiento',
      'filtro-importe-min', 'filtro-importe-max', 'filtro-fecha-desde', 'filtro-fecha-hasta']
      .forEach(id => { document.getElementById(id).value = ''; });
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

  // 7. Modal
  document.getElementById('modal-close').addEventListener('click', cerrarModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) cerrarModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') cerrarModal();
  });
}

// Arrancar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', init);

})();
