import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

type WorkSample = {
  number: string;
  category: string;
  title: string;
  note: string;
  image: string;
};

export function WorkSwitcher({ items }: { items: readonly WorkSample[] }) {
  const [active, setActive] = useState(0);
  const reducedMotion = useReducedMotion();
  const current = items[active];

  return (
    <div className="work-switcher">
      <div className="work-visual" aria-live="polite">
        <AnimatePresence mode="wait">
          <motion.img
            key={current.number}
            src={current.image}
            alt="Illustrative street dance concept; not a photograph of DD or a credited project"
            initial={{ opacity: reducedMotion ? 1 : 0, filter: reducedMotion ? "blur(0px)" : "blur(16px)", scale: reducedMotion ? 1 : 1.04 }}
            animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
            exit={{ opacity: reducedMotion ? 1 : 0, filter: reducedMotion ? "blur(0px)" : "blur(12px)" }}
            transition={{ duration: reducedMotion ? 0 : .42, ease: "easeOut" }}
          />
        </AnimatePresence>
        <span className="work-visual-index">{current.number} / {items.length.toString().padStart(2, "0")}</span>
        <span className="work-visual-note">CONCEPT IMAGE · FINAL MEDIA PENDING</span>
      </div>
      <div className="work-list" aria-label="Sample project categories">
        {items.map((item, index) => (
          <button
            type="button"
            key={item.number}
            className={index === active ? "work-item active" : "work-item"}
            aria-pressed={index === active}
            onMouseEnter={() => setActive(index)}
            onFocus={() => setActive(index)}
            onClick={() => setActive(index)}
          >
            <span className="work-item-top"><span>{item.number} / {item.category}</span><ArrowUpRight size={20} /></span>
            <strong>{item.title}</strong>
            <span className="work-item-note">{item.note}</span>
          </button>
        ))}
        <p>Verified acts, collaborators, dates and credits will replace these samples after DD approves them.</p>
      </div>
    </div>
  );
}
