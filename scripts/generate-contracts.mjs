import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

// Intentionally small generator for the schema vocabulary in the MVP contract.
// Fail on unknown vocabulary rather than silently emitting incorrect client types.
export function schemaType(schema) {
  if (!schema || Object.keys(schema).length === 0) return 'unknown';
  if (schema.$ref) {
    const prefix = '#/components/schemas/';
    if (!schema.$ref.startsWith(prefix)) throw new Error('Unsupported schema reference');
    return `Schemas[${JSON.stringify(schema.$ref.slice(prefix.length))}]`;
  }
  if(schema.oneOf?.length)return schema.oneOf.map(item=>'('+schemaType(item)+')').join(' | ');
  for (const keyword of ['allOf', 'oneOf', 'anyOf', 'not', 'patternProperties']) {
    if (keyword in schema) throw new Error(`Unsupported schema keyword: ${keyword}`);
  }
  if ('const' in schema) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map(value => JSON.stringify(value)).join(' | ');
  if (Array.isArray(schema.type)) return schema.type.map(type => schemaType({ ...schema, type })).join(' | ');
  switch (schema.type) {
    case 'string': return 'string';
    case 'integer': case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'null': return 'null';
    case 'array': return `Array<${schemaType(schema.items)}>`;
    case 'object': {
      if (!schema.properties) return 'Record<string, unknown>';
      if (!Object.keys(schema.properties).length) return 'Record<string, never>';
      return `{ ${Object.entries(schema.properties).map(([key, value]) => `${JSON.stringify(key)}${schema.required?.includes(key) ? '' : '?'}: ${schemaType(value)};`).join(' ')} }`;
    }
    default: throw new Error(`Unsupported schema type: ${schema.type}`);
  }
}

export function generate(document) {
  const schemas = Object.entries(document.components.schemas).map(([name, schema]) => `  ${JSON.stringify(name)}: ${schemaType(schema)};`).join('\n');
  const operations = [];
  for (const [path, item] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (!operation.operationId) continue;
      const response = Object.entries(operation.responses).find(([code]) => /^2\d\d$/.test(code))?.[1];
      const request = operation.requestBody?.content?.['application/json']?.schema;
      operations.push(`  ${JSON.stringify(operation.operationId)}: { method: ${JSON.stringify(method.toUpperCase())}; path: ${JSON.stringify(path)}; body: ${request ? schemaType(request) : 'never'}; response: ${response?.content?.['application/json']?.schema?schemaType(response.content['application/json'].schema):'void'} };`);
    }
  }
  return `// Generated from contracts/openapi-mvp.yaml. Run pnpm contracts:generate.\n// Only x-implemented-in operations are implemented; M2.3/M2.4/M2.5 require local-synthetic flags.\nexport interface Schemas {\n${schemas}\n}\nexport interface Operations {\n${operations.join('\n')}\n}\nexport type HealthResponse = Operations['getHealth']['response'];\n`;
}

