# Normas de trabajo — ContratosCAM

Aplica SIEMPRE estas normas. Prioriza calidad sobre velocidad: "despacito y
con buena letra", sin prisas; si te atascas, pregunta en vez de improvisar.

## Plan antes de ejecutar

Para cualquier tarea no trivial, primero indica el plan (archivos que se van
a tocar y enfoque) y espera el OK antes de escribir código. No "mejores"
cosas que no se han pedido.

## Flujo de trabajo

- Trabaja SIEMPRE en una rama propia partiendo de la rama base del proyecto
  (pregunta cuál es si no está claro; no la asumas). Una rama por tarea, para
  no bloquear a nadie.
- Nunca commitees directamente sobre la rama base ni sobre `main`.
- No hagas commit ni push salvo que se pida explícitamente con la frase
  exacta acordada: **"Confirmo, commit y push"**. Sin esa frase, no commitees
  ni pushees.
- En commits, push y PRs NO hagas ninguna referencia a la IA: nada de
  `Co-Authored-By: Claude`, nada de menciones a Claude ni emojis tipo
  :robot_face:, ni en el mensaje ni en la descripción. Los mensajes van en
  español y describen el cambio funcional, como si los hubiera escrito el
  autor humano.

## Secretos y credenciales

- Nunca hardcodees claves, tokens ni credenciales. Nunca commitees `.env` ni
  ficheros con secretos. Nunca imprimas secretos en logs ni en la terminal.
- Si detectas un secreto expuesto (en el código, el historial o donde sea),
  PÁRATE y avisa antes de seguir.

## Dependencias

Trabaja dentro del stack existente. No metas paquetes/dependencias nuevas sin
pedirlo antes.

## Respeta las convenciones existentes

- Antes de escribir, lee el código de alrededor y replica sus patrones
  (naming, estructura, manejo de errores). No impongas un estilo distinto del
  que ya hay.
- Ante la duda, imita lo que ya hace el proyecto antes que aplicar criterio
  propio.

## Tipado

Este proyecto es JavaScript plano (sin TypeScript configurado). Si en el
futuro se introduce TypeScript: evita `any`; usa tipos/interfaces explícitas
para props, estado y handlers. Si se toca un archivo `.jsx`, conviértelo a
`.tsx` con tipado fuerte y no dejes `.jsx` nuevos.

## Nada de "strings mágicos"

- No compares contra literales sueltos (p. ej. `x.key === 'telefono'`). Usa
  constantes con nombre o enums.
- Los valores por defecto y demás claves deben derivarse de su fuente única
  (p. ej. `OPCIONES[0].key`), no repetir el literal en varios sitios.

## Arrays/config en vez de ternarios encadenados

Si hay lógica que depende de "qué campo/clave es" (maxLength, pattern,
validación, etc.), NO uses ternarios anidados ni `if/else` repetidos. Modela
los datos como un array/objeto de configuración y recórrelo. Deja que la
estructura mande, no el código condicional.

## No duplicar lógica (DRY)

- Si una lógica aparece en dos sitios, extráela a un util compartido y
  reutilízala desde ahí. No copies-pegues.
- Antes de escribir algo nuevo, busca si ya existe una función/utilidad
  reutilizable y úsala.

## Migraciones (BD)

Hoy el proyecto no tiene un sistema de migraciones incremental (la base
SQLite se reconstruye desde cero en cada ETL vía `scripts/import-db.js`). Si
en el futuro se introducen migraciones:

- Deben ser deterministas: describen una transición de estado conocida, no
  lógica defensiva. Un condicional en una migración es mala señal; suele
  indicar que el estado de partida no está bien definido. Si hace falta uno,
  párate y aclara antes de improvisar.
- Nada de condicionales en las migraciones: evita bloques
  `DO $$ ... IF ... END $$`, comprobaciones de existencia y cualquier `IF`.
- En concreto, nada de condicionales en los `ADD COLUMN` (ni `IF NOT EXISTS`
  ni similares). La columna se añade porque se sabe que no existe.

## Scripts destructivos o con coste

Cualquier script que escriba en producción, borre datos o gaste dinero
(llamadas a API) debe soportar `--dry-run` y exigir confirmación explícita
con números concretos (filas afectadas, coste estimado) antes de escribir.

## Tests

No borres, saltes ni debilites tests para que pase el verde. Si un test
falla, entiende por qué. Si cambias comportamiento, actualiza o añade el
test.

## Cierre de cada cambio

- Deja el linter y el type-checker sin errores en los archivos tocados.
- Verifica el cambio de verdad (ejecutando la app / la ruta afectada), no
  solo en teoría.
- Quita logs/prints de debug, código comentado, TODOs sueltos y código
  muerto que se haya dejado.
- Cambios mínimos y de bajo riesgo: no toques lo que ya funciona si no hace
  falta.
