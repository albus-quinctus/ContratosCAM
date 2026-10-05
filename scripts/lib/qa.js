/**
 * scripts/lib/qa.js
 *
 * Utilidades de test compartidas por las suites scripts/_qa-*.js.
 * Cada suite llama a las aserciones y, al final, a terminar().
 */

let totalTests = 0;
let pasados = 0;
let fallidos = 0;

function registrar(descripcion, ok, esperado, obtenido) {
  totalTests++;
  if (ok) {
    pasados++;
    console.log(`  ✅ ${descripcion}`);
  } else {
    fallidos++;
    console.error(`  ❌ ${descripcion}`);
    console.error(`     Esperado: ${esperado}`);
    console.error(`     Obtenido: ${obtenido}`);
  }
}

export function assert(descripcion, obtenido, esperado) {
  registrar(descripcion, obtenido === esperado, JSON.stringify(esperado), JSON.stringify(obtenido));
}

export function assertDeep(descripcion, obtenido, esperado) {
  const a = JSON.stringify(obtenido);
  const b = JSON.stringify(esperado);
  registrar(descripcion, a === b, b, a);
}

export function assertApprox(descripcion, obtenido, esperado, tolerancia = 0.01) {
  registrar(descripcion, Math.abs(obtenido - esperado) <= tolerancia, `~${esperado} (±${tolerancia})`, obtenido);
}

/**
 * Muestra el resumen y termina con código 1 si algún test ha fallado.
 */
export function terminar() {
  console.log('\n' + '═'.repeat(60));
  console.log(`📊 Resultado: ${pasados}/${totalTests} tests pasados`);
  if (fallidos > 0) {
    console.log(`❌ ${fallidos} tests fallidos`);
    process.exit(1);
  } else {
    console.log('✅ Todos los tests pasaron correctamente');
  }
}
