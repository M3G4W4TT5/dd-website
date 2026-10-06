import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Pause, Play } from "lucide-react";
import FlexCarousel from "./FlexCarousel";
import { SwipeIndicator } from "./SwipeIndicator";
import type { FlexCarouselApi, ReelClip } from "./flex-carousel-types";
import "./ClipReel.css";

export function ClipReel({ clips }: { clips: readonly ReelClip[] }) {
  const [mobile, setMobile] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const apiRef = useRef<FlexCarouselApi | null>(null);
  const fallbackRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const nativeMode = reducedMotion || unsupported;

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 760px)");
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setMobile(mobileQuery.matches);
      setReducedMotion(motionQuery.matches);
      if (motionQuery.matches) setPaused(true);
    };
    update();
    mobileQuery.addEventListener("change", update);
    motionQuery.addEventListener("change", update);
    return () => {
      mobileQuery.removeEventListener("change", update);
      motionQuery.removeEventListener("change", update);
    };
  }, []);

  const onReady = useCallback((api: FlexCarouselApi) => {
    apiRef.current = api;
    setReady(true);
  }, []);
  const onUnsupported = useCallback(() => setUnsupported(true), []);
  const move = (direction: number) => {
    if (nativeMode) {
      const row = fallbackRef.current;
      row?.scrollBy({ left: direction * row.clientWidth * .9, behavior: reducedMotion ? "instant" : "smooth" });
    } else apiRef.current?.move(direction);
  };

  if (!clips.length) return null;

  return <div className="clip-reel" id="motion" aria-label="DD in motion">
    <div className="clip-reel-stage" ref={stageRef}>
      <SwipeIndicator interactionRef={stageRef} />
      {!nativeMode && <FlexCarousel
        items={clips}
        preset="liquid"
        intro="bloom"
        cardHeight={mobile ? .46 : .52}
        gap={mobile ? 16 : 64}
        squeeze={mobile ? 0 : .05}
        focusOnClick={false}
        captions={false}
        captureWheel={false}
        fit="natural"
        radius={3}
        lensWidth={mobile ? .64 : .79}
        lensHeight={mobile ? .7 : 1.26}
        tilt={53}
        roundness={.39}
        bend={mobile ? .24 : .29}
        smoothBend={mobile}
        reach={mobile ? .2 : .33}
        dispersion={1.42}
        followCursor={false}
        autoplay={!paused}
        interval={6}
        paused={paused}
        onReady={onReady}
        onUnsupported={onUnsupported}
      />}
      <div className="clip-reel-native" ref={fallbackRef} hidden={ready && !nativeMode} aria-label="Dance video excerpts">
        {clips.map(clip => <video key={clip.id} src={clip.src} poster={clip.poster} controls muted playsInline loop preload="none" aria-label={clip.alt} />)}
      </div>
    </div>
    <p className="clip-reel-bio">DD’s work moves between live stages, music films and campaigns. Selected credits include Dua Lipa’s Glastonbury set, Jungle’s <i>Back On 74</i> and Rosalía’s LUX tour. <a href="https://www.voguescandinavia.com/articles/didde-mie-beauty-guide" target="_blank" rel="noopener noreferrer">Tour source <ArrowUpRight size={14} /></a></p>
    <div className="clip-reel-controls">
      <span>DRAG TO EXPLORE</span>
      <div>
        <button type="button" aria-label="Previous dance clip" onClick={() => move(-1)}><ArrowLeft size={18} /></button>
        {!nativeMode && <button type="button" aria-label={paused ? "Play dance clips" : "Pause dance clips"} aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? <Play size={17} /> : <Pause size={17} />}</button>}
        <button type="button" aria-label="Next dance clip" onClick={() => move(1)}><ArrowRight size={18} /></button>
      </div>
    </div>
  </div>;
}
