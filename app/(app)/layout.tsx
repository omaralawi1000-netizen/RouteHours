import "../globals.css";

// The current RouteHours design. Its global stylesheet loads only for the app, not for /lab.
export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
