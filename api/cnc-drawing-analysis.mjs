import {generateText, Output} from 'ai';
import {z} from 'zod';
import {authenticatedUser, tokenFrom} from './_planner-core.mjs';
const MAX_FILE_BYTES=2_500_000, MODEL='openai/gpt-5.4-mini';
const dimension=z.object({value:z.number().positive().nullable(),unit:z.literal('mm'),source:z.string().max(240),origin:z.enum(['explicit','derived','unknown']),confidence:z.number().min(0).max(1)});
const schema=z.object({
 partType:z.enum(['rotational','non_rotational','uncertain']),
 dimensions:z.object({outerDiameter:dimension,length:dimension,wallThickness:dimension,innerDiameter:dimension,boreDepth:dimension}),
 referenceFace:z.enum(['front','rear','uncertain']),
 drawingNotes:z.array(z.string().max(260)).max(15),
 ambiguities:z.array(z.string().max(260)).max(20),
 proposedOperations:z.array(z.enum(['face','outer','inner','drill','partoff'])).max(5),
 overallConfidence:z.number().min(0).max(1)
});
function decodeFile(input){
 if(!input||typeof input!=='object')throw new Error('Upload ontbreekt.');
 const mime=String(input.mediaType||''), supported=['application/pdf','image/png','image/jpeg','image/webp'];
 if(!supported.includes(mime))throw new Error('Voor AI-herkenning zijn PDF, PNG, JPEG en WebP ondersteund. STEP en DXF vereisen een aparte geometrielezer.');
 const base64=String(input.base64||'');
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)||base64.length>Math.ceil(MAX_FILE_BYTES*4/3)+16)throw new Error('Bestandformaat of bestandsgrootte ongeldig.');
 const bytes=Buffer.from(base64,'base64');
 if(!bytes.length||bytes.length>MAX_FILE_BYTES)throw new Error('Upload moet kleiner zijn dan 2,5 MB.');
 const pdf=bytes.subarray(0,5).toString()==='%PDF-';
 const png=bytes.length>8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const jpg=bytes.length>2&&bytes[0]===255&&bytes[1]===216;
 const webp=bytes.length>12&&bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
 if(!({'application/pdf':pdf,'image/png':png,'image/jpeg':jpg,'image/webp':webp})[mime])throw new Error('Het bestand komt niet overeen met het opgegeven formaat.');
 return {bytes,mime};
}
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Alleen POST is toegestaan.'});
 const user=await authenticatedUser(tokenFrom(req));
 if(!user)return res.status(401).json({error:'Log eerst in bij de Planner.'});
 let file;try{file=decodeFile(req.body?.file)}catch(e){return res.status(400).json({error:e.message})}
 try{
 const instructions='Je leest technische productietekeningen voor een albast CNC-draaibank. Alleen maten interpreteren, GEEN CNC-code. Onderscheid expliciete maatlijnen, eenduidig afgeleide maten en onbekend. Nooit millimeters uit pixels of visuele schaal schatten. Diameter is volledige diameter (X in diameterprogrammering), geen radius. Onderscheid buitenmaat, binnendiameter, totale lengte, wanddikte, kamer/boordiepte. Ontbreekt bewijs: value=null, origin=unknown. source bevat herkenbare aanwijzing als doorsnede en exacte maatlijn, of afleidingsformule. Converteer expliciete inches alleen als de eenheid vaststaat. Tegenstrijdige aanzichten en toleranties benoemen. Z0 nooit raden: uncertain indien niet aangegeven. voorgestelde bewerkingen alleen op basis van zichtbare features, niet automatisch aannemen. Wees extra voorzichtig met binnencontour en wanddikte. Antwoord Nederlands.';
 const attachment=file.mime==='application/pdf'?{type:'file',data:file.bytes,mediaType:file.mime,filename:'productietekening.pdf'}:{type:'image',image:file.bytes,mediaType:file.mime};
 const result=await generateText({model:MODEL,output:Output.object({schema}),messages:[{role:'user',content:[{type:'text',text:instructions},attachment]}]});
 const output=result.output,dimensions={};
 for(const [name,val] of Object.entries(output.dimensions))dimensions[name]=val.origin==='unknown'||val.confidence<0.6?{...val,value:null,origin:'unknown'}:val;
 return res.status(200).json({...output,dimensions,status:'unverified',model:MODEL,exportAllowed:false});
 }catch(error){console.error('CNC drawing analysis failed',error?.message||error);return res.status(503).json({error:'AI-tekeningherkenning is nu niet beschikbaar. Controleer de configuratie of probeer het later.'})}
}