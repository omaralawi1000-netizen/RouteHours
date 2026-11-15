import type { Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { NIGHT_SCENE, SCENE_HOURS, SCENES } from "../ui/wallpaper-scenes";
import "../ui/tokens.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });

export const viewport: Viewport = { themeColor: "#0B0D1C" };

/**
 * Before the first paint, colour the page with the sky of the wallpaper this phone will show
 * (its saved choice, or the one for this hour), so opening the app never flashes a different
 * scene or a dark screen before a light one. The wallpaper itself is drawn once it is known.
 */
const SKY = Object.fromEntries(SCENES.map(scene => [scene.id, scene.colors["--status"]]));
const firstSky = `try{var s=${JSON.stringify(SKY)},h=${JSON.stringify(SCENE_HOURS)},r=localStorage.getItem("routehours:wallpaper")||localStorage.getItem("routehours:lab-wallpaper")||"auto",c;try{c=JSON.parse(r)}catch(e){c=r}
if(!s[c]){var n=new Date().getHours();c=${JSON.stringify(NIGHT_SCENE)};for(var i=0;i<h.length;i++)if(n>=h[i][0]&&n<h[i][1])c=h[i][2]}
var d=document.documentElement;d.style.background=s[c];d.style.setProperty("--page-bg",s[c]);document.querySelectorAll("meta[name=theme-color]").forEach(function(m){m.removeAttribute("media");m.content=s[c]})}catch(e){}`;

/** The RouteHours app in the Headlight design. It loads only the new tokens, never the classic global styles. */
export default function MainLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className={jakarta.variable}>
    <script type={typeof window === "undefined" ? "text/javascript" : "text/plain"} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: firstSky }}/>
    {children}
  </div>;
}
