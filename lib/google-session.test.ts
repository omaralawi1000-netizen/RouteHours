import assert from 'node:assert/strict';
import test from 'node:test';
import {cachedGoogleAccount,rememberGoogleAccount,savedGoogleEmail,clearGoogleSession} from './google-session.ts';
import {googleAccount,authorizeGoogleAccount,GOOGLE_EMAIL_SCOPE,GOOGLE_FILE_SCOPE} from './google-auth.ts';

function setup(){
  const local=new Map<string,string>(),session=new Map<string,string>();
  const store=(map:Map<string,string>)=>({getItem:(k:string)=>map.get(k)||null,setItem:(k:string,v:string)=>map.set(k,v),removeItem:(k:string)=>map.delete(k)});
  const old=Object.getOwnPropertyDescriptor(globalThis,'window');
  const events=new EventTarget();
  Object.defineProperty(globalThis,'window',{configurable:true,value:{localStorage:store(local),sessionStorage:store(session),dispatchEvent:(e:Event)=>events.dispatchEvent(e),location:{origin:'https://route-hours.vercel.app'}}});
  return {local,session,restore(){if(old)Object.defineProperty(globalThis,'window',old);else Reflect.deleteProperty(globalThis,'window')}};
}
const id='session-test.apps.googleusercontent.com';
test('verified connections survive remounts and tab reloads without permanent bearer-token storage',async()=>{
  const env=setup();const account={token:'secret-token',email:'worker@example.com',expires:Date.now()+3600000};
  try{
    rememberGoogleAccount(id,'drive',account);
    assert.deepEqual(cachedGoogleAccount(id,'drive'),account);
    const fresh=await import(new URL('./google-session.ts?fresh-reload',import.meta.url).href);
    assert.deepEqual(fresh.cachedGoogleAccount(id,'drive'),account,'fresh module restores the browser-tab session');
    assert.equal(cachedGoogleAccount(id,'gmail'),null,'Drive permission never becomes Gmail permission');
    assert.equal(cachedGoogleAccount('other.apps.googleusercontent.com','drive'),null);
    assert.ok(!Array.from(env.local.values()).join('').includes('secret-token'));
    assert.equal(savedGoogleEmail(id,'drive'),'worker@example.com');
  }finally{clearGoogleSession(id,'drive');env.restore()}
});
test('expired and malformed sessions lose access while preserving the remembered account',()=>{
  const env=setup();
  try{
    const account={token:'temporary',email:'worker@example.com',expires:Date.now()+100};
    rememberGoogleAccount('expiry.apps.googleusercontent.com','drive',account);
    account.expires=Date.now()-100;
    clearGoogleSession('expiry.apps.googleusercontent.com','drive');
    env.session.set('routehours:google-drive:expiry.apps.googleusercontent.com',JSON.stringify({version:1,clientId:'expiry.apps.googleusercontent.com',service:'drive',account}));
    assert.equal(cachedGoogleAccount('expiry.apps.googleusercontent.com','drive'),null);
    assert.equal(savedGoogleEmail('expiry.apps.googleusercontent.com','drive'),'worker@example.com');
    assert.equal(env.session.size,0);
    env.session.set('routehours:google-drive:corrupt.apps.googleusercontent.com','bad json');
    assert.equal(cachedGoogleAccount('corrupt.apps.googleusercontent.com','drive'),null);
    assert.equal(env.session.size,0);
  }finally{env.restore()}
});
test('returning users reuse verified sessions and renew with an account hint instead of forced selection',async t=>{
  const env=setup();let opens=0;const prompts:{prompt:string;login_hint?:string}[]=[];
  const client='returning.apps.googleusercontent.com';
  const initTokenClient=(config:{scope:string;callback:(value:unknown)=>void})=>({
    requestAccessToken:(options:{prompt:string;login_hint?:string})=>{
      opens++;prompts.push(options);config.callback({access_token:'verified-'+opens,scope:config.scope,expires_in:3600});
    }
  });
  Object.assign(window,{google:{accounts:{oauth2:{initTokenClient}}}});
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({email:'returning@example.com'})));
  try{
    const first=await googleAccount(client);
    assert.equal(opens,1);assert.deepEqual(prompts[0],{prompt:'select_account'});
    assert.deepEqual(await googleAccount(client),first);assert.equal(opens,1);
    clearGoogleSession(client,'google');
    await googleAccount(client);assert.deepEqual(prompts[1],{prompt:'',login_hint:'returning@example.com'});
    await googleAccount(client,{forceAccountChoice:true});assert.deepEqual(prompts[2],{prompt:'select_account'});
    await authorizeGoogleAccount(client,'drive',[GOOGLE_FILE_SCOPE,GOOGLE_EMAIL_SCOPE]);assert.equal(opens,4,'email-only connection does not skip Drive permission');
  }finally{clearGoogleSession(client,'google');clearGoogleSession(client,'drive');env.restore()}
});
