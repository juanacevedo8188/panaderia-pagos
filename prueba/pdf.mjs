import {crearInformePDF} from '../public/informe-pdf.js';
import {writeFileSync, mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const sample={semana:'2026-09-13',fin:'2026-09-19',generado:'15/9/2026 12:00',demo:true,totalVentas:500000,
 empleados:[{nombre:'Lucía Muñoz',objetivo:100000,pagado:40000,pendiente:60000,excedente:0}],
 pagos:Array.from({length:30},(_,i)=>({fecha:'2026-09-15',nombre:'Lucía Muñoz',medio:'transferencia',autor:'José',monto:i===0?40000:0})),
 ventas:[{fecha:'2026-09-13',m:300000,t:200000},{fecha:'2026-09-14'}],
 gastos:[{fecha:'2026-09-15',concepto:'Reposición de mercadería: azúcar, café y artículos varios (prueba de acentos y texto largo)',autor:'José',monto:12345.67}]};
const antes=JSON.stringify(sample), bytes=crearInformePDF(sample);
assert.equal(JSON.stringify(sample),antes,'no modifica registros');
assert.ok(Buffer.from(bytes).toString('latin1').startsWith('%PDF-1.4'));
mkdirSync('tmp/pdfs',{recursive:true});
writeFileSync('tmp/pdfs/informe-prueba.pdf',bytes);
console.log('PDF generado con acentos, tabla larga y datos ficticios; registros intactos.');
