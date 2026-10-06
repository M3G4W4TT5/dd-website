import type {CopyGroup} from "../cms/model";
import { useEffect, useState } from "react";
const canonical = "https://didde-mie.com";
const draftPreview = import.meta.env.PUBLIC_DRAFT_PREVIEW === "1";
const production = import.meta.env.PUBLIC_SERVICES_URL === canonical;
export function useFormsAvailable() {
  const [available, setAvailable] = useState(!draftPreview && !production);
  useEffect(() => { setAvailable(!draftPreview && (!production || window.location.origin === canonical)); }, []);
  return available;
}
export function formEndpoint(path: "/api/contact" | "/api/marketing" | "/api/marketing/action") {
  if (draftPreview) throw new Error("Draft preview has no form delivery");
  if (production) {
    if (window.location.origin !== canonical) throw new Error("Visual preview only");
    return path;
  }
  return new URL(path, import.meta.env.PUBLIC_SERVICES_URL || "http://127.0.0.1:3011");
}
export function PreviewFormsNotice({ available, copy }: { available: boolean; copy: CopyGroup<"forms"> }) {
  return available ? null : <p role="status">{copy.previewBefore} <a href={canonical}>didde-mie.com</a>{copy.previewAfter}</p>;
}
