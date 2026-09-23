import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ArrowLeft, ArrowRight, Camera } from "lucide-react";

type SamplePost = {
  number: string;
  label: string;
  tone: string;
};

export function InstagramCarousel({ posts }: { posts: readonly SamplePost[] }) {
  const [viewportRef, api] = useEmblaCarousel({ align: "start", containScroll: "trimSnaps" });
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const updateControls = useCallback(() => {
    setCanPrev(api?.canScrollPrev() ?? false);
    setCanNext(api?.canScrollNext() ?? false);
  }, [api]);

  useEffect(() => {
    if (!api) return;
    updateControls();
    api.on("select", updateControls).on("reInit", updateControls);
    return () => {
      api.off("select", updateControls).off("reInit", updateControls);
    };
  }, [api, updateControls]);

  return (
    <div className="feed-carousel" aria-label="Instagram sample carousel">
      <div className="feed-viewport" ref={viewportRef}>
        <div className="feed-track">
          {posts.map((post) => (
            <article className={`feed-slide feed-${post.tone}`} key={post.number}>
              <div className="feed-placeholder-art" aria-hidden="true"><span /></div>
              <div className="feed-card-top"><Camera size={18} /><span>SAMPLE / {post.number}</span></div>
              <div className="feed-card-bottom"><strong>{post.label}</strong><span>Real post pending</span></div>
            </article>
          ))}
        </div>
      </div>
      <div className="feed-controls">
        <span>PREVIEW ONLY · NO INSTAGRAM CONNECTION</span>
        <div>
          <button type="button" onClick={() => api?.scrollPrev()} disabled={!canPrev} aria-label="Previous sample post"><ArrowLeft size={20} /></button>
          <button type="button" onClick={() => api?.scrollNext()} disabled={!canNext} aria-label="Next sample post"><ArrowRight size={20} /></button>
        </div>
      </div>
    </div>
  );
}
