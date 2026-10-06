import { useEffect, useRef, useState } from "react";
import "./SwipeIndicator.css";

/** One left/right hint per carousel, reset only by a new page load. */
export function SwipeIndicator() {
  const ref = useRef<HTMLSpanElement>(null);
  const played = useRef(false);
  const [state, setState] = useState<"waiting" | "playing" | "done">("waiting");

  useEffect(() => {
    const element = ref.current;
    const carousel = element?.parentElement;
    if (!carousel) return;
    const mobile = window.matchMedia("(max-width: 760px)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let observer: IntersectionObserver | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observe = () => {
      observer?.disconnect();
      if (played.current || !mobile.matches || reducedMotion.matches) return;
      observer = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting || entry.intersectionRatio < .5) return;
        played.current = true;
        setState("playing");
        observer?.disconnect();
        timer = setTimeout(() => setState("done"), 2000);
      }, { threshold: .5, rootMargin: "-80px 0px -24px 0px" });
      observer.observe(carousel);
    };
    observe();
    mobile.addEventListener("change", observe);
    reducedMotion.addEventListener("change", observe);
    return () => {
      observer?.disconnect();
      clearTimeout(timer);
      mobile.removeEventListener("change", observe);
      reducedMotion.removeEventListener("change", observe);
    };
  }, []);

  return <span ref={ref} className="swipe-indicator" data-state={state} aria-hidden="true" />;
}
