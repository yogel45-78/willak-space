/* Corre las pruebas de la sección 12 sin navegador:  node app/js/pruebas-node.js
   Sale con código 1 si alguna falla. */
const fs = require('fs'), path = require('path'), vm = require('vm');
globalThis.window = globalThis;
globalThis.document = { getElementById: () => null, documentElement: {} };
for (const f of ['../config.js', 'estado.js', 'calculo.js', 'verdor.js', 'motor.js', 'demo.js', 'datos.js', 'servidor.js', 'ambiente.js', 'pruebas.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), { filename: f });
}
const res = globalThis.Chakra.pruebas();
let mal = 0;
for (const r of res) {
  if (!r.ok) mal++;
  console.log((r.ok ? 'OK   ' : 'FALLA') + ' §' + r.seccion + ' ' + r.nombre + (r.ok ? '' : '\n        esperado: ' + r.esperado + '\n        obtenido: ' + r.obtenido));
}
console.log(`\n${res.length - mal} de ${res.length} pruebas pasan.`);
process.exit(mal ? 1 : 0);
