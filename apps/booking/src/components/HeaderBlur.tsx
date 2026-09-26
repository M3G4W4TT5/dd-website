import type { CSSProperties } from "react";

const masks = [
  "linear-gradient(#000 0% 10%, #0000 30%)",
  "linear-gradient(#0000 0%, #000 10% 20%, #0000 40%)",
  "linear-gradient(#0000 0%, #000 20% 30%, #0000 50%)",
  "linear-gradient(#0000 10%, #000 30% 40%, #0000 60%)",
  "linear-gradient(#0000 20%, #000 40% 50%, #0000 70%)",
  "linear-gradient(#0000 30%, #000 50% 60%, #0000 80%)",
  "linear-gradient(#0000 40%, #000 60% 70%, #0000 90%)",
  "linear-gradient(#0000 50%, #000 70% 80%, #0000 100%)",
  "linear-gradient(#0000 60%, #000 80% 90%, #0000 100%)",
  "linear-gradient(#0000 70%, #000 90%, #0000 100%)",
];

// Diffuse the heavier page typography more strongly in the upper part of the header.
const upperBlurRadii = [96, 48, 20];

/** Overlapping masked backdrops keep the navigation sharp and soften the page toward the top. */
export function HeaderBlur() {
  return <div className="header-blur" aria-hidden="true">
    {masks.map((mask, index) => <span key={mask} style={{
      "--header-blur": `${upperBlurRadii[index] ?? 48 / 1.9 ** index}px`,
      "--header-mask": mask,
    } as CSSProperties} />)}
  </div>;
}
