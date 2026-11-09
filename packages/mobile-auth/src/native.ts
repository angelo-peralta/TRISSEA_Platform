import {Platform} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import {MobileSession} from './controller';
import {mobileTransport} from './transport';
import type {Purpose} from './configuration';
const sessions=new Map<string,Promise<MobileSession>>();

export function nativeSession(purpose:Purpose,apiUrl:string){
 const scope=purpose+':'+apiUrl,prior=sessions.get(scope);if(prior)return prior;
 const pending=create(purpose,apiUrl);sessions.set(scope,pending);void pending.catch(()=>sessions.delete(scope));return pending;
}
async function create(purpose:Purpose,apiUrl:string){
 if(!['android','ios'].includes(Platform.OS)||!await SecureStore.isAvailableAsync())throw new Error('Native secure storage unavailable');
 const key=`trissea.${purpose.toLowerCase()}.identity.v1`,options={keychainService:key,keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,requireAuthentication:false};
 return new MobileSession({purpose,apiUrl,transport:mobileTransport(purpose,apiUrl),uuid:()=>Crypto.randomUUID(),proof:async()=>{
  const bytes=await Crypto.getRandomBytesAsync(32);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 },store:{read:()=>SecureStore.getItemAsync(key,options),write:value=>SecureStore.setItemAsync(key,value,options),clear:()=>SecureStore.deleteItemAsync(key,options)}});
}
