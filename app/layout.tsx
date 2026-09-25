import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "RouteHours — Bus shift tracker",
  description: "A calm, private space to track bus shifts and export hours.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive"/></body></html>;
}
