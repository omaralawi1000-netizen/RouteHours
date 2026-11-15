"use client";

import { useEffect, useRef, useState } from "react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Tracks whether RouteHours runs as an installed app, and offers the browser's install prompt when it has one. */
export function useInstall() {
  const [installed, setInstalled] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const installPrompt = useRef<InstallPrompt | null>(null);
  useEffect(() => {
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const onPrompt = (event: Event) => { event.preventDefault(); installPrompt.current = event as InstallPrompt; };
    const onInstalled = () => { setInstalled(true); setInstructionsOpen(false); installPrompt.current = null; };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);
  /** Use the browser prompt when available, otherwise show written instructions. */
  async function install() {
    const prompt = installPrompt.current;
    if (!prompt) { setInstructionsOpen(true); return; }
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    installPrompt.current = null;
  }
  return { installed, install, instructionsOpen, setInstructionsOpen };
}
