import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Fraunces, Inter_Tight, Plus_Jakarta_Sans } from "next/font/google";
import "../ui/tokens.css";

// Four fonts to choose from in the lab. Modern (Plus Jakarta Sans) is the default, so only it is preloaded.
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });
const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight", display: "swap", preload: false });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap", preload: false });
const fraunces = Fraunces({ subsets: ["latin"], style: ["italic"], axes: ["opsz", "SOFT"], variable: "--font-fraunces", display: "swap", preload: false });

export const metadata: Metadata = {
  title: "Headlight lab · RouteHours",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#0A0C11" };

/** The hidden design lab. It loads only the new design tokens, never the old global styles. */
export default function LabLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className={`${jakarta.variable} ${interTight.variable} ${bricolage.variable} ${fraunces.variable}`}>{children}</div>;
}
