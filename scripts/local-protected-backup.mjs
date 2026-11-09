// Windows development migration only. Plaintext travels through private pipes,
// never a command argument, file, terminal or tracked evidence artifact.
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

async function crypt(operation, file, input) {
  if (process.platform !== 'win32' || process.env.NODE_ENV === 'production') throw new Error('Local Windows backup context required');
  const allowed = resolve(process.env.LOCALAPPDATA, 'TRISSEA', 'secure-backups') + sep;
  if (!resolve(file).startsWith(allowed)) throw new Error('Protected backup path outside local backup directory');
  await mkdir(dirname(file), { recursive: true });
  const encrypt = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $payloadStream=New-Object IO.MemoryStream; [Console]::OpenStandardInput().CopyTo($payloadStream); $plain=$payloadStream.ToArray(); $protected=[Security.Cryptography.ProtectedData]::Protect($plain,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); $backupStream=[IO.File]::Open($env:TRISSEA_PROTECTED_PATH,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write); try { $backupStream.Write($protected,0,$protected.Length) } finally { $backupStream.Dispose(); [Array]::Clear($plain,0,$plain.Length) }`;
  const decrypt = `Add-Type -AssemblyName System.Security; $plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($env:TRISSEA_PROTECTED_PATH),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); $outputStream=[Console]::OpenStandardOutput(); $outputStream.Write($plain,0,$plain.Length); $outputStream.Flush(); [Array]::Clear($plain,0,$plain.Length)`;
  return new Promise((accept, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', operation === 'protect' ? encrypt : decrypt], {
      env: { ...process.env, TRISSEA_PROTECTED_PATH: resolve(file) }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    });
    const output = []; child.stdout.on('data', bytes => output.push(bytes));
    child.stderr.on('data', () => {});
    child.on('error', () => reject(new Error('Protected backup process unavailable')));
    child.on('close', code => code === 0 ? accept(Buffer.concat(output)) : reject(new Error('Protected backup operation failed')));
    child.stdin.on('error', () => {}); child.stdin.end(input);
  });
}
export const protectLocal = (bytes, file) => crypt('protect', file, bytes);
export const unprotectLocal = file => crypt('unprotect', file);
