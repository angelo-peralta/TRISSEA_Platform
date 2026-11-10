import {createHash} from 'node:crypto';
import {invalid} from './fare-model';

export interface MatrixRow {
  destinationLabel:string;category:'LISTED_AREA'|'POBLACION';regularCentavos:number;discountedCentavos:number;
  regularPhp:string;discountedPhp:string;sourcePage:number;originalStatus:string;originalOriginScope:string;originalEffectiveFrom:string;
}
const header='destination_label,category,regular_php,student_senior_pwd_php,source_page,status,origin_scope,effective_from';
/** Strict RFC4180 reader for this source vocabulary; no label normalization or floating point money. */
export function importMatrix(csv:unknown){
  if(typeof csv!=='string'||Buffer.byteLength(csv)>30000||csv.includes('\0'))return invalid();
  const records:string[][]=[];let record:string[]=[],field='',quoted=false,closed=false;
  const input=csv.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
  for(let i=0;i<input.length;i++){
    const c=input[i]!;
    if(quoted){if(c==='"'){if(input[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
    if(c==='"'){if(field||closed)return invalid();quoted=true;continue;}
    if(c===','||c==='\n'){record.push(field);field='';closed=false;if(c==='\n'){records.push(record);record=[];}continue;}
    if(closed||c==='\r')return invalid();field+=c;
  }
  if(quoted)return invalid();if(field||record.length||closed){record.push(field);records.push(record);}
  if(records.shift()?.join(',')!==header||records.length!==43)return invalid();
  const seen=new Set<string>();
  const money=(v:string)=>{if(!/^\d{1,6}\.\d{2}$/.test(v))return invalid();return Number(v.replace('.',''));};
  const rows:MatrixRow[]=records.map(r=>{
    if(r.length!==8)return invalid();const [destinationLabel,category,regularPhp,discountedPhp,page,originalStatus,originalOriginScope,originalEffectiveFrom]=r as [string,string,string,string,string,string,string,string];
    if(!destinationLabel.trim()||destinationLabel.length>160||Array.from(destinationLabel).some(c=>c.charCodeAt(0)<32)||seen.has(destinationLabel.toLowerCase())||!['LISTED_AREA','POBLACION'].includes(category)||!['1','2'].includes(page)||originalStatus!=='UNVERIFIED_PENDING_CITY_APPROVAL'||!['UNKNOWN','POBLACION_TO_POBLACION'].includes(originalOriginScope)||originalEffectiveFrom!=='')return invalid();
    seen.add(destinationLabel.toLowerCase());const regularCentavos=money(regularPhp),discountedCentavos=money(discountedPhp);if(discountedCentavos>regularCentavos)return invalid();
    if(category==='POBLACION'&&(destinationLabel!=='Poblacion (within)'||originalOriginScope!=='POBLACION_TO_POBLACION'||regularCentavos!==2200||discountedCentavos!==1800))return invalid();
    if(category==='LISTED_AREA'&&originalOriginScope!=='UNKNOWN')return invalid();
    return {destinationLabel,category:category as MatrixRow['category'],regularPhp,discountedPhp,regularCentavos,discountedCentavos,sourcePage:Number(page),originalStatus,originalOriginScope,originalEffectiveFrom};
  });
  if(rows.filter(r=>r.category==='LISTED_AREA').length!==42||rows.filter(r=>r.category==='POBLACION').length!==1)return invalid();
  return {sha256:createHash('sha256').update(csv).digest('hex'),rows};
}
