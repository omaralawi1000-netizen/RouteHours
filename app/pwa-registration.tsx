"use client";

import { useEffect } from "react";

export default function PwaRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).then(async registration => {
      await navigator.serviceWorker.ready;
      const urls = Array.from(document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>("script[src],link[rel=stylesheet][href]"))
        .map(element => element instanceof HTMLScriptElement ? element.src : element.href)
        .filter(url => url.startsWith(location.origin));
      registration.active?.postMessage({ type: "PRECACHE", urls });
    }).catch(() => {});
  }, []);
  return null;
}
