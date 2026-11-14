"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { AnimatePresence, m, useDragControls, type PanInfo } from "motion/react";
import { fade, spring } from "./motion";
import styles from "./sheet.module.css";

/**
 * A bottom sheet that behaves like a native one: it rises on the `smooth` spring, follows your
 * finger when you drag the handle, and closes when you pull it down far or fast enough. Pull it
 * up and it resists like a rubber band. Escape, a tap on the dimmed page, and Android's Back
 * gesture all close it too. While open, focus stays inside and the page behind can't scroll.
 */
export default function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  return <AnimatePresence>{open && <SheetPanel key="sheet" onClose={onClose} title={title} footer={footer}>{children}</SheetPanel>}</AnimatePresence>;
}

function SheetPanel({ onClose, title, children, footer }: { onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const controls = useDragControls();
  const titleId = useId();
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const root = document.documentElement, overflow = root.style.overflow;
    root.style.overflow = "hidden";
    panel.current?.focus({ preventScroll: true });
    // Back on Android closes the sheet instead of leaving the app: push a history entry and
    // treat "back" as close. If the sheet closes another way, remove that entry again.
    const marker = { routehoursSheet: Math.random() };
    history.pushState(marker, "");
    let poppedByBack = false;
    const onPop = () => { poppedByBack = true; close.current(); };
    window.addEventListener("popstate", onPop);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); return; }
      if (event.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>("button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])")];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
      if (!poppedByBack && history.state?.routehoursSheet === marker.routehoursSheet) history.back();
      root.style.overflow = overflow;
      before?.focus?.({ preventScroll: true });
    };
  }, []);

  function end(_: unknown, info: PanInfo) {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose();
  }

  return <>
    <m.div className={styles.scrim} onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: fade }} transition={fade} aria-hidden="true"/>
    <m.div ref={panel} className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
      initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%", transition: spring.exit }} transition={spring.smooth}
      drag="y" dragListener={false} dragControls={controls} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0.06, bottom: 1 }} dragTransition={{ bounceStiffness: 420, bounceDamping: 36 }} onDragEnd={end}>
      <div className={styles.grip} onPointerDown={event => controls.start(event)}>
        <span className={styles.handle} aria-hidden="true"/>
        <h2 id={titleId} className={`${styles.title} serif`}>{title}</h2>
      </div>
      <div className={styles.body}>{children}</div>
      {footer && <div className={styles.footer}>{footer}</div>}
    </m.div>
  </>;
}
