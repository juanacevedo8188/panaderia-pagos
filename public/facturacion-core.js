// Borradores locales: sin llamadas a ARCA ni cambios en caja o sueldos.
export const medidas = ['Unidades','Docenas','Kg','Gramos','Litros','Metros','Horas','Servicios','Otras'];
export const dinero = n => Number(n).toLocaleString('es-AR',{style:'currency',currency:'ARS'});
export function decimal(s, decimales=2){
  const v=String(s).trim().replace(',','.');
  if(!new RegExp('^\\d+(?:\\.\\d{1,'+decimales+'})?$').test(v)) throw Error('Usá números positivos, sin separadores de miles.');
  const n=Number(v); if(!Number.isFinite(n)||n>100000000) throw Error('El importe o cantidad supera el límite del borrador.');
  return n;
}
export function calcular(items){
 if(!items.length) throw Error('Agregá al menos un producto.');
 const filas=items.map(x=>{
  if(!x.descripcion.trim()) throw Error('Completá la descripción de cada producto.');
  if(!medidas.includes(x.medida)) throw Error('Elegí una unidad de medida válida.');
  const cantidad=decimal(x.cantidad,3),precio=decimal(x.precio,2);
  if(cantidad<=0||precio<=0) throw Error('La cantidad y el precio deben ser mayores a cero.');
  // Cantidad en milésimas y precio en centavos: redondeo por renglón.
  const producto=Math.round(cantidad*1000)*Math.round(precio*100);
  if(!Number.isSafeInteger(producto)) throw Error("La combinación de cantidad y precio es demasiado grande.");
  const subtotal=Math.round(producto/1000);
  if(!Number.isSafeInteger(subtotal)) throw Error('El subtotal es demasiado grande.');
  return {...x,cantidad,precio,centavos:subtotal};
 });
 const centavos=filas.reduce((n,x)=>n+x.centavos,0);
 if(!Number.isSafeInteger(centavos)) throw Error('El total es demasiado grande.');
 return {filas,total:centavos/100};
}
