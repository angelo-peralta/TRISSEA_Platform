import {useEffect,useRef,useState} from 'react';
import type {Schemas} from '@trissea/contracts';
type Case=Schemas['VerificationCase'];
type Detail=Schemas['VerificationDetail'];
type Decision=Schemas['VerificationDecisionRequest'];
const uuid=(s:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const valid=(c:Case)=>!!c&&uuid(c.id)&&uuid(c.todaId)&&Number.isSafeInteger(c.version)&&c.version>0&&c.source==='SYNTHETIC_ONLY'&&c.realDocumentsEnabled===false&&c.operationalServicesEnabled===false&&c.realDriverApproved===false&&['DRIVER','VEHICLE','TODA_MEMBERSHIP'].includes(c.kind)&&['DRAFT','SUBMITTED','APPROVED','REJECTED','REVOKED','EXPIRED'].includes(c.state);
class ReviewError extends Error{constructor(readonly status:number){super('Review unavailable');}}

/** Application permissions come from current PostgreSQL records on every call.
 * This panel cannot provision staff, assign reviewers or upload documents. */
export function AssignedVerificationPanel({csrfToken}:{csrfToken:string}){
 const [toda,setToda]=useState(''),[membership,setMembership]=useState(false),[items,setItems]=useState<Case[]>([]),[nextCursor,setNextCursor]=useState<string|null>(null),[detail,setDetail]=useState<Detail|null>(null),[busy,setBusy]=useState(false),[status,setStatus]=useState('Load an assigned synthetic queue to check current access.');
 const pending=useRef(false),epoch=useRef(0),controller=useRef<AbortController|null>(null),attempt=useRef<{id:string;path:string;body:Decision;key:string}|null>(null);
 useEffect(()=>{const invalidate=()=>{epoch.current++;controller.current?.abort();};const clear=()=>{if(document.hidden){invalidate();setItems([]);setNextCursor(null);setDetail(null);attempt.current=null;setStatus('Review data hidden. Reload assigned cases after returning.');}};document.addEventListener('visibilitychange',clear);return ()=>{invalidate();document.removeEventListener('visibilitychange',clear);};},[]);
 function reset(){epoch.current++;controller.current?.abort();setItems([]);setNextCursor(null);setDetail(null);attempt.current=null;setStatus('Load an assigned synthetic queue to check current access.');}
 async function request(path:string,body?:Decision,key?:string){
  const abort=new AbortController();controller.current=abort;const deadline=setTimeout(()=>abort.abort(),10000);
  try{const r=await fetch('/v1/admin/verifications/'+path,{credentials:'same-origin',cache:'no-store',signal:abort.signal,...(body?{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken,'Idempotency-Key':key!},body:JSON.stringify(body)}:{})});if(!r.ok)throw new ReviewError(r.status);return await r.json() as unknown;}finally{clearTimeout(deadline);}
 }
 function failed(error:unknown){setItems([]);setNextCursor(null);setDetail(null);if(error instanceof ReviewError&&(error.status===401||error.status===403)){attempt.current=null;setStatus('Access denied. Check current scope and session, or reauthenticate with TOTP.');}else if(error instanceof ReviewError&&error.status===409){attempt.current=null;setStatus('Case or evidence changed. Reload and review it before a new decision.');}else setStatus('Review service unavailable. Retry the original decision or reload current cases.');}
 async function run(work:(version:number)=>Promise<void>){if(pending.current)return;pending.current=true;setBusy(true);const version=++epoch.current;try{await work(version);}catch(e){if(version===epoch.current)failed(e);}finally{pending.current=false;setBusy(false);}}
 async function load(after:string|null=null){
  if(!uuid(toda)){reset();setStatus('Enter a valid synthetic organization identifier.');return;}
  return run(async version=>{
   attempt.current=null;setDetail(null);
   if(!after){setItems([]);setNextCursor(null);}
   setStatus(after?'Checking more assigned cases…':'Checking assigned cases…');
   let data:Schemas['VerificationCases'];
   try{data=await request('todas/'+encodeURIComponent(toda)+(membership?'/memberships':'/cases')+(after?'?after='+encodeURIComponent(after):'')) as Schemas['VerificationCases'];}
   catch(error){
    if(after&&(error instanceof TypeError||error instanceof DOMException&&error.name==='AbortError'||error instanceof ReviewError&&error.status>=500)){
     if(version===epoch.current)setStatus('More cases unavailable. Retry loading more assigned cases.');
     return;
    }
    throw error;
   }
   if(!data||data.source!=='SYNTHETIC_ONLY'||!Array.isArray(data.items)||data.items.length>20||data.items.some(c=>!valid(c)||c.todaId!==toda||((c.kind==='TODA_MEMBERSHIP')!==membership)||after&&c.id.toLowerCase()<=after.toLowerCase()))throw new Error();
   const combined=after?[...items,...data.items]:data.items;
   if(new Set(combined.map(c=>c.id.toLowerCase())).size!==combined.length||data.nextCursor!==null&&(typeof data.nextCursor!=='string'||!uuid(data.nextCursor)||data.items.length!==20||data.nextCursor!==data.items.at(-1)?.id))throw new Error();
   if(version===epoch.current){setItems(combined);setNextCursor(data.nextCursor);setStatus(combined.length?'Assigned cases loaded. Showing '+combined.length+' synthetic records.':'No assigned cases in this queue.');}
  });
 }
 function open(c:Case){return run(async version=>{attempt.current=null;setDetail(null);const value=await request((membership?'memberships/':'cases/')+encodeURIComponent(c.id)) as Detail;
  if(!value||!valid(value.case)||value.case.id!==c.id||value.case.todaId!==toda||((value.case.kind==='TODA_MEMBERSHIP')!==membership)||!Array.isArray(value.submissions)||!Array.isArray(value.decisions)||value.submissions.length>50||value.decisions.length>100||value.evidence&&(!uuid(value.evidence.evidenceId)||!Number.isSafeInteger(value.evidence.evidenceVersion)||value.evidence.evidenceVersion<1||!/^SYNTHETIC_[A-Z0-9_]{1,32}$/.test(value.evidence.referenceCode)))throw new Error();
  if(version===epoch.current){setDetail(value);setStatus('Review current synthetic evidence. No operating authority is granted.');}
 });}
 function decide(outcome:Decision['outcome']){
  if(!detail?.evidence)return;
  const reasons={APPROVE:'SYNTHETIC_ACCEPTED',REJECT:'SYNTHETIC_INCOMPLETE',REVOKE:'SYNTHETIC_WITHDRAWN',EXPIRE:'SYNTHETIC_EXPIRED'} as const;
  attempt.current={id:detail.case.id,path:(membership?'memberships/':'cases/')+detail.case.id+'/decisions',body:{expectedVersion:detail.case.version,evidenceVersion:detail.evidence.evidenceVersion,outcome,reasonCode:reasons[outcome]},key:crypto.randomUUID()};return retry();
 }
 function retry(){const current=attempt.current;if(!current)return;return run(async version=>{setDetail(null);setStatus('Decision pending server confirmation…');const result=await request(current.path,current.body,current.key) as Case;if(!valid(result)||result.id!==current.id)throw new Error();if(version===epoch.current){attempt.current=null;setItems([]);setNextCursor(null);setStatus('Synthetic decision recorded by the server: '+result.state+'. Reload current cases to continue.');}});}
 const c=detail?.case;
 return <section className="verification-panel" aria-labelledby="verification-title">
  <h3 id="verification-title">Assigned synthetic verification</h3>
  <p>Assigned reviewers only. Real documents, permits and driver operation remain disabled.</p>
  <label htmlFor="review-toda">Synthetic organization identifier</label>
  <input id="review-toda" value={toda} disabled={busy} autoComplete="off" spellCheck={false} onChange={e=>{reset();setToda(e.target.value);}}/>
  <label htmlFor="review-kind">Review queue</label>
  <select id="review-kind" value={membership?'membership':'driver'} disabled={busy} onChange={e=>{reset();setMembership(e.target.value==='membership');}}><option value="driver">Driver and vehicle</option><option value="membership">TODA membership</option></select>
  <button onClick={()=>void load()} disabled={busy}>Load assigned cases</button>
  <p role="status" aria-live="polite">{status}</p>
  <ul id="assigned-cases" aria-label="Assigned cases">{items.map(item=><li key={item.id}><button disabled={busy} onClick={()=>void open(item)}>{item.kind} · {item.effectiveState} · {item.id}</button></li>)}</ul>
  {nextCursor?<button disabled={busy} aria-controls="assigned-cases" onClick={()=>void load(nextCursor)}>Load more assigned cases</button>:null}
  {c&&detail?<section aria-label="Selected synthetic case">
   <h4>{c.kind} · {c.effectiveState}</h4>
   <p>Case version {c.version}, submission {c.round}. Evidence {detail.evidence?.evidenceVersion??'not submitted'}.</p>
   <p>{detail.evidence?.referenceCode??'No selected evidence'}</p>
   <p>Recent history: {detail.submissions.length} submissions, {detail.decisions.length} decisions.{detail.historyTruncated?' Older history retained by the server.':''}</p>
   <div className="actions">
    {c.state==='SUBMITTED'?<><button disabled={busy||!c.evidenceCurrent||!detail.evidence} onClick={()=>void decide('APPROVE')}>Approve synthetic evidence</button><button disabled={busy||!detail.evidence} onClick={()=>void decide('REJECT')}>Reject synthetic evidence</button></>:null}
    {c.state==='APPROVED'?<><button disabled={busy} onClick={()=>void decide('REVOKE')}>Revoke synthetic approval</button><button disabled={busy||c.effectiveState!=='EXPIRED'} onClick={()=>void decide('EXPIRE')}>Record synthetic expiry</button></>:null}
   </div>
  </section>:null}
  {attempt.current&&!busy?<button onClick={()=>void retry()}>Retry original decision</button>:null}
 </section>;
}
