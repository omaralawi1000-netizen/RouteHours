import type { Metadata, Viewport } from "next";
import Script from "next/script";
import PwaRegistration from "./pwa-registration";
import "./globals.css";
export const metadata: Metadata = {
  title: "RouteHours — Bus shift tracker",
  description: "A calm, private space to track bus shifts and export hours.",
  applicationName: "RouteHours",
  appleWebApp: { capable: true, title: "RouteHours", statusBarStyle: "default" },
  icons: { icon: "/icon-192-v3.png", apple: "/apple-icon-v3.png" },
};
export const viewport:Viewport={width:"device-width",initialScale:1,viewportFit:"cover",themeColor:"#edf3ff"};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body>{children}<PwaRegistration/><Script id="routehours-theme" strategy="beforeInteractive">{"try { const mode = JSON.parse(localStorage.getItem('routehours:v1') || 'null')?.themeMode; if (mode === 'dark' || mode === 'light') document.documentElement.dataset.theme = mode; const dark = mode === 'dark' || mode !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches; document.querySelectorAll('meta[name=theme-color]').forEach(meta => {meta.removeAttribute('media');meta.content = dark ? '#111b31' : '#edf3ff';}); } catch {}"}</Script><Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive"/></body></html>;
}
