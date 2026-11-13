import type { Metadata, Viewport } from "next";
import { Fraunces, Inter_Tight, Outfit } from "next/font/google";
import "../ui/tokens.css";

// Three pairings to choose from in the lab. Clean is the default, so only it is preloaded.
const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight", display: "swap" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap", preload: false });
const fraunces = Fraunces({ subsets: ["latin"], style: ["italic"], axes: ["opsz", "SOFT"], variable: "--font-fraunces", display: "swap", preload: false });

export const metadata: Metadata = {
  title: "Headlight lab · RouteHours",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#0A0C11" };

/** The hidden design lab. It loads only the new design tokens, never the old global styles. */
export default function LabLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className={`${interTight.variable} ${outfit.variable} ${fraunces.variable}`}>{children}</div>;
}
