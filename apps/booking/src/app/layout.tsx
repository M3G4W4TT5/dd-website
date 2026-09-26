import type { Metadata } from "next";
import { PageTransition } from "@/components/PageTransition";
import "@fontsource/anton/400.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/700.css";
import "./palette.css";
import "./styles.css";
import "./art-direction.css";

export const metadata: Metadata = {
  title: "TTD Studio | Booking preview",
  description: "Preview TTD Studio at Nygaardsvej 5a, 2. sal, 2100 København Ø. No reservations are created yet.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><PageTransition>{children}</PageTransition></body>
    </html>
  );
}
