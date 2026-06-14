import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { parseRounds } from "@/lib/pastRounds";
import PastGalaxy from "./PastGalaxy";

export const metadata: Metadata = {
  title: "The Past — debate.fish",
  description:
    "A galaxy of recorded debate rounds. Orbit, filter, and watch the rounds that shaped the activity.",
};

// The CSV is part of the repo and never changes at runtime, so read + parse it
// once at build time and bake the result into the static page.
export const dynamic = "force-static";

export default function ThePastPage() {
  const csv = fs.readFileSync(path.join(process.cwd(), "app", "rounds.csv"), "utf8");
  const rounds = parseRounds(csv);
  return <PastGalaxy rounds={rounds} />;
}
