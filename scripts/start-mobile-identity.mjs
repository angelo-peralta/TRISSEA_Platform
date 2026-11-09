import configuration from './environment.cjs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import schema from './environment-schema.cjs';
const configurationKeys=schema.fields;
const app=process.argv[2];
if(!['passenger','driver'].includes(app)||process.argv.length!==3)throw new Error('Expected passenger or driver');
const local=configuration.loadLocal();
// Map only public client configuration; process injection wins. No backend env
// file is passed to Expo or copied into the mobile application directory.
const publicEnv=Object.fromEntries(['EXPO_PUBLIC_M2_AUTH_ENABLED','EXPO_PUBLIC_M2_API_URL'].map(key=>[key,process.env[key]??local[key]??'']));
if(publicEnv.EXPO_PUBLIC_M2_AUTH_ENABLED==='')publicEnv.EXPO_PUBLIC_M2_AUTH_ENABLED='false';
if(!['false','true'].includes(publicEnv.EXPO_PUBLIC_M2_AUTH_ENABLED))throw new Error('Invalid EXPO_PUBLIC_M2_AUTH_ENABLED');
const cwd=fileURLToPath(new URL('../apps/'+app+'/',import.meta.url));
const cli=fileURLToPath(new URL('../apps/'+app+'/node_modules/expo/bin/cli',import.meta.url));
const child=spawn(process.execPath,[cli,'start','--dev-client','--localhost','--port',local[app.toUpperCase()+'_METRO_PORT']],{cwd,env:{...Object.fromEntries(Object.entries(process.env).filter(([key])=>!Object.hasOwn(local,key)||!Object.hasOwn(configurationKeys,key))),...publicEnv,EXPO_NO_DOTENV:'1'},stdio:'inherit',windowsHide:true});
child.on('exit',code=>{process.exitCode=code??1;});child.on('error',()=>{console.error('Mobile identity development server failed to start');process.exitCode=1;});
