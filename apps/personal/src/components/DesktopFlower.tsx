import { useEffect, useRef, type CSSProperties } from "react";
import type { FlowerModel } from "./FlowerModel";
import "./DesktopFlower.css";

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

export function DesktopFlower({ maskSrc, modelSrc }: { maskSrc: string; modelSrc: string }) {
  const flowerRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const glowCanvasRef = useRef<HTMLCanvasElement>(null);
  const glowFilterRef = useRef<SVGFilterElement>(null);

  useEffect(() => {
    const flower = flowerRef.current;
    const canvas = canvasRef.current;
    const glow = glowRef.current;
    const glowCanvas = glowCanvasRef.current;
    const page = document.querySelector<HTMLElement>(".desktop-flower-page");
    const hero = document.querySelector<HTMLElement>(".hero-image");
    const links = document.querySelector<HTMLElement>(".links-section");
    const linksList = links?.querySelector<HTMLElement>(".links-list");
    if (!flower || !canvas || !glow || !glowCanvas || !page || !hero || !links) return;
    const glowContext = glowCanvas.getContext("2d");

    const desktop = window.matchMedia("(min-width:761px)");
    let measuredDesktop = desktop.matches;
    const reduced = window.matchMedia("(prefers-reduced-motion:reduce)");
    let frame = 0;
    let lastTime = 0;
    let initialized = false;
    let pointerX = 0;
    let pointerY = 0;
    let mouseX = NaN;
    let mouseY = NaN;
    let hoverGlow = 0;
    let clickGlow = 0;
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
    let pageLeft = 0;
    let startX = 0;
    let startY = 0;
    let viewportY = 0;
    let linksTop = 0;
    let linksBottom = 0;
    let dockThreshold = 0;
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
      flower.disabled = !model || reduced.matches
        || document.documentElement.classList.contains("desktop-intro-active");
    };
    updateInteraction();

    const measure = () => {
      const pageRect = page.getBoundingClientRect();
      const heroRect = hero.getBoundingClientRect();
      const linksRect = links.getBoundingClientRect();
      pageTop = pageRect.top + window.scrollY;
      pageLeft = pageRect.left;
      const originalX = heroRect.left - pageRect.left + heroRect.width * .835 - flower.offsetWidth / 2;
      const rightGap = heroRect.right - pageRect.left - originalX - flower.offsetWidth;
      startX = originalX + rightGap / 2;
      startY = heroRect.top - pageRect.top + heroRect.height * .7 - flower.offsetHeight / 2;
      if (!desktop.matches) {
        const inset = heroRect.width * .05;
        startX = heroRect.right - pageRect.left - flower.offsetWidth - inset;
        startY = heroRect.bottom - pageRect.top - flower.offsetHeight - inset;
      }
      viewportY = Math.min(pageTop + startY, window.innerHeight - flower.offsetHeight - 40);
      linksTop = linksRect.top - pageRect.top;
      linksBottom = linksRect.bottom - pageRect.top;
      dockThreshold = linksTop + linksRect.height / 2 - flower.offsetHeight / 2;
      endX = linksRect.right - pageRect.left - window.innerWidth * .023 - flower.offsetWidth;
      endY = linksRect.bottom - pageRect.top - flower.offsetHeight - 48;
      if (!desktop.matches && linksList) {
        const dividerY = linksList.getBoundingClientRect().bottom - pageRect.top;
        endX = linksRect.right - pageRect.left - 20 - flower.offsetWidth;
        endY = dividerY + (linksBottom - dividerY - flower.offsetHeight) / 2;
      }
      flowerHeight = flower.offsetHeight;
      glow.style.width = `${flower.offsetWidth + 48}px`;
      glow.style.height = `${flowerHeight + 48}px`;
      // Keep the same perceived rim and shine on the smaller mobile coin.
      const glowScale = desktop.matches ? 1 : flower.offsetWidth / 144;
      glowFilterRef.current?.querySelectorAll("[data-glow-radius]").forEach(primitive => {
        primitive.setAttribute("radius", String(Number(primitive.getAttribute("data-glow-radius")) * glowScale));
      });
      glowFilterRef.current?.querySelectorAll("[data-glow-blur]").forEach(primitive => {
        primitive.setAttribute("stdDeviation", String(Number(primitive.getAttribute("data-glow-blur")) * glowScale));
      });
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
      const followY = clamp(window.scrollY + viewportY - pageTop, startY, endY);
      // Commit to the resting position halfway through Links. Tall viewports
      // can reveal its bottom before the follower reaches that threshold.
      const sectionBottomVisible = followY > startY && window.scrollY + window.innerHeight - pageTop >= linksBottom;
      const targetY = followY >= dockThreshold || sectionBottomVisible ? endY : followY;
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
        x: startX + (endX - startX) * ease + (reduced.matches || introActive ? 0 : pointerX * 14 * (1 - dockEase)),
        y: clamp(targetY + (reduced.matches || introActive ? 0 : pointerY * 12 * (1 - dockEase)), startY, endY),
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

    const paint = (elapsed: number) => {
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
      // Copy the freshly rendered alpha silhouette, so the glow follows every
      // petal, cutout and rotation. A separate normal-blend layer keeps it pink.
      const dx = mouseX - (pageLeft + x + flower.offsetWidth / 2);
      const dy = mouseY - (pageTop + visibleY - window.scrollY + flowerHeight / 2);
      const distance = Math.hypot(Math.max(Math.abs(dx) - flower.offsetWidth / 2, 0), Math.max(Math.abs(dy) - flowerHeight / 2, 0));
      const edge = clamp(Math.hypot(dx / (flower.offsetWidth / 2), dy / (flowerHeight / 2)), 0, 1);
      const enabled = !!model && !reduced.matches && !document.documentElement.classList.contains("desktop-intro-active");
      const desiredGlow = enabled && Number.isFinite(distance) ? (1 - clamp(distance / 160, 0, 1)) ** 2 * edge ** 2 : 0;
      hoverGlow += (desiredGlow - hoverGlow) * (1 - Math.exp(-elapsed * 16));
      if (Math.abs(desiredGlow - hoverGlow) < .001) hoverGlow = desiredGlow;
      // The click lights the whole rim, then its speed controls the fade.
      // Hover illumination remains directional after the spin has settled.
      const desiredClickGlow = enabled && settlingClick ? clamp(Math.abs(angularVelocity) / 12, 0, 1) : 0;
      clickGlow += (desiredClickGlow - clickGlow) * (1 - Math.exp(-elapsed * 10));
      if (Math.abs(desiredClickGlow - clickGlow) < .001) clickGlow = desiredClickGlow;
      const strength = enabled ? Math.max(hoverGlow, clickGlow) : 0;
      glow.style.opacity = String(strength);
      glow.style.transform = `translate3d(${(x - 24).toFixed(2)}px,${(visibleY - 24).toFixed(2)}px,0)`;
      // Put a soft spotlight outside the contour, even when the pointer is
      // inside it. This shines inward from the rim instead of slicing from its centre.
      const direction = Number.isFinite(dx) ? Math.atan2(dy, dx) : 0;
      glow.style.setProperty("--glow-x", `${24 + flower.offsetWidth / 2 + Math.cos(direction) * (flower.offsetWidth / 2 + 18)}px`);
      glow.style.setProperty("--glow-y", `${24 + flowerHeight / 2 + Math.sin(direction) * (flowerHeight / 2 + 18)}px`);
      glow.style.setProperty("--glow-floor", String(strength > 0 ? clickGlow / strength : 0));
      if (glowContext && strength > .001) {
        if (glowCanvas.width !== canvas.width) glowCanvas.width = canvas.width;
        if (glowCanvas.height !== canvas.height) glowCanvas.height = canvas.height;
        glowContext.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
        glowContext.drawImage(canvas, 0, 0);
      }
      flower.style.visibility = "visible";
      if (model || flower.dataset.modelFallback === "true") {
        const bounds = model?.frontBounds() || { width: 1, height: 1 };
        const width = String(bounds.width), height = String(bounds.height);
        if (flower.dataset.frontWidth !== width) flower.dataset.frontWidth = width;
        if (flower.dataset.frontHeight !== height) flower.dataset.frontHeight = height;
        if (flower.dataset.introReady !== "true") flower.dataset.introReady = "true";
      }
      return hoverGlow === desiredGlow && clickGlow === desiredClickGlow;
    };

    const tick = (time: number) => {
      frame = 0;
      const elapsed = Math.min(Math.max((time - lastTime) / 1000, 0), .064);
      const goal = target();
      if (!initialized || reduced.matches || document.documentElement.classList.contains("desktop-intro-active")) {
        x = goal.x;
        y = goal.y;
        angle = goal.angle;
        velocityX = velocityY = angularVelocity = 0;
        initialized = true;
      } else {
        // Substeps keep the underdamped spring stable during slower frames.
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
      const glowResting = paint(elapsed);
      if ((!resting || !glowResting) && !reduced.matches) frame = window.requestAnimationFrame(tick);
    };

    const wake = () => {
      if (frame) return;
      lastTime = performance.now();
      frame = window.requestAnimationFrame(tick);
    };
    const spin = () => {
      if (flower.disabled) return;
      clickGlow = 1;
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
      if (loadingModel || model) return;
      loadingModel = true;
      try {
        // Load the renderer separately from the initial page bundle.
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
      if (measuredDesktop !== desktop.matches) {
        measuredDesktop = desktop.matches;
        initialized = false;
        settlingClick = false;
        rotationTurns = rotationPhase = angularVelocity = 0;
        pointerX = pointerY = 0;
        mouseX = mouseY = NaN;
        hoverGlow = 0;
        clickGlow = 0;
        glow.style.opacity = "0";
      }
      measure();
      updateInteraction();
      void loadModel();
      wake();
    };
    const move = (event: PointerEvent) => {
      if (reduced.matches || document.documentElement.classList.contains("desktop-intro-active") || event.pointerType === "touch") return;
      pointerX = clamp(event.clientX / window.innerWidth * 2 - 1, -1, 1);
      pointerY = clamp(event.clientY / window.innerHeight * 2 - 1, -1, 1);
      mouseX = event.clientX;
      mouseY = event.clientY;
      wake();
    };
    const leave = (event: PointerEvent) => {
      if (event.relatedTarget !== null) return;
      pointerX = pointerY = 0;
      mouseX = mouseY = NaN;
      wake();
    };
    const motionChange = () => {
      pointerX = pointerY = 0;
      mouseX = mouseY = NaN;
      hoverGlow = 0;
      clickGlow = 0;
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

  return <><button ref={flowerRef} type="button" className="desktop-flower-layer desktop-flower" aria-label="Spin the flower" disabled
    style={{ "--flower-mask": `url("${maskSrc}")` } as CSSProperties}>
    <canvas ref={canvasRef} aria-hidden="true" />
  </button>
    <div ref={glowRef} className="desktop-flower-layer desktop-flower-glow" aria-hidden="true">
      <canvas ref={glowCanvasRef} />
    </div>
    <svg width="0" height="0" className="desktop-flower-glow-defs" aria-hidden="true">
      <defs><filter ref={glowFilterRef} id="desktop-flower-edge-glow" x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
        <feMorphology in="SourceAlpha" operator="dilate" radius="3" data-glow-radius="3" result="expanded" />
        <feMorphology in="SourceAlpha" operator="erode" radius="1" data-glow-radius="1" result="contracted" />
        <feComposite in="expanded" in2="contracted" operator="out" result="edge" />
        <feFlood floodColor="var(--pink)" result="pink" />
        <feComposite in="pink" in2="edge" operator="in" result="rim" />
        <feGaussianBlur in="rim" stdDeviation="8" data-glow-blur="8" result="halo" />
        <feComponentTransfer in="halo" result="softHalo"><feFuncA type="linear" slope="2.5" /></feComponentTransfer>
        <feGaussianBlur in="rim" stdDeviation="3" data-glow-blur="3" result="nearGlow" />
        <feMerge><feMergeNode in="softHalo" /><feMergeNode in="nearGlow" /><feMergeNode in="rim" /></feMerge>
      </filter></defs>
    </svg>
  </>;
}
