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
  };
}
