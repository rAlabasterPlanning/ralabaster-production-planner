/* STEP Part 21 analytic-feature inventory; does NOT certify topology or machining. */
(function(root){'use strict';
function splitRecords(input){const rows=[];let start=-1,quote=false;
for(let i=0;i<input.length;i++){const c=input[i];if(c==="'"){if(quote&&input[i+1]==="'"){i++;continue}quote=!quote;continue}
if(!quote&&c==='#'&&(i===0||/[\s;]/.test(input[i-1])))start=i;
if(!quote&&c===';'&&start>=0){rows.push(input.slice(start,i).trim());start=-1}}return rows}
function argumentsOf(s){const m=s.match(/^\s*#(\d+)\s*=\s*([A-Z0-9_]+)\s*\(([\s\S]*)\)\s*$/i);return m?{id:+m[1],type:m[2].toUpperCase(),args:m[3]}:null}
function topArgs(s){let depth=0,quoted=false,from=0,out=[];for(let i=0;i<s.length;i++){const c=s[i];if(c==="'"){if(quoted&&s[i+1]==="'"){i++;continue}quoted=!quoted}else if(!quoted){if(c==='(')depth++;else if(c===')')depth--;else if(c===','&&depth===0){out.push(s.slice(from,i).trim());from=i+1}}}out.push(s.slice(from).trim());return out}
function num(s){const v=Number(s);return Number.isFinite(v)?v:null}
function parse(source){
if(typeof source!=='string'||source.length>30_000_000)throw new Error('STEP tekst te groot of ongeldig');
if(!/^\s*ISO-10303-21\s*;/i.test(source))throw new Error('Geen STEP Part 21 bestand');
const entries=splitRecords(source).map(argumentsOf).filter(Boolean),byId=new Map(entries.map(e=>[e.id,e]));
const cylinder=[],torus=[],circle=[],cone=[],plane=[];
const found={CYLINDRICAL_SURFACE:cylinder,TOROIDAL_SURFACE:torus,CIRCLE:circle,CONICAL_SURFACE:cone,PLANE:plane};
for(const e of entries){if(!found[e.type])continue;const args=topArgs(e.args),tail=args.slice(e.type==='TOROIDAL_SURFACE'||e.type==='CONICAL_SURFACE'?-2:-1);let payload=null;
if(e.type==='CYLINDRICAL_SURFACE'||e.type==='CIRCLE')payload={radiusMm:num(tail[0])};
if(e.type==='TOROIDAL_SURFACE')payload={majorRadiusMm:num(tail[0]),minorRadiusMm:num(tail[1])};
if(e.type==='CONICAL_SURFACE')payload={radiusMm:num(tail[0]),semiAngleRadians:num(tail[1])};
if(e.type==='PLANE')payload={};
if(payload&&Object.values(payload).every(x=>x!==null))found[e.type].push({entity:'#'+e.id,type:e.type,...payload})}
const surfaces=entries.filter(e=>['ADVANCED_FACE','FACE_SURFACE'].includes(e.type)),faceGeometry=[];
for(const face of surfaces){const args=topArgs(face.args);
const ref=args.find(x=>/^#\d+$/.test(x)&&byId.has(+x.slice(1))&&found[byId.get(+x.slice(1)).type]);
if(ref)faceGeometry.push({face:'#'+face.id,surface:ref,kind:byId.get(+ref.slice(1)).type})}
const unitsKnown=/SI_UNIT\s*\([^;]*\.MILLI\.\s*,\s*\.METRE\./i.test(source);
return {source:'STEP analytic entities',unitsConfirmedMm:unitsKnown,entities:entries.length,cylinders:cylinder,toruses:torus,circles:circle,cones:cone,planes:plane,faceGeometry,completeFeatureRecognition:false,
warnings:['Gevonden radiussen zijn STEP-entiteiten, niet noodzakelijk actieve productcontouren.','Chamfers vergen B-Rep face-edge-adjacentie en kunnen nog niet automatisch bevestigd worden.','Wanddikte en volledig X/Z-profiel zijn nog niet gevalideerd.',...(!unitsKnown?['Millimeters niet bevestigd; waarden zijn ongeverifieerd.']:[])]};
}
root.RALAB_STEP_ANALYTIC={parse};
})(typeof window==='undefined'?globalThis:window);
