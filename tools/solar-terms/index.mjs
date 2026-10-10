/** Private solar-term prototype over an explicitly supplied longitude engine. */
export const SOLAR_TERMS = Object.freeze([
 [0,'Chunfen','Spring equinox'],[15,'Qingming','Clear and bright'],
 [30,'Guyu','Grain rain'],[45,'Lixia','Start of summer'],
 [60,'Xiaoman','Grain full'],[75,'Mangzhong','Grain in ear'],
 [90,'Xiazhi','Summer solstice'],[105,'Xiaoshu','Minor heat'],
 [120,'Dashu','Major heat'],[135,'Liqiu','Start of autumn'],
 [150,'Chushu','End of heat'],[165,'Bailu','White dew'],
 [180,'Qiufen','Autumn equinox'],[195,'Hanlu','Cold dew'],
 [210,'Shuangjiang','Frost descent'],[225,'Lidong','Start of winter'],
 [240,'Xiaoxue','Minor snow'],[255,'Daxue','Major snow'],
 [270,'Dongzhi','Winter solstice'],[285,'Xiaohan','Minor cold'],
 [300,'Dahan','Major cold'],[315,'Lichun','Start of spring'],
 [330,'Yushui','Rain water'],[345,'Jingzhe','Awakening of insects'],
].map(([longitude,pinyin,name])=>Object.freeze({longitude,pinyin,name,kind:longitude%30===15?'jie':'zhongqi'})));
const dateOfYear=year=>{const date=new Date(0);date.setUTCFullYear(year,0,1);date.setUTCHours(0,0,0,0);return date;};
function nonemptyIdentity(value) {
 return typeof value==='string'&&value.trim()!=='';
}
function ephemerisIdentity(value) {
 if(nonemptyIdentity(value))return value;
 if(value===null||typeof value!=='object')throw new TypeError('Supply an explicitly versioned ephemeris');
 const prototype=Object.getPrototypeOf(value);
 if(prototype!==Object.prototype&&prototype!==null)throw new TypeError('Ephemeris identity must be a plain name/version record');
 const keys=Reflect.ownKeys(value);
 if(keys.length!==2||!keys.includes('name')||!keys.includes('version'))throw new TypeError('Ephemeris identity needs name and version');
 const name=Object.getOwnPropertyDescriptor(value,'name'),version=Object.getOwnPropertyDescriptor(value,'version');
 if(!name||!version||!('value' in name)||!('value' in version)||!name.enumerable||!version.enumerable||!nonemptyIdentity(name.value)||!nonemptyIdentity(version.value))throw new TypeError('Ephemeris identity needs nonempty data strings');
 return name.value+'@'+version.value;
}
function longitudeSourceIdentity(engine) {
 if(!engine||typeof engine.searchLongitudeCrossings!=='function'||!nonemptyIdentity(engine.ENGINE_VERSION))throw new TypeError('Supply an explicitly versioned longitude engine');
 return {engine:engine.ENGINE_VERSION,ephemeris:ephemerisIdentity(engine.EPHEMERIS)};
}
export function createSolarTermScanner(engine) {
 longitudeSourceIdentity(engine);
 return function solarTermsForYear(year,options={}) {
  if(!Number.isInteger(year)||year<1||year>9998)throw new RangeError('Gregorian year must be an integer from 1 to 9998');
  const prototype=options!==null&&typeof options==='object'?Object.getPrototypeOf(options):undefined;
  if(prototype!==Object.prototype&&prototype!==null)throw new RangeError('Options must be a plain data object');
  for(const key of Reflect.ownKeys(options)){
   const property=Object.getOwnPropertyDescriptor(options,key);
   if(key!=='maxSamples'||!property||!('value' in property)||!property.enumerable)throw new RangeError('Only a plain maxSamples data property is supported');
  }
  const value=Object.getOwnPropertyDescriptor(options,'maxSamples')?.value;
  const maxSamples=value===undefined?12000:value;
  if(!Number.isInteger(maxSamples)||maxSamples<1||maxSamples>1000000)throw new RangeError('maxSamples must be an integer from 1 to 1000000');
  const source=longitudeSourceIdentity(engine);
  const ensureSourceUnchanged=()=>{
   const current=longitudeSourceIdentity(engine);
   if(current.engine!==source.engine||current.ephemeris!==source.ephemeris)throw new TypeError('Longitude-source identity changed during the inventory');
  };
  const finish=result=>{ensureSourceUnchanged();return result;};
  const start=dateOfYear(year),end=dateOfYear(year+1),from=start.getTime(),to=end.getTime();
  let samples=0;const terms=[];
  const base={schema:'zodiacs.solar-terms.alpha.v1',year,window:{from:start.toISOString(),to:end.toISOString(),interval:'(from,to]',clock:'UTC calendar; supplied engine time conversion'},source,accuracy:{status:'unvalidated',independentEventSeconds:null},completeness:{status:'unproven',method:'supplied coarse longitude crossing solver'}};
  for(const term of SOLAR_TERMS){
   const remaining=maxSamples-samples;
   if(remaining===0)return finish({...base,status:'refused',reason:'sample-budget',samples,maxSamples,terms:[]});
   ensureSourceUnchanged();
   const result=engine.searchLongitudeCrossings('Sun',term.longitude,new Date(from),new Date(to),{stepDays:2,maxSamples:remaining});
   ensureSourceUnchanged();
   if(!result||!Number.isInteger(result.samples)||result.samples<0||result.samples>remaining)throw new TypeError('Invalid longitude-source sample accounting');
   samples+=result.samples;
   if(result.status==='refused'){
    if(result.reason!=='sample-budget'||!Array.isArray(result.crossings)||result.crossings.length!==0)throw new TypeError('Invalid longitude-source refusal');
    return finish({...base,status:'refused',reason:'sample-budget',samples,maxSamples,terms:[]});
   }
   if(result.status!=='complete'||!Array.isArray(result.crossings))throw new TypeError('Invalid longitude-source status');
   if(result.crossings.length!==1)return finish({...base,status:'refused',reason:'unexpected-solar-crossing-count',longitude:term.longitude,samples,maxSamples,terms:[]});
   const crossing=result.crossings[0];
   if(!(crossing.at instanceof Date)||!Number.isFinite(Date.prototype.getTime.call(crossing.at))||crossing.retrograde!==false)throw new TypeError('Invalid forward solar crossing');
   const time=Date.prototype.getTime.call(crossing.at);
   if(time<=from||time>to)throw new TypeError('Solar crossing lies outside the named interval');
   terms.push({...term,at:new Date(time).toISOString()});
  }
  terms.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  if(terms.some((term,index)=>index>0&&Date.parse(term.at)<=Date.parse(terms[index-1].at)))return finish({...base,status:'refused',reason:'non-distinct-solar-crossings',samples,maxSamples,terms:[]});
  return finish({...base,status:'computed',samples,maxSamples,terms});
 };
}
