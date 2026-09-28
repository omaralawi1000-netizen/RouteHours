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
    background_color: "#f8f9fc",
    theme_color: "#6154d9",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
