import { useEffect, useRef, useState, type RefObject } from "react";
import "./SwipeIndicator.css";

/** One left/right hint per carousel, reset only by a new page load. */
export function SwipeIndicator({ interactionRef }: { interactionRef: RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLSpanElement>(null);
  const played = useRef(false);
  const [state, setState] = useState<"waiting" | "playing" | "done">("waiting");

  useEffect(() => {
    const element = ref.current;
    const carousel = element?.parentElement;
    const interactionRoot = interactionRef.current;
    if (!carousel || !interactionRoot) return;
    const mobile = window.matchMedia("(max-width: 760px)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pointer: { id: number; x: number; y: number } | undefined;
    const pointerDown = (event: PointerEvent) => {
      if (played.current || !event.isPrimary || event.button !== 0) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    };
    const pointerMove = (event: PointerEvent) => {
      if (!pointer || event.pointerId !== pointer.id) return;
      const dx = Math.abs(event.clientX - pointer.x);
      const dy = Math.abs(event.clientY - pointer.y);
      // Taps and vertical page scrolling do not demonstrate a carousel swipe.
      if (dy > 10 && dy > dx) {
        pointer = undefined;
        return;
      }
      if (dx <= 10 || dx <= dy) return;
      pointer = undefined;
      played.current = true;
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      setState("done");
    };
    const pointerEnd = (event: PointerEvent) => {
      if (pointer?.id === event.pointerId) pointer = undefined;
    };
    const check = () => {
      frame = 0;
      if (played.current || !mobile.matches || reducedMotion.matches) return;
      if (document.documentElement.classList.contains("desktop-intro-active")) return;
      const bounds = carousel.getBoundingClientRect();
      // A small centre band allows normal scrolling to reach the trigger.
      if (!bounds.width || !bounds.height || Math.abs(bounds.top + bounds.height / 2 - window.innerHeight / 2) > 24) return;
      played.current = true;
      setState("playing");
      timer = setTimeout(() => setState("done"), 2000);
    };
    const schedule = () => {
      if (!played.current && !frame) frame = requestAnimationFrame(check);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(carousel);
    interactionRoot.addEventListener("pointerdown", pointerDown, { passive: true, capture: true });
    window.addEventListener("pointermove", pointerMove, { passive: true, capture: true });
    window.addEventListener("pointerup", pointerEnd, { passive: true, capture: true });
    window.addEventListener("pointercancel", pointerEnd, { passive: true, capture: true });
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("dd:intro-complete", schedule);
    mobile.addEventListener("change", schedule);
    reducedMotion.addEventListener("change", schedule);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      interactionRoot.removeEventListener("pointerdown", pointerDown, true);
      window.removeEventListener("pointermove", pointerMove, true);
      window.removeEventListener("pointerup", pointerEnd, true);
      window.removeEventListener("pointercancel", pointerEnd, true);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("dd:intro-complete", schedule);
      mobile.removeEventListener("change", schedule);
      reducedMotion.removeEventListener("change", schedule);
    };
  }, [interactionRef]);

  return <span ref={ref} className="swipe-indicator" data-state={state} aria-hidden="true" />;
}
