import {useEffect,useMemo,useState,useSyncExternalStore} from 'react';
import {AppState,Pressable,StyleSheet,Text,TextInput,View} from 'react-native';
import {AppScreen,AppButton,InfoSection,useTheme} from '@trissea/mobile-ui';
import {spacing,typeScale,radius,touchTarget} from '@trissea/design-tokens';
import {mobileConfiguration,type Purpose} from './configuration';
import type {MobileSession} from './controller';

export function MobileAuthScreen({purpose}:{purpose:Purpose}){
 const [session,setSession]=useState<MobileSession|null>(null),[unavailable,setUnavailable]=useState(false);
 const configuration=useMemo(()=>{try{return mobileConfiguration(process.env.EXPO_PUBLIC_M2_AUTH_ENABLED,process.env.EXPO_PUBLIC_M2_API_URL,__DEV__);}catch{return null;}},[]);
 useEffect(()=>{let current=true;if(configuration?.enabled){void import('./native').then(m=>m.nativeSession(purpose,configuration.apiUrl)).then(s=>{if(current)setSession(s);}).catch(()=>{if(current)setUnavailable(true);});}return ()=>{current=false;};},[purpose,configuration]);
 return <AppScreen title={purpose==='DRIVER'?'Profile':'Account'}>
  {!configuration||unavailable?<InfoSection title="Identity preview unavailable">Check the local configuration and use a rebuilt native development client.</InfoSection>:!configuration.enabled?<InfoSection title="Not available in M1">Sign-in is disabled in this development preview.</InfoSection>:session?<SessionControls session={session} purpose={purpose}/>:<InfoSection title="Loading identity preview">Checking native secure storage…</InfoSection>}
 </AppScreen>;
}

