import type { Metadata } from "next";
import { PageTransition } from "@/components/PageTransition";
import { ThemeFavicon } from "@/components/ThemeFavicon";
import "@fontsource/anton/400.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/700.css";
import "./palette.css";
import "./styles.css";

export const metadata: Metadata = {
  title: "TTD Studio | Booking",
  description: "Book TTD Studio at Nygaardsvej 5a, 2. sal, 2100 København Ø.",
  robots: { index: false, follow: false },
  icons: { icon: [
    { url: "/branding/ttd/favicons/green/favicon.ico", sizes: "any", type: "image/x-icon" },
    { url: "/branding/ttd/favicons/green/favicon.png", sizes: "32x32", type: "image/png" },
  ] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><PageTransition>{children}</PageTransition><ThemeFavicon /></body>
    </html>
  );
}