export const generatePassengerClient=document=>generateMobileClient(document,'PASSENGER');
export const generateDriverClient=document=>generateMobileClient(document,'DRIVER');
function generateMobileClient(document,purpose) {
  const label=purpose==='DRIVER'?'Driver':'Passenger';
  const specs={};const inputs=[],operationTypes=[];
  for(const [path,item] of Object.entries(document.paths))for(const [method,op] of Object.entries(item)){
    if(purpose==='PASSENGER'?op['x-implemented-in']!=='M2.3-local-synthetic':!(op['x-driver-operation-id']||op['x-implemented-in']==='M2.4-local-synthetic'||(op['x-implemented-in']==='M2.6-local-synthetic'&&op['x-client-purpose']==='DRIVER')))continue;
    const operationId=purpose==='DRIVER'?(op['x-driver-operation-id']??op.operationId):op.operationId;
    operationTypes.push(JSON.stringify(operationId)+': Omit<Operations['+JSON.stringify(op.operationId)+'],"response"> & {response: '+label+'Purpose<Operations['+JSON.stringify(op.operationId)+']["response"]>};');
    const success=Object.entries(op.responses).find(([code])=>/^2\d\d$/.test(code));
    const fields=[...(op.requestBody?['body: '+label+'Purpose<Operations['+JSON.stringify(op.operationId)+']["body"]>;']:[]),...(op.security?[]:['accessToken: string;'])];
    const parameters=(op.parameters??[]).map(p=>p.$ref?document.components.parameters[p.$ref.split('/').at(-1)]:p);
    for(const p of parameters.filter(p=>p.name!=='X-Client-Purpose'))fields.push(`${JSON.stringify(p.name==='Idempotency-Key'?'idempotencyKey':p.name==='X-Device-Id'?'deviceId':p.name==='X-Client-Proof'?'clientProof':p.name)}${p.required?'':'?'}: string;`);
    inputs.push(`${JSON.stringify(operationId)}: { ${fields.join(' ')} signal?: AbortSignal };`);
    specs[operationId]={path,method:method.toUpperCase(),parameters,authenticated:!op.security,request:op.requestBody?.content['application/json'].schema??null,response:success[1].content?.['application/json'].schema??null,status:Number(success[0])};
  }
  if(Object.keys(specs).length!==(purpose==='DRIVER'?20:10))throw new Error('Unexpected mobile operation count');
  const names=new Set();function collect(schema){if(!schema)return;if(schema.$ref){const name=schema.$ref.split('/').at(-1);if(!names.has(name)){names.add(name);collect(document.components.schemas[name]);}}for(const value of Object.values(schema.properties??{}))collect(value);if(schema.items)collect(schema.items);}
  for(const spec of Object.values(specs)){collect(spec.request);collect(spec.response);}
  const schemas=Object.fromEntries([...names].map(name=>[name,document.components.schemas[name]]));
  return `// Generated from contracts/openapi-mvp.yaml. Run pnpm contracts:generate.
import type { Operations } from './generated/m1';
type ${label}Purpose<T> = T extends {clientPurpose:string} ? Omit<T,'clientPurpose'> & {clientPurpose:${JSON.stringify(purpose)}} : T;
export interface ${label}Inputs { ${inputs.join('\n')} }
interface ${label}Operations { ${operationTypes.join('\n')} }
type Shape = { description?: string; $ref?: string; type?: string | string[]; const?: unknown; enum?: unknown[]; properties?: Record<string, Shape>; required?: string[]; additionalProperties?: boolean; items?: Shape; pattern?: string; format?: string; minLength?: number; maxLength?: number; minimum?: number; maximum?: number; maxItems?: number };
const schemas: Record<string, Shape> = ${JSON.stringify(schemas)};
const specs = ${JSON.stringify(specs)} as const;
function valid(value: unknown, shape: Shape): boolean {
 if(shape.$ref) return valid(value,schemas[shape.$ref.split('/').pop()!]!);
 if('const' in shape && value!==shape.const) return false;
 if(shape.enum && !shape.enum.includes(value)) return false;
 if(Array.isArray(shape.type)) return shape.type.some(type=>valid(value,{...shape,type}));
 if(shape.type==='null') return value===null;
 if(shape.type==='object'){
  if(!value || typeof value!=='object' || Array.isArray(value))return false;
  const body=value as Record<string,unknown>;
  return (shape.required??[]).every(key=>Object.hasOwn(body,key)) && Object.entries(body).every(([key,item])=>shape.properties?.[key]?valid(item,shape.properties[key]):shape.additionalProperties!==false);
 }
 if(shape.type==='array')return Array.isArray(value) && (shape.maxItems===undefined||value.length<=shape.maxItems) && value.every(item=>valid(item,shape.items!));
 if(shape.type==='string')return typeof value==='string' && (shape.minLength===undefined||value.length>=shape.minLength) && (shape.maxLength===undefined||value.length<=shape.maxLength) && (!shape.pattern||new RegExp(shape.pattern).test(value)) && (shape.format!=='uuid'||/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) && (shape.format!=='date-time'||Number.isFinite(Date.parse(value)));
 if(shape.type==='integer'||shape.type==='number')return typeof value==='number' && Number.isFinite(value) && (shape.type!=='integer'||Number.isInteger(value)) && (shape.minimum===undefined||value>=shape.minimum) && (shape.maximum===undefined||value<=shape.maximum);
 return shape.type==='boolean' && typeof value==='boolean';
}
export class ${label}ApiError extends Error { constructor(readonly status:number){super('Mobile identity request failed');} }
/** Stateless transport. Caller keeps credentials in platform secure storage and serializes refresh.
 * No logging, localStorage, persistent token cache, automatic retries or SMS-code retrieval. */
export function create${label}Client(baseUrl:string,fetcher:typeof fetch=fetch){
 return {async request<K extends keyof ${label}Inputs>(operation:K,input:${label}Inputs[K]):Promise<${label}Operations[K]['response']>{
  const spec=specs[operation],args=input as unknown as Record<string,unknown>,headers:Record<string,string>={Accept:'application/json'};let path:string=spec.path;
  if(spec.authenticated){if(typeof args.accessToken!=='string'||!args.accessToken)throw new ${label}ApiError(400);headers.Authorization='Bearer '+args.accessToken;}
  for(const parameter of spec.parameters){const name=parameter.name,field=name==='Idempotency-Key'?'idempotencyKey':name==='X-Device-Id'?'deviceId':name==='X-Client-Proof'?'clientProof':name;const value=args[field];
   if(name==='X-Client-Purpose'){headers[name]=${JSON.stringify(purpose)};continue;}
   if(value===undefined&&!parameter.required)continue;
   if(!valid(value,parameter.schema))throw new ${label}ApiError(400);
   if(parameter.in==='path')path=path.replace('{'+name+'}',encodeURIComponent(value as string));else if((parameter.in as string)==='query')path+=(path.includes('?')?'&':'?')+encodeURIComponent(name)+'='+encodeURIComponent(value as string);else headers[name]=value as string;
  }
  if(spec.request && args.body && typeof args.body==='object' && 'clientPurpose' in args.body && args.body.clientPurpose!==${JSON.stringify(purpose)})throw new ${label}ApiError(400);
  if(spec.request&&!valid(args.body,spec.request))throw new ${label}ApiError(400);
  if(spec.request)headers['Content-Type']='application/json';
  const response=await fetcher(baseUrl.replace(/\\/$/,'')+path,{method:spec.method,headers,credentials:'omit',cache:'no-store',...(spec.request?{body:JSON.stringify(args.body)}:{}),...(args.signal?{signal:args.signal as AbortSignal}:{})});
  if(response.status!==spec.status)throw new ${label}ApiError(response.status);
  if(!spec.response)return undefined as ${label}Operations[K]['response'];
  let body:unknown;try{body=await response.json();}catch{throw new ${label}ApiError(502);}
  if(body && typeof body==='object' && 'clientPurpose' in body && body.clientPurpose!==${JSON.stringify(purpose)})throw new ${label}ApiError(502);
  if(!valid(body,spec.response))throw new ${label}ApiError(502);return body as ${label}Operations[K]['response'];
 }};
}
`;
}

