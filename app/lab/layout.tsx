import type { Metadata, Viewport } from "next";
import { Geist, Instrument_Serif } from "next/font/google";
import "../ui/tokens.css";

const geist = Geist({ subsets: ["latin"], weight: ["200", "300", "400", "500", "600"], variable: "--font-geist", display: "swap" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["italic"], variable: "--font-instrument-serif", display: "swap" });

export const metadata: Metadata = {
  title: "Headlight lab · RouteHours",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#0A0C11" };

/** The hidden design lab. It loads only the new design tokens, never the old global styles. */
export default function LabLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className={`${geist.variable} ${serif.variable}`}>{children}</div>;
}
