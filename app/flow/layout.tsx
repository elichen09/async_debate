import FlowSidebar from "@/app/components/flow/FlowSidebar";
import FlowGate from "@/app/components/flow/FlowGate";

// Two-pane shell: persistent flow list on the left, the active flow on the right.
// The thin hotzone reveals the site's vertical nav rail on left-edge hover
// (FlowSidebar toggles the html.flow-route class that hides it by default).
// FlowGate restricts the whole section to allow-listed test accounts.
export default function FlowLayout({ children }: { children: React.ReactNode }) {
  return (
    <FlowGate>
      <div className="flow-shell">
        <div className="flow-nav-hotzone" aria-hidden />
        <FlowSidebar />
        <div className="flow-content">{children}</div>
      </div>
    </FlowGate>
  );
}
