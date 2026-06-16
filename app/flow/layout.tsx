import FlowSidebar from "@/app/components/flow/FlowSidebar";

// Two-pane shell: persistent flow list on the left, the active flow on the right.
// The thin hotzone reveals the site's vertical nav rail on left-edge hover
// (FlowSidebar toggles the html.flow-route class that hides it by default).
export default function FlowLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flow-shell">
      <div className="flow-nav-hotzone" aria-hidden />
      <FlowSidebar />
      <div className="flow-content">{children}</div>
    </div>
  );
}
