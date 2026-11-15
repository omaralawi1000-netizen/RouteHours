"use client";
import { useEffect, useState } from 'react';
import { cachedGoogleAccount, savedGoogleEmail, GOOGLE_SESSION_EVENT, type GoogleService } from '@/lib/google-session';
import { rememberGoogleGrant, type GoogleAccount } from '@/lib/google-auth';
import { refreshGoogle, staysSignedIn } from '@/lib/google-offline';

export function useGoogleSession(clientId: string, service: GoogleService) {
  const [state,setState] = useState<{clientId:string;service:GoogleService;account:GoogleAccount|null;email:string}>({clientId:'',service,account:null,email:''});
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>, restoring = false, alive = true;
    const update = () => {
      clearTimeout(timer);
      const account = cachedGoogleAccount(clientId,service), email = account?.email || savedGoogleEmail(clientId,service);
      setState({clientId,service,account,email});
      if(account) timer = setTimeout(update,Math.max(1,account.expires-Date.now()));
      // Signed in to stay: quietly fetch a fresh hour of access so Send is ready without a Google window.
      else if(!restoring && staysSignedIn(clientId)) {
        restoring = true;
        void refreshGoogle(clientId,service).then(fresh => { if(fresh && alive) try { rememberGoogleGrant(clientId,service,fresh); } catch { /* Missing permission: Connect asks for it. */ } }).finally(() => { restoring = false; });
      }
    };
    update();
    window.addEventListener(GOOGLE_SESSION_EVENT,update);
    window.addEventListener('focus',update);
    window.addEventListener('storage',update);
    document.addEventListener('visibilitychange',update);
    return () => {alive=false;clearTimeout(timer);window.removeEventListener(GOOGLE_SESSION_EVENT,update);window.removeEventListener('focus',update);window.removeEventListener('storage',update);document.removeEventListener('visibilitychange',update);};
  },[clientId,service]);
  return state.clientId===clientId&&state.service===service ? {account:state.account,savedEmail:state.email} : {account:null,savedEmail:''};
}
