import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "RouteHours — Bus Shift Tracker",
    short_name: "RouteHours",
    description: "Track bus shifts, record notes, and export your hours.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0B0D1C",
    theme_color: "#0B0D1C",
    icons: [
      // Drawn in scripts/icons and rendered by scripts/make-icons.mjs. The maskable one is what
      // Android shows; the monochrome one is its themed icon (Material You), where the launcher supports it.
      { src: "/icon-192-v4.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512-v4.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-v4.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon-monochrome-v4.png", sizes: "512x512", type: "image/png", purpose: "monochrome" },
    ],
    // Long-press the app icon (Android) for these. The Today screen handles ?do=start and ?do=finish.
    shortcuts: [
      { name: "Start shift", short_name: "Start", url: "/?do=start", icons: [{ src: "/shortcut-start-v2.png", sizes: "192x192", type: "image/png" }] },
      { name: "Finish shift", short_name: "Finish", url: "/?do=finish", icons: [{ src: "/shortcut-finish-v2.png", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
