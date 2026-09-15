import assert from 'node:assert/strict';
import { crearHandler } from '../netlify/functions/datos.mjs';
process.env.CLAVE_PANADERIA='clave-ficticia-de-prueba';
delete process.env.CONTEXT;
let doc=null, etag=0, reads=0, release;
let barrier=new Promise(r=>release=r);
const store={
  async get(){return structuredClone(doc);},
  async getWithMetadata(){
    const snapshot=doc ? {data:structuredClone(doc),etag:String(etag)} : null;
    if(++reads===2)release();
    await barrier;
    return snapshot;
  },
  async setJSON(key,data,options){
    if(options.onlyIfNew ? doc!==null : options.onlyIfMatch!==String(etag))return {modified:false};
    doc=structuredClone(data);etag++;return {modified:true,etag:String(etag)};
  }
};
const handler=crearHandler(()=>store);
const request=(version,id)=>new Request('https://example.test/api/datos',{method:'PUT',headers:{'x-clave':process.env.CLAVE_PANADERIA,'content-type':'application/json'},body:JSON.stringify({version,datos:{empleados:[],pagos:[{id}]}})});
for(const version of [0,1]){
  reads=0;barrier=new Promise(r=>release=r);
  const result=await Promise.all([handler(request(version,'a')),handler(request(version,'b'))]);
  assert.deepEqual(result.map(r=>r.status).sort(),[200,409]);
  assert.equal(doc.version,version+1);
  assert.equal(doc.datos.pagos.length,1);
  const conflict=await result.find(r=>r.status===409).json();
  assert.equal(conflict.version,doc.version);
}
assert.equal((await handler(request(-1,'x'))).status,400);
process.env.CONTEXT='deploy-preview';
assert.equal((await handler(request(2,'x'))).status,403);
console.log('Backend: primera escritura y actualización concurrentes atómicas; preview aislada: OK');
