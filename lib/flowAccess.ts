// Who can see the /flow workspace.
//
// The live allowlist is the flow_access table, managed from /flow/admin by the
// master account — granting someone access no longer needs a redeploy. The
// static list below is only the fallback for when that table doesn't exist yet
// (it's also the seed inside supabase/flow_access.sql). This stays a soft,
// client-side gate for testing; the hard rules are the RLS policies.
//
// MASTER_EMAIL is duplicated in supabase/flow_access.sql (is_flow_master) so
// the database enforces the same admin — change it in both places.

import { supabase } from "@/lib/supabase";

export const MASTER_EMAIL = "elichen314@gmail.com";

export const FLOW_ALLOWED_EMAILS: string[] = [
  "elichen314@gmail.com",
  "bchen2010@gmail.com",
  "rahulranilinc@gmail.com",
  "gary.r.ayal@gmail.com",
  "ethanisebbin@gmail.com",
  "28shangl@abschools.org",
  "melamnirmal@gmail.com",
  "christopherlawrence1022@gmail.com",
];

export function isFlowMaster(email: string | null | undefined): boolean {
  return !!email && email.trim().toLowerCase() === MASTER_EMAIL;
}

// Static-list check — the offline/fallback path only.
export function isFlowAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  return FLOW_ALLOWED_EMAILS.includes(email.trim().toLowerCase());
}

// The real gate check: the master is always in; everyone else is looked up in
// flow_access. If the table is missing or the query fails (offline, migration
// not run yet), fall back to the static list so access never breaks on an
// infra hiccup. Once the table answers, it is the source of truth.
export async function checkFlowAccess(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  if (e === MASTER_EMAIL) return true;
  try {
    const { data, error } = await supabase.from("flow_access").select("email").eq("email", e).maybeSingle();
    if (error) return isFlowAllowed(e);
    return !!data;
  } catch {
    return isFlowAllowed(e);
  }
}
