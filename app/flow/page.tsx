// Empty state — the sidebar (in the layout) handles creating/selecting a flow.
export default function FlowIndexPage() {
  return (
    <div className="flow-empty">
      <p className="flow-empty__eyebrow">Flow sheets</p>
      <h1 className="flow-empty__title">Flow a round with your partner</h1>
      <p className="flow-empty__sub">
        Hover the <b>left edge</b> to open the flow panel, then create one with
        <b> + aff</b> or <b>+ neg</b>. Both of you can fill the grid, write the
        speech, and drop in saved extensions — live.
      </p>
    </div>
  );
}
