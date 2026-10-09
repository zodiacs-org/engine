import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = new URL("../", import.meta.url);
const contracts = new URL("../typescript/contracts/", root);
const bytes = await readFile(new URL("openapi.json", contracts));
const provenance = JSON.parse(await readFile(new URL("provenance.json", contracts), "utf8"));
if (createHash("sha256").update(bytes).digest("hex") !== provenance.subsetSha256) throw Error("Contract digest mismatch");
function pythonContract(document) {
 const definitions=[]; const used=new Set(Object.keys(document.components.schemas));
 const py=v=>v===true?"True":v===false?"False":v===null?"None":JSON.stringify(v);
 function fresh(n){n=n.replace(/[^A-Za-z0-9_]/g,"_");let name=n, i=2;while(used.has(name)) name=n+"_"+i++; used.add(name);return name;}
 function merge(s){if(s.$ref)return merge(document.components.schemas[s.$ref.split("/").pop()]);if(!s.allOf)return s;const base={...s};delete base.allOf;for(const item of s.allOf){const b=merge(item);if(b.type!=="object"&&!b.properties)throw Error("Unsupported non-object allOf");base.type="object";base.properties={...base.properties,...b.properties};base.required=[...new Set([...(base.required??[]),...(b.required??[])])];}return base;}
 function obj(s,name){const req=new Set(s.required??[]);const entries=Object.entries(s.properties??{}).map(([k,v])=>py(k)+": "+(req.has(k)?"Required":"NotRequired")+"["+type(v,name+"_"+k)+"]"); definitions.push(name+" = TypedDict("+py(name)+", {"+entries.join(", ")+"}, total=False)");return JSON.stringify(name);}
 function type(s,hint){
  if(s.$ref){const n=s.$ref.split("/").pop();if(!document.components.schemas[n])throw Error("Unknown schema");return JSON.stringify(n);}
  if(Object.hasOwn(s,"const"))return "Literal["+py(s.const)+"]";
  if(s.enum)return "Literal["+s.enum.map(py).join(", ")+"]";
  if(s.allOf)return type(merge(s),hint);
  if(s.oneOf?.every(x=>Array.isArray(x.required)&&Object.keys(x).every(k=>["required","not"].includes(k)))){
   const keys=s.oneOf.every(x=>!x.not)?new Set(s.oneOf.flatMap(x=>x.required??[])):new Set();
   const forbidden = n => { if (!n) return []; if (n.required?.length===1) return n.required; if(n.anyOf?.every(x=>x.required?.length===1&&Object.keys(x).length===1))return n.anyOf.flatMap(x=>x.required); throw Error("Unsupported negative branch"); };
   return "Union["+s.oneOf.map((branch,i)=>{const base={...s};delete base.oneOf;const selected=new Set(branch.required??[]);base.properties=Object.fromEntries(Object.entries(base.properties).filter(([k])=>(!keys.has(k)||selected.has(k))&&!forbidden(branch.not).includes(k)));base.required=[...(base.required??[]),...selected];return obj(base,fresh(hint+"_Option"+(i+1)));}).join(", ")+"]";
  }
  if(s.oneOf||s.anyOf)return "Union["+(s.oneOf??s.anyOf).map((x,i)=>type(x,hint+"_Option"+i)).join(", ")+"]";
  if(Array.isArray(s.type))return "Union["+s.type.map(t=>type({...s,type:t},hint+"_"+t)).join(", ")+"]";
  if(s.type==="object"||s.properties){
   if(!Object.keys(s.properties??{}).length)return "dict[str, "+(s.additionalProperties&&typeof s.additionalProperties==="object"?type(s.additionalProperties,hint+"_Value"):"object")+"]";
   return obj(s,fresh(hint));
  }
  if(s.type==="array"){
   const items=s.prefixItems?s.prefixItems.map((v,i)=>type(v,hint+"_Item"+i)): [type(s.items&&typeof s.items==="object"?s.items:{},hint+"_Item")];
   const unique=[...new Set(items)];return "list["+(unique.length>1?"Union["+unique.join(", ")+"]":unique[0])+"]";
  }
  if(s.type==="string")return "str";if(s.type==="integer")return "int";if(s.type==="number")return "float";if(s.type==="boolean")return "bool";if(s.type==="null")return "None";
  if(s.type!==undefined)throw Error("Unknown type "+s.type);
  return "object";
 }
 const aliases=[];
 for(const [name,schema] of Object.entries(document.components.schemas)){
  const s=merge(schema);
  if((s.type==="object"||s.properties)&&!s.oneOf&&!s.anyOf) obj(s,name);
  else aliases.push(name+" : TypeAlias = "+type(s,name));
 }
 const schemas=Object.entries(document.paths).filter(([_,v])=>v.post).map(([path,v])=>[path.slice(8),Object.values(v.post.responses["200"].content["application/json"].examples)[0].value.schema]);
 if(schemas.length!==7)throw Error("Expected 7 endpoints");
 return '# Generated from the verified Compute contract; run scripts/generate-contract.mjs.\nfrom typing import Literal, NotRequired, Required, TypeAlias, TypedDict, Union\n\n'+definitions.join("\n\n")+"\n\n"+aliases.join("\n")+"\n\nRESPONSE_SCHEMAS: dict[str, str] = "+JSON.stringify(Object.fromEntries(schemas))+"\n";
}
const generated = pythonContract(JSON.parse(bytes.toString("utf8")));
const output = new URL("src/zodiacs_compute/contract.py", root);
if(process.argv.includes("--check")) { if(await readFile(output,"utf8")!==generated)throw Error("Generated Python contract differs"); }
else await writeFile(output,generated);
