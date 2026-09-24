"use client";

import { useEffect } from "react";

export function useVisualEffects() {
  useEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>("[data-reveal]");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      elements.forEach((element) => element.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.08 });
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const images = document.querySelectorAll<HTMLElement>("[data-image-shadow]");
    const motionAllowed = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!motionAllowed || !finePointer) return;

    let pointer: { x: number; y: number } | null = null;
    let frame = 0;
    const updateShadows = () => {
      frame = 0;
      const currentPointer = pointer;
      if (!currentPointer) return;
      const maxDistance = Math.max(window.innerWidth, window.innerHeight) * 0.6;
      images.forEach((image) => {
        const bounds = image.getBoundingClientRect();
        const dx = currentPointer.x - (bounds.left + bounds.width / 2);
        const dy = currentPointer.y - (bounds.top + bounds.height / 2);
        const distance = Math.hypot(dx, dy);
        const reach = Math.min(distance / maxDistance, 1);
        image.style.setProperty("--shadow-x", `${(dx / (distance || 1)) * reach * 42}px`);
        image.style.setProperty("--shadow-y", `${(dy / (distance || 1)) * reach * 42}px`);
        image.style.setProperty("--shadow-blur", `${18 + reach * 62}px`);
        image.style.setProperty("--shadow-spread", `${reach * 8}px`);
      });
    };
    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateShadows);
    };
    const onPointerMove = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY };
      scheduleUpdate();
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const footer = document.querySelector<HTMLElement>(".site-footer");
    const revealSpace = document.querySelector<HTMLElement>(".footer-reveal-space");
    if (!footer || !revealSpace) return;

    let frame = 0;
    const updateGradient = () => {
      frame = 0;
      const bounds = revealSpace.getBoundingClientRect();
      const progress = Math.min(Math.max((window.innerHeight - bounds.top) / bounds.height, 0), 1);
      footer.style.setProperty("--footer-progress", progress.toFixed(3));
    };
    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateGradient);
    };
    const measureFooter = () => {
      revealSpace.style.height = `${footer.offsetHeight}px`;
      scheduleUpdate();
    };
    const resizeObserver = new ResizeObserver(measureFooter);
    resizeObserver.observe(footer);
    measureFooter();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", measureFooter);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", measureFooter);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

}
