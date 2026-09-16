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
const JS = PAGINA.match(/<script>([\s\S]*?)<\/script>/)[1] +
  "\nglobalThis.__t = { get datos(){return datos}, set datos(v){datos=v}, sinc, op, aplicar, normalizar, empujar, traer, conectar, desconectar, uid, claveSemana, inicioDe, congelar, registrar, ventasSemana, ventasDia, gastosDe, objetivoDe, objetivoHabitual, tarifaDe, diasTrabajados, descongelar, pagosDe, balanceSemana, resumenSemana, metricasDashboard, get inicioVista(){return inicioVista}, set inicioVista(v){inicioVista=v} };\n";

// --- servidor de mentira ---
let servidor = { version: 0, datos: null, fecha: null };
const CLAVE_OK = "pan2026";
let peticiones = [];
let bloquearRespuesta = false, respuestaBloqueada = null;
let caido = false;                    // simula el wifi de la panadería

function crearDispositivo(nombre){
  const almacen = new Map();
  const elem = () => ({
    _h: "", addEventListener(){}, focus(){}, querySelector(){ return null; },
    set innerHTML(v){ this._h = v; }, get innerHTML(){ return this._h; },
    textContent: "", value: "", disabled: false, hidden: false,
    dataset: {}, lastElementChild: null,
    classList: { toggle(){}, add(){}, remove(){}, contains(){ return false; } },
    setAttribute(){}, getAttribute(){ return null; }
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
      const respuesta = resp({ version: servidor.version, fecha: servidor.fecha });
      if (bloquearRespuesta){ bloquearRespuesta = false; await new Promise(r => { respuestaBloqueada = r; }); }
      return respuesta;
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
bauti.op({ t:"emp+", emp:{ id:"e1", nombre:"Marta", modo:"semana", monto:250000, extra:0, dias:[0,1,2,3,4,5,6] } });
bauti.op({ t:"emp+", emp:{ id:"e2", nombre:"Jorge", modo:"dia", monto:40000, extra:8000, dias:[0,2,3,4,5,6] } });
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
bauti.op({ t:"todo=", datos:{
  empleados:[{ id:"z1", nombre:"Restaurado", modo:"semana", monto:1, extra:0, dias:[0,1,2,3,4,5,6] }],
  pagos:[], turnos:{}, gastos:[], dias:{}, ventas:{}, objetivos:{}
} });
await esperar();
await mama.traer();
assert.equal(mama.datos.empleados.map(e => e.nombre).join(","), "Restaurado", "el respaldo reemplaza la planilla en los dos");
assert.equal(mama.datos.pagos.length, 0);
console.log("9. restauración de respaldo: ok");

/* ============ 10. objetivos congelados por semana ============ */
const SEMANA = bauti.claveSemana(bauti.inicioDe(new Date("2026-09-16T12:00")));
assert.equal(SEMANA, "2026-09-13", "el miércoles 16 cae en la semana del domingo 13");

// una semana congelada con el formato viejo (un número suelto)
mama.op({ t:"obj=", clave:SEMANA, empId:"z1", valor:500 });
mama.op({ t:"emp=", id:"z1", monto:900 });
await esperar();
await bauti.traer();
assert.equal(bauti.datos.objetivos[SEMANA].z1, 500, "la tarifa congelada no se mueve");
assert.equal(bauti.datos.empleados[0].monto, 900, "el aumento sí viaja");
assert.equal(bauti.objetivoDe(bauti.datos.empleados[0], SEMANA), 500,
  "en la semana congelada sigue valiendo lo de antes");
console.log("10. tarifas congeladas: ok");

/* ============ 11. facturación por turno ============ */
const MARTES = "2026-09-08";
bauti.op({ t:"turno=", fecha:MARTES, turno:"m", valor:120000 });
mama .op({ t:"turno=", fecha:MARTES, turno:"t", valor:90000 });
await esperar();
await bauti.traer();
assert.deepEqual(bauti.datos.turnos[MARTES], { m:120000, t:90000 }, "los turnos de los dos conviven");

const domingo = bauti.inicioDe(new Date(MARTES + "T12:00"));
const SEM_MARTES = bauti.claveSemana(domingo);
assert.equal(bauti.ventasDia(MARTES), 210000, "el día suma sus dos turnos");
assert.equal(bauti.ventasSemana(domingo, SEM_MARTES), 210000, "la semana suma los días cargados");

// cargar de nuevo el mismo turno corrige el monto, no lo duplica
bauti.op({ t:"turno=", fecha:MARTES, turno:"m", valor:130000 });
await esperar();
assert.equal(bauti.ventasDia(MARTES), 220000, "recargar un turno lo reemplaza");

// borrar un turno lo saca de la suma, también en el otro dispositivo
mama.op({ t:"turno=", fecha:MARTES, turno:"m", valor:null });
await esperar();
await bauti.traer();
assert.equal(bauti.datos.turnos[MARTES].m, undefined, "el turno borrado no vuelve");
assert.equal(bauti.ventasSemana(domingo, SEM_MARTES), 90000, "y la semana se recalcula");
console.log("11. facturación por turno: ok");

/* ============ 12. semanas cargadas a mano antes de los turnos ============ */
const domViejo = bauti.inicioDe(new Date("2026-07-22T12:00"));
const SEM_VIEJA = bauti.claveSemana(domViejo);
bauti.op({ t:"ventas=", clave:SEM_VIEJA, valor:4000000 });
assert.equal(bauti.ventasSemana(domViejo, SEM_VIEJA), 4000000, "sin turnos vale el total cargado a mano");
console.log("12. semanas viejas cargadas a mano: ok");

/* ============ 13. costos generales ============ */
bauti.op({ t:"gasto+", gasto:{ id:"g-harina", fecha:MARTES, monto:450000, concepto:"harina" } });
mama .op({ t:"gasto+", gasto:{ id:"g-luz",    fecha:MARTES, monto:80000,  concepto:"luz" } });
await esperar();
await bauti.traer();
assert.equal(bauti.gastosDe(domingo).length, 2, "los costos de los dos conviven");
assert.equal(bauti.gastosDe(domingo).reduce((a, g) => a + g.monto, 0), 530000, "y suman");

// un costo de otra semana no entra en esta
bauti.op({ t:"gasto+", gasto:{ id:"g-viejo", fecha:"2026-07-22", monto:999, concepto:"alquiler" } });
assert.equal(bauti.gastosDe(domingo).length, 2, "cada costo cae en su semana");

mama.op({ t:"gasto-", id:"g-harina" });
await esperar();
await bauti.traer();
assert.equal(bauti.gastosDe(domingo).map(g => g.concepto).join(","), "luz", "el costo borrado no vuelve");
console.log("13. costos generales: ok");


/* ============ 14. la semana va de domingo a sábado ============ */
assert.equal(bauti.claveSemana(bauti.inicioDe(new Date("2026-09-13T12:00"))), "2026-09-13", "el domingo abre la semana");
assert.equal(bauti.claveSemana(bauti.inicioDe(new Date("2026-09-19T12:00"))), "2026-09-13", "el sábado 19 todavía es esa semana");
assert.equal(bauti.claveSemana(bauti.inicioDe(new Date("2026-09-20T12:00"))), "2026-09-20", "el domingo 20 ya es la siguiente");

const dom13 = bauti.inicioDe(new Date("2026-09-13T12:00"));
bauti.op({ t:"gasto+", gasto:{ id:"g-dom", fecha:"2026-09-13", monto:1, concepto:"domingo" } });
bauti.op({ t:"gasto+", gasto:{ id:"g-sab", fecha:"2026-09-19", monto:2, concepto:"sábado" } });
bauti.op({ t:"gasto+", gasto:{ id:"g-sig", fecha:"2026-09-20", monto:4, concepto:"domingo siguiente" } });
assert.equal(bauti.gastosDe(dom13).reduce((a, g) => a + g.monto, 0), 3,
  "el domingo y el sábado entran; el domingo siguiente no");
console.log("14. semana de domingo a sábado: ok");

/* ============ 15. pago por día ============ */
bauti.op({ t:"emp+", emp:{ id:"j1", nombre:"Bereniz", modo:"dia", monto:21430, extra:0, dias:[] } });
bauti.op({ t:"emp+", emp:{ id:"j2", nombre:"German",  modo:"dia", monto:40000, extra:8000, dias:[0,2,3,4,5,6] } });
await esperar();
const ber = () => bauti.datos.empleados.find(e => e.id === "j1");
const ger = () => bauti.datos.empleados.find(e => e.id === "j2");

// German tiene días fijos: la semana sale del patrón
assert.equal(bauti.objetivoHabitual(ger()), 288000, "6 días × (40.000 + 8.000 de cole)");
assert.equal(bauti.objetivoDe(ger(), "2026-10-04"), 288000, "y vale para cualquier semana sin marcar");

// Bereniz cubre: sin días marcados no le corresponde nada
assert.equal(bauti.objetivoDe(ber(), "2026-09-13"), 0, "sin días marcados no hay nada que pagarle");
bauti.op({ t:"dias=", clave:"2026-09-13", empId:"j1", dias:[0, 3] });
await esperar();
assert.equal(bauti.objetivoDe(ber(), "2026-09-13"), 42860, "dos días cubiertos");

// los días de una semana no se contagian a otra
assert.equal(bauti.objetivoDe(ber(), "2026-09-20"), 0, "la semana siguiente arranca en cero");

// congelar la tarifa no congela los días: el aumento no entra, el día sí
bauti.op({ t:"obj=", clave:"2026-09-13", empId:"j1", valor:{ modo:"dia", monto:21430, extra:0 } });
bauti.op({ t:"emp=", id:"j1", monto:30000 });
await esperar();
assert.equal(bauti.objetivoDe(ber(), "2026-09-13"), 42860, "el aumento no reescribe la semana congelada");
bauti.op({ t:"dias=", clave:"2026-09-13", empId:"j1", dias:[0, 3, 5] });
await esperar();
assert.equal(bauti.objetivoDe(ber(), "2026-09-13"), 64290, "pero un día más sí, porque es un hecho de esa semana");

// y viaja al otro dispositivo
await mama.traer();
assert.deepEqual(mama.datos.dias["2026-09-13"].j1, [0, 3, 5], "los días marcados los ve el otro");
console.log("15. pago por día y días por semana: ok");

/* ============ 16. datos de la versión anterior ============ */
const viejo = bauti.normalizar({
  empleados:[{ id:"v1", nombre:"Antiguo", semanal:180000 }],
  pagos:[], turnos:{}, gastos:[],
  ventas:{ "2026-W38": 999 },
  objetivos:{ "2026-W38": { v1: 180000 } }
});
assert.equal(viejo.empleados[0].modo, "semana", "el que cobraba por semana sigue por semana");
assert.equal(viejo.empleados[0].monto, 180000, "semanal pasa a monto");
assert.equal(viejo.empleados[0].semanal, undefined, "y el campo viejo se va");
assert.equal(viejo.empleados[0].dias.length, 7);

const k = Object.keys(viejo.ventas)[0];
assert.match(k, /^\d{4}-\d{2}-\d{2}$/, "la semana ISO pasa a ser una fecha");
assert.equal(new Date(k + "T12:00").getDay(), 0, "y esa fecha es un domingo");
assert.equal(viejo.ventas[k], 999, "sin perder el valor");
assert.equal(viejo.objetivos[k].v1, 180000, "ni la tarifa congelada");

const dosVeces = bauti.normalizar(bauti.normalizar(viejo));
assert.equal(Object.keys(dosVeces.ventas).length, 1, "migrar dos veces no duplica nada");
assert.equal(dosVeces.empleados[0].monto, 180000);
console.log("16. migración de datos viejos: ok");


/* ============ 17. un aumento no reescribe una semana ya pagada ============ */
// German viene de la prueba 15: $50.000 por día desde el aumento anterior,
// más $8.000 de cole, seis días.
bauti.op({ t:"emp=", id:"j2", monto:40000 });

// semana del 13: se le paga algo y la tarifa queda congelada
bauti.inicioVista = bauti.inicioDe(new Date("2026-09-13T12:00"));
bauti.op({ t:"pago+", pago:{ id:"p-ger", empId:"j2", fecha:"2026-09-15", monto:100000, medio:"efectivo" } });
bauti.congelar("2026-09-13");
assert.equal(bauti.objetivoDe(ger(), "2026-09-13"), 288000, "6 × (40.000 + 8.000)");

// el aumento se carga mirando esa misma semana: no la tiene que tocar
bauti.op({ t:"emp=", id:"j2", monto:50000 });
bauti.descongelar("j2");
assert.equal(bauti.objetivoDe(ger(), "2026-09-13"), 288000,
  "la semana que ya cobró queda como estaba");
assert.equal(bauti.objetivoDe(ger(), "2026-09-20"), 348000,
  "y el aumento entra desde la semana siguiente");

// en una semana donde a él no se le pagó nada, corregir el monto sí entra
bauti.inicioVista = bauti.inicioDe(new Date("2026-09-20T12:00"));
bauti.congelar("2026-09-20");                 // como si se le hubiera pagado a otro
bauti.op({ t:"emp=", id:"j2", monto:60000 });
bauti.descongelar("j2");
assert.equal(bauti.objetivoDe(ger(), "2026-09-20"), 408000,
  "si él no cobró nada esa semana, el monto corregido vale igual");
await esperar();
console.log("17. aumentos y semanas ya pagadas: ok");


/* 18. El exceso de una persona no compensa la deuda con otra. */
const calculos=crearDispositivo("calculos");
calculos.datos=calculos.normalizar({empleados:[{id:"a",nombre:"A",modo:"semana",monto:100000},{id:"b",nombre:"B",modo:"semana",monto:100000}],pagos:[{id:"pa",empId:"a",fecha:"2026-09-15",monto:120000,medio:"efectivo"}],turnos:{"2026-09-15":{m:500000}},gastos:[]});
const inicio=calculos.inicioDe(new Date("2026-09-15T12:00"));
assert.equal(calculos.balanceSemana(inicio).pendiente,100000);
assert.equal(calculos.balanceSemana(inicio).excedente,20000);
assert.equal(calculos.balanceSemana(inicio).resultado,300000);
calculos.op({t:"emp=",id:"a",bajaDesde:"2026-09-20"});
assert.equal(calculos.objetivoDe(calculos.datos.empleados[0],"2026-09-13"),100000);
assert.equal(calculos.objetivoDe(calculos.datos.empleados[0],"2026-09-20"),0);
assert.equal(calculos.datos.pagos.length,1);
console.log("18. saldos individuales, resultado y baja sin borrar historial: ok");
calculos.inicioVista=inicio;
calculos.datos.turnos["2026-09-08"]={m:250000,t:999999};
const metricas=calculos.metricasDashboard(inicio);
assert.equal(metricas.pares,1,"compara únicamente turnos cargados en ambas semanas");
assert.equal(metricas.variacion,100,"500000 / 250000 - 1 = 100%");
assert.equal(metricas.promedio,500000);
assert.equal(metricas.avance,50,"exceso no aumenta la cobertura de otro empleado");
assert.equal(metricas.pesoGastos,0);
delete calculos.datos.turnos["2026-09-08"];
assert.equal(calculos.metricasDashboard(inicio).variacion,null,"sin base no inventa variación");
console.log("Dashboard: turnos comparables, promedio y cobertura individual: ok");


/* 19. Un pago que llega mientras esperamos un PUT no desaparece de la cola. */
await bauti.empujar();
bloquearRespuesta=true;
bauti.op({t:"pago+",pago:{id:"p-enviado",empId:"j2",fecha:"2026-09-22",monto:1000,medio:"efectivo"}});
const enVuelo=bauti.empujar();
await esperar(30);
assert.ok(respuestaBloqueada,"la respuesta queda demorada");
bauti.op({t:"pago+",pago:{id:"p-durante",empId:"j2",fecha:"2026-09-22",monto:2000,medio:"efectivo"}});
respuestaBloqueada();
await enVuelo;
assert.equal(bauti.sinc.pendientes.length,1,"solo se quita el lote confirmado");
await esperar();
assert.ok(servidor.datos.pagos.some(p=>p.id==="p-enviado"));
assert.ok(servidor.datos.pagos.some(p=>p.id==="p-durante"));
assert.equal(bauti.sinc.pendientes.length,0);
console.log("19. carga durante una respuesta demorada: ok");

console.log("\nTODO OK — " + peticiones.length + " llamadas al servidor, versión final " + servidor.version);

process.exit(0);
