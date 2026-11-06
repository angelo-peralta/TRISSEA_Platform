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
    if(purpose==='PASSENGER'?op['x-implemented-in']!=='M2.3-local-synthetic':!(op['x-driver-operation-id']||op['x-implemented-in']==='M2.4-local-synthetic'))continue;
    const operationId=purpose==='DRIVER'?(op['x-driver-operation-id']??op.operationId):op.operationId;
    operationTypes.push(JSON.stringify(operationId)+': Omit<Operations['+JSON.stringify(op.operationId)+'],"response"> & {response: '+label+'Purpose<Operations['+JSON.stringify(op.operationId)+']["response"]>};');
    const success=Object.entries(op.responses).find(([code])=>/^2\d\d$/.test(code));
    const fields=[...(op.requestBody?['body: '+label+'Purpose<Operations['+JSON.stringify(op.operationId)+']["body"]>;']:[]),...(op.security?[]:['accessToken: string;'])];
    const parameters=(op.parameters??[]).map(p=>p.$ref?document.components.parameters[p.$ref.split('/').at(-1)]:p);
    for(const p of parameters.filter(p=>p.name!=='X-Client-Purpose'))fields.push(`${JSON.stringify(p.name==='Idempotency-Key'?'idempotencyKey':p.name==='X-Device-Id'?'deviceId':p.name==='X-Client-Proof'?'clientProof':p.name)}: string;`);
    inputs.push(`${JSON.stringify(operationId)}: { ${fields.join(' ')} signal?: AbortSignal };`);
    specs[operationId]={path,method:method.toUpperCase(),parameters,authenticated:!op.security,request:op.requestBody?.content['application/json'].schema??null,response:success[1].content?.['application/json'].schema??null,status:Number(success[0])};
  }
  if(Object.keys(specs).length!==(purpose==='DRIVER'?15:10))throw new Error('Unexpected mobile operation count');
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
   if(!valid(value,parameter.schema))throw new ${label}ApiError(400);
   if(parameter.in==='path')path=path.replace('{'+name+'}',encodeURIComponent(value as string));else headers[name]=value as string;
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const input = new URL('../contracts/openapi-mvp.yaml', import.meta.url);
  const document = parse(await readFile(input, 'utf8'));
  const outputs = [
    ['../packages/contracts/src/generated/m1.ts', generate(document)],
    ['../packages/contracts/src/health-client.ts', generateHealthClient(document)],
    ['../packages/contracts/src/passenger-client.ts', generatePassengerClient(document)],
    ['../packages/contracts/src/driver-client.ts', generateDriverClient(document)],
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
