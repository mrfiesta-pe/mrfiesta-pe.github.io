const fs=require('fs');const ts=require('typescript');const assert=require('node:assert/strict');const source=fs.readFileSync(require('node:path').join(__dirname,'../src/lib/clientCapture.ts'),'utf8');const code=ts.transpile(source,{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022});const captureLib={};Function('exports',code)(captureLib);const now=new Date(2026,8,17);
const sample=`[11:39 a. m., 3/9/2026] Cliente: Nombre: Cliente Prueba&#x20;
Paquete descrito
Fecha 28 noviembre/ 4pm
Direccion: colegio de prueba jr uno 123
[11:39 a. m., 3/9/2026] Mr Fiesta: Y cual de estas propuestas sería
[11:40 a. m., 3/9/2026] Cliente: El de 650
[11:40 a. m., 3/9/2026] Cliente: a las 4 debería empezar el show, ustsdes llegan antes no?
[11:43 a. m., 3/9/2026] Mr Fiesta: Si claro deberíamos estar a las 2 pm
[11:52 a. m., 3/9/2026] Mr Fiesta: Nombre: Cliente Prueba&#x20;
Paquete descrito
Fecha 23 noviembre/ 4pm
Direccion: colegio de prueba jr uno 123
Me confirma si está bien la fecha
[11:52 a. m., 3/9/2026] Cliente: perdon
[11:52 a. m., 3/9/2026] Cliente: ES 28 DE NOVIEMBRE
[11:54 a. m., 3/9/2026] Cliente: SABADO
[11:54 a. m., 3/9/2026] Mr Fiesta: Ok, un número de contacto por favor
[11:55 a. m., 3/9/2026] Cliente: 900111222 / 900333444`;
const values=r=>Object.fromEntries(r.fields.filter(f=>f.value).map(f=>[f.key,f.value]));const result=captureLib.parseClientCapture(sample,now);assert.equal(values(result).cliente,'Cliente Prueba');assert.equal(values(result).fecha_evento,'2026-11-28');assert.equal(values(result).hora_inicio,'16:00');assert.deepEqual(result.phones,['900111222','900333444']);
const template='NOMBRE DEL CONTRATANTE: María Pérez\nTELÉFONO: +51 999 123 456\nDIRECCIÓN EXACTA: Calle Uno 123\nDISTRITO: La Punta\nREFERENCIA: Frente al parque\nFECHA DEL EVENTO: 25/09/2026\nHORA DE INICIO: 6:30 pm\nNOMBRE DEL CUMPLEAÑERO/A: Lucía\nEDAD: ocho años\nCANCIÓN PARA LA INVITACIÓN: Happy\nTEMÁTICA PARA LA INVITACIÓN: Frozen';assert.equal(Object.keys(values(captureLib.parseClientCapture(template,now))).length,11);
const free='Hola soy María Pérez, mi hija Lucía cumple ocho años. La fiesta será en el colegio Franco Peruano, Jr. Uno 123.\nFecha 25 de septiembre a las seis y media de la tarde\nMi cel es 999 123 456\nTemática Frozen';
assert.equal(captureLib.parseDate('21 de enero',new Date(2026,10,1)).value,'2027-01-21');assert.equal(captureLib.parseDate('21/01/2026',now).value,'2026-01-21');assert(captureLib.parseDate('31 de febrero',now).warning);assert(captureLib.parseDate('ayer 16 septiembre',now).warning);
assert.equal(captureLib.parseClientCapture('Hora: 7',now).fields.find(f=>f.key==='hora_inicio').warning,'Confirma si es de mañana o tarde.');assert(captureLib.parseClientCapture('Fecha: 28 noviembre\nDOMINGO',now).fields.find(f=>f.key==='fecha_evento').warning);
console.log('Parser checks passed');


assert.equal(values(captureLib.parseClientCapture('Fecha: 28/11',now)).hora_inicio,undefined);
assert.equal(values(captureLib.parseClientCapture('Hora: 12am',now)).hora_inicio,'00:00');
assert.equal(values(captureLib.parseClientCapture('Hora: 12pm',now)).hora_inicio,'12:00');
assert.equal(values(captureLib.parseClientCapture('Hora: 19:45',now)).hora_inicio,'19:45');
assert.equal(values(captureLib.parseClientCapture('Teléfono: 51 999 123 456',now)).telefono,'999123456');
assert.equal(values(captureLib.parseClientCapture('Nombre Cliente Prueba',now)).cliente,'Cliente Prueba');
assert.equal(values(captureLib.parseClientCapture('Nombre del contratante:\nCliente Prueba',now)).cliente,'Cliente Prueba');
assert.equal(values(captureLib.parseClientCapture('Llegamos a las 2 pm para instalar',now)).hora_inicio,undefined);
assert.equal(values(captureLib.parseClientCapture('Nombre: Cliente Prueba TELÉFONO: 999123456 DISTRITO: Surco',now)).lugar,'Surco');
assert.equal(values(captureLib.parseClientCapture(free,now)).hora_inicio,'18:30');
assert.equal(values(captureLib.parseClientCapture(free,now)).agasajado,'Lucía');
assert.equal(captureLib.parseDate('17 septiembre',now).value,'2026-09-17');
assert.equal(captureLib.parseDate('2027-01-21',now).value,'2027-01-21');
assert(captureLib.parseClientCapture('Hora: 25:99',now).fields.find(f=>f.key==='hora_inicio').warning);
assert.deepEqual(captureLib.selectedCapture(result.fields,{}),{});
assert.equal(captureLib.selectedCapture(result.fields,{cliente:true}).cliente,'Cliente Prueba');
assert(captureLib.buildMissingMessage({}, {cliente:'Cliente Prueba'}).includes('Distrito'));
console.log('Additional regression checks passed');
