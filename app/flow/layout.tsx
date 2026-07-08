import type { Metadata, Viewport } from "next";
import FlowSidebar from "@/app/components/flow/FlowSidebar";
import FlowGate from "@/app/components/flow/FlowGate";
import FlowConfirmProvider from "@/app/components/flow/ConfirmProvider";
import FlowFilmGrain from "@/app/components/flow/FlowFilmGrain";
import FlowPwa from "@/app/components/flow/FlowPwa";

// The flow section is installable as a desktop app ("FishFlower"). The manifest
// is linked only in this layout, so the browser's install prompt appears on
// /flow pages — not the rest of the site — and the installed app is scoped to
// /flow. FlowPwa registers the offline-shell service worker (public/sw.js).
export const metadata: Metadata = { manifest: "/flow.webmanifest" };
export const viewport: Viewport = { themeColor: "#f2f0ed" };

// Two-pane shell: persistent flow list on the left, the active flow on the right.
// The thin hotzone reveals the site's vertical nav rail on left-edge hover
// (FlowSidebar toggles the html.flow-route class that hides it by default).
// FlowGate restricts the whole section to allow-listed test accounts.
export default function FlowLayout({ children }: { children: React.ReactNode }) {
  return (
    <FlowGate>
      <div className="flow-shell">
        {/* Flow is a focused work surface: a neutral-gray canvas with moving
            analog film grain, instead of the heavy animated site backgrounds. */}
        <FlowFilmGrain />
        <FlowPwa />
        <FlowConfirmProvider>
          <div className="flow-nav-hotzone" aria-hidden />
          <FlowSidebar />
          <div className="flow-content">{children}</div>
        </FlowConfirmProvider>
      </div>
    </FlowGate>
  );
}
