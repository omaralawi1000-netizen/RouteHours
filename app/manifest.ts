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
    background_color: "#edf3ff",
    theme_color: "#edf3ff",
    icons: [
      { src: "/icon-192-v3.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512-v3.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-v3.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press the app icon (Android) for these. Each one can also be dragged out as its own icon.
    shortcuts: [
      { name: "Start shift", short_name: "Start", url: "/lab?do=start", icons: [{ src: "/shortcut-start.png", sizes: "192x192", type: "image/png" }] },
      { name: "Finish shift", short_name: "Finish", url: "/lab?do=finish", icons: [{ src: "/shortcut-finish.png", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
