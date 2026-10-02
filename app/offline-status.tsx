"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const updateStatus = () => setOnline(navigator.onLine);
    updateStatus();
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);
    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  return online;
}

export default function OfflineStatus({ online }: { online: boolean }) {
  if (online) return null;

  return (
    <aside className="offline-status" role="status">
      <WifiOff size={18} aria-hidden="true" />
      <div className="offline-status-copy">
        <strong>You’re offline</strong>
        <span>Timer and typed notes still work. AI, voice services and email need a connection.</span>
      </div>
    </aside>
  );
}
