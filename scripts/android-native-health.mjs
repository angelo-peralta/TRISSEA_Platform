// Crash-buffer summaries only; never retain arbitrary application log content.
export function nativeCrashCount(log,packageName,since){
 return log.split('\n').filter(line=>{
  const time=Number(/^\s*(\d+\.\d+)/.exec(line)?.[1])*1000;
  return time>=since&&(/\bCmdline:\s+(\S+)/.exec(line)?.[1]===packageName||line.includes('Process: '+packageName+','));
 }).length;
}
