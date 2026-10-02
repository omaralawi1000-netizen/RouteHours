"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { animate } from "motion/mini";

// Keep dismissal fast and interruptible; never animate a network operation closed.
export function useSheetDismiss(dialog: RefObject<HTMLDivElement | null>, onClose: () => void, canClose: () => boolean = () => true) {
  const latest = useRef({ onClose, canClose });
  latest.current = { onClose, canClose };
  const alive = useRef(true), exiting = useRef(false);
  const transition = useRef<ReturnType<typeof animate> | null>(null);
  const [closing, setClosing] = useState(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; transition.current?.stop(); }; }, []);
  const dismiss = useCallback(() => {
    if (exiting.current || !latest.current.canClose()) return;
    exiting.current = true; setClosing(true);
    const element = dialog.current;
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { latest.current.onClose(); return; }
    transition.current = animate(element, { opacity: [1, 0], transform: ["translateY(0)", "translateY(16px)"] }, { duration: .14, ease: [.4, 0, 1, 1] });
    void Promise.resolve(transition.current).then(() => { if (alive.current) latest.current.onClose(); });
  }, [dialog]);
  return { dismiss, closing };
}
