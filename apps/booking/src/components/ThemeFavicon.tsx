"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type Theme = "green" | "purple" | "red" | "yellow";

function renderedTheme(): Theme {
  // The rendered page wins over its URL: an unknown event uses the yellow 404 page.
  if (document.querySelector(".not-found-main")) return "yellow";
  if (document.querySelector(".events-main")) return "purple";
  if (document.querySelector(".contact-main")) return "red";
  return "green";
}

function updateFavicon() {
  const theme = renderedTheme();
  const seen = new Set<string>();
  for (const link of document.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')) {
    const format = link.type === "image/png" ? "png" : "ico";
    if (seen.has(format)) {
      link.remove();
      continue;
    }
    seen.add(format);
    const href = `/branding/ttd/favicons/${theme}/favicon.${format}`;
    if (link.getAttribute("href") !== href) link.setAttribute("href", href);
  }
}

export function ThemeFavicon() {
  const pathname = usePathname();

  useEffect(() => {
    updateFavicon();
    // Next commits server-rendered page content and metadata independently during navigation.
    // Watch both so the icon follows the page that actually rendered, including notFound().
    const observer = new MutationObserver(updateFavicon);
    observer.observe(document.body, { childList: true, subtree: true });
    observer.observe(document.head, { childList: true });
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