function SessionControls({session,purpose}:{session:MobileSession;purpose:Purpose}){
 const state=useSyncExternalStore(session.subscribe,session.getSnapshot),theme=useTheme();
 const [phone,setPhone]=useState(''),[code,setCode]=useState(''),[ack,setAck]=useState({context:'',notice:false,terms:false});
 useEffect(()=>{void session.setActive(AppState.currentState==='active');const sub=AppState.addEventListener('change',s=>{if(s!=='active'){setPhone('');setCode('');}void session.setActive(s==='active');});return ()=>{sub.remove();void session.setActive(false);};},[session]);
 const textStyle=[styles.body,{color:theme.textPrimary}],inputStyle=[styles.input,{backgroundColor:theme.surfaceRaised,color:theme.textPrimary,borderColor:theme.border}];
 const signedOut=['SIGNED_OUT','EXPIRED'].includes(state.phase),profile=state.profile;
 const context=profile?[profile.userId,profile.requiredNoticeVersion,profile.requiredTermsVersion].join(':'):'',notice=!!context&&ack.context===context&&ack.notice,terms=!!context&&ack.context===context&&ack.terms;
 return <View style={styles.group}>
  <InfoSection title="Local identity preview">Use synthetic test accounts only. SMS is simulated. No live rides or identity-document collection.</InfoSection>
  {state.message&&<Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.body,{color:theme.textPrimary}]}>{state.message}</Text>}
  {state.busy&&<Text accessibilityLiveRegion="polite" style={textStyle}>Please wait…</Text>}
  {signedOut&&<View style={styles.group}>
   <Text accessibilityRole="header" style={[styles.heading,{color:theme.textPrimary}]}>{purpose==='DRIVER'?'Driver sign-in':'Passenger sign-in'}</Text>
   <Text style={textStyle}>Philippine mobile number</Text>
   <TextInput testID="auth-phone" accessibilityLabel="Philippine mobile number" placeholder="+639…" placeholderTextColor={theme.textSecondary} style={inputStyle} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="off" autoCorrect={false} maxLength={13} editable={!state.busy}/>
   <AppButton label="Request code" busy={state.busy} disabled={!/^\+639\d{9}$/.test(phone)} onPress={()=>{const value=phone;setPhone('');void session.requestCode(value);}}/>
  </View>}
  {state.phase==='CODE_REQUIRED'&&<View style={styles.group}>
   <Text accessibilityRole="header" style={[styles.heading,{color:theme.textPrimary}]}>Enter verification code</Text>
   <Text style={textStyle}>Six digits from the isolated mock SMS test harness. Codes are never shown by this app.</Text>
   <TextInput testID="auth-code" accessibilityLabel="Verification code" style={inputStyle} value={code} onChangeText={setCode} keyboardType="number-pad" secureTextEntry autoComplete="off" autoCorrect={false} contextMenuHidden maxLength={6}/>
   <AppButton label="Verify code" disabled={!/^\d{6}$/.test(code)} onPress={()=>{const value=code;setCode('');void session.verifyCode(value);}}/>
   <AppButton label="Change number" variant="secondary" onPress={()=>{setCode('');void session.changeNumber();}}/>
  </View>}
  {state.phase==='CONSENT_REQUIRED'&&profile&&<View style={styles.group}>
   <InfoSection title="Synthetic test acknowledgements">These engineering-only notices do not authorize production personal-data processing. No real documents or bookings are collected.</InfoSection>
   <Toggle label="I acknowledge the synthetic test privacy notice" checked={notice} onPress={()=>setAck({context,notice:!notice,terms})}/>
   <Toggle label="I accept the synthetic test terms" checked={terms} onPress={()=>setAck({context,notice,terms:!terms})}/>
   <AppButton label="Continue" disabled={!notice||!terms} onPress={()=>{void session.consent(notice,terms);}}/>
  </View>}
  {state.phase==='AUTHENTICATED'&&profile&&<View style={styles.group}>
   <InfoSection title={purpose==='DRIVER'?'Driver account connected':'Passenger account connected'}>Your session was checked with TRISSEA. Live services remain disabled.</InfoSection>
   {profile.clientPurpose==='DRIVER'&&<InfoSection title="Driver verification">{profile.driverStatus==='PENDING'?'Pending verification. Authentication does not authorize driving.':'Verification status: '+profile.driverStatus+'. Driving remains disabled.'}</InfoSection>}
   <AppButton label="Check session" onPress={()=>{void session.restore();}}/>
   {purpose==='DRIVER'&&<AppButton label="Go Online unavailable" disabled/>}
  </View>}
  {['OFFLINE','STORAGE_UNAVAILABLE','SIGNOUT_PENDING','LOCKED'].includes(state.phase)&&<AppButton label={state.phase==='SIGNOUT_PENDING'?'Retry sign-out':'Retry connection'} busy={state.busy} onPress={()=>{void session.restore();}}/>}
  {(profile||['OFFLINE','SIGNOUT_PENDING'].includes(state.phase))&&<AppButton label="Sign out" variant="secondary" busy={state.busy} onPress={()=>{setPhone('');setCode('');setAck({context:'',notice:false,terms:false});void session.logout();}}/>}
 </View>;
}
function Toggle({label,checked,onPress}:{label:string;checked:boolean;onPress:()=>void}){const theme=useTheme();return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{checked}} onPress={onPress} style={[styles.toggle,{borderColor:theme.border,backgroundColor:theme.surfaceRaised}]}><Text style={[styles.body,{color:theme.textPrimary}]}>{checked?'☑ ':'☐ '}{label}</Text></Pressable>;}
const styles=StyleSheet.create({group:{gap:spacing.lg},body:{fontSize:typeScale.body,lineHeight:26},heading:{fontSize:typeScale.heading,fontWeight:'600'},input:{minHeight:touchTarget.android,padding:spacing.lg,borderRadius:radius,borderWidth:1,fontSize:typeScale.body},toggle:{minHeight:touchTarget.android,padding:spacing.lg,borderRadius:radius,borderWidth:1,justifyContent:'center'}});
