import "../globals.css";

// The classic RouteHours design, kept at /classic while the new one settles in. Its global stylesheet loads only here.
export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
