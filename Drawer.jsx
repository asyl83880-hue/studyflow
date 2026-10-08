import { useEffect, useRef } from "react";
import { Icon } from "./UI";

export default function Drawer({ open, onClose, title, id, children, side = "right" }) {
  const panel = useRef(null);
  const closeHandler = useRef(onClose);
  closeHandler.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => [...panel.current.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]')].filter(el => el.getClientRects().length > 0);
    const frame = requestAnimationFrame(() => (focusable()[0] || panel.current)?.focus());
    function onKey(event) {
      if (event.key === "Escape") { event.preventDefault(); closeHandler.current(); }
      if (event.key === "Tab") {
        const elements = focusable();
        if (!elements.length) { event.preventDefault(); panel.current.focus(); return; }
        const first = elements[0], last = elements.at(-1);
        if (event.shiftKey && (document.activeElement === first || !panel.current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !panel.current.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);

  return <div className={`drawer-layer drawer-${side}`} hidden={!open}><div className="drawer-backdrop" onClick={onClose} /><section ref={panel} className="drawer-panel" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} tabIndex={-1}><header className="drawer-header"><div><p className="eyebrow">STUDYFLOW</p><h2 id={`${id}-title`}>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Закрыть панель"><Icon name="close" /></button></header><div className="drawer-body">{children}</div></section></div>;
}
