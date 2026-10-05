/**
 * scripts/build-web.js
 *
 * Genera el sitio estático que se publica en GitHub Pages.
 *
 * - Copia el frontend (src/web/) y los JSON procesados (data/processed/,
 *   incluidos los contratos por año de data/processed/contratos/).
 * - Genera las páginas de cada idioma traducido (p. ej. _site/en/) a partir
 *   de las páginas en español: mismo HTML con su `lang` y las rutas a los
 *   recursos compartidos subidas un nivel. Los textos se traducen en el
 *   navegador (src/web/js/i18n.js + src/web/locales/).
 *
 * Entrada: src/web/, data/processed/ (JSON, también en subcarpetas)
 * Salida:  _site/ (se borra y se regenera entera)
 *
 * Uso: node scripts/build-web.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(__dirname, '..');
const WEB_DIR = path.join(RAIZ, 'src/web');
const DATA_DIR = path.join(RAIZ, 'data/processed');
const SALIDA_DIR = path.join(RAIZ, '_site');
const SALIDA_DATA_DIR = path.join(SALIDA_DIR, 'data/processed');

// Idioma de las páginas de src/web/ y de los idiomas con subdirectorio propio
const IDIOMA_ORIGEN = 'es';
const IDIOMAS_TRADUCIDOS = ['en'];

/**
 * Cambios que convierten una página de la raíz en su versión de /<idioma>/.
 * Todos los patrones deben aparecer en cada página: si falta alguno el build
 * falla, para no publicar una página con rutas rotas.
 */
function transformaciones(idioma) {
  return [
    { buscar: `<html lang="${IDIOMA_ORIGEN}">`, reemplazar: `<html lang="${idioma}">` },
    { buscar: 'href="css/', reemplazar: 'href="../css/' },
    { buscar: 'src="js/',   reemplazar: 'src="../js/' },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Build
// ─────────────────────────────────────────────────────────────────────────────

function copiarWebYDatos() {
  fs.rmSync(SALIDA_DIR, { recursive: true, force: true });
  fs.cpSync(WEB_DIR, SALIDA_DIR, { recursive: true });

  let numJsons = 0;
  fs.cpSync(DATA_DIR, SALIDA_DATA_DIR, {
    recursive: true,
    filter: origen => {
      if (fs.statSync(origen).isDirectory()) return true;
      if (!origen.endsWith('.json')) return false;
      numJsons++;
      return true;
    },
  });
  return numJsons;
}

function generarPaginaTraducida(html, idioma, nombrePagina) {
  let resultado = html;
  for (const { buscar, reemplazar } of transformaciones(idioma)) {
    if (!resultado.includes(buscar)) {
      throw new Error(`${nombrePagina}: no se encontró "${buscar}" al generar /${idioma}/`);
    }
    resultado = resultado.replaceAll(buscar, reemplazar);
  }
  return resultado;
}

function generarIdiomas() {
  const paginas = fs.readdirSync(WEB_DIR).filter(f => f.endsWith('.html'));
  for (const idioma of IDIOMAS_TRADUCIDOS) {
    const dirIdioma = path.join(SALIDA_DIR, idioma);
    fs.mkdirSync(dirIdioma, { recursive: true });
    for (const pagina of paginas) {
      const html = fs.readFileSync(path.join(WEB_DIR, pagina), 'utf8');
      fs.writeFileSync(path.join(dirIdioma, pagina), generarPaginaTraducida(html, idioma, pagina));
    }
  }
  return paginas;
}

function main() {
  const numJsons = copiarWebYDatos();
  const paginas = generarIdiomas();

  console.log(`✅ Sitio generado en ${path.relative(RAIZ, SALIDA_DIR)}/`);
  console.log(`   Datos: ${numJsons} JSON copiados`);
  for (const idioma of IDIOMAS_TRADUCIDOS) {
    console.log(`   /${idioma}/: ${paginas.join(', ')}`);
  }
}

main();
