import FlowSidebar from "@/app/components/flow/FlowSidebar";
import FlowGate from "@/app/components/flow/FlowGate";
import FlowConfirmProvider from "@/app/components/flow/ConfirmProvider";
import ForceGridScene from "@/app/components/ForceGridScene";

// Two-pane shell: persistent flow list on the left, the active flow on the right.
// The thin hotzone reveals the site's vertical nav rail on left-edge hover
// (FlowSidebar toggles the html.flow-route class that hides it by default).
// FlowGate restricts the whole section to allow-listed test accounts.
export default function FlowLayout({ children }: { children: React.ReactNode }) {
  return (
    <FlowGate>
      {/* Flow is a focused work surface: pin the calm light graph-paper scene
          (and drop the heavy animated backgrounds) the whole time you're in it. */}
      <ForceGridScene />
      <div className="flow-shell">
        <FlowConfirmProvider>
          <div className="flow-nav-hotzone" aria-hidden />
          <FlowSidebar />
          <div className="flow-content">{children}</div>
        </FlowConfirmProvider>
      </div>
    </FlowGate>
  );
}
