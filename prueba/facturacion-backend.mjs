import assert from 'node:assert/strict';
import {crearHandler} from '../netlify/functions/datos.mjs';
process.env.CLAVE_PANADERIA='test-key';
delete process.env.CONTEXT;
let doc={version:1,datos:{empleados:[],pagos:[],facturacion:{clientes:[{id:'c1'}],borradores:[]}}};
const handler=crearHandler(()=>({getWithMetadata:async()=>({data:structuredClone(doc),etag:'e1'}),setJSON:async(k,nuevo)=>{doc=nuevo;return {modified:true};}}));
const r=await handler(new Request('https://example.test/api/datos',{method:'PUT',headers:{'x-clave':'test-key'},body:JSON.stringify({version:1,datos:{empleados:[],pagos:[{id:'p1'}]}})}));
assert.equal(r.status,200);assert.equal(doc.datos.facturacion.clientes[0].id,'c1');assert.equal(doc.datos.pagos[0].id,'p1');
console.log('Facturación: clientes preservados al guardar desde una pestaña antigua: OK');
