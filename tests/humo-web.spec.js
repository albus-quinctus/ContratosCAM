/**
 * tests/humo-web.spec.js
 *
 * Prueba de humo de la web publicada: cada página carga los datos reales,
 * pinta la tabla, tiene el idioma correcto y no da errores en la consola.
 * Se ejecuta sobre el build (_site/), igual que lo que se despliega.
 *
 * Uso: npm run test:web
 */

import { test, expect } from '@playwright/test';

// Páginas del sitio y el dato que solo aparece cuando han cargado los contratos
const PAGINAS = [
  { ruta: '/', idioma: 'es', estadistica: '#stat-total' },
  { ruta: '/ranking.html', idioma: 'es', estadistica: '#stat-total-adj' },
  { ruta: '/en/', idioma: 'en', estadistica: '#stat-total' },
  { ruta: '/en/ranking.html', idioma: 'en', estadistica: '#stat-total-adj' },
];

// Valor de las estadísticas antes de cargar los datos (ver src/web/*.html)
const SIN_DATOS = '—';
const IDIOMA_INGLES = PAGINAS.find(p => p.idioma === 'en');
// CDN de Chart.js: la web debe seguir mostrando los datos si no carga
const CDN_GRAFICAS = '**/cdn.jsdelivr.net/**';

/** Apunta los errores de JavaScript y de consola de la página. */
function vigilarErrores(page) {
  const errores = [];
  page.on('pageerror', error => errores.push(error.message));
  page.on('console', mensaje => {
    if (mensaje.type() === 'error') errores.push(mensaje.text());
  });
  return errores;
}

async function comprobarDatosCargados(page, { idioma, estadistica }) {
  await expect(page.locator('html')).toHaveAttribute('lang', idioma);
  await expect(page.locator(estadistica)).not.toHaveText(SIN_DATOS);
  await expect(page.locator(estadistica)).toHaveText(/\d/);
  await expect(page.locator('#tabla-body tr').first()).toBeVisible();
}

for (const pagina of PAGINAS) {
  test(`${pagina.ruta} carga los datos sin errores`, async ({ page }) => {
    const errores = vigilarErrores(page);
    await page.goto(pagina.ruta);
    await comprobarDatosCargados(page, pagina);
    expect(errores).toEqual([]);
  });
}

test('con el navegador en inglés, la portada redirige a /en/', async ({ browser }) => {
  const contexto = await browser.newContext({ locale: 'en-US' });
  const page = await contexto.newPage();
  await page.goto(PAGINAS[0].ruta);
  await expect(page).toHaveURL(new RegExp(`${IDIOMA_INGLES.ruta}$`));
  await comprobarDatosCargados(page, IDIOMA_INGLES);
  await contexto.close();
});

test('sin el CDN de las gráficas, la portada sigue mostrando los datos', async ({ page }) => {
  await page.route(CDN_GRAFICAS, ruta => ruta.abort());
  await page.goto(PAGINAS[0].ruta);
  await comprobarDatosCargados(page, PAGINAS[0]);
});
