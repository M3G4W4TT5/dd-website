import { useCallback, useEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { SwipeIndicator } from "./SwipeIndicator";

type WorkItem = {
  number: string;
  category: string;
  title: string;
  role: string;
  note: string;
  image?: string;
  imageAlt?: string;
  imagePosition?: string;
  imageCredit?: string;
  videoUrl: string;
};

function DDLoader({ label }: { label: string }) {
  return <div className="dd-loader" role="status" aria-label={label}>
    <span className="dd-loader-mark" aria-hidden="true"><span>D</span><span>D</span><i>.</i></span>
  </div>;
}

function ImageError() {
  return <div className="dd-image-error" role="status" aria-label="Project image could not load">DD.</div>;
}

function MobileWorkImage({ item }: { item: WorkItem }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) setStatus("loaded");
  }, [item.image]);

  if (!item.image) return null;

  return <div className="work-mobile-image">
    {status === "loading" && <DDLoader label={`Loading image for ${item.title}`} />}
    {status === "error" && <ImageError />}
    <img
      ref={imageRef}
      src={item.image}
      alt={item.imageAlt}
      loading="lazy"
      decoding="async"
      className={status === "loaded" ? "is-loaded" : ""}
      onLoad={() => setStatus("loaded")}
      onError={() => setStatus("error")}
    />
  </div>;
}

