"use client";

import { useEffect, useRef, useState, useTransition, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

const DURATION = 340;
type Phase = "idle" | "blur" | "colour" | "waiting" | "reveal";
function pageColour(pathname: string) {
  if (pathname === "/events" || pathname.startsWith("/events/")) return "var(--purple-bg)";
  if (pathname === "/contact") return "var(--red-bg)";
  return "var(--green-bg)";
}

export function PageTransition({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");
  const [colour, setColour] = useState("var(--green-bg)");
  const [pending, startTransition] = useTransition();
  const destination = useRef<URL | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const surface = useRef<HTMLDivElement>(null);
  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }
  useEffect(() => {
    const reset = () => {
      clearTimers();
      destination.current = null;
      setPhase("idle");
    };
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotionChange = () => {
      const target = destination.current;
      reset();
      if (motion.matches && target) window.location.assign(target.href);
    };
    window.addEventListener("popstate", reset);
    window.addEventListener("pageshow", reset);
    motion.addEventListener("change", onMotionChange);
    return () => {
      clearTimers();
      window.removeEventListener("popstate", reset);
      window.removeEventListener("pageshow", reset);
      motion.removeEventListener("change", onMotionChange);
    };
  }, []);
  useEffect(() => {
    if (phase !== "waiting" || pending || !destination.current) return;
    if (pathname !== destination.current.pathname) return;
    clearTimers();
    // Reveal only after the destination's server content has committed.
    const frame = requestAnimationFrame(() => {
      setPhase("reveal");
      timers.current.push(setTimeout(() => {
        destination.current = null;
        setPhase("idle");
        // Restore interactivity before moving focus; the React update commits next.
        if (surface.current) surface.current.inert = false;
        const heading = surface.current?.querySelector<HTMLElement>("h1");
        if (heading) {
          heading.setAttribute("tabindex", "-1");
          heading.focus({ preventScroll: true });
        }
      }, DURATION));
    });
    return () => cancelAnimationFrame(frame);
  }, [phase, pending, pathname]);
  function navigate(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const anchor = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
    if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
    const target = new URL(anchor.href, window.location.href);
    if (target.origin !== window.location.origin || !["http:", "https:"].includes(target.protocol)) return;
    if (target.pathname.startsWith("/api/") || target.pathname === pathname) return;
    event.preventDefault();
    if (destination.current) return;
    destination.current = target;
    setColour(pageColour(pathname));
    setPhase("blur");
    router.prefetch(target.pathname + target.search);
    timers.current.push(setTimeout(() => {
      setColour(pageColour(target.pathname));
      setPhase("colour");
      timers.current.push(setTimeout(() => {
        setPhase("waiting");
        startTransition(() => router.push(target.pathname + target.search + target.hash));
      }, DURATION));
    }, DURATION));
    // Fall back to ordinary navigation if a route request stalls.
    timers.current.push(setTimeout(() => window.location.assign(target.href), 15000));
  }
  const active = phase !== "idle";
  return <>
    <div ref={surface} className="page-transition-surface" data-phase={phase} onClickCapture={navigate} inert={active} aria-busy={active || undefined}>{children}</div>
    <div className="page-transition" data-phase={phase} aria-hidden="true" style={{ "--transition-colour": colour } as CSSProperties}>
      <div className="page-transition-colour" />
      <div className="page-transition-loader">
        <div className="page-transition-squares">
          <div className="page-transition-square page-transition-square--green" />
          <div className="page-transition-square page-transition-square--purple" />
          <div className="page-transition-square page-transition-square--red" />
          <div className="page-transition-square page-transition-square--yellow" />
        </div>
      </div>
    </div>
  </>;
}
