// Standalone, paginated packing slip. All text is escaped before PDF serialization.
window.RALAB_PACKING_PDF=(order,customer,readyDate)=>{
 const clean=v=>String(v??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[–—]/g,'-').replace(/[’‘]/g,"'").replace(/[^\x20-\x7e]/g,'?');
 const escape=v=>clean(v).replace(/[\\()]/g,'\\$&');
 const wrap=(v,n)=>{const words=clean(v).match(new RegExp(`.{1,${n}}(?:\\s|$)|.{1,${n}}`,'g'));return words?.map(x=>x.trim())||[''];};
 const pages=[];let commands,y;
 const text=(x,y,value,bold=false,size=10)=>`BT /F${bold?2:1} ${size} Tf ${x} ${y} Td (${escape(value)}) Tj ET`;
 function page(){commands=['0.16 0.17 0.19 rg',text(45,785,'rAlabaster',true,25),text(45,745,'PAKBON',true,18)];let h=720;for(const value of ['Ordernummer: '+order.order_no,'Klant: '+customer.company_name,'Datum gereed: '+readyDate])for(const line of wrap(value,85)){commands.push(text(45,h,line));h-=14;}y=h-30;commands.push(text(55,y,'Omschrijving',true),text(445,y,'Aantal',true));y-=25;pages.push(commands);}
 page();
 for(const line of [...(order.portal_order_lines||[])].sort((a,b)=>a.line_no-b.line_no)){
  const rows=wrap(line.description,60),quantity=wrap(Number(line.quantity)+' '+(line.unit||''),18);
  for(let i=0;i<Math.max(rows.length,quantity.length);i++){if(y<90)page();if(rows[i])commands.push(text(55,y,rows[i]));if(quantity[i])commands.push(text(445,y,quantity[i]));y-=14;}y-=14;
 }
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'];
 const kids=[];
 pages.forEach((commands,i)=>{commands.push(text(45,55,`rAlabaster BV - Pagina ${i+1} / ${pages.length}`,false,8));const stream=commands.join('\n'),id=objects.length+1;kids.push(`${id} 0 R`);objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${id+1} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);});
 objects[1]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
 let out='%PDF-1.4\n',offsets=[];objects.forEach((value,i)=>{offsets.push(out.length);out+=`${i+1} 0 obj\n${value}\nendobj\n`;});const xref=out.length;
 return out+`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(x=>String(x).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
};
