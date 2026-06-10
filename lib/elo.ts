// Elo helpers shared by signup, rankings, and the history graph.

export const ELO_MIN = 600;
export const ELO_MAX_START = 1200;
export const ELO_K = 32;

export interface Tier {
  name: string;
  min: number;
  /** Light tint that stays legible on the dark photo backgrounds. */
  color: string;
  blurb: string;
}

// Ordered low → high. Names follow the debate ladder, not gaming ranks.
export const TIERS: Tier[] = [
  { name: "Novice",    min: 0,    color: "oklch(0.78 0.05 145)", blurb: "Brand new to public forum" },
  { name: "Contender", min: 800,  color: "oklch(0.80 0.10 150)", blurb: "A season of rounds behind you" },
  { name: "Advocate",  min: 1000, color: "oklch(0.78 0.14 142)", blurb: "Competitive on your local circuit" },
  { name: "Orator",    min: 1200, color: "oklch(0.82 0.12 95)",  blurb: "Varsity confidence, national reps" },
  { name: "Laureate",  min: 1400, color: "oklch(0.88 0.10 90)",  blurb: "The top of the ladder" },
];

export function tierFor(elo: number): Tier {
  let t = TIERS[0];
  for (const tier of TIERS) if (elo >= tier.min) t = tier;
  return t;
}

export function expectedScore(mine: number, theirs: number): number {
  return 1 / (1 + Math.pow(10, (theirs - mine) / 400));
}

export interface EloPoint {
  /** Elo after this round (or the starting point when label is "Start"). */
  elo: number;
  delta: number;
  won: boolean | null;
  label: string;
  sub: string;
  date: string | null;
  roundId: string | null;
}

export interface HistoryRound {
  id: string;
  topic: string;
  winnerId: string;
  opponentUsername: string;
  opponentElo: number;
  date: string | null;
}

/**
 * Rebuild an Elo timeline for a player from their completed ranked rounds.
 * Exact per-round deltas live server-side, so this walks backward from the
 * player's true current Elo using standard Elo (K=32) against each opponent's
 * current rating. The endpoint is always exact; earlier points are estimates.
 */
export function reconstructHistory(
  playerId: string,
  currentElo: number,
  rounds: HistoryRound[],
): EloPoint[] {
  const ordered = [...rounds].sort((a, b) =>
    (a.date || "").localeCompare(b.date || "")
  );

  const points: EloPoint[] = [];
  let elo = currentElo;
  for (let i = ordered.length - 1; i >= 0; i--) {
    const r = ordered[i];
    const won = r.winnerId === playerId;
    const exp = expectedScore(elo, r.opponentElo);
    const delta = Math.round(ELO_K * ((won ? 1 : 0) - exp)) || (won ? 1 : -1);
    points.unshift({
      elo,
      delta,
      won,
      label: r.topic,
      sub: `vs @${r.opponentUsername}`,
      date: r.date,
      roundId: r.id,
    });
    elo -= delta;
  }

  points.unshift({
    elo,
    delta: 0,
    won: null,
    label: "Start",
    sub: "Joined the ladder",
    date: ordered[0]?.date ?? null,
    roundId: null,
  });

  return points;
}
