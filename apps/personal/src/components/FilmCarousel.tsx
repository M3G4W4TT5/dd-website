import { useCallback, useEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Play } from "lucide-react";

type Film = {
  number: string;
  title: string;
  detail: string;
  kind: string;
  publisher: string;
  image: string;
  imageAlt: string;
  youtubeId: string;
  url: string;
};

export function FilmCarousel({ films }: { films: readonly Film[] }) {
  const [viewportRef, api] = useEmblaCarousel({ align: "start", containScroll: "trimSnaps" });
  const dialogRef = useRef<HTMLDialogElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [selectedFilm, setSelectedFilm] = useState<Film | null>(null);
  const [playerState, setPlayerState] = useState<"loading" | "ready" | "blocked">("loading");

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

  useEffect(() => {
    if (selectedFilm && !dialogRef.current?.open) dialogRef.current?.showModal();
  }, [selectedFilm]);

  useEffect(() => {
    if (!selectedFilm) return;
    const timeout = window.setTimeout(() => {
      setPlayerState((state) => state === "loading" ? "blocked" : state);
    }, 7000);
    return () => window.clearTimeout(timeout);
  }, [selectedFilm]);

  const openFilm = (film: Film) => {
    setPlayerState("loading");
    setSelectedFilm(film);
  };

  const playerLoaded = () => {
    const frame = iframeRef.current?.contentWindow;
    if (!frame) {
      setPlayerState("blocked");
      return;
    }
    try {
      setPlayerState(frame.location.href === "about:blank" ? "blocked" : "ready");
    } catch {
      setPlayerState("ready");
    }
  };

  return (
    <div className="feed-carousel" aria-label="Selected performance films and tour recording">
      <div className="feed-viewport" ref={viewportRef}>
        <div className="feed-track">
          {films.map((film) => (
            <article className="feed-slide" key={film.number}>
              <button type="button" className="feed-video-trigger" onClick={() => openFilm(film)} aria-label={`Play ${film.title} on this page`}>
                <img src={film.image} loading="lazy" alt={film.imageAlt} />
                <div className="feed-card-top"><span>{film.kind} / {film.number}</span></div>
                <div className="feed-card-bottom"><strong>{film.title}</strong><Play size={20} /></div>
              </button>
            </article>
          ))}
        </div>
      </div>
      <div className="feed-controls">
        <span>SELECT A FILM TO WATCH</span>
        <div>
          <button type="button" onClick={() => api?.scrollPrev()} disabled={!canPrev} aria-label="Previous film"><ArrowLeft size={20} /></button>
          <button type="button" onClick={() => api?.scrollNext()} disabled={!canNext} aria-label="Next film"><ArrowRight size={20} /></button>
        </div>
      </div>
      <dialog ref={dialogRef} className="film-dialog" aria-label={selectedFilm ? `${selectedFilm.title} video player` : "Video player"} onClose={() => setSelectedFilm(null)}>
        {selectedFilm && <>
          <div className="film-dialog-head"><div><span>NOW PLAYING / {selectedFilm.publisher}</span><strong>{selectedFilm.title}</strong></div><button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close video player">CLOSE ×</button></div>
          <div className="film-dialog-frame">
            <img className="film-dialog-poster" src={selectedFilm.image} alt="" />
            <iframe ref={iframeRef} className={playerState === "ready" ? "is-ready" : ""} src={`https://www.youtube.com/embed/${selectedFilm.youtubeId}?autoplay=1&rel=0`} title={`${selectedFilm.title} — YouTube player`} referrerPolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen onLoad={playerLoaded} onError={() => setPlayerState("blocked")} />
            {playerState === "loading" && <div className="film-player-loading" role="status" aria-label="Loading YouTube player"><span className="dd-loader-mark" aria-hidden="true"><span>D</span><span>D</span><i>.</i></span></div>}
            {playerState === "blocked" && <div className="film-player-fallback" role="alert"><strong>YouTube playback is blocked in this browser.</strong><a href={selectedFilm.url} target="_blank" rel="noopener noreferrer">Watch on YouTube <ArrowUpRight size={18} /></a></div>}
          </div>
          <div className="film-dialog-foot"><span>{selectedFilm.detail}</span>{playerState !== "blocked" && <a href={selectedFilm.url} target="_blank" rel="noopener noreferrer">Open original on YouTube <ArrowUpRight size={15} /></a>}</div>
        </>}
      </dialog>
    </div>
  );
}
