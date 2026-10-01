import { useEffect, useRef, type CSSProperties } from "react";
import type { FlowerModel } from "./FlowerModel";
import "./DesktopFlower.css";

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

export function DesktopFlower({ maskSrc, modelSrc }: { maskSrc: string; modelSrc: string }) {
  const flowerRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const flower = flowerRef.current;
    const canvas = canvasRef.current;
    const page = document.querySelector<HTMLElement>(".desktop-flower-page");
    const hero = document.querySelector<HTMLElement>(".hero-image");
    const links = document.querySelector<HTMLElement>(".links-section");
    if (!flower || !canvas || !page || !hero || !links) return;

    const desktop = window.matchMedia("(min-width:761px)");
    const reduced = window.matchMedia("(prefers-reduced-motion:reduce)");
    let frame = 0;
    let lastTime = 0;
    let initialized = false;
    let pointerX = 0;
    let pointerY = 0;
    let x = 0;
    let y = 0;
    let velocityX = 0;
    let velocityY = 0;
    let angle = .16;
    let angularVelocity = 0;
    let rotationTurns = 0;
    let rotationPhase = 0;
    let settlingClick = false;
    let lastScrollTime = -Infinity;
    let pageTop = 0;
    let startX = 0;
    let startY = 0;
    let viewportY = 0;
    let linksTop = 0;
    let endX = 0;
    let endY = 0;
    let flowerHeight = 0;
    let lastPinkSplit = -1;
    let pinkInk = [246, 170, 224];
    let model: FlowerModel | undefined;
    let loadingModel = false;
    let stopped = false;
    const abort = new AbortController();
    const fullTurn = Math.PI * 2;
    const updateInteraction = () => {
      flower.disabled = !model || !desktop.matches || reduced.matches
        || document.documentElement.classList.contains("desktop-intro-active");
    };
    updateInteraction();

    const measure = () => {
      const pageRect = page.getBoundingClientRect();
      const heroRect = hero.getBoundingClientRect();
      const linksRect = links.getBoundingClientRect();
      pageTop = pageRect.top + window.scrollY;
      const originalX = heroRect.left - pageRect.left + heroRect.width * .835 - flower.offsetWidth / 2;
      const rightGap = heroRect.right - pageRect.left - originalX - flower.offsetWidth;
      startX = originalX + rightGap / 2;
      startY = heroRect.top - pageRect.top + heroRect.height * .7 - flower.offsetHeight / 2;
      viewportY = Math.min(pageTop + startY, window.innerHeight - flower.offsetHeight - 40);
      linksTop = linksRect.top - pageRect.top;
      endX = linksRect.right - pageRect.left - window.innerWidth * .023 - flower.offsetWidth;
      endY = linksRect.bottom - pageRect.top - flower.offsetHeight - 48;
      flowerHeight = flower.offsetHeight;
      // Difference blending yields the site's black when this ink is over pink.
      const pink = getComputedStyle(links).backgroundColor.match(/\d+/g)?.map(Number);
      const black = getComputedStyle(document.body).backgroundColor.match(/\d+/g)?.map(Number);
      if (pink && black) {
        pinkInk = pink.slice(0, 3).map((channel, i) => Math.abs(channel - black[i]));
        flower.style.setProperty("--flower-pink-ink", `rgb(${pinkInk.join(" ")})`);
      }
      model?.resize(flower.offsetWidth, flowerHeight);
    };

    const target = () => {
      const introActive = document.documentElement.classList.contains("desktop-intro-active");
      const targetY = clamp(window.scrollY + viewportY - pageTop, startY, endY);
      const progress = clamp((targetY - linksTop) / Math.max(1, endY - linksTop), 0, 1);
      const ease = progress * progress * (3 - 2 * progress);
      // Finish at a full turn, easing into a front-facing pose over the last 320px.
      // Unwrapped angles keep downward/upward scroll rotating in opposite directions.
      const rate = Math.PI * 2 / 1400;
      const dockStart = Math.max(startY, endY - 320);
      const dockProgress = clamp((targetY - dockStart) / Math.max(1, endY - dockStart), 0, 1);
      const dockEase = dockProgress * dockProgress * (3 - 2 * dockProgress);
      const scrollAngle = .16 + (targetY - startY) * rate;
      const dockAngle = Math.ceil((.16 + (endY - startY) * rate) / (Math.PI * 2)) * Math.PI * 2;
      const normalAngle = introActive ? 0 : reduced.matches ? .16 * (1 - dockEase)
        : scrollAngle + (dockAngle - scrollAngle) * dockEase;
      let goalAngle = normalAngle + rotationTurns + rotationPhase * (1 - dockEase);
      // After an impulse, the final idle pose is flat. Active scrolling still drives the angle.
      if (settlingClick && performance.now() - lastScrollTime > 120) goalAngle = Math.round(goalAngle / fullTurn) * fullTurn;
      return {
        x: startX + (endX - startX) * ease + (reduced.matches || introActive ? 0 : pointerX * 14),
        y: clamp(targetY + (reduced.matches || introActive ? 0 : pointerY * 12), startY, endY),
        angle: introActive || reduced.matches ? normalAngle : goalAngle,
        normalAngle,
        dockEase
      };
    };

    const alignRotation = (nextAngle: number, goal = target()) => {
      const offset = nextAngle - goal.normalAngle;
      rotationTurns = Math.round(offset / fullTurn) * fullTurn;
      rotationPhase = goal.dockEase < .999999 ? (offset - rotationTurns) / (1 - goal.dockEase) : 0;
    };

    const paint = () => {
      // Clamp the visible spring overshoot to the page, keeping it out of the footer.
      const visibleY = clamp(y, startY, endY);
      flower.style.transform = `translate3d(${x.toFixed(2)}px,${visibleY.toFixed(2)}px,0)`;
      // Split at the section edge so only the part over pink becomes black.
      const split = clamp(linksTop - visibleY, 0, flowerHeight);
      if (Math.abs(split - lastPinkSplit) > .01) {
        flower.style.setProperty("--flower-pink-start", `${split.toFixed(2)}px`);
        lastPinkSplit = split;
      }
      model?.render(angle, split, pinkInk);
      flower.style.visibility = "visible";
      if (model || flower.dataset.modelFallback === "true") {
        const bounds = model?.frontBounds() || { width: 1, height: 1 };
        const width = String(bounds.width), height = String(bounds.height);
        if (flower.dataset.frontWidth !== width) flower.dataset.frontWidth = width;
        if (flower.dataset.frontHeight !== height) flower.dataset.frontHeight = height;
        if (flower.dataset.introReady !== "true") flower.dataset.introReady = "true";
      }
    };

    const tick = (time: number) => {
      frame = 0;
      if (!desktop.matches) return;
      const goal = target();
      if (!initialized || reduced.matches || document.documentElement.classList.contains("desktop-intro-active")) {
        x = goal.x;
        y = goal.y;
        angle = goal.angle;
        velocityX = velocityY = angularVelocity = 0;
        initialized = true;
      } else {
        // Substeps keep the underdamped spring stable during slower frames.
        const elapsed = Math.min((time - lastTime) / 1000, .064);
        const steps = Math.max(1, Math.ceil(elapsed / .008));
        const dt = elapsed / steps;
        for (let i = 0; i < steps; i++) {
          velocityX += ((goal.x - x) * 78 - velocityX * 12.5) * dt;
          velocityY += ((goal.y - y) * 78 - velocityY * 12.5) * dt;
          // Separate, nearly critical damping lets rotation coast to a stop.
          angularVelocity += ((goal.angle - angle) * 45 - angularVelocity * 14) * dt;
          x += velocityX * dt;
          y += velocityY * dt;
          angle += angularVelocity * dt;
        }
      }
      lastTime = time;
      const resting = Math.abs(goal.x - x) < .05 && Math.abs(goal.y - y) < .05
        && Math.abs(velocityX) < .1 && Math.abs(velocityY) < .1
        && Math.abs(goal.angle - angle) < .0001 && Math.abs(angularVelocity) < .001
        && (!settlingClick || performance.now() - lastScrollTime > 120);
      if (resting) {
        x = goal.x; y = goal.y; angle = goal.angle;
        velocityX = velocityY = angularVelocity = 0;
        if (settlingClick) { alignRotation(angle, goal); settlingClick = false; }
      }
      paint();
      if (!resting && !reduced.matches) frame = window.requestAnimationFrame(tick);
    };

    const wake = () => {
      if (!desktop.matches || frame) return;
      lastTime = performance.now();
      frame = window.requestAnimationFrame(tick);
    };
    const spin = () => {
      if (flower.disabled) return;
      // Add momentum on every click, with enough forward travel to dissipate it naturally.
      angularVelocity = Math.max(0, angularVelocity) + 48;
      const finishAngle = Math.ceil((angle + angularVelocity / Math.sqrt(45)) / fullTurn) * fullTurn;
      alignRotation(finishAngle);
      settlingClick = true;
      wake();
    };
    const click = (event: MouseEvent) => {
      if (flower.disabled || event.button !== 0) return;
      // Listen before overlapping content handles the click, without changing
      // stacking or interfering with that content's links and controls.
      if (event.target instanceof Node && flower.contains(event.target)) {
        spin();
        return;
      }
      if (event.detail === 0) return; // Keyboard activation belongs to its focused control.
      const bounds = flower.getBoundingClientRect();
      if (event.clientX >= bounds.left && event.clientX <= bounds.right
        && event.clientY >= bounds.top && event.clientY <= bounds.bottom) spin();
    };
    const scroll = () => { lastScrollTime = performance.now(); wake(); };
    const introComplete = () => { updateInteraction(); wake(); };
    const loadModel = async () => {
      if (loadingModel || model || !desktop.matches) return;
      loadingModel = true;
      try {
        // Import Three.js and fetch the GLB only for desktop.
        const { createFlowerModel } = await import("./FlowerModel");
        if (stopped) return;
        const loaded = await createFlowerModel(canvas, modelSrc, abort.signal);
        if (stopped) { loaded.dispose(); return; }
        model = loaded;
        model.resize(flower.offsetWidth, flowerHeight);
        flower.classList.add("desktop-flower-model-ready");
        updateInteraction();
        wake();
      } catch (error) {
        if (!stopped) {
          console.warn("3D flower unavailable; using the flower silhouette.", error);
          flower.dataset.modelFallback = "true";
          wake();
        }
      }
    };
    const resize = () => {
      if (!desktop.matches) {
        if (frame) window.cancelAnimationFrame(frame);
        frame = 0;
        initialized = false;
        settlingClick = false;
        rotationTurns = rotationPhase = angularVelocity = 0;
        flower.style.visibility = "hidden";
        updateInteraction();
        return;
      }
      measure();
      updateInteraction();
      void loadModel();
      wake();
    };
    const move = (event: PointerEvent) => {
      if (!desktop.matches || reduced.matches || document.documentElement.classList.contains("desktop-intro-active") || event.pointerType === "touch") return;
      pointerX = clamp(event.clientX / window.innerWidth * 2 - 1, -1, 1);
      pointerY = clamp(event.clientY / window.innerHeight * 2 - 1, -1, 1);
      wake();
    };
    const leave = (event: PointerEvent) => {
      if (event.relatedTarget !== null) return;
      pointerX = pointerY = 0;
      wake();
    };
    const motionChange = () => {
      pointerX = pointerY = 0;
      settlingClick = false;
      rotationTurns = rotationPhase = angularVelocity = 0;
      updateInteraction();
      wake();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(page);
    observer.observe(hero);
    observer.observe(links);
    document.addEventListener("click", click, { capture: true });
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerout", leave);
    window.addEventListener("dd:intro-complete", introComplete);
    desktop.addEventListener("change", resize);
    reduced.addEventListener("change", motionChange);
    resize();

    return () => {
      stopped = true;
      abort.abort();
      if (frame) window.cancelAnimationFrame(frame);
      model?.dispose();
      observer.disconnect();
      document.removeEventListener("click", click, { capture: true });
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerout", leave);
      window.removeEventListener("dd:intro-complete", introComplete);
      desktop.removeEventListener("change", resize);
      reduced.removeEventListener("change", motionChange);
    };
  }, [modelSrc]);

  return <button ref={flowerRef} type="button" className="desktop-flower-layer desktop-flower" aria-label="Spin the flower" disabled
    style={{ "--flower-mask": `url("${maskSrc}")` } as CSSProperties}>
    <canvas ref={canvasRef} aria-hidden="true" />
  </button>;
}
