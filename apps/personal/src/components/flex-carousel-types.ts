import type { CSSProperties } from "react";

export type ReelClip = {
  id: string;
  src: string;
  poster: string;
  title: string;
  alt: string;
};

export type FlexCarouselApi = { move: (direction: number) => void };

export type FlexCarouselProps = {
  items: readonly ReelClip[];
  preset?: "liquid" | "ribbon" | "vortex" | "arch";
  intro?: "rise" | "bloom" | "spin" | "deal" | "none";
  cardHeight?: number;
  gap?: number;
  radius?: number;
  fit?: "natural" | "portrait" | "square" | "landscape";
  lensWidth?: number;
  lensHeight?: number;
  tilt?: number;
  roundness?: number;
  bend?: number;
  smoothBend?: boolean;
  reach?: number;
  curl?: "twist" | "rise" | "fall";
  dispersion?: number;
  liquid?: number;
  followCursor?: boolean;
  squeeze?: number;
  focusOnClick?: boolean;
  autoplay?: boolean;
  paused?: boolean;
  interval?: number;
  captions?: boolean;
  captureWheel?: boolean;
  onChange?: (index: number, item: ReelClip) => void;
  onSelect?: (index: number, item: ReelClip) => void;
  onReady?: (api: FlexCarouselApi) => void;
  onUnsupported?: () => void;
  className?: string;
  style?: CSSProperties;
};
