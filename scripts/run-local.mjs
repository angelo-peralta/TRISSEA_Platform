import { spawn } from 'node:child_process';
import configuration from './environment.cjs';

const [profile, ...arguments_] = process.argv.slice(2);
if (!arguments_.length) throw new Error('Expected profile and Node entry point');
try {
  const child = spawn(process.execPath, arguments_, {
    env: configuration.environmentFor(profile), stdio: 'inherit', windowsHide: true,
  });
  child.on('error', () => { console.error('Configured local process failed to start'); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} catch { console.error('Local configuration rejected; check variable names and the selected profile'); process.exitCode = 1; }
