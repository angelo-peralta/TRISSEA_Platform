/** Reproducible realm policy. Callers inject generated noncommitted client secrets. */
export const realmName='trissea-local';
export const browserFlow='trissea-password-totp';
export function localRealm({bffSecret,readerSecret,origin='http://127.0.0.1:5174'}){
 const callback=origin+'/v1/admin/auth/callback';
 return {
  realm:realmName,enabled:true,attributes:{'trissea.environment':'local-synthetic'},sslRequired:'none',registrationAllowed:false,registrationEmailAsUsername:false,rememberMe:false,resetPasswordAllowed:false,editUsernameAllowed:false,
  loginWithEmailAllowed:true,duplicateEmailsAllowed:false,verifyEmail:true,bruteForceProtected:true,failureFactor:5,waitIncrementSeconds:60,maxFailureWaitSeconds:900,
  ssoSessionIdleTimeout:900,ssoSessionMaxLifespan:3600,accessTokenLifespan:3600,accessCodeLifespan:60,accessCodeLifespanLogin:300,
  otpPolicyType:'totp',otpPolicyAlgorithm:'HmacSHA1',otpPolicyDigits:6,otpPolicyPeriod:30,otpPolicyLookAheadWindow:0,otpPolicyCodeReusable:false,
  passwordPolicy:'length(16) and notUsername and notEmail and passwordHistory(3)',
  browserFlow,resetCredentialsFlow:'trissea-deny-recovery',eventsEnabled:false,adminEventsEnabled:false,adminEventsDetailsEnabled:false,
  defaultRoles:[],defaultDefaultClientScopes:[],defaultOptionalClientScopes:[],
  authenticationFlows:[
   {alias:browserFlow,providerId:'basic-flow',topLevel:true,builtIn:false,authenticationExecutions:[
    {authenticator:'auth-username-password-form',requirement:'REQUIRED',priority:10,authenticatorFlow:false,authenticatorConfig:'trissea-password-amr'},
    {authenticator:'auth-otp-form',requirement:'REQUIRED',priority:20,authenticatorFlow:false,authenticatorConfig:'trissea-totp-amr'},
   ]},
   {alias:'trissea-deny-recovery',providerId:'basic-flow',topLevel:true,builtIn:false,authenticationExecutions:[{authenticator:'deny-access-authenticator',requirement:'REQUIRED',priority:10,authenticatorFlow:false}]},
  ],
  authenticatorConfig:[{alias:'trissea-password-amr',config:{'default.reference.value':'pwd','default.reference.maxAge':'3600'}},{alias:'trissea-totp-amr',config:{'default.reference.value':'otp','default.reference.maxAge':'3600'}}],
  requiredActions:[{alias:'CONFIGURE_TOTP',name:'Configure OTP',providerId:'CONFIGURE_TOTP',enabled:true,defaultAction:false,priority:10},
   ...['UPDATE_PASSWORD','UPDATE_PROFILE','VERIFY_EMAIL','UPDATE_EMAIL','delete_account','update_user_locale','webauthn-register','webauthn-register-passwordless','CONFIGURE_RECOVERY_AUTHN_CODES'].map(alias=>({alias,name:alias,providerId:alias,enabled:false,defaultAction:false,priority:100}))],
  clients:[
   {clientId:'trissea-admin-bff',name:'TRISSEA local server BFF',enabled:true,protocol:'openid-connect',publicClient:false,secret:bffSecret,standardFlowEnabled:true,directAccessGrantsEnabled:false,implicitFlowEnabled:false,serviceAccountsEnabled:false,fullScopeAllowed:false,
    redirectUris:[callback],webOrigins:[origin],attributes:{'pkce.code.challenge.method':'S256','use.refresh.tokens':'false','access.token.lifespan':'3600','post.logout.redirect.uris':origin},
    defaultClientScopes:['basic','profile','email'],optionalClientScopes:[],protocolMappers:[{name:'Authentication methods',protocol:'openid-connect',protocolMapper:'oidc-amr-mapper',consentRequired:false,config:{'id.token.claim':'true','access.token.claim':'true','claim.name':'amr'}}]},
   {clientId:'trissea-assurance-reader',enabled:true,protocol:'openid-connect',publicClient:false,secret:readerSecret,standardFlowEnabled:false,directAccessGrantsEnabled:false,implicitFlowEnabled:false,serviceAccountsEnabled:true,fullScopeAllowed:true,defaultClientScopes:['roles','kc-admin-api'],optionalClientScopes:[]},
   {clientId:'account',enabled:false},{clientId:'account-console',enabled:false},{clientId:'broker',enabled:false},
  ],
 };
}
