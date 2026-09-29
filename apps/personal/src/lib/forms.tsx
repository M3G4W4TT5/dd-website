import { useEffect, useState } from "react";
const canonical = "https://didde-mie.com";
const production = import.meta.env.PUBLIC_SERVICES_URL === canonical;
export function useFormsAvailable() {
  const [available, setAvailable] = useState(!production);
  useEffect(() => { setAvailable(!production || window.location.origin === canonical); }, []);
  return available;
}
export function formEndpoint(path: "/api/contact" | "/api/marketing" | "/api/marketing/action") {
  if (production) {
    if (window.location.origin !== canonical) throw new Error("Visual preview only");
    return path;
  }
  return new URL(path, import.meta.env.PUBLIC_SERVICES_URL || "http://127.0.0.1:3011");
}
export function PreviewFormsNotice({ available }: { available: boolean }) {
  return available ? null : <p role="status">This is a visual preview. Forms are available on <a href={canonical}>didde-mie.com</a>.</p>;
}
