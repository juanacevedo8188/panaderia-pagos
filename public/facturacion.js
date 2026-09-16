import {medidas,calcular,dinero} from './facturacion-core.js';
import {crearBorradorPDF} from './facturacion-pdf.js';
const root=document.getElementById('facturacion-app');
const demo=new URLSearchParams(location.search).get('demo')==='1';
const bridge=window.avenidaFacturacion;
const habitual={id:'cliente-senado-santa-fe',cliente:'CAMARA DE SENADORES DE LA PROVINCIA DE SANTA FE',documento:'30999284961',domicilio:'Gral Lopez 3055 - Santa Fe, Santa Fe',condicion:'IVA Sujeto Exento',venta:'Contado'};
const key='avenida-facturacion-borradores-v1'+(demo?'-demo':'');
const blank=()=>({fecha:new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10),emisor:'',cuitEmisor:'',domicilioEmisor:'',cliente:'',documento:'',domicilio:'',condicion:'Consumidor final',venta:'Contado',items:[{descripcion:'',cantidad:'1',medida:'Unidades',precio:''}]});
let data={clientes:[],productos:[],borradores:[],actual:blank()};
let blocked=false,dirty=false;
try{const raw=localStorage.getItem(key);if(raw){const v=JSON.parse(raw);if(!Array.isArray(v.clientes)||!Array.isArray(v.productos)||!Array.isArray(v.borradores)||!Array.isArray(v.actual?.items))throw Error();for(const b of v.borradores)calcular(b.items);data=v;}}catch{blocked=true;}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const opts=(list,val)=>list.map(x=>`<option ${x===val?'selected':''}>${esc(x)}</option>`).join('');
const field=(label,name,value,max=160)=>`<label>${label}<input data-field="${name}" value="${esc(value)}" maxlength="${max}"></label>`;
function message(s){root.querySelector('.fact-status').textContent=s;}
function persist(coleccion,valor,base){
 if(coleccion && !bridge.guardar(coleccion,valor,base)){message('No se pudo guardar la copia local. Revisá el estado de sincronización antes de salir.');return false;}
 if(coleccion==='borradores')bridge.guardar('emisor',Object.fromEntries(['emisor','cuitEmisor','domicilioEmisor'].map(k=>[k,data.actual[k]])));
 if(!blocked){try{localStorage.setItem(key,JSON.stringify(data));}catch{message('No se pudo guardar el formulario local. Revisá la sincronización.');return false;}}
 dirty=false;
 return true;
}
function syncLabel(){const s=bridge.estado();return s.demo?'Demostración: datos de prueba, sin conexión real.':s.conectado?(s.pendientes?'Cambios pendientes de sincronizar. Revisá el estado de conexión en la cabecera.':'Vinculado a la planilla compartida. Revisá el estado de conexión en la cabecera.'):'Sin conexión configurada: conectá la planilla desde Ajustes para compartir estos datos.';}
let snapshot='';
function recibir(){
 const f=bridge.leer(),next=JSON.stringify(f);
 if(next===snapshot)return;
 // Mantener lo que se está escribiendo y esperar a que termine la edición de un campo.
 if(root.contains(document.activeElement)&&/^(INPUT|SELECT)$/.test(document.activeElement.tagName))return;
 if(root.querySelector('#fact-form'))read();
 snapshot=next;if(!data.actual.emisor)Object.assign(data.actual,f.emisor);data.clientes=f.clientes;data.productos=f.productos;data.borradores=f.borradores;
 render();
}
// Importación aditiva: conservar las copias antiguas, sin reemplazar registros compartidos.
const shared=bridge.leer();
if(!blocked && !data.migrado){
 for(const collection of ['clientes','productos','borradores']){
  for(const old of data[collection]){
   const id=old.id||(collection==='clientes'?'cliente-'+(old.documento||old.cliente):'producto-'+old.descripcion+'-'+old.medida);
   if(!shared[collection].some(x=>x.id===id))bridge.guardar(collection,{...old,id,revision:old.revision||crypto.randomUUID()});
  }
 }
 data.migrado=true;try{localStorage.setItem(key,JSON.stringify(data));}catch{}
}
if(!demo&&!bridge.leer().clientes.some(x=>x.id===habitual.id||x.documento===habitual.documento))bridge.guardar('clientes',habitual);
const initial=bridge.leer();
data.clientes=initial.clientes;data.productos=initial.productos;data.borradores=initial.borradores;
if(!data.actual.emisor)Object.assign(data.actual,initial.emisor);
if(!demo&&!data.actual.cliente)Object.assign(data.actual,habitual,{id:data.actual.id});
snapshot=JSON.stringify(initial);
function render(){const a=data.actual;
 root.innerHTML=`<section class="fact-tools"><span class="eyebrow">Herramientas / Facturación</span><h2>Prepará tu próxima factura</h2>
 <p class="fact-notice"><strong>Borradores sin validez fiscal.</strong> ARCA todavía no está conectado. No se emiten facturas ni se registran ventas desde esta herramienta.</p>
 <p>Clientes, productos y borradores guardados se comparten con la planilla y se incluyen en el respaldo JSON. El formulario sin guardar queda en este dispositivo.</p><p id="fact-sync-label">${esc(syncLabel())}</p>
 <p class="fact-status" role="status" aria-live="polite"></p>
 <form id="fact-form"><h3>Emisor</h3><p>Datos para la vista previa. Completalos una vez y guardá el borrador para recordarlos.</p><div class="fact-grid">${field('Nombre o razón social','emisor',a.emisor)}${field('CUIT del emisor','cuitEmisor',a.cuitEmisor,13)}${field('Domicilio comercial','domicilioEmisor',a.domicilioEmisor)}<label>Fecha<input data-field="fecha" type="date" value="${esc(a.fecha)}" required></label></div>
 <h3>Cliente</h3><label>Clientes guardados<select id="fact-clientes"><option value="">Elegí un cliente</option>${data.clientes.map((x,i)=>`<option value="${i}">${esc(x.cliente)}</option>`).join('')}</select></label><div class="fact-grid">${field('Nombre o razón social del cliente','cliente',a.cliente)}${field('CUIT / DNI del cliente (si corresponde)','documento',a.documento,20)}${field('Domicilio del cliente','domicilio',a.domicilio)}<label>Condición frente al IVA<select data-field="condicion">${opts(['Consumidor final','IVA Sujeto Exento','Responsable Monotributo','IVA Responsable Inscripto'],a.condicion)}</select></label><label>Condición de venta<select data-field="venta">${opts(['Contado','Cuenta corriente'],a.venta)}</select></label></div>
 <div class="fact-actions"><button type="button" data-action="cliente">Guardar cliente</button></div>
 <h3>Productos y cantidades</h3><p>Precio por la medida elegida: por docena, por kg, etc. Usá coma o punto para decimales, sin separadores de miles. Hasta 3 decimales en cantidad y 2 en precio.</p>
 <label>Agregar producto guardado<select id="fact-productos"><option value="">Elegí un producto</option>${data.productos.map((x,i)=>`<option value="${i}">${esc(x.descripcion)} · ${esc(x.medida)}</option>`).join('')}</select></label>
 <div>${a.items.map((x,i)=>`<div class="fact-item" data-index="${i}"><label>Descripción ${i+1}<input data-item="descripcion" value="${esc(x.descripcion)}" maxlength="180" required></label><label>Cantidad ${i+1}<input data-item="cantidad" inputmode="decimal" value="${esc(x.cantidad)}" required></label><label>Medida ${i+1}<select data-item="medida">${opts(medidas,x.medida)}</select></label><label>Precio por medida ${i+1}<input data-item="precio" inputmode="decimal" value="${esc(x.precio)}" required></label><div class="fact-actions"><button type="button" data-action="producto" data-row="${i}">Guardar producto ${i+1}</button><button type="button" data-action="quitar" data-row="${i}" ${a.items.length===1?'disabled':''}>Quitar renglón ${i+1}</button></div></div>`).join('')}</div>
 <div class="fact-actions"><button type="button" data-action="agregar">Agregar renglón</button><button type="submit" class="fact-primary">Ver vista previa</button><button type="button" data-action="guardar">Guardar borrador</button><button type="button" data-action="pdf">Descargar borrador PDF</button><button type="button" data-action="nuevo">Nuevo borrador</button></div></form>
 <div id="fact-preview" hidden></div><p><button disabled>Emitir factura · ARCA pendiente</button></p>
 <details class="fact-arca"><summary>Conexión directa con ARCA · Configuración pendiente</summary><p>Para habilitar la emisión se necesita un certificado digital autorizado para WSFE, su clave privada guardada en el servidor y un punto de venta específico para Web Services. No ingreses tu clave fiscal en esta página.</p><p>Primero se debe probar la integración en homologación. Este módulo todavía no envía solicitudes de emisión a ARCA.</p><p><a href="https://www.afip.gob.ar/ws/documentacion/wsaa.asp" target="_blank" rel="noopener">Certificados y autorización de ARCA</a> · <a href="https://www.afip.gob.ar/fe/emision-autorizacion/solicitud-autorizacion.asp" target="_blank" rel="noopener">Puntos de venta y emisión</a></p></details><h3>Borradores guardados</h3><div class="fact-history">${data.borradores.length?data.borradores.map((x,i)=>`<article><div class="fact-summary"><span>${esc(x.fecha)} · ${esc(x.cliente)}<br><small>${x.conflicto?'Edición simultánea: copia conservada · ':''}Borrador sin validez fiscal</small></span><strong>${dinero(calcular(x.items).total)}</strong></div><div class="fact-actions"><button data-action="abrir" data-row="${i}">Abrir borrador ${i+1}</button><button data-action="repetir" data-row="${i}">Repetir borrador ${i+1}</button></div></article>`).join(''):'<p>Todavía no guardaste borradores.</p>'}</div></section>`;
 if(blocked)message('No se pudo leer el formulario local. Los datos compartidos siguen disponibles.');
}
function read(){root.querySelectorAll('[data-field]').forEach(e=>data.actual[e.dataset.field]=e.value.trim());root.querySelectorAll('[data-index]').forEach(row=>row.querySelectorAll('[data-item]').forEach(e=>data.actual.items[Number(row.dataset.index)][e.dataset.item]=e.value.trim()));}
function valid(){read();if(!data.actual.emisor||!data.actual.cliente||!data.actual.fecha)throw Error('Completá emisor, cliente y fecha.');return calcular(data.actual.items);}
function preview(){const c=valid(),a=data.actual,p=root.querySelector('#fact-preview');p.hidden=false;p.className='fact-preview';p.innerHTML=`<h3>BORRADOR · SIN VALIDEZ FISCAL</h3><p>${esc(a.emisor)} · CUIT ${esc(a.cuitEmisor||'pendiente')}<br>${esc(a.domicilioEmisor)}</p><p>${esc(a.fecha)} · ${esc(a.venta)}<br>Cliente: ${esc(a.cliente)} · ${esc(a.documento)}<br>${esc(a.domicilio)} · ${esc(a.condicion)}</p>${c.filas.map(x=>`<p class="fact-summary"><span>${esc(x.descripcion)}<br>${x.cantidad.toLocaleString('es-AR')} ${esc(x.medida)} × ${dinero(x.precio)}</span><strong>${dinero(x.centavos/100)}</strong></p>`).join('')}<p class="fact-total">Total: ${dinero(c.total)}</p><p>No autorizado por ARCA. Sin número fiscal, CAE ni QR.</p>`;return c;}
function download(){preview();const bytes=crearBorradorPDF(data.actual);const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));const link=document.createElement('a');link.href=url;link.download=`avenida-borrador-${data.actual.fecha}.pdf`;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);message('Borrador PDF generado. No es una factura fiscal.');}
root.addEventListener('input',()=>{dirty=true;root.querySelector('#fact-preview').hidden=true;});
root.addEventListener('change',e=>{read();dirty=true;root.querySelector('#fact-preview').hidden=true;
 if(e.target.id==='fact-clientes'&&e.target.value!==''){const selected=data.clientes[Number(e.target.value)];Object.assign(data.actual,Object.fromEntries(['cliente','documento','domicilio','condicion','venta'].map(k=>[k,selected[k]])));render();}
 if(e.target.id==='fact-productos'&&e.target.value!==''){const p={...data.productos[Number(e.target.value)],cantidad:'1'};if(data.actual.items.length===1&&!data.actual.items[0].descripcion&&!data.actual.items[0].precio)data.actual.items=[p];else data.actual.items.push(p);render();}
});
root.addEventListener('submit',e=>{e.preventDefault();try{preview();message('Vista previa actualizada.');}catch(err){message(err.message);}});
root.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b)return;try{
 read();const a=data.actual,i=Number(b.dataset.row);
 switch(b.dataset.action){
 case 'agregar':a.items.push({descripcion:'',cantidad:'1',medida:'Unidades',precio:''});dirty=true;render();break;
 case 'quitar':a.items.splice(i,1);dirty=true;render();break;
 case 'cliente':{if(!a.cliente)throw Error('Completá el nombre del cliente.');const x=Object.fromEntries(['cliente','documento','domicilio','condicion','venta'].map(k=>[k,a[k]]));const n=data.clientes.findIndex(c=>c.cliente===x.cliente&&c.documento===x.documento);x.id=n<0?crypto.randomUUID():data.clientes[n].id;if(n<0)data.clientes.push(x);else data.clientes[n]=x;if(persist('clientes',x)){render();message('Cliente guardado. '+syncLabel());}break;}
 case 'producto':{calcular([a.items[i]]);const x={...a.items[i],cantidad:'1'};const n=data.productos.findIndex(p=>p.descripcion===x.descripcion&&p.medida===x.medida);x.id=n<0?crypto.randomUUID():data.productos[n].id;if(n<0)data.productos.push(x);else data.productos[n]=x;if(persist('productos',x)){render();message('Producto guardado. '+syncLabel());}break;}
 case 'guardar':{valid();const copy=structuredClone(a);copy.id=copy.id||crypto.randomUUID();const base=copy.revision;copy.revision=crypto.randomUUID();a.id=copy.id;a.revision=copy.revision;const n=data.borradores.findIndex(x=>x.id===copy.id);if(n<0)data.borradores.unshift(copy);else data.borradores[n]=copy;if(persist('borradores',copy,base)){render();message('Borrador guardado. '+syncLabel());}break;}
 case 'pdf':download();break;
 case 'nuevo':if(dirty&&!confirm('Hay cambios sin guardar. ¿Crear otro borrador?'))return;data.actual={...blank(),...(!demo?(data.clientes.find(x=>x.id===habitual.id)||habitual):{}),id:undefined,...Object.fromEntries(['emisor','cuitEmisor','domicilioEmisor'].map(k=>[k,a[k]]))};dirty=false;render();break;
 case 'abrir':case 'repetir':if(dirty&&!confirm('Hay cambios sin guardar. ¿Continuar?'))return;data.actual=structuredClone(data.borradores[i]);if(b.dataset.action==='repetir'){delete data.actual.id;delete data.actual.revision;data.actual.fecha=blank().fecha;}dirty=true;render();message('Revisá los datos e importes antes de guardar.');break;
 }
}catch(err){message(err.message);}});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
// Otra pestaña puede guardar: bloquear evita sobrescribir esos cambios silenciosamente.
window.addEventListener('storage',e=>{if(e.key===key){blocked=true;message('El formulario cambió en otra pestaña. Guardá tu borrador antes de recargar.');}});
render();

setInterval(()=>{recibir();const label=root.querySelector('#fact-sync-label');if(label)label.textContent=syncLabel();},1500);
