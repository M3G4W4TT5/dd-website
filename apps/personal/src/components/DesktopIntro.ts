/** Coordinates the loader with the actual rendered coin on both desktop and mobile. */
export async function startDesktopIntro() {
  const root = document.documentElement;
  if (!root.classList.contains("desktop-intro-active")) return;
  const desktop = matchMedia("(min-width:761px)");
  const reduced = matchMedia("(prefers-reduced-motion:reduce)");
  const dot = document.querySelector<HTMLElement>(".site-intro-mark i");
  const baseline = document.querySelector<HTMLElement>(".site-intro-baseline");
  const coin = document.querySelector<HTMLElement>(".desktop-flower");
  const sprites = Array.from(document.querySelectorAll<HTMLElement>(".site-intro-flower"));
  if (!dot || !baseline || !coin || sprites.length !== 2) return;

  let finished = false;
  let animations: Animation[] = [];
  let observer: MutationObserver | undefined;
  let readinessTimer = 0;
  let inkFrame = 0;
  let releaseReadiness = () => {};
  const previousGutter = root.style.scrollbarGutter;
  // Preserve the page's width while hiding its scrollbar, without changing viewport units.
  const scrollbarProbe = document.createElement("div");
  scrollbarProbe.style.cssText = "position:absolute;width:100px;height:100px;overflow:scroll;visibility:hidden;pointer-events:none";
  document.body.append(scrollbarProbe);
  root.style.setProperty("--intro-scrollbar-width", `${scrollbarProbe.offsetWidth - scrollbarProbe.clientWidth}px`);
  scrollbarProbe.remove();
  root.style.scrollbarGutter = "auto";
  const blockedKeys = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);
  const blockScroll = (event: Event) => event.preventDefault();
  const blockKey = (event: KeyboardEvent) => { if (blockedKeys.has(event.key)) event.preventDefault(); };
  const finish = () => {
    if (finished) return;
    finished = true;
    releaseReadiness();
    observer?.disconnect();
    clearTimeout(readinessTimer);
    cancelAnimationFrame(inkFrame);
    animations.forEach(animation => animation.cancel());
    sprites.forEach(sprite => sprite.remove());
    coin.classList.remove("desktop-flower-intro-landed");
    root.classList.remove("desktop-intro-active", "desktop-intro-running");
    root.style.scrollbarGutter = previousGutter;
    root.style.removeProperty("--intro-scrollbar-width");
    window.removeEventListener("wheel", blockScroll);
    window.removeEventListener("touchmove", blockScroll);
    window.removeEventListener("keydown", blockKey);
    window.removeEventListener("dd:intro-complete", finish);
    desktop.removeEventListener("change", finish);
    reduced.removeEventListener("change", preferenceChange);
    window.dispatchEvent(new Event("dd:intro-complete"));
  };
  const preferenceChange = () => { if (reduced.matches) finish(); };
  window.addEventListener("wheel", blockScroll, { passive: false });
  window.addEventListener("touchmove", blockScroll, { passive: false });
  window.addEventListener("keydown", blockKey);
  window.addEventListener("dd:intro-complete", finish);
  desktop.addEventListener("change", finish);
  reduced.addEventListener("change", preferenceChange);

  try {
    // The dot's ink bounds, including its true baseline, preserve its original visible size.
    const style = getComputedStyle(dot);
    const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    await document.fonts.load(font, ".");
    if (finished) return;
    const context = document.createElement("canvas").getContext("2d");
    if (!context) { finish(); return; }
    context.font = font;
    const ink = context.measureText(".");
    const dotRect = dot.getBoundingClientRect();
    const height = ink.actualBoundingBoxAscent + ink.actualBoundingBoxDescent;
    const width = height * 1672 / 1856;
    const inkLeft = dotRect.left - ink.actualBoundingBoxLeft;
    const inkWidth = ink.actualBoundingBoxLeft + ink.actualBoundingBoxRight;
    const left = inkLeft + (inkWidth - width) / 2;
    const top = baseline.getBoundingClientRect().top - ink.actualBoundingBoxAscent;
    sprites.forEach(sprite => Object.assign(sprite.style, {
      left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`
    }));
    sprites[0].style.opacity = ".4";
    sprites[0].style.transform = `translateX(${-parseFloat(style.fontSize) * .1}px) scale(.9)`;

    // Wait briefly for the first rendered 3D frame (or the silhouette fallback).
    await new Promise<void>(resolve => {
      releaseReadiness = resolve;
      const ready = () => {
        if (coin.dataset.introReady !== "true") return;
        observer?.disconnect();
        clearTimeout(readinessTimer);
        resolve();
      };
      observer = new MutationObserver(ready);
      observer.observe(coin, { attributes: true, attributeFilter: ["data-intro-ready"] });
      readinessTimer = window.setTimeout(resolve, 1500);
      ready();
    });
    if (finished) return;
    // Two RAFs allow the coin's first paint and any restored page position to settle.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    if (finished) return;
    if (getComputedStyle(coin).visibility !== "visible") { finish(); return; }
    const rect = coin.getBoundingClientRect();
    const targetWidth = rect.width * Number(coin.dataset.frontWidth || 1);
    const targetHeight = rect.height * Number(coin.dataset.frontHeight || 1);
    const targetLeft = rect.left + (rect.width - targetWidth) / 2;
    const targetTop = rect.top + (rect.height - targetHeight) / 2;
    const destination = `translate(${targetLeft - left}px,${targetTop - top}px) scale(${targetWidth / width},${targetHeight / height})`;
    const negative = sprites[1];
    const links = document.querySelector<HTMLElement>(".links-section");
    const updateInk = () => {
      if (!links) return;
      // A reload may restore a position over Links; keep that portion black at the handoff too.
      const bounds = negative.getBoundingClientRect();
      const localHeight = parseFloat(negative.style.height);
      const split = Math.max(0, Math.min(localHeight, (links.getBoundingClientRect().top - bounds.top) * localHeight / bounds.height));
      const ink = getComputedStyle(coin).getPropertyValue("--flower-pink-ink").trim() || "#f6aae0";
      negative.style.background = `linear-gradient(to bottom,#fff 0px,#fff ${split}px,${ink} ${split}px,${ink} 100%)`;
    };
    const trackInk = () => { updateInk(); inkFrame = requestAnimationFrame(trackInk); };
    const duration = 1350;
    const flightStart = 783 / duration;
    const pulse = [
      { offset: 0, transform: `translateX(${-parseFloat(style.fontSize) * .1}px) scale(.9)`, opacity: .4 },
      { offset: 472 / duration, transform: `translateX(${-parseFloat(style.fontSize) * .1}px) scale(.9)`, opacity: .4 },
      { offset: 702 / duration, transform: "none", opacity: 1 },
      { offset: flightStart, transform: "none", opacity: 1, easing: "cubic-bezier(.6,0,.18,1)" }
    ];
    animations = [
      sprites[0].animate([
        ...pulse,
        { offset: 1, transform: destination, opacity: 0 }
      ], { duration, fill: "both" }),
      sprites[1].animate([
        { offset: 0, transform: "none", opacity: 0 },
        { offset: flightStart, transform: "none", opacity: 0, easing: "cubic-bezier(.6,0,.18,1)" },
        { offset: 1, transform: destination, opacity: 1 }
      ], { duration, fill: "both" })
    ];
    root.classList.add("desktop-intro-running");
    inkFrame = requestAnimationFrame(trackInk);
    await Promise.all(animations.map(animation => animation.finished));
    if (finished) return;
    cancelAnimationFrame(inkFrame);
    animations.forEach(animation => animation.cancel());
    sprites[0].remove();
    // Once aligned, fade inside the coin's blend layer to avoid inverting the image twice.
    Object.assign(negative.style, {
      left: `${(rect.width - targetWidth) / 2}px`, top: `${(rect.height - targetHeight) / 2}px`,
      width: `${targetWidth}px`, height: `${targetHeight}px`, opacity: "1", transform: "none"
    });
    negative.classList.add("site-intro-flower-docked");
    coin.append(negative);
    coin.classList.add("desktop-flower-intro-landed");
    updateInk();
    const fade = negative.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: "both" });
    animations = [fade];
    await fade.finished;
    finish();
  } catch {
    finish();
  }
}
