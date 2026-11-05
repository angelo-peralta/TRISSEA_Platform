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
      operations.push(`  ${JSON.stringify(operation.operationId)}: { method: ${JSON.stringify(method.toUpperCase())}; path: ${JSON.stringify(path)}; body: ${request ? schemaType(request) : 'never'}; response: ${schemaType(response?.content?.['application/json']?.schema)} };`);
    }
  }
  return `// Generated from contracts/openapi-mvp.yaml. Run pnpm contracts:generate.\n// Future operations are DESIGN ONLY; M1 implements getHealth only.\nexport interface Schemas {\n${schemas}\n}\nexport interface Operations {\n${operations.join('\n')}\n}\nexport type HealthResponse = Operations['getHealth']['response'];\n`;
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
  ];
  for (const [path, generated] of outputs) {
    const output = new URL(path, import.meta.url);
    if (process.argv.includes('--check')) {
      if (await readFile(output, 'utf8') !== generated) throw new Error('Generated contracts drifted; run pnpm contracts:generate');
    } else {
      await mkdir(new URL('../packages/contracts/src/generated/', import.meta.url), { recursive: true });
      await writeFile(output, generated);
    }
  }
  if (process.argv.includes('--check')) console.info('Generated MVP types and health client match the contract.');
}
