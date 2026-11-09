import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import configuration from './environment.cjs';
import schema from './environment-schema.cjs';

const [app, ...arguments_] = process.argv.slice(2);
if (!['passenger', 'driver'].includes(app) || !arguments_.length) throw new Error('Expected app and Expo command');
const local = configuration.loadLocal({ optional: arguments_[0] !== 'start' });
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !Object.hasOwn(schema.fields, key)));
for (const key of ['EXPO_PUBLIC_M2_AUTH_ENABLED', 'EXPO_PUBLIC_M2_API_URL']) env[key] = process.env[key] ?? local[key];
env.EXPO_NO_DOTENV = '1';
const child = spawn(process.execPath, [fileURLToPath(new URL('../apps/' + app + '/node_modules/expo/bin/cli', import.meta.url)), ...arguments_], {
  cwd: fileURLToPath(new URL('../apps/' + app + '/', import.meta.url)), env, stdio: 'inherit', windowsHide: true,
});
child.on('exit', code => { process.exitCode = code ?? 1; });
child.on('error', () => { console.error('Expo process failed to start'); process.exitCode = 1; });
