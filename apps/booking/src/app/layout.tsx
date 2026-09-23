import type { Metadata } from "next";
import "./styles.css";

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
