import type { Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "../ui/tokens.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });

export const viewport: Viewport = { themeColor: "#0B0D1C" };

/** The RouteHours app in the Headlight design. It loads only the new tokens, never the classic global styles. */
export default function MainLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className={jakarta.variable}>{children}</div>;
}