export function generateHealthClient(document) {
  const path = Object.entries(document.paths).find(([, item]) => item.get?.operationId === 'getHealth')?.[0];
  if (!path) throw new Error('Missing implemented health operation');
  const schema = document.components.schemas.HealthResponse;
  const checks = schema.required.map(key => {
    const property = schema.properties[key];
    if (!('const' in property)) throw new Error('Health client requires explicit constant response fields');
    return `!(${JSON.stringify(key)} in body) || body[${JSON.stringify(key)}] !== ${JSON.stringify(property.const)}`;
  });
  return `// Generated from contracts/openapi-mvp.yaml. Run pnpm contracts:generate.
import type { HealthResponse } from './generated/m1';

export function createHealthClient(baseUrl: string, fetcher: typeof fetch = fetch) {
  return {
    async getHealth(signal?: AbortSignal): Promise<HealthResponse> {
      const response = await fetcher(baseUrl.replace(/\\/$/, '') + ${JSON.stringify(path)}, { ...(signal ? { signal } : {}) });
      if (!response.ok) throw new Error('API health unavailable');
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object' ||
        ${checks.join(' ||\n        ')}) throw new Error('Unexpected API health response');
      return body as HealthResponse;
    },
  };
}
`;
}
export function generateFareClient(document){
 const specs={},inputs=[],names=new Set();
 const collect=shape=>{if(!shape)return;if(shape.$ref){const name=shape.$ref.split('/').at(-1);if(!names.has(name)){names.add(name);collect(document.components.schemas[name]);}}for(const value of Object.values(shape.properties??{}))collect(value);if(shape.items)collect(shape.items);for(const option of shape.oneOf??[])collect(option);};
 for(const [path,item]of Object.entries(document.paths))for(const [method,op]of Object.entries(item)){
  if(op['x-implemented-in']!=='M3-local-simulation')continue;
  const parameters=(op.parameters??[]).map(p=>p.$ref?document.components.parameters[p.$ref.split('/').at(-1)]:p),request=op.requestBody?.content['application/json'].schema??null,response=op.responses['200'].content['application/json'].schema;
  const fields=parameters.map(p=>`${JSON.stringify(p.name==='Idempotency-Key'?'idempotencyKey':p.name==='X-CSRF-Token'?'csrfToken':p.name)}${p.required?'':'?'}: ${p.schema.type==='integer'?'number':'string'};`);
  if(request)fields.push('body: Operations['+JSON.stringify(op.operationId)+']["body"];');
  inputs.push(`${JSON.stringify(op.operationId)}: {${fields.join(' ')} signal?:AbortSignal};`);
  specs[op.operationId]={path,method:method.toUpperCase(),parameters,request,response};collect(request);collect(response);
 }
 if(Object.keys(specs).length!==14)throw new Error('Unexpected fare operation count');
 return `// Generated from contracts/openapi-mvp.yaml. Run pnpm contracts:generate.
import type {Operations} from './generated/m1';
export interface FareInputs {${inputs.join('\n')}}
type Shape={type?:string|string[];oneOf?:Shape[];$ref?:string;const?:unknown;enum?:unknown[];properties?:Record<string,Shape>;required?:string[];additionalProperties?:boolean;items?:Shape;minItems?:number;maxItems?:number;minimum?:number;maximum?:number;format?:string;minLength?:number;maxLength?:number};
const specs=${JSON.stringify(specs)} as const;
const schemas:Record<string,Shape>=${JSON.stringify(Object.fromEntries([...names].map(n=>[n,document.components.schemas[n]])))};
function valid(v:unknown,s:Shape):boolean{
 if(s.$ref)return valid(v,schemas[s.$ref.split('/').pop()!]!);
 if(s.oneOf)return s.oneOf.filter(o=>valid(v,o)).length===1;
 if('const'in s)return v===s.const;
 if(s.enum&&!s.enum.includes(v))return false;
 if(Array.isArray(s.type))return s.type.some(type=>valid(v,{...s,type}));
 if(s.type==='null')return v===null;
 if(s.type==='object'){if(!v||typeof v!=='object'||Array.isArray(v))return false;const b=v as Record<string,unknown>;return (s.required??[]).every(k=>Object.hasOwn(b,k))&&Object.entries(b).every(([k,value])=>s.properties?.[k]?valid(value,s.properties[k]):s.additionalProperties!==false);}
 if(s.type==='array')return Array.isArray(v)&&(s.minItems===undefined||v.length>=s.minItems)&&(s.maxItems===undefined||v.length<=s.maxItems)&&v.every(value=>valid(value,s.items!));
 if(s.type==='string')return typeof v==='string'&&(s.minLength===undefined||v.length>=s.minLength)&&(s.maxLength===undefined||v.length<=s.maxLength)&&(s.format!=='uuid'||/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v));
 if(s.type==='integer'||s.type==='number')return typeof v==='number'&&Number.isFinite(v)&&(s.type!=='integer'||Number.isSafeInteger(v))&&(s.minimum===undefined||v>=s.minimum)&&(s.maximum===undefined||v<=s.maximum);
 return s.type==='boolean'&&typeof v==='boolean';
}
export class FareApiError extends Error{constructor(readonly status:number){super('Fare request unavailable');}}
/** Same-origin BFF only. No credential storage, automatic retry or activation transport. */
export function createFareClient(fetcher:typeof fetch=fetch){return {async request<K extends keyof FareInputs>(operation:K,input:FareInputs[K]):Promise<Operations[K]['response']>{
 const spec=specs[operation],args=input as unknown as Record<string,unknown>,headers:Record<string,string>={Accept:'application/json'};let path:string=spec.path;
 for(const p of spec.parameters){const field=p.name==='Idempotency-Key'?'idempotencyKey':p.name==='X-CSRF-Token'?'csrfToken':p.name,value=args[field];if(value===undefined&&!p.required)continue;if(!valid(value,p.schema))throw new FareApiError(400);if(p.in==='path')path=path.replace('{'+p.name+'}',encodeURIComponent(String(value)));else if(p.in==='query')path+=(path.includes('?')?'&':'?')+p.name+'='+encodeURIComponent(String(value));else headers[p.name]=String(value);}
 if(spec.request&&!valid(args.body,spec.request))throw new FareApiError(400);if(spec.request)headers['Content-Type']='application/json';
 const response=await fetcher('/v1'+path,{method:spec.method,headers,credentials:'same-origin',cache:'no-store',...(args.signal?{signal:args.signal as AbortSignal}:{}),...(spec.request?{body:JSON.stringify(args.body)}:{})});
 if(response.status!==200)throw new FareApiError(response.status);let body:unknown;try{body=await response.json();}catch{throw new FareApiError(502);}if(!valid(body,spec.response))throw new FareApiError(502);return body as Operations[K]['response'];
 }};}
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const input = new URL('../contracts/openapi-mvp.yaml', import.meta.url);
  const document = parse(await readFile(input, 'utf8'));
  const outputs = [
    ['../packages/contracts/src/generated/m1.ts', generate(document)],
    ['../packages/contracts/src/health-client.ts', generateHealthClient(document)],
    ['../packages/contracts/src/passenger-client.ts', generatePassengerClient(document)],
    ['../packages/contracts/src/driver-client.ts', generateDriverClient(document)],
    ['../packages/contracts/src/fare-client.ts', generateFareClient(document)],
    ['../services/api/src/contracts/generated/mvp.ts', generate(document)],
  ];
  for (const [path, generated] of outputs) {
    const output = new URL(path, import.meta.url);
    if (process.argv.includes('--check')) {
      if (await readFile(output, 'utf8') !== generated) throw new Error('Generated contracts drifted; run pnpm contracts:generate');
    } else {
      await mkdir(new URL('.', output), { recursive: true });
      await writeFile(output, generated);
    }
  }
  if (process.argv.includes('--check')) console.info('Generated MVP types and health client match the contract.');
}
