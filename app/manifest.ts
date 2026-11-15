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
      { src: "/icon-192-v3.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512-v3.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-v3.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press the app icon (Android) for these. The Today screen handles ?do=start and ?do=finish.
    shortcuts: [
      { name: "Start shift", short_name: "Start", url: "/?do=start", icons: [{ src: "/shortcut-start.png", sizes: "192x192", type: "image/png" }] },
      { name: "Finish shift", short_name: "Finish", url: "/?do=finish", icons: [{ src: "/shortcut-finish.png", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
