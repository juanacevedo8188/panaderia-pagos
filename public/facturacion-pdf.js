import {calcular,dinero} from './facturacion-core.js';
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
export function crearBorradorPDF(a){
 const c=calcular(a.items),pages=[];let ops=[],y=0;
 const W=595.28,H=841.89;
 const text=(s,x,top,size=10)=>ops.push(`BT /F1 ${size} Tf 0.15 0.18 0.28 rg 1 0 0 1 ${x} ${H-top-size} Tm (${literal(s)}) Tj ET`);
 const nueva=()=>{if(ops.length)pages.push(ops);ops=[];text('AVENIDA | BORRADOR',40,30,18);text('SIN VALIDEZ FISCAL - NO AUTORIZADO POR ARCA',40,60,11);y=95;};
 const line=s=>{for(const t of envolver(s,82)){if(y>755)nueva();text(t,40,y);y+=16;}};
 nueva();line('Emisor: '+a.emisor);line('CUIT: '+(a.cuitEmisor||'Pendiente'));line('Domicilio: '+a.domicilioEmisor);line('Fecha: '+a.fecha+' | Venta: '+a.venta);line('Cliente: '+a.cliente);line('Documento: '+(a.documento||'Sin informar'));line('Domicilio: '+a.domicilio);line('Condicion frente al IVA: '+a.condicion);y+=14;
 for(const x of c.filas){const desc=envolver(x.descripcion,82);if(y+(desc.length+2)*16>755)nueva();line(x.descripcion);line(`${x.cantidad.toLocaleString('es-AR')} ${x.medida} x ${dinero(x.precio)} = ${dinero(x.centavos/100)}`);y+=10;}
 line('TOTAL: '+dinero(c.total));y+=12;line('Borrador para revision. No es factura, recibo ni constancia de pago.');line('Sin numero fiscal, CAE ni QR. Importes expresados en pesos argentinos.');
 pages.push(ops);pages.forEach((p,i)=>p.push(`BT /F1 8 Tf 0.3 0.3 0.3 rg 1 0 0 1 40 25 Tm (BORRADOR SIN VALIDEZ FISCAL | Pagina ${i+1} de ${pages.length}) Tj ET`));
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
