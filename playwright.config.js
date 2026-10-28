/**
 * playwright.config.js
 *
 * Configuración de la prueba de humo de la web (npm run test:web): construye
 * el sitio con npm run build:web, lo sirve en local y lo abre en Chromium.
 */

import { defineConfig, devices } from '@playwright/test';

const PUERTO = 3000;

export default defineConfig({
  testDir: 'tests',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PUERTO}`,
    // Idioma por defecto del sitio: sin esto el navegador redirigiría a /en/
    locale: 'es-ES',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `npm run build:web && npx serve _site --listen ${PUERTO} --no-clipboard`,
    url: `http://localhost:${PUERTO}`,
    reuseExistingServer: !process.env.CI,
  },
});