export function WorkSwitcher({ items }: { items: readonly WorkItem[] }) {
  const [active, setActive] = useState(0);
  const [imageStatus, setImageStatus] = useState<Partial<Record<string, "loaded" | "error">>>({});
  const activeImageRef = useRef<HTMLImageElement>(null);
  const visualRef = useRef<HTMLAnchorElement>(null);
  const [desktopHeight, setDesktopHeight] = useState<number>();
  const listRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const reducedMotion = useReducedMotion();
  const [mobile, setMobile] = useState(false);
  const [mobileActive, setMobileActive] = useState(0);
  const [mobileHeight, setMobileHeight] = useState<number>();
  const [mobileImageBounds, setMobileImageBounds] = useState<{ top: number; height: number }>();
  const focusSelectedCard = useRef(false);
  const [carouselRef, carousel] = useEmblaCarousel({
    active: false,
    align: "start",
    loop: true,
    duration: reducedMotion ? 0 : 25,
    breakpoints: { "(max-width: 760px)": { active: true } },
  });
  const setListRef = useCallback((node: HTMLDivElement | null) => {
    listRef.current = node;
    carouselRef(node);
  }, [carouselRef]);
  const current = items[active];
  const currentStatus = current.image ? imageStatus[current.image] ?? "loading" : "empty";

  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const visual = visualRef.current;
    if (!visual || mobile) return;
    const update = () => setDesktopHeight(visual.getBoundingClientRect().height);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(visual);
    return () => observer.disconnect();
  }, [mobile]);

  useEffect(() => {
    if (!carousel || !mobile) return;
    let observer: ResizeObserver | undefined;
    const update = () => {
      const index = carousel.selectedScrollSnap();
      setMobileActive(index);
      const card = carousel.slideNodes()[index];
      observer?.disconnect();
      if (!card) return;
      const resize = () => {
        setMobileHeight(card.offsetHeight);
        const image = card.querySelector<HTMLElement>(".work-mobile-image");
        const column = listRef.current?.parentElement;
        if (!image || !column) {
          setMobileImageBounds(undefined);
          return;
        }
        const bounds = image.getBoundingClientRect();
        setMobileImageBounds({ top: bounds.top - column.getBoundingClientRect().top, height: bounds.height });
      };
      resize();
      observer = new ResizeObserver(resize);
      observer.observe(card);
    };
    update();
    carousel.on("select", update).on("reInit", update);
    return () => {
      observer?.disconnect();
      carousel.off("select", update).off("reInit", update);
    };
  }, [carousel, mobile]);

  useEffect(() => {
    if (mobile && focusSelectedCard.current) {
      carousel?.slideNodes()[mobileActive]?.focus({ preventScroll: true });
      focusSelectedCard.current = false;
    }
  }, [carousel, mobile, mobileActive]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const update = () => {
      setCanScrollUp(list.scrollTop > 1);
      setCanScrollDown(list.scrollTop + list.clientHeight < list.scrollHeight - 1);
    };
    update();
    list.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(list);
    return () => {
      list.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [items.length]);

  const scrollList = (direction: number) => {
    const list = listRef.current;
    if (list) list.scrollBy({ top: direction * list.clientHeight * .75, behavior: reducedMotion ? "instant" : "smooth" });
  };

  useEffect(() => {
    const image = activeImageRef.current;
    const source = current.image;
    if (source && image?.complete && image.naturalWidth > 0 && image.getAttribute("src") === source) {
      setImageStatus((previous) => ({ ...previous, [source]: "loaded" }));
    }
  }, [current.image]);

  return (
    <div className="work-switcher">
      <div className="work-visual-column" aria-live="polite">
        <a ref={visualRef} className="work-visual" href={current.videoUrl} target="_blank" rel="noopener noreferrer" aria-label={`Watch ${current.title} video`}>
          {currentStatus === "loading" && <DDLoader label={`Loading image for ${current.title}`} />}
          {currentStatus === "error" && <ImageError />}
          {currentStatus === "empty" && <div className="work-visual-placeholder" aria-hidden="true">DD.</div>}
          <AnimatePresence mode="wait">
            {current.image && currentStatus !== "error" && <motion.img
              ref={activeImageRef}
              key={current.number}
              src={current.image}
              alt={current.imageAlt}
              decoding="async"
              onLoad={() => setImageStatus((previous) => ({ ...previous, [current.image!]: "loaded" }))}
              onError={() => setImageStatus((previous) => ({ ...previous, [current.image!]: "error" }))}
              initial={{ opacity: 0, filter: reducedMotion ? "blur(0px)" : "blur(16px)", scale: reducedMotion ? 1 : 1.04 }}
              animate={{ opacity: currentStatus === "loaded" ? 1 : 0, filter: "blur(0px)", scale: 1 }}
              exit={{ opacity: reducedMotion ? 1 : 0, filter: reducedMotion ? "blur(0px)" : "blur(12px)" }}
              transition={{ duration: reducedMotion ? 0 : .42, ease: "easeOut" }}
            />}
          </AnimatePresence>
        </a>
        <div className="work-visual-info">
          <p><strong>{current.role}</strong></p>
        </div>
      </div>
      <div className="work-list-column">
      <div className="work-swipe-overlay" hidden={!mobileImageBounds} style={mobileImageBounds}>
        <SwipeIndicator />
      </div>
      <div
        className="work-list"
        id="selected-projects"
        ref={setListRef}
        role={mobile ? "region" : undefined}
        aria-roledescription={mobile ? "carousel" : undefined}
        aria-label="Selected projects"
        style={mobile ? mobileHeight ? { height: mobileHeight } : undefined : desktopHeight ? { height: desktopHeight, maxHeight: desktopHeight } : undefined}
        onKeyDown={(event) => {
          if (!mobile || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
          event.preventDefault();
          focusSelectedCard.current = true;
          if (event.key === "ArrowLeft") carousel?.scrollPrev();
          else carousel?.scrollNext();
        }}
      >
        <div className="work-track">
        {items.map((item, index) => (
          <a
            className="work-entry"
            key={item.number}
            href={item.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            inert={mobile && index !== mobileActive}
            aria-hidden={mobile && index !== mobileActive ? true : undefined}
            onMouseEnter={() => setActive(index)}
            onFocus={() => setActive(index)}
          >
            <div
              className={index === active ? "work-item active" : "work-item"}
            >
              <ArrowUpRight className="work-item-link-icon" size={20} aria-hidden="true" />
              <strong>{item.title}</strong>
              <span className="work-item-role">{item.role}</span>
              <span className="work-item-note">{item.note}</span>
            </div>
            <div className="work-mobile-media">
              <MobileWorkImage item={item} />
            </div>
          </a>
        ))}
        </div>
      </div>
      <div className="work-gallery-controls">
        <span>CLICK AN IMAGE TO WATCH · OPENS YOUTUBE</span>
        <div>
          <button type="button" onClick={() => carousel?.scrollPrev()} aria-label="Previous project" aria-controls="selected-projects"><ArrowLeft size={20} /></button>
          <button type="button" onClick={() => carousel?.scrollNext()} aria-label="Next project" aria-controls="selected-projects"><ArrowRight size={20} /></button>
        </div>
      </div>
      <div className="work-list-controls">
        <span>SCROLL TO EXPLORE · {items.length.toString().padStart(2, "0")} PROJECTS</span>
        <div>
          <button type="button" onClick={() => scrollList(-1)} disabled={!canScrollUp} aria-label="Scroll to previous projects" aria-controls="selected-projects"><ArrowUp size={20} /></button>
          <button type="button" onClick={() => scrollList(1)} disabled={!canScrollDown} aria-label="Scroll to more projects" aria-controls="selected-projects"><ArrowDown size={20} /></button>
        </div>
      </div>
      </div>
    </div>
  );
}
