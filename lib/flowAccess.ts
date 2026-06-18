// The flow workspace is gated to hand-picked accounts during testing. Add an
// email here (lowercase) to grant access. Checked client-side in FlowGate and
// used to hide the nav link — this is a soft gate for testing, not hard security.
export const FLOW_ALLOWED_EMAILS: string[] = [
  "elichen314@gmail.com",
];

export function isFlowAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  return FLOW_ALLOWED_EMAILS.includes(email.trim().toLowerCase());
}
