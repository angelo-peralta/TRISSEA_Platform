import {PhoneAuthError,objectInput,uuid} from '../passenger/primitives';
export const caseKinds=['DRIVER','VEHICLE','TODA_MEMBERSHIP'] as const;
export type CaseKind=typeof caseKinds[number];
export const outcomes=['APPROVE','REJECT','REVOKE','EXPIRE'] as const;
export type Outcome=typeof outcomes[number];
export function version(value:unknown):number{if(typeof value!=='number'||!Number.isInteger(value)||value<1||value>2147483646)throw new PhoneAuthError('INVALID_REQUEST');return value;}
export function openInput(raw:unknown){const value=objectInput(raw,['relationshipId','kind']);if(!uuid(value.relationshipId)||!caseKinds.includes(value.kind as CaseKind))throw new PhoneAuthError('INVALID_REQUEST');return {relationshipId:value.relationshipId,kind:value.kind as CaseKind};}
export function submissionInput(raw:unknown){const value=objectInput(raw,['expectedVersion','evidenceId','evidenceVersion']);if(!uuid(value.evidenceId))throw new PhoneAuthError('INVALID_REQUEST');return {expectedVersion:version(value.expectedVersion),evidenceId:value.evidenceId,evidenceVersion:version(value.evidenceVersion)};}
export function decisionInput(raw:unknown){const value=objectInput(raw,['expectedVersion','evidenceVersion','outcome','reasonCode']);const expectedVersion=version(value.expectedVersion),evidenceVersion=version(value.evidenceVersion);
 const reasons:Record<Outcome,readonly string[]>={APPROVE:['SYNTHETIC_ACCEPTED'],REJECT:['SYNTHETIC_INCOMPLETE','SYNTHETIC_MISMATCH'],REVOKE:['SYNTHETIC_WITHDRAWN'],EXPIRE:['SYNTHETIC_EXPIRED']};
 if(!outcomes.includes(value.outcome as Outcome)||typeof value.reasonCode!=='string'||!reasons[value.outcome as Outcome].includes(value.reasonCode))throw new PhoneAuthError('INVALID_REQUEST');
 return {expectedVersion,evidenceVersion,outcome:value.outcome as Outcome,reasonCode:value.reasonCode};
}
export function cursorInput(raw:unknown):string|undefined{const value=objectInput(raw??{},['after']);if(value.after===undefined)return undefined;if(!uuid(value.after))throw new PhoneAuthError('INVALID_REQUEST');return value.after;}
