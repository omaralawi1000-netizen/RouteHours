import type { Metadata } from "next";
import Script from "next/script";
import PwaRegistration from "./pwa-registration";
import "./globals.css";

export const metadata: Metadata = {
  title: "RouteHours — Bus shift tracker",
  description: "A calm, private space to track bus shifts and export hours.",
  applicationName: "RouteHours",
  appleWebApp: { capable: true, title: "RouteHours", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon-192.png", apple: "/apple-icon.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<PwaRegistration/><Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive"/></body></html>;
}
