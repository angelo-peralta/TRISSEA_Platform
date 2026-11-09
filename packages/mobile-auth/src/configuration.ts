export type Purpose='PASSENGER'|'DRIVER';
export function mobileConfiguration(enabled:string|undefined,apiUrl:string|undefined,development:boolean):{enabled:false}|{enabled:true;apiUrl:string}{
 if(enabled===undefined||enabled==='false')return {enabled:false};
 if(enabled!=='true'||!development)throw new Error('Mobile identity preview configuration unavailable');
 try{const u=new URL(apiUrl??'');if(u.username||u.password||u.search||u.hash||u.pathname!=='/v1'||u.protocol!=='http:'||!['127.0.0.1','localhost','10.0.2.2'].includes(u.hostname)||!['4100','4101','4104'].includes(u.port))throw new Error();return {enabled:true,apiUrl:u.href};}
 catch{throw new Error('Mobile identity preview configuration unavailable');}
}
