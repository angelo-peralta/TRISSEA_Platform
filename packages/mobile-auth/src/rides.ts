import {createRideClient,RideApiError,type RideInputs,type Schemas} from '../../contracts/src/index';
import type {MobileSession,CredentialStore} from './controller';
import type {Purpose} from './configuration';
type Ride=Schemas['M4Ride'];
export interface RideView {userId:string|null;scenarios:Schemas['M4Scenario'][];quote:Schemas['M4Quote']|null;ride:Ride|null;offers:Schemas['M4Offers']['items'];recent:Schemas['M4Recent']['items'];reference:string;available:boolean;busy:boolean;loaded:boolean;offline:boolean;message:string}
interface Pending {userId:string;operation:keyof RideInputs;input:Record<string,unknown>}
const mutations=new Set<keyof RideInputs>(['m4Quote','m4Confirm','m4Cancel','m4Availability','m4DriverAction']);
const finished=(ride:Ride)=>['COMPLETED','CANCELLED','EXPIRED','FAILED','NO_DRIVER_AVAILABLE'].includes(ride.state);
export class RideSession{
 private state:RideView={userId:null,scenarios:[],quote:null,ride:null,offers:[],recent:[],reference:'',available:false,busy:false,loaded:false,offline:false,message:'Load your local simulation.'};
 private listeners=new Set<()=>void>();private refreshing:Promise<void>|null=null;private syncing:Promise<void>|null=null;private pending:Pending|null=null;private loadedUser:string|null=null;private viewEpoch=0;
 readonly client;
 constructor(readonly auth:Pick<MobileSession,'getSnapshot'|'authorized'>,readonly purpose:Purpose,readonly apiUrl:string,readonly store:CredentialStore,readonly uuid:()=>string,fetcher:typeof fetch=fetch){this.client=createRideClient(apiUrl,purpose,fetcher);}
 getSnapshot=()=>this.state;subscribe=(listener:()=>void)=>{this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};};
 private update(value:Partial<RideView>){this.state={...this.state,...value};for(const listener of this.listeners)listener();}
 private apply(ride:Ride){if(this.state.ride?.id===ride.id&&this.state.ride.version>ride.version)return;this.update({ride,quote:null});}
 private call<K extends keyof RideInputs>(operation:K,input:Omit<RideInputs[K],'accessToken'>){return this.auth.authorized(async accessToken=>{
  const controller=new AbortController(),deadline=setTimeout(()=>controller.abort(),10000);
  try{return await this.client.request(operation,{...input,accessToken,signal:controller.signal} as RideInputs[K]);}finally{clearTimeout(deadline);}
 });}
 private failure(error:unknown){const status=error instanceof RideApiError?error.status:0;this.update({offline:status===0||status>=500,message:status===401?'Session expired. Sign in from Account or Profile.':status===403?'This account is not enrolled in this local simulation.':status===409?'The quote, offer or ride changed. Refresh and review before continuing.':status===400||status===404?'This synthetic route or action is unavailable. Refresh the current ride.':'Connection unavailable. Your pending action is preserved; retry after reconnecting.'});return status;}
 private async restorePending(){const user=this.auth.getSnapshot().profile?.userId;if(!user)throw new Error('Sign in required');if(user===this.loadedUser)return;
  this.viewEpoch++;this.pending=null;this.update({userId:user,ride:null,quote:null,offers:[],scenarios:[],recent:[],loaded:false});
  const raw=await this.store.read();if(!raw){this.loadedUser=user;return;}const value=JSON.parse(raw) as Pending;
  if(!value||typeof value!=='object')throw new Error('Invalid pending action');
  if(value.userId!==user){await this.store.clear();this.loadedUser=user;return;}if(!mutations.has(value.operation)||!value.input||typeof value.input.idempotencyKey!=='string'||'accessToken'in value.input)throw new Error('Invalid pending action');this.pending=value;this.loadedUser=user;
 }
 async refresh(){if(this.refreshing)return this.refreshing;if(this.state.busy||this.auth.getSnapshot().phase!=='AUTHENTICATED')return;
  this.refreshing=this.load();try{await this.refreshing;}finally{this.refreshing=null;}
 }
 private async load(){let epoch=this.viewEpoch;
  try{const restoring=this.restorePending();epoch=this.viewEpoch;await restoring;if(this.pending){await this.execute();if(this.state.ride){const ride=await this.call(this.purpose==='PASSENGER'?'m4PASSENGERRide':'m4DRIVERRide',{rideId:this.state.ride.id});if(epoch===this.viewEpoch)this.apply(ride);}}
   const scenarios=await this.call(this.purpose==='PASSENGER'?'m4PASSENGERScenarios':'m4DRIVERScenarios',{}),current=await this.call(this.purpose==='PASSENGER'?'m4PASSENGERCurrent':'m4DRIVERCurrent',{}),recent=await this.call(this.purpose==='PASSENGER'?'m4PASSENGERRecent':'m4DRIVERRecent',{});
   const offers=this.purpose==='DRIVER'?(await this.call('m4Offers',{})).items:[];
   if(epoch!==this.viewEpoch)return;if(current.ride)this.apply(current.ride);
   this.update({scenarios:scenarios.items,reference:scenarios.participantReference,available:scenarios.available,recent:recent.items,offers,loaded:true,offline:false,message:this.state.loaded&&!this.state.offline&&this.state.message?this.state.message:'Synced with the local simulation server. No live operations.'});
  }catch(error){if(epoch===this.viewEpoch)this.failure(error);}
 }
 private async execute(){const p=this.pending;if(!p)return;try{
  const result=await this.call(p.operation,p.input as Omit<RideInputs[typeof p.operation],'accessToken'>);await this.store.clear();this.pending=null;
  if('quote'in result)this.update({quote:result.quote});else if('outcome'in result){if(result.ride)this.apply(result.ride);this.update({message:result.outcome==='PICKUP_REJECTED'?'Pickup proof not accepted. Check the passenger code; guesses are limited.':'Server confirmed '+result.outcome+'.'});}else if('state'in result&&'fare'in result)this.apply(result as Ride);
  this.update({offline:false});
 }catch(error){const status=this.failure(error);if([400,403,404,409].includes(status)){await this.store.clear();this.pending=null;}throw error;}}
 private async mutate(operation:keyof RideInputs,input:Record<string,unknown>){if(this.state.busy)return;this.update({busy:true,message:''});try{await this.refreshing;await this.restorePending();if(!this.pending)this.pending={userId:this.loadedUser!,operation,input:{...input,idempotencyKey:this.uuid()}};await this.store.write(JSON.stringify(this.pending));await this.execute();}catch(error){this.failure(error);}finally{this.update({busy:false});}}
 preview(scenarioId:string,passengerCount:number,fareClass:'REGULAR'|'DISCOUNTED'){return this.mutate('m4Quote',{body:{scenarioId,passengerCount,fareClass}});}
 confirm(){return this.state.quote?this.mutate('m4Confirm',{body:{quoteId:this.state.quote.id}}):Promise.resolve();}
 cancel(){const r=this.state.ride;return r?this.mutate('m4Cancel',{rideId:r.id,body:{expectedVersion:r.version}}):Promise.resolve();}
 availability(available:boolean){return this.mutate('m4Availability',{body:{available}}).then(()=>this.refresh());}
 action(action:string,pickupCode?:string){const r=this.state.ride;return r?this.mutate('m4DriverAction',{rideId:r.id,action,body:{expectedVersion:r.version,...pickupCode===undefined?{}:{pickupCode}}}):Promise.resolve();}
 offer(index:number,action:'ACCEPT'|'DECLINE'){const e=this.state.offers[index];return e?this.mutate('m4DriverAction',{rideId:e.ride.id,action,body:{expectedVersion:e.ride.version,offerId:e.offer.id}}).then(()=>this.refresh()):Promise.resolve();}
 async open(id:string){const epoch=this.viewEpoch;try{const ride=await this.call(this.purpose==='PASSENGER'?'m4PASSENGERRide':'m4DRIVERRide',{rideId:id});if(epoch===this.viewEpoch)this.apply(ride);}catch(error){if(epoch===this.viewEpoch)this.failure(error);}}
 async syncRide(manual=false){
  if(manual)this.update({message:''});
  if(this.syncing)return this.syncing;if(this.state.busy)return;
  this.syncing=(async()=>{if(this.state.ride)await this.open(this.state.ride.id);await this.refresh();})();
  try{await this.syncing;}finally{this.syncing=null;}
 }
 home(){if(!this.state.ride||finished(this.state.ride)){this.viewEpoch++;this.update({ride:null,quote:null});}}
 retry(){return this.pending?this.mutate(this.pending.operation,this.pending.input):this.syncRide();}
}
