"use client";
import { useEffect, useState } from 'react';
import { cachedGoogleAccount, savedGoogleEmail, GOOGLE_SESSION_EVENT, type GoogleService } from '@/lib/google-session';
import type { GoogleAccount } from '@/lib/google-auth';

export function useGoogleSession(clientId: string, service: GoogleService) {
  const [state,setState] = useState<{clientId:string;service:GoogleService;account:GoogleAccount|null;email:string}>({clientId:'',service,account:null,email:''});
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer);
      const account = cachedGoogleAccount(clientId,service), email = account?.email || savedGoogleEmail(clientId,service);
      setState({clientId,service,account,email});
      if(account) timer = setTimeout(update,Math.max(1,account.expires-Date.now()));
    };
    update();
    window.addEventListener(GOOGLE_SESSION_EVENT,update);
    window.addEventListener('focus',update);
    window.addEventListener('storage',update);
    document.addEventListener('visibilitychange',update);
    return () => {clearTimeout(timer);window.removeEventListener(GOOGLE_SESSION_EVENT,update);window.removeEventListener('focus',update);window.removeEventListener('storage',update);document.removeEventListener('visibilitychange',update);};
  },[clientId,service]);
  return state.clientId===clientId&&state.service===service ? {account:state.account,savedEmail:state.email} : {account:null,savedEmail:''};
}
