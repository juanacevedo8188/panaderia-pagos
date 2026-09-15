// PDF autónomo: fuentes estándar, texto seleccionable y paginación A4.
// No consulta la red ni altera los registros recibidos.
const dinero = n => '$' + Number(n || 0).toLocaleString('es-AR', {maximumFractionDigits:2});
const latin = s => String(s ?? '').normalize('NFC').replace(/[–—−]/g,'-').replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^\x20-\x7e\xa0-\xff\n]/g,'?');
const literal = s => latin(s).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
function envolver(texto,max){
  const lineas=[];
  for (const parrafo of latin(texto).split('\n')){
    let linea='';
    for (let palabra of parrafo.split(/\s+/)){
      if(linea && linea.length+palabra.length+1>max){lineas.push(linea);linea='';}
      while(palabra.length>max){if(linea){lineas.push(linea);linea='';}lineas.push(palabra.slice(0,max));palabra=palabra.slice(max);}
      if(palabra)linea+=(linea?' ':'')+palabra;
    }
    lineas.push(linea);
  }
  return lineas;
}
export function crearInformePDF(informe){
  const pages=[];let ops=[],y=0;
  const W=595.28,H=841.89,M=40,ancho=W-2*M;
  const rect=(x,top,w,h,color)=>ops.push(`${color} rg ${x} ${H-top-h} ${w} ${h} re f`);
  const text=(s,x,top,size=10,font='F1',color='0.16 0.19 0.29')=>ops.push(`BT /${font} ${size} Tf ${color} rg 1 0 0 1 ${x} ${H-top-size} Tm (${literal(s)}) Tj ET`);
  const nueva=()=>{
    if(ops.length)pages.push(ops);
    ops=[];rect(0,0,W,78,'0.20 0.24 0.40');text('AVENIDA',M,19,21,'F2','1 1 1');
    text('BAKERY & CANDYSHOP | INFORME SEMANAL',M,49,9,'F1','0.84 0.88 0.96');
    text(`${informe.semana} al ${informe.fin}`,M,92,12,'F2');
    y=119;
  };
  const espacio=h=>{if(y+h>H-53)nueva();};
  const parrafo=(s,color='0.36 0.39 0.46')=>{for(const line of envolver(s,91)){espacio(15);text(line,M,y,9,'F1',color);y+=14;}y+=6;};
  const titulo=s=>{espacio(125);y+=9;text(s,M,y,13,'F2');y+=25;};
  const tabla=(heads,rows,widths)=>{
    const cabecera=()=>{rect(M,y,ancho,25,'0.91 0.93 0.97');let x=M;heads.forEach((s,i)=>{text(s,x+6,y+7,9,'F2');x+=widths[i];});y+=25;};
    espacio(45);cabecera();
    if(!rows.length)rows=[['Sin registros para esta semana.']];
    rows.forEach((row,idx)=>{
      const lines=widths.map((w,i)=>envolver(row[i]??'',Math.max(3,Math.floor((w-12)/5.1))));
      const count=Math.max(...lines.map(l=>l.length));let offset=0;
      while(offset<count){
        if(y+24>H-53){nueva();cabecera();}
        const cantidad=Math.min(count-offset,Math.floor((H-53-y-10)/12));
        const h=cantidad*12+10;
        if(idx%2===0)rect(M,y,ancho,h,'0.97 0.98 0.99');
        let x=M;lines.forEach((ls,i)=>{ls.slice(offset,offset+cantidad).forEach((s,j)=>text(s,x+6,y+5+j*12,8.5,'F3'));x+=widths[i];});
        y+=h;offset+=cantidad;
      }
    });y+=12;
  };
  nueva();
  parrafo(`Generado: ${informe.generado}. ${informe.demo?'DEMOSTRACION: datos ficticios. ':''}${informe.estado||''}`);
  const e=informe.empleados,p=informe.pagos,g=informe.gastos,v=informe.ventas;
  const sueldos=e.reduce((s,x)=>s+x.objetivo,0),pagado=p.reduce((s,x)=>s+x.monto,0),costos=g.reduce((s,x)=>s+x.monto,0),ventas=informe.totalVentas;
  titulo('Resumen de la semana');
  tabla(['Concepto','Importe'],[
    ['Ventas registradas',dinero(ventas)],['Sueldos previstos',dinero(sueldos)],['Pagos entregados',dinero(pagado)],
    ['Pendiente al personal',dinero(e.reduce((s,x)=>s+x.pendiente,0))],['Pagos excedidos (no compensan otras deudas)',dinero(e.reduce((s,x)=>s+x.excedente,0))],
    ['Gastos registrados',dinero(costos)],['Resultado estimado',dinero(ventas-sueldos-costos)]
  ],[360,ancho-360]);
  parrafo('Resultado estimado = ventas registradas - sueldos previstos - gastos. Incluye sueldos de toda la semana; no representa efectivo disponible ni ganancia contable definitiva. Las cargas pueden estar incompletas.');
  titulo('Personal: previsto, entregado y pendiente');
  tabla(['Empleado','Previsto','Entregado','Pendiente','Excedente'],e.map(x=>[x.nombre,dinero(x.objetivo),dinero(x.pagado),dinero(x.pendiente),dinero(x.excedente)]),[155,90,90,90,ancho-425]);
  titulo('Detalle de pagos');
  tabla(['Fecha','Empleado','Medio / operador','Importe'],p.map(x=>[x.fecha,x.nombre,`${x.medio}${x.autor?' / '+x.autor:''}`,dinero(x.monto)]),[78,155,185,ancho-418]);
  titulo('Ventas por dia y turno');
  tabla(['Fecha','Manana','Tarde','Total'],v.map(x=>[x.fecha,x.m==null?'Sin carga':dinero(x.m),x.t==null?'Sin carga':dinero(x.t),x.m==null&&x.t==null?'Sin carga':dinero((x.m||0)+(x.t||0))]),[110,135,135,ancho-380]);
  if(informe.ventasManual)parrafo('Esta semana usa un total historico cargado manualmente, sin detalle por turno.');
  titulo('Detalle de gastos');
  tabla(['Fecha','Concepto','Operador','Importe'],g.map(x=>[x.fecha,x.concepto,x.autor||'-',dinero(x.monto)]),[78,230,110,ancho-418]);
  parrafo('Control interno. No reemplaza recibos de sueldo ni comprobantes. Para restaurar la planilla completa, conserve el respaldo JSON.');
  pages.push(ops);
  pages.forEach((page,i)=>page.push(`BT /F1 8 Tf 0.45 0.48 0.55 rg 1 0 0 1 40 28 Tm (Avenida | ${literal(informe.semana)} | Pagina ${i+1} de ${pages.length}) Tj ET`));
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>'];
  const kids=[];
  pages.forEach(page=>{const id=objects.length+1,stream=page.join('\n');kids.push(`${id} 0 R`);objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${id+1} 0 R >>`);objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);});
  objects[1]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;
  let pdf='%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';const offsets=[0];
  objects.forEach((obj,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;});
  const xref=pdf.length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(n=>pdf+=`${String(n).padStart(10,'0')} 00000 n \n`);
  pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(pdf,c=>c.charCodeAt(0));
}
