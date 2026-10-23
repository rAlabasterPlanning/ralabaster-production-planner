// Customer packing slips use the planner's established rAlabaster document style.
(()=>{
 let logoHex='';
 window.RALAB_PACKING_PDF_READY=typeof fetch==='function'?fetch('assets/ralabaster-logo.b64.txt').then(r=>{if(!r.ok)throw Error('Logo');return r.text()}).then(s=>{logoHex=Array.from(atob(s.replace(/\s/g,'')),c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join('')+'>'}).catch(()=>{}):Promise.resolve();
 window.RALAB_PACKING_PDF=(order,customer,readyDate)=>{
 const clean=v=>String(v??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[–—]/g,'-').replace(/[’‘]/g,"'").replace(/[^\x20-\x7e]/g,'?');
 const escape=v=>clean(v).replace(/[\\()]/g,'\\$&');
 const wrap=(v,n)=>String(v??'').split(/\r?\n/).flatMap(v=>clean(v).match(new RegExp(`.{1,${n}}(?:\\s|$)|.{1,${n}}`,'g'))?.map(x=>x.trim())||['']);
 const dark='0.245 0.255 0.286',green='0.080 0.285 0.245',ink='0.130 0.145 0.150',muted='0.390 0.420 0.420';
 const pages=[];let commands,y;
 const text=(x,y,value,bold=false,size=10,color=ink)=>commands.push(`${color} rg BT /F${bold?2:1} ${size} Tf ${x} ${y} Td (${escape(value)}) Tj ET`);
 const fill=(x,y,w,h,color)=>commands.push(`${color} rg ${x} ${y} ${w} ${h} re f`);
 const rule=(y)=>commands.push(`${green} RG 0.6 w 45 ${y} m 550 ${y} l S`);
 function page(){commands=[];pages.push(commands);fill(0,715,595,127,dark);
 if(logoHex)commands.push('q 190 0 0 70 42 742 cm /Logo Do Q');else text(45,772,'rAlabaster',true,25,'1 1 1');
 ['rAlabaster / Linck BV','Kasteeldreef 18','5151 RS Drunen','Nederland','+31 418 743101','info@ralabaster.com'].forEach((v,i)=>text(392,806-i*13,v,i===0,i?8.2:9,'1 1 1'));
 text(45,672,'PAKBON',true,24,dark);text(45,651,'BEGELEIDEND DOCUMENT BIJ LEVERING',false,9,muted);
 text(410,674,'PAKBONNUMMER',true,8,green);wrap(order.order_no||'-',20).slice(0,2).forEach((v,i)=>text(410,654-i*14,v,true,12,dark));rule(625);
 text(45,603,'LEVERINGSADRES',true,9,green);wrap(customer.company_name,38).slice(0,2).forEach((v,i)=>text(45,582-i*14,v,true,11,dark));
 const address=[customer.address||customer.street,[customer.postal_code||customer.zip,customer.city].filter(Boolean).join(' '),customer.country,customer.contact_name?`t.a.v. ${customer.contact_name}`:''].filter(Boolean);
 address.flatMap(v=>wrap(v,43)).slice(0,4).forEach((v,i)=>text(45,550-i*13,v,false,9));
 text(323,603,'DOCUMENTGEGEVENS',true,9,green);text(323,582,'BEVESTIGDE LEVERDATUM',true,8,green);text(323,567,readyDate||'-');text(323,540,'KLANTREFERENTIE',true,8,green);const referenceRows=wrap(order.customer_reference||'-',38);referenceRows.forEach((v,i)=>text(323,525-i*13,v));const requestedY=510-referenceRows.length*13;text(323,requestedY,'GEVRAAGDE LEVERDATUM',true,8,green);text(323,requestedY-15,order.requested_delivery_date||'-',false,9);
 const tableTop=Math.min(473,requestedY-40);text(45,tableTop,'GELEVERDE ARTIKELEN',true,9,green);fill(45,tableTop-35,505,27,dark);text(57,tableTop-25,'OMSCHRIJVING',true,9,'1 1 1');text(401,tableTop-25,'VERPAKKING',true,9,'1 1 1');text(505,tableTop-25,'AANTAL',true,9,'1 1 1');y=tableTop-55;
 }
 page();
 for(const line of [...(order.portal_order_lines||[])].sort((a,b)=>a.line_no-b.line_no)){
 const rows=wrap(line.description,52),quantity=wrap(Number(line.quantity)+' '+(line.unit||''),11),packages=wrap(line.packages||'-',15);
 for(let i=0;i<Math.max(rows.length,quantity.length,packages.length);i++){if(y<115)page();fill(45,y-5,505,19,'0.945 0.950 0.945');if(rows[i])text(57,y,rows[i]);if(packages[i])text(401,y,packages[i],false,9);if(quantity[i])text(505,y,quantity[i],true,9);y-=18;}rule(y+8);y-=16;
 }
 const notes=wrap(order.delivery_note||'Geen bijzonderheden.',78);if(y<250)page();
 text(45,y-6,'OPMERKING BIJ LEVERING',true,9,green);y-=30;
 for(const row of notes){if(y<200)page();text(57,y,row,false,9.5);y-=14;}
 y-=30;if(y<160){page();y=380;}
 text(45,y,'ONTVANGSTBEVESTIGING',true,9,green);text(45,y-25,'Naam ontvanger',false,8.5,muted);text(244,y-25,'Datum',false,8.5,muted);text(373,y-25,'Handtekening',false,8.5,muted);
 for(const [x,end] of [[45,220],[244,345],[373,550]])commands.push(`0.75 0.77 0.76 RG 0.7 w ${x} ${y-59} m ${end} ${y-59} l S`);
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'];
 let logoId=0;if(logoHex){logoId=objects.length+1;objects.push(`<< /Type /XObject /Subtype /Image /Width 420 /Height 155 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${logoHex.length} >>\nstream\n${logoHex}\nendstream`);}
 const kids=[];
 pages.forEach((cmd,i)=>{commands=cmd;rule(77);text(45,58,'rAlabaster / Linck BV | Kasteeldreef 18, 5151 RS Drunen | info@ralabaster.com',false,7.5,muted);text(45,45,'BTW NL863451536B01 | KvK 84982101 | +31 418 743101',false,7.5,muted);text(509,45,`${i+1} / ${pages.length}`,false,7.5,muted);const stream=cmd.join('\n'),id=objects.length+1;kids.push(`${id} 0 R`);objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> ${logoId?`/XObject << /Logo ${logoId} 0 R >>`:''} >> /Contents ${id+1} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);});
 objects[1]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;let out='%PDF-1.4\n',offsets=[];objects.forEach((value,i)=>{offsets.push(out.length);out+=`${i+1} 0 obj\n${value}\nendobj\n`;});const xref=out.length;
 return out+`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(x=>String(x).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 };
})();