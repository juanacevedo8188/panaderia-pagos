/* ============================================================
   PLANILLA COMPARTIDA
   Guarda un único documento JSON en Netlify Blobs y lo protege
   con la clave de la panadería (variable CLAVE_PANADERIA).

   GET  /api/datos            -> { version, datos, fecha }
   PUT  /api/datos            <- { version, datos }
                              -> 200 { version, fecha }
                              -> 409 { version, datos }  si alguien
                                 guardó algo mientras tanto
   ============================================================ */

import { getStore } from "@netlify/blobs";
import { createHash, timingSafeEqual } from "node:crypto";

export const config = { path: "/api/datos" };

const LLAVE = "planilla";
const huella = (s) => createHash("sha256").update(String(s)).digest();

const json = (cuerpo, estado = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });

export function crearHandler(almacen = getStore){
return async (req) => {
  if (process.env.CONTEXT && process.env.CONTEXT !== "production" && process.env.CONTEXT !== "dev")
    return json({ error: "vista-previa", mensaje: "La vista previa no accede a la planilla compartida." }, 403);
  const esperada = process.env.CLAVE_PANADERIA;

  // Sin clave configurada no se guarda nada: mejor fallar de entrada
  // que dejar la planilla abierta a cualquiera que pase por la URL.
  if (!esperada)
    return json({ error: "sin-clave" }, 503);

  // Comparación de tiempo constante: no le regala pistas a quien pruebe claves.
  if (!timingSafeEqual(huella(req.headers.get("x-clave") || ""), huella(esperada)))
    return json({ error: "clave" }, 401);

  const store = almacen({ name: "panaderia", consistency: "strong" });

  if (req.method === "GET") {
    const doc = await store.get(LLAVE, { type: "json" });
    return json(doc || { version: 0, datos: null, fecha: null });
  }

  if (req.method === "PUT") {
    let cuerpo;
    try { cuerpo = await req.json(); }
    catch { return json({ error: "json" }, 400); }

    const { version, datos } = cuerpo || {};
    if (!Number.isSafeInteger(version) || version < 0 || !datos || typeof datos !== "object" || Array.isArray(datos) || !Array.isArray(datos.empleados) || !Array.isArray(datos.pagos))
      return json({ error: "formato" }, 400);

    const lectura = await store.getWithMetadata(LLAVE, { type: "json" });
    const actual = lectura ? lectura.data : null;
    const vActual = actual ? actual.version : 0;

    // Alguien guardó entre que este dispositivo leyó y escribió:
    // le devolvemos lo que hay para que rehaga sus cambios encima.
    if (vActual !== version)
      return json({ error: "desfasado", version: vActual, datos: actual ? actual.datos : null }, 409);

    // Una pestaña vieja no conoce facturación: conservarla en lugar de borrarla.
    if (!Object.hasOwn(datos, 'facturacion') && actual?.datos?.facturacion)
      datos.facturacion = actual.datos.facturacion;
    const nuevo = { version: vActual + 1, datos, fecha: new Date().toISOString() };
    // El ETag hace indivisible la comprobación y escritura en Blobs.
    if (lectura && !lectura.etag) return json({ error: "sin-etag" }, 503);
    const escritura = await store.setJSON(LLAVE, nuevo,
      lectura ? { onlyIfMatch:lectura.etag } : { onlyIfNew:true });
    if (!escritura.modified){
      const remoto = await store.get(LLAVE, { type:"json" });
      return json({ error:"desfasado", version:remoto?.version || 0, datos:remoto?.datos || null },409);
    }
    return json({ version: nuevo.version, fecha: nuevo.fecha });
  }

  return json({ error: "metodo" }, 405);
};

}
export default crearHandler();
