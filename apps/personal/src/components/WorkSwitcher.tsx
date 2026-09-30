import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

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
  sourceUrl: string;
  sourceLabel: string;
  filmUrl?: string;
  filmLabel?: string;
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
      style={{ objectPosition: item.imagePosition }}
      onLoad={() => setStatus("loaded")}
      onError={() => setStatus("error")}
    />
  </div>;
}

export function WorkSwitcher({ items }: { items: readonly WorkItem[] }) {
  const [active, setActive] = useState(0);
  const [imageStatus, setImageStatus] = useState<Partial<Record<string, "loaded" | "error">>>({});
  const activeImageRef = useRef<HTMLImageElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const reducedMotion = useReducedMotion();
  const current = items[active];
  const currentStatus = current.image ? imageStatus[current.image] ?? "loading" : "empty";

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
        <div className="work-visual">
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
              style={{ objectPosition: current.imagePosition }}
              onLoad={() => setImageStatus((previous) => ({ ...previous, [current.image!]: "loaded" }))}
              onError={() => setImageStatus((previous) => ({ ...previous, [current.image!]: "error" }))}
              initial={{ opacity: 0, filter: reducedMotion ? "blur(0px)" : "blur(16px)", scale: reducedMotion ? 1 : 1.04 }}
              animate={{ opacity: currentStatus === "loaded" ? 1 : 0, filter: "blur(0px)", scale: 1 }}
              exit={{ opacity: reducedMotion ? 1 : 0, filter: reducedMotion ? "blur(0px)" : "blur(12px)" }}
              transition={{ duration: reducedMotion ? 0 : .42, ease: "easeOut" }}
            />}
          </AnimatePresence>
          <span className="work-visual-index">{current.number} / {items.length.toString().padStart(2, "0")}</span>
        </div>
        <div className="work-visual-info">
          <p><strong>{current.role}</strong></p>
          <div><a href={current.sourceUrl} target="_blank" rel="noopener noreferrer">{current.sourceLabel} <ArrowUpRight size={15} /></a>{current.filmUrl && <a href={current.filmUrl} target={current.filmUrl.startsWith("#") ? undefined : "_blank"} rel={current.filmUrl.startsWith("#") ? undefined : "noopener noreferrer"}>{current.filmLabel} <ArrowUpRight size={15} /></a>}</div>
        </div>
      </div>
      <div className="work-list-column">
      <div className="work-list" id="selected-projects" ref={listRef} aria-label="Selected projects">
        {items.map((item, index) => (
          <div className="work-entry" key={item.number}>
            <button
              type="button"
              className={index === active ? "work-item active" : "work-item"}
              aria-pressed={index === active}
              onMouseEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
              onClick={() => setActive(index)}
            >
              <span className="work-item-top"><span>{item.number} / {item.category}</span><ArrowUpRight size={20} /></span>
              <strong>{item.title}</strong>
              <span className="work-item-role">{item.role}</span>
              <span className="work-item-note">{item.note}</span>
            </button>
            <div className="work-mobile-media">
              <MobileWorkImage item={item} />
              <div><a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{item.sourceLabel} <ArrowUpRight size={15} /></a>{item.filmUrl && <a href={item.filmUrl} target={item.filmUrl.startsWith("#") ? undefined : "_blank"} rel={item.filmUrl.startsWith("#") ? undefined : "noopener noreferrer"}>{item.filmLabel} <ArrowUpRight size={15} /></a>}</div>
            </div>
          </div>
        ))}
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
