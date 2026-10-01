"use client";
import { useEffect, useState } from "react";

// A touch phone remains in the mobile journey if browser zoom widens its CSS
// viewport. Resizing a desktop window still follows the normal breakpoint.
export const MOBILE_JOURNEY_QUERY = "(max-width: 820px), (hover: none) and (pointer: coarse)";
export function useMobileJourney() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(MOBILE_JOURNEY_QUERY);
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return mobile;
}
