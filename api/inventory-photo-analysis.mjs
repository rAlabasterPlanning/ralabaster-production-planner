import {generateObject} from 'ai';
import {z} from 'zod';
import {authenticatedUser,tokenFrom} from './_planner-core.mjs';
const MODEL='openai/gpt-5.4-mini';
const schema=z.object({category:z.enum(['raw','slab','semi']).nullable(),material:z.string().nullable(),description:z.string().nullable(),dimensions:z.object({lengthMm:z.number().nullable(),widthMm:z.number().nullable(),heightMm:z.number().nullable(),diameterMm:z.number().nullable()}),confidence:z.number().min(0).max(1),evidence:z.array(z.string()).max(6),warning:z.string().nullable()});
export default async function handler(request,response){
 if(request.method!=='POST')return response.status(405).json({error:'Alleen POST is toegestaan.'});
 const user=await authenticatedUser(tokenFrom(request));if(!user)return response.status(401).json({error:'Log opnieuw in.'});
 const {imageDataUrl}=request.body||{};if(!/^data:image\/(jpeg|png|webp);base64,/i.test(String(imageDataUrl||'')))return response.status(400).json({error:'Maak of kies eerst een foto.'});
 if(String(imageDataUrl).length>10_000_000)return response.status(413).json({error:'De foto is te groot.'});
 try{const result=await generateObject({model:MODEL,schema,messages:[{role:'user',content:[{type:'text',text:'Analyseer deze voorraadfoto voor rAlabaster. Lees uitsluitend zichtbare labels, maatlijnen en tekst. Kies raw voor ruw materiaal/blokken, slab voor platen en semi voor half-fabricaat. Schat geen exacte millimeters zonder zichtbare maatvoering of betrouwbare schaal; gebruik dan null. Geef een lage confidence en waarschuwing bij twijfel. Antwoord in het Nederlands.'},{type:'image',image:imageDataUrl}]}]});return response.status(200).json(result.object)}catch(error){console.error('inventory photo analysis failed',error);return response.status(503).json({error:'Fotoherkenning is nu niet beschikbaar. Je kunt de gegevens wel handmatig invullen.'})}
}
