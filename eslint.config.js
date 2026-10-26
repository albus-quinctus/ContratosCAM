/**
 * eslint.config.js
 *
 * Configuración de ESLint (npm run lint). Reglas recomendadas de ESLint, sin
 * reglas de estilo: el objetivo es detectar errores y código muerto.
 */

import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['_site/', 'data/', 'tmp/', 'src/web/js/vendor/'],
  },
  js.configs.recommended,
  {
    // Pipeline de datos y configuración: módulos ES ejecutados con Node
    files: ['scripts/**/*.js', '*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: globals.node,
    },
  },
  {
    // Frontend: scripts clásicos que se cargan con <script> en el navegador
    files: ['src/web/js/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.browser,
        // Definidos por otros <script> de la página: Chart.js (CDN),
        // i18next (js/vendor/) y DatosCAM (js/datos.js)
        Chart: 'readonly',
        i18next: 'readonly',
        DatosCAM: 'readonly',
      },
    },
  },
];
