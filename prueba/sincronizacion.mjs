/* ============================================================
   PRUEBAS DE LA PLANILLA COMPARTIDA
   Corre el JS de la app en dos "dispositivos" simulados contra un
   servidor de mentira, para verificar que dos personas cargando a
   la vez (o una sin internet) no se pisen los datos.

   Se corre con:  npm test
   ============================================================ */
import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert";

// Se prueba el mismo JavaScript que corre en el navegador: se lo saca
// del <script> de la página, sin copiarlo, para que no se desfasen.
const PAGINA = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const JS = PAGINA.match(/<script>([\s\S]*)<\/script>/)[1] +
  "\nglobalThis.__t = { get datos(){return datos}, set datos(v){datos=v}, sinc, op, aplicar, normalizar, empujar, traer, conectar, desconectar, uid, claveSemana, lunesDe, congelar, registrar, ventasSemana, ventasDia, gastosDe };\n";

// --- servidor de mentira ---
let servidor = { version: 0, datos: null, fecha: null };
const CLAVE_OK = "pan2026";
let peticiones = [];
let caido = false;                    // simula el wifi de la panadería

function crearDispositivo(nombre){
  const almacen = new Map();
  const elem = () => ({
    _h: "", addEventListener(){}, focus(){}, querySelector(){ return null; },
    set innerHTML(v){ this._h = v; }, get innerHTML(){ return this._h; },
    textContent: "", value: "", disabled: false, hidden: false,
    dataset: {}, lastElementChild: null
  });
  const elementos = new Map();
  const sandbox = {
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    Math, Date, JSON, Object, Array, String, Number, isNaN, parseFloat, parseInt,
    URL, Blob: class {}, FileReader: class {}, Intl,
    confirm: () => true,
    alert: () => {},
    localStorage: {
      getItem: k => (almacen.has(k) ? almacen.get(k) : null),
      setItem: (k, v) => almacen.set(k, v),
      removeItem: k => almacen.delete(k)
    },
    document: {
      hidden: false, activeElement: null,
      addEventListener(){},
      getElementById(id){
        if (!elementos.has(id)) elementos.set(id, elem());
        return elementos.get(id);
      },
      createElement(){ return elem(); }
    },
    window: { addEventListener(){}, scrollY: 0, scrollTo(){} },
    async fetch(url, opciones = {}){
      const metodo = opciones.method || "GET";
      if (caido) throw new TypeError("Failed to fetch");
      const clave = opciones.headers["x-clave"];
      peticiones.push(`${nombre} ${metodo}`);
      const resp = (cuerpo, status = 200) => ({
        ok: status >= 200 && status < 300, status, json: async () => cuerpo
      });
      if (clave !== CLAVE_OK) return resp({ error: "clave" }, 401);
      if (metodo === "GET") return resp(servidor);
      const { version, datos } = JSON.parse(opciones.body);
      if (version !== servidor.version)
        return resp({ error: "desfasado", version: servidor.version, datos: servidor.datos }, 409);
      servidor = { version: servidor.version + 1, datos, fecha: new Date().toISOString() };
      return resp({ version: servidor.version, fecha: servidor.fecha });
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(JS, sandbox);
  return sandbox.__t;
}

const esperar = (ms = 900) => new Promise(r => setTimeout(r, ms));
const pagosDe = d => d.pagos.map(p => `${p.empId}:${p.monto}`).sort().join(" ");

/* ============ 1. sin clave, todo local ============ */
const bauti = crearDispositivo("bauti");
bauti.op({ t:"emp=", id:"e1", nombre:"Marta" });
bauti.op({ t:"emp+", emp:{ id:"e2", nombre:"Jorge", semanal:300000 } });
assert.equal(bauti.sinc.pendientes.length, 0, "sin clave no se encolan pendientes");
assert.equal(servidor.version, 0, "sin clave no se habla con el servidor");
console.log("1. modo local: ok");

/* ============ 2. clave incorrecta ============ */
await bauti.conectar("mal");
assert.equal(bauti.sinc.estado, "clave", "estado tras clave incorrecta");
assert.equal(bauti.sinc.clave, "", "no guarda una clave incorrecta");
console.log("2. clave incorrecta: ok");

/* ============ 3. primera conexión: sube lo local ============ */
await bauti.conectar(CLAVE_OK);
await esperar();
assert.equal(servidor.version, 1, "el servidor estrena la planilla");
assert.equal(servidor.datos.empleados.length, 2, "subió los dos empleados");
assert.equal(bauti.sinc.pendientes.length, 0, "no quedan pendientes");
assert.equal(bauti.sinc.estado, "ok");
console.log("3. primera subida: ok");

/* ============ 4. el otro dispositivo baja la planilla ============ */
const mama = crearDispositivo("mama");
await mama.conectar(CLAVE_OK);
await esperar();
assert.equal(mama.datos.empleados.map(e => e.nombre).join(","), "Marta,Jorge", "mamá ve el plantel");
assert.equal(mama.sinc.version, 1);
console.log("4. bajada en el otro dispositivo: ok");

/* ============ 5. los dos cargan un pago a la vez ============ */
bauti.op({ t:"pago+", pago:{ id:"p-bauti", empId:"e1", fecha:"2026-09-10", monto:100000, medio:"efectivo" } });
mama .op({ t:"pago+", pago:{ id:"p-mama",  empId:"e2", fecha:"2026-09-10", monto:200000, medio:"transferencia" } });
await esperar();
await esperar();

assert.equal(servidor.version, 3, "quedaron los dos guardados, uno tras otro");
assert.equal(pagosDe(servidor.datos), "e1:100000 e2:200000", "no se perdió ningún pago: " + pagosDe(servidor.datos));
assert.equal(bauti.sinc.pendientes.length, 0);
assert.equal(mama.sinc.pendientes.length, 0);
console.log("5. carga simultánea sin pisarse: ok");

/* ============ 6. cada uno ve lo del otro al sincronizar ============ */
await bauti.traer();
assert.equal(pagosDe(bauti.datos), "e1:100000 e2:200000", "bauti ve el pago de mamá");
await mama.traer();
assert.equal(pagosDe(mama.datos), "e1:100000 e2:200000", "mamá ve el pago de bauti");
console.log("6. cada uno ve lo del otro: ok");

/* ============ 7. borrar en un lado se propaga ============ */
mama.op({ t:"pago-", id:"p-bauti" });
await esperar();
await bauti.traer();
assert.equal(pagosDe(bauti.datos), "e2:200000", "el pago borrado no vuelve");
console.log("7. borrado propagado: ok");

/* ============ 8. se corta internet y vuelve ============ */
caido = true;
const versionAntes = servidor.version;
bauti.op({ t:"emp+", emp:{ id:"e3", nombre:"Sin señal", semanal:50 } });
bauti.op({ t:"pago+", pago:{ id:"p-offline", empId:"e2", fecha:"2026-09-11", monto:5000, medio:"efectivo" } });
await esperar();
assert.equal(servidor.version, versionAntes, "sin red el servidor no se toca");
assert.equal(bauti.sinc.pendientes.length, 2, "los cambios quedan encolados");
assert.equal(bauti.sinc.estado, "error", "avisa que está sin conexión");
assert.equal(bauti.datos.empleados.some(e => e.nombre === "Sin señal"), true, "en pantalla se ven igual");

// mientras tanto, mamá con datos carga otra cosa
caido = false;
mama.op({ t:"pago+", pago:{ id:"p-mientras", empId:"e1", fecha:"2026-09-11", monto:7000, medio:"transferencia" } });
await esperar();

// vuelve la red en el dispositivo de bauti
await bauti.empujar();
await esperar();
assert.equal(bauti.sinc.pendientes.length, 0, "al volver la red se vacía la cola");
assert.equal(servidor.datos.empleados.some(e => e.nombre === "Sin señal"), true, "llegó lo cargado sin señal");
assert.equal(pagosDe(servidor.datos).includes("e2:5000"), true, "llegó el pago cargado sin señal");
assert.equal(pagosDe(servidor.datos).includes("e1:7000"), true, "y no borró lo que cargó mamá mientras tanto");
console.log("8. corte de internet y reconexión: ok");

/* ============ 9. respaldo restaurado reemplaza todo ============ */
bauti.op({ t:"todo=", datos:{ empleados:[{ id:"z1", nombre:"Restaurado", semanal:1 }], pagos:[], ventas:{}, objetivos:{} } });
await esperar();
await mama.traer();
assert.equal(mama.datos.empleados.map(e => e.nombre).join(","), "Restaurado", "el respaldo reemplaza la planilla en los dos");
assert.equal(mama.datos.pagos.length, 0);
console.log("9. restauración de respaldo: ok");

/* ============ 10. objetivos congelados por semana ============ */
mama.op({ t:"obj=", clave:"2026-W37", empId:"z1", valor:500 });
mama.op({ t:"emp=", id:"z1", semanal:900 });
await esperar();
await bauti.traer();
assert.equal(bauti.datos.objetivos["2026-W37"].z1, 500, "el objetivo viejo no se mueve");
assert.equal(bauti.datos.empleados[0].semanal, 900, "el sueldo nuevo sí viaja");
console.log("10. objetivos congelados: ok");

/* ============ 11. facturación por turno ============ */
const MARTES = "2026-09-08";
bauti.op({ t:"turno=", fecha:MARTES, turno:"m", valor:120000 });
mama .op({ t:"turno=", fecha:MARTES, turno:"t", valor:90000 });
await esperar();
await bauti.traer();
assert.deepEqual(bauti.datos.turnos[MARTES], { m:120000, t:90000 }, "los turnos de los dos conviven");

const lunes = bauti.lunesDe(new Date(MARTES + "T12:00"));
assert.equal(bauti.ventasDia(MARTES), 210000, "el día suma sus dos turnos");
assert.equal(bauti.ventasSemana(lunes, "2026-W37"), 210000, "la semana suma los días cargados");

// cargar de nuevo el mismo turno corrige el monto, no lo duplica
bauti.op({ t:"turno=", fecha:MARTES, turno:"m", valor:130000 });
await esperar();
assert.equal(bauti.ventasDia(MARTES), 220000, "recargar un turno lo reemplaza");

// borrar un turno lo saca de la suma, también en el otro dispositivo
mama.op({ t:"turno=", fecha:MARTES, turno:"m", valor:null });
await esperar();
await bauti.traer();
assert.equal(bauti.datos.turnos[MARTES].m, undefined, "el turno borrado no vuelve");
assert.equal(bauti.ventasSemana(lunes, "2026-W37"), 90000, "y la semana se recalcula");
console.log("11. facturación por turno: ok");

/* ============ 12. semanas cargadas a mano antes de los turnos ============ */
bauti.op({ t:"ventas=", clave:"2026-W30", valor:4000000 });
const lunesViejo = bauti.lunesDe(new Date("2026-07-22T12:00"));
assert.equal(bauti.claveSemana(lunesViejo), "2026-W30");
assert.equal(bauti.ventasSemana(lunesViejo, "2026-W30"), 4000000, "sin turnos vale el total viejo");
console.log("12. semanas viejas cargadas a mano: ok");

/* ============ 13. costos generales ============ */
bauti.op({ t:"gasto+", gasto:{ id:"g-harina", fecha:MARTES, monto:450000, concepto:"harina" } });
mama .op({ t:"gasto+", gasto:{ id:"g-luz",    fecha:MARTES, monto:80000,  concepto:"luz" } });
await esperar();
await bauti.traer();
assert.equal(bauti.gastosDe(lunes).length, 2, "los costos de los dos conviven");
assert.equal(bauti.gastosDe(lunes).reduce((a, g) => a + g.monto, 0), 530000, "y suman");

// un costo de otra semana no entra en esta
bauti.op({ t:"gasto+", gasto:{ id:"g-viejo", fecha:"2026-07-22", monto:999, concepto:"alquiler" } });
assert.equal(bauti.gastosDe(lunes).length, 2, "cada costo cae en su semana");

mama.op({ t:"gasto-", id:"g-harina" });
await esperar();
await bauti.traer();
assert.equal(bauti.gastosDe(lunes).map(g => g.concepto).join(","), "luz", "el costo borrado no vuelve");
console.log("13. costos generales: ok");


console.log("\nTODO OK — " + peticiones.length + " llamadas al servidor, versión final " + servidor.version);

process.exit(0);
