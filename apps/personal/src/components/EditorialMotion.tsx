import { useEffect } from "react";

export function EditorialMotion() {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const observed = document.querySelectorAll<HTMLElement>("[data-reveal]");
    if (reduced.matches || !("IntersectionObserver" in window)) {
      observed.forEach((element) => element.classList.add("is-visible"));
    } else {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      }, { rootMargin: "0px 0px -5% 0px", threshold: .08 });
      observed.forEach((element) => observer.observe(element));
      return () => observer.disconnect();
    }
  }, []);

  useEffect(() => {
    const hero = document.querySelector<HTMLElement>(".hero-image");
    const title = document.querySelector<HTMLElement>(".hero-name");
    if (!hero || !title || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let pointerX = 0;
    let pointerY = 0;
    const render = () => {
      raf = 0;
      const rect = hero.getBoundingClientRect();
      const scrollPosition = Math.max(-1, Math.min(1, (window.innerHeight / 2 - (rect.top + rect.height / 2)) / window.innerHeight));
      hero.style.setProperty("--image-y", `${Math.round(scrollPosition * 40 + pointerY * 13)}px`);
      hero.style.setProperty("--image-x", `${Math.round(pointerX * 14)}px`);
      title.style.setProperty("--title-y", `${Math.round(scrollPosition * -45)}px`);
      title.style.setProperty("--title-x", `${Math.round(pointerX * -11)}px`);
    };
    const schedule = () => { if (!raf) raf = window.requestAnimationFrame(render); };
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const rect = hero.getBoundingClientRect();
      pointerX = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1));
      pointerY = Math.max(-1, Math.min(1, (event.clientY - rect.top) / rect.height * 2 - 1));
      schedule();
    };
    hero.addEventListener("pointermove", move);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      hero.removeEventListener("pointermove", move);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
