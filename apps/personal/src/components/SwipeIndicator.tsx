import { useEffect, useRef, useState } from "react";
import "./SwipeIndicator.css";

/** One left/right hint per carousel, reset only by a new page load. */
export function SwipeIndicator({ targetSelector }: { targetSelector?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const played = useRef(false);
  const [state, setState] = useState<"waiting" | "playing" | "done">("waiting");

  useEffect(() => {
    const element = ref.current;
    const parent = element?.parentElement;
    const carousel = targetSelector ? parent?.querySelector<HTMLElement>(targetSelector) : parent;
    if (!carousel) return;
    const mobile = window.matchMedia("(max-width: 760px)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
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
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("dd:intro-complete", schedule);
      mobile.removeEventListener("change", schedule);
      reducedMotion.removeEventListener("change", schedule);
    };
  }, [targetSelector]);

  return <span ref={ref} className="swipe-indicator" data-state={state} aria-hidden="true" />;
}
