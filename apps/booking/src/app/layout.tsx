import type { Metadata } from "next";
import "@fontsource/anton/400.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/700.css";
import "./styles.css";
import "./art-direction.css";

export const metadata: Metadata = {
  title: "DD Studio | Booking preview",
  description: "Local preview of DD Studio's booking experience. No reservations are created yet.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="da">
      <body>{children}</body>
    </html>
  );
}
