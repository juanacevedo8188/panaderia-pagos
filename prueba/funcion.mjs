/* Verifica la función sin Netlify: que importe, que exporte la ruta
   y que los caminos de autorización respondan lo que dicen responder. */
import assert from "node:assert";
import { getStore } from "@netlify/blobs";
import handler, { config } from "../netlify/functions/datos.mjs";


assert.equal(config.path, "/api/datos");
assert.equal(typeof getStore, "function");
assert.equal(typeof handler, "function");

const pedir = (clave, metodo = "GET") =>
  handler(new Request("https://x/api/datos", {
    method: metodo,
    headers: clave === null ? {} : { "x-clave": clave }
  }));

// 1. sin variable de entorno no se guarda nada
delete process.env.CLAVE_PANADERIA;
let r = await pedir("loquesea");
assert.equal(r.status, 503, "sin CLAVE_PANADERIA -> 503");
assert.equal((await r.json()).error, "sin-clave");

// 2. con clave configurada, la que no coincide no entra
process.env.CLAVE_PANADERIA = "una frase larga de la panaderia";
for (const intento of [null, "", "otra", "una frase larga de la panaderi"]) {
  r = await pedir(intento);
  assert.equal(r.status, 401, `clave ${JSON.stringify(intento)} -> 401`);
}

// 3. la correcta pasa la puerta y recién ahí busca el almacén
//    (afuera de Netlify eso falla, que es exactamente lo que se espera)
let llego = false;
try { await pedir("una frase larga de la panaderia"); }
catch (e) { llego = /blobs|environment|siteID|store/i.test(e.message); }
assert.equal(llego, true, "con la clave correcta llega a Netlify Blobs");

console.log("función: ruta, 503 sin clave, 401 con clave mala y paso con la buena — ok");
