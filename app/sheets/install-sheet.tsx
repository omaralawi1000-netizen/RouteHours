"use client";

import { X } from "lucide-react";

/** Step-by-step instructions for adding RouteHours to the home screen when the browser can't prompt. */
export default function InstallSheet({ onClose }: { onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className="modal install-modal" role="dialog" aria-modal="true" aria-label="Install RouteHours"><div className="modal-head"><div><h2>Install RouteHours</h2></div><button className="icon-btn" aria-label="Close" onClick={onClose}><X size={19}/></button></div><p>Open your deployed RouteHours website in your phone browser, then add it to your Home Screen:</p><div className="install-steps"><strong>iPhone · Safari</strong><ol><li>Tap Share.</li><li>Tap <b>Add to Home Screen</b>.</li><li>Turn on <b>Open as Web App</b>, then tap Add.</li></ol></div><div className="install-steps"><strong>Android · Chrome</strong><ol><li>Tap the three-dot menu.</li><li>Tap <b>Install app</b> or <b>Install and create shortcut</b>.</li><li>Confirm Install.</li></ol></div><p className="install-fine">Use the new Home Screen icon for your shifts. Your records stay in that browser installation, so export a backup regularly.</p></div></div>;
}
