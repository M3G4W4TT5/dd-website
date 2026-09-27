import { defineConfig } from "astro/config";
import react from "@astrojs/react";

if (process.env.DD_MODE === "production") {
  for (const key of ["PUBLIC_SERVICES_URL", "PUBLIC_BOOKING_URL"]) {
    const value = process.env[key];
    if (!value) throw new Error(`Missing ${key}`);
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error(`Invalid ${key}`);
  }
}

export default defineConfig({
  integrations: [react()],
  devToolbar: { enabled: false },
});
