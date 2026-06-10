"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import type { CSSProperties } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tournament {
  id: string;
  name: string;
  size: 4 | 8;
  status: "registration" | "active" | "complete";
  topic: string | null;
  created_by: string;
  winner_id: string | null;
  created_at: string;
  format: "open" | "private";
  join_code: string | null;
}

interface Profile {
  id: string;
  username: string;
  display_name: string;
  elo: number;
}

interface TournamentParticipant {
  id: string;
  tournament_id: string;
  user_id: string;
  seed: number | null;
  status: "active" | "eliminated" | "disqualified" | "winner";
  joined_at: string;
  user: Profile;
}

interface TournamentMatch {
  id: string;
  tournament_id: string;
  round_number: number;
  match_number: number;
  player1_id: string | null;
  player2_id: string | null;
  winner_id: string | null;
  round_id: string | null;
  status: "pending" | "active" | "complete";
  next_match_id: string | null;
}

interface JudgingAssignment {
  id: string;
  tournament_id: string;
  match_id: string;
  judge_id: string;
  completed: boolean;
  assigned_at: string;
}

// ─── Bracket ─────────────────────────────────────────────────────────────────

const MH = 58;
const MW = 158;
const SB = 84;
const RG = 52;

function getX(ri: number) { return ri * (MW + RG); }
function getMidY(ri: number, mi: number, firstCount: number, totalH: number) {
  const n = firstCount / Math.pow(2, ri);
  return mi * (totalH / n) + (totalH / n) / 2;
}
function getTopY(ri: number, mi: number, firstCount: number, totalH: number) {
  return getMidY(ri, mi, firstCount, totalH) - MH / 2;
}

interface BracketProps {
  matches: TournamentMatch[];
  participants: TournamentParticipant[];
  userId: string;
  size: 4 | 8;
}

function Bracket({ matches, participants, userId, size }: BracketProps) {
  const firstCount  = size === 4 ? 2 : 4;
  const totalRounds = size === 4 ? 2 : 3;
  const totalH = firstCount * SB;
  const totalW = totalRounds * MW + (totalRounds - 1) * RG;
  const roundLabels = size === 4
    ? ["Semifinals", "Final"]
    : ["Quarterfinals", "Semifinals", "Final"];

  const roundGroups: TournamentMatch[][] = [];
  for (let r = 1; r <= totalRounds; r++) {
    roundGroups.push(matches.filter(m => m.round_number === r).sort((a, b) => a.match_number - b.match_number));
  }

  function getProfile(uid: string | null): Profile | null {
    if (!uid) return null;
    return participants.find(p => p.user_id === uid)?.user ?? null;
  }

  const connectors: React.ReactElement[] = [];
  for (let ri = 0; ri < totalRounds - 1; ri++) {
    const nextRound = roundGroups[ri + 1] ?? [];
    nextRound.forEach((_, ni) => {
      const xRight = getX(ri) + MW;
      const xMid   = xRight + RG / 2;
      const xLeft  = getX(ri + 1);
      const y1     = getMidY(ri, ni * 2,     firstCount, totalH);
      const y2     = getMidY(ri, ni * 2 + 1, firstCount, totalH);
      const yNext  = getMidY(ri + 1, ni, firstCount, totalH);
      connectors.push(
        <g key={`conn-${ri}-${ni}`} stroke="rgba(255,255,255,0.16)" strokeWidth={1} fill="none">
          <line x1={xRight} y1={y1}    x2={xMid}  y2={y1} />
          <line x1={xRight} y1={y2}    x2={xMid}  y2={y2} />
          <line x1={xMid}   y1={y1}    x2={xMid}  y2={y2} />
          <line x1={xMid}   y1={yNext} x2={xLeft} y2={yNext} />
        </g>
      );
    });
  }

  return (
    <div style={{ overflowX: "auto", paddingBottom: 4 }}>
      {/* Round labels */}
      <div style={{ position: "relative", width: totalW, height: 18, marginBottom: 10 }}>
        {roundLabels.map((label, ri) => (
          <div key={ri} style={{ position: "absolute", left: getX(ri), width: MW, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.30)" }}>
            {label}
          </div>
        ))}
      </div>

      {/* Bracket body */}
      <div style={{ position: "relative", width: totalW, height: totalH }}>
        <svg width={totalW} height={totalH} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
          {connectors}
        </svg>

        {roundGroups.map((roundMatches, ri) =>
          roundMatches.map((match, mi) => {
            const p1 = getProfile(match.player1_id);
            const p2 = getProfile(match.player2_id);
            const isMyMatch = match.player1_id === userId || match.player2_id === userId;
            const players = [
              { id: match.player1_id, profile: p1 },
              { id: match.player2_id, profile: p2 },
            ];
            return (
              <div
                key={match.id}
                style={{
                  position: "absolute",
                  left: getX(ri),
                  top: getTopY(ri, mi, firstCount, totalH),
                  width: MW,
                  height: MH,
                  background: "rgba(255,255,255,0.07)",
                  backdropFilter: "blur(12px)",
                  border: `1px solid ${isMyMatch ? "rgba(var(--accent-raw, 80,160,80), 0.50)" : "rgba(255,255,255,0.12)"}`,
                  borderColor: isMyMatch ? "oklch(0.54 0.16 142 / 0.50)" : "rgba(255,255,255,0.12)",
                  borderRadius: 8,
                  overflow: "hidden",
                  boxShadow: isMyMatch ? "0 0 0 1.5px oklch(0.54 0.16 142 / 0.20)" : "none",
                }}
              >
                {players.map((player, pi) => (
                  <div
                    key={pi}
                    style={{
                      height: "50%",
                      padding: "0 10px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 6,
                      borderBottom: pi === 0 ? "1px solid rgba(255,255,255,0.08)" : undefined,
                      background:
                        match.winner_id && match.winner_id === player.id
                          ? "rgba(80,180,100,0.12)"
                          : match.winner_id && match.winner_id !== player.id && player.id
                          ? "rgba(0,0,0,0.10)"
                          : undefined,
                    }}
                  >
                    <span style={{
                      fontSize: 12,
                      fontWeight: match.winner_id === player.id ? 600 : 400,
                      color: player.profile
                        ? (match.winner_id === player.id ? "#fff" : "rgba(255,255,255,0.70)")
                        : "rgba(255,255,255,0.28)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      flex: 1,
                    }}>
                      {player.profile ? (player.profile.display_name || player.profile.username) : "TBD"}
                    </span>
                    {match.winner_id === player.id && (
                      <span style={{ fontSize: 10, color: "var(--accent)", flexShrink: 0 }}>✓</span>
                    )}
                  </div>
                ))}
                {match.round_id && (
                  <Link href={`/round/${match.round_id}`} style={{ position: "absolute", inset: 0 }} />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TournamentPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [participants, setParticipants] = useState<TournamentParticipant[]>([]);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [assignments, setAssignments] = useState<JudgingAssignment[]>([]);
  const [creatorProfile, setCreatorProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [codeCopied, setCodeCopied] = useState(false);

  const autoSynced = useRef(false);

  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    if (!loading && tournament?.status === "active" && !autoSynced.current && !actionLoading) {
      autoSynced.current = true;
      syncTournament();
    }
  }, [loading, tournament?.status]);

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push("/login"); return; }
    setUserId(session.user.id);

    const [{ data: t }, { data: p }, { data: m }, { data: a }] = await Promise.all([
      supabase.from("tournaments").select("*").eq("id", id).single(),
      supabase.from("tournament_participants").select("*, user:profiles!user_id(id, username, display_name, elo)").eq("tournament_id", id).order("seed", { ascending: true, nullsFirst: false }),
      supabase.from("tournament_matches").select("*").eq("tournament_id", id).order("round_number").order("match_number"),
      supabase.from("tournament_judging_assignments").select("*").eq("tournament_id", id),
    ]);

    if (t) {
      setTournament(t as Tournament);
      const { data: cp } = await supabase.from("profiles").select("id, username, display_name, elo").eq("id", t.created_by).single();
      setCreatorProfile((cp as Profile) || null);
    }
    setParticipants((p as unknown as TournamentParticipant[]) || []);
    setMatches((m as TournamentMatch[]) || []);
    setAssignments((a as JudgingAssignment[]) || []);
    setLoading(false);
  }

  async function handleJoin() {
    setError(""); setActionLoading(true);
    const { error: err } = await supabase.from("tournament_participants").insert({ tournament_id: id, user_id: userId });
    if (err) setError(err.message);
    setActionLoading(false);
    await load();
  }

  async function handleLeave() {
    setActionLoading(true);
    await supabase.from("tournament_participants").delete().eq("tournament_id", id).eq("user_id", userId);
    setActionLoading(false);
    await load();
  }

  async function copyJoinCode() {
    if (!tournament?.join_code) return;
    await navigator.clipboard.writeText(tournament.join_code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 1500);
  }

  // Creator assigns a seed; if another player holds it, the two swap.
  async function assignSeed(targetUserId: string, newSeed: number) {
    setActionLoading(true);
    const target = participants.find(p => p.user_id === targetUserId);
    const holder = participants.find(p => p.seed === newSeed && p.user_id !== targetUserId);
    if (holder) {
      await supabase.from("tournament_participants").update({ seed: target?.seed ?? null }).eq("tournament_id", id).eq("user_id", holder.user_id);
    }
    await supabase.from("tournament_participants").update({ seed: newSeed }).eq("tournament_id", id).eq("user_id", targetUserId);
    setActionLoading(false);
    await load();
  }

  async function assignJudge(matchId: string, judgeId: string) {
    if (!judgeId) return;
    setActionLoading(true);
    const existing = assignments.find(a => a.match_id === matchId);
    if (existing) {
      if (!existing.completed) {
        await supabase.from("tournament_judging_assignments").update({ judge_id: judgeId }).eq("id", existing.id);
      }
    } else {
      await supabase.from("tournament_judging_assignments").insert({ tournament_id: id, match_id: matchId, judge_id: judgeId, completed: false });
    }
    setActionLoading(false);
    await load();
  }

  async function startTournament() {
    setError(""); setActionLoading(true);
    if (!tournament) { setActionLoading(false); return; }
    if (matches.length > 0) { setError("Tournament has already been started."); setActionLoading(false); return; }

    let sorted: TournamentParticipant[];
    if (tournament.format === "private") {
      const seeds = participants.map(p => p.seed);
      const validSeeds = seeds.every(s => s != null && s >= 1 && s <= tournament.size) && new Set(seeds).size === participants.length;
      if (!validSeeds) { setError("Assign a unique seed to every player before starting."); setActionLoading(false); return; }
      sorted = [...participants].sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99));
    } else {
      sorted = [...participants].sort((a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime());
      for (let i = 0; i < sorted.length; i++) {
        await supabase.from("tournament_participants").update({ seed: i + 1 }).eq("tournament_id", id).eq("user_id", sorted[i].user_id);
      }
    }

    const p = sorted;
    const sz = tournament.size;
    const matchDefs = sz === 4
      ? [
          { round_number: 1, match_number: 1, player1_id: p[0].user_id, player2_id: p[3].user_id },
          { round_number: 1, match_number: 2, player1_id: p[1].user_id, player2_id: p[2].user_id },
          { round_number: 2, match_number: 1, player1_id: null, player2_id: null },
        ]
      : [
          { round_number: 1, match_number: 1, player1_id: p[0].user_id, player2_id: p[7].user_id },
          { round_number: 1, match_number: 2, player1_id: p[3].user_id, player2_id: p[4].user_id },
          { round_number: 1, match_number: 3, player1_id: p[1].user_id, player2_id: p[6].user_id },
          { round_number: 1, match_number: 4, player1_id: p[2].user_id, player2_id: p[5].user_id },
          { round_number: 2, match_number: 1, player1_id: null, player2_id: null },
          { round_number: 2, match_number: 2, player1_id: null, player2_id: null },
          { round_number: 3, match_number: 1, player1_id: null, player2_id: null },
        ];

    const { data: created, error: matchErr } = await supabase.from("tournament_matches").insert(matchDefs.map(m => ({ ...m, tournament_id: id, status: "pending" }))).select();
    if (matchErr || !created) { setError("Failed to create bracket."); setActionLoading(false); return; }

    const sm = [...created].sort((a, b) => a.round_number !== b.round_number ? a.round_number - b.round_number : a.match_number - b.match_number);
    const links = sz === 4
      ? [{ id: sm[0].id, nxt: sm[2].id }, { id: sm[1].id, nxt: sm[2].id }]
      : [
          { id: sm[0].id, nxt: sm[4].id }, { id: sm[1].id, nxt: sm[4].id },
          { id: sm[2].id, nxt: sm[5].id }, { id: sm[3].id, nxt: sm[5].id },
          { id: sm[4].id, nxt: sm[6].id }, { id: sm[5].id, nxt: sm[6].id },
        ];
    await Promise.all(links.map(l => supabase.from("tournament_matches").update({ next_match_id: l.nxt }).eq("id", l.id)));

    const round1 = sm.filter(m => m.round_number === 1);
    const topic = tournament.topic || "Tournament Match";
    const { data: rounds } = await supabase.from("rounds").insert(
      round1.map(m => ({ topic, pro_id: m.player1_id, con_id: m.player2_id, challenger_id: userId, challenger_pick: "pro", status: "active", current_speech: 1, is_ranked: false, con_goes_first: false }))
    ).select();
    if (!rounds) { setError("Failed to create rounds."); setActionLoading(false); return; }

    await Promise.all(round1.map((m, i) => supabase.from("tournament_matches").update({ round_id: rounds[i].id, status: "active" }).eq("id", m.id)));

    // Private tournaments leave judging to the creator, who assigns judges per match.
    if (tournament.format !== "private") {
      const judgeRows = sz === 4
        ? [
            { tournament_id: id, match_id: sm[0].id, judge_id: p[1].user_id, completed: false },
            { tournament_id: id, match_id: sm[1].id, judge_id: p[0].user_id, completed: false },
          ]
        : [
            { tournament_id: id, match_id: sm[0].id, judge_id: p[2].user_id, completed: false },
            { tournament_id: id, match_id: sm[1].id, judge_id: p[1].user_id, completed: false },
            { tournament_id: id, match_id: sm[2].id, judge_id: p[3].user_id, completed: false },
            { tournament_id: id, match_id: sm[3].id, judge_id: p[0].user_id, completed: false },
          ];

      await supabase.from("tournament_judging_assignments").insert(judgeRows);
    }
    await supabase.from("tournaments").update({ status: "active" }).eq("id", id);
    setActionLoading(false);
    await load();
  }

  async function syncTournament() {
    setActionLoading(true);

    const [{ data: fm0 }, { data: fa0 }] = await Promise.all([
      supabase.from("tournament_matches").select("*").eq("tournament_id", id).order("round_number").order("match_number"),
      supabase.from("tournament_judging_assignments").select("*").eq("tournament_id", id),
    ]);

    let fm = fm0 || [];
    let fa = fa0 || [];

    const roundIds = fm.filter(m => m.round_id).map(m => m.round_id as string);
    const { data: ballots } = roundIds.length > 0
      ? await supabase.from("ballots").select("round_id, judge_id, winner_id").in("round_id", roundIds)
      : { data: [] };
    const ab = ballots || [];

    if (roundIds.length > 0) {
      const { data: existingRounds } = await supabase.from("rounds").select("id").in("id", roundIds);
      const existingIds = new Set((existingRounds || []).map(r => r.id));

      for (const match of fm.filter(m => m.status === "active" && m.round_id && !existingIds.has(m.round_id))) {
        const { data: speechRows } = await supabase.from("speeches").select("speech_number, speaker_id").eq("round_id", match.round_id).order("speech_number", { ascending: true });
        const submitted = (speechRows || []).length;
        const lastSpeakerId = submitted > 0 ? speechRows![submitted - 1].speaker_id : null;
        const eliminatedId = lastSpeakerId === match.player1_id ? match.player2_id : match.player1_id;
        const advancingId  = lastSpeakerId;

        if (submitted === 0) {
          await supabase.from("tournament_matches").update({ status: "complete", winner_id: null }).eq("id", match.id);
          for (const uid of [match.player1_id, match.player2_id]) {
            if (uid) await supabase.from("tournament_participants").update({ status: "eliminated" }).eq("tournament_id", id).eq("user_id", uid);
          }
          const idx = fm.findIndex(m => m.id === match.id);
          if (idx !== -1) fm[idx] = { ...fm[idx], status: "complete", winner_id: null };
        } else {
          if (eliminatedId) await supabase.from("tournament_participants").update({ status: "eliminated" }).eq("tournament_id", id).eq("user_id", eliminatedId);
          await supabase.from("tournament_matches").update({ status: "complete", winner_id: advancingId }).eq("id", match.id);
          const idx = fm.findIndex(m => m.id === match.id);
          if (idx !== -1) fm[idx] = { ...fm[idx], status: "complete", winner_id: advancingId };
        }
      }
    }

    for (const match of fm.filter(m => m.status === "active" && m.round_id)) {
      const ballot = ab.find(b => b.round_id === match.round_id);
      if (!ballot) continue;
      await supabase.from("tournament_matches").update({ status: "complete", winner_id: ballot.winner_id }).eq("id", match.id);
      const loserId = ballot.winner_id === match.player1_id ? match.player2_id : match.player1_id;
      if (loserId) await supabase.from("tournament_participants").update({ status: "eliminated" }).eq("tournament_id", id).eq("user_id", loserId);
      const asgn = fa.find(a => a.match_id === match.id);
      if (asgn && !asgn.completed) {
        const judgedByAssigned = ab.some(b => b.round_id === match.round_id && b.judge_id === asgn.judge_id);
        if (judgedByAssigned) await supabase.from("tournament_judging_assignments").update({ completed: true }).eq("id", asgn.id);
      }
    }

    const [{ data: fm2 }, { data: fa2 }] = await Promise.all([
      supabase.from("tournament_matches").select("*").eq("tournament_id", id).order("round_number").order("match_number"),
      supabase.from("tournament_judging_assignments").select("*").eq("tournament_id", id),
    ]);
    fm = fm2 || [];
    fa = fa2 || [];

    for (const pending of fm.filter(m => m.status === "pending")) {
      const feeders = fm.filter(m => m.next_match_id === pending.id);
      if (feeders.length < 2 || !feeders.every(f => f.status === "complete")) continue;

      let p1Id: string | null = feeders[0].winner_id;
      let p2Id: string | null = feeders[1].winner_id;

      for (let fi = 0; fi < 2; fi++) {
        const feeder = feeders[fi];
        const wid = fi === 0 ? p1Id : p2Id;
        if (!wid) continue;
        const obligation = fa.find(a => {
          if (a.judge_id !== wid) return false;
          const m = fm.find(x => x.id === a.match_id);
          return m?.round_number === feeder.round_number;
        });
        if (obligation && !obligation.completed) {
          await supabase.from("tournament_participants").update({ status: "disqualified" }).eq("tournament_id", id).eq("user_id", wid);
          if (fi === 0) p1Id = null; else p2Id = null;
        }
      }

      if (!p1Id && p2Id) { await supabase.from("tournament_matches").update({ player1_id: p2Id, player2_id: null, winner_id: p2Id, status: "complete" }).eq("id", pending.id); continue; }
      if (p1Id && !p2Id) { await supabase.from("tournament_matches").update({ player1_id: p1Id, player2_id: null, winner_id: p1Id, status: "complete" }).eq("id", pending.id); continue; }
      if (!p1Id && !p2Id) continue;

      const topic = tournament?.topic || `Tournament Match — Round ${pending.round_number}`;
      const { data: newRound } = await supabase.from("rounds").insert({ topic, pro_id: p1Id, con_id: p2Id, challenger_id: userId, challenger_pick: "pro", status: "active", current_speech: 1, is_ranked: false, con_goes_first: false }).select().single();
      if (!newRound) continue;

      await supabase.from("tournament_matches").update({ player1_id: p1Id, player2_id: p2Id, round_id: newRound.id, status: "active" }).eq("id", pending.id);

      // Open tournaments auto-assign the least-loaded judge; private ones wait for the creator.
      if (tournament?.format !== "private") {
        const eligible = participants
          .filter(p => p.user_id !== p1Id && p.user_id !== p2Id)
          .map(p => ({ uid: p.user_id, load: fa.filter(a => a.judge_id === p.user_id).length }))
          .sort((a, b) => a.load - b.load);
        const judgeId = eligible[0]?.uid ?? null;
        if (judgeId) await supabase.from("tournament_judging_assignments").insert({ tournament_id: id, match_id: pending.id, judge_id: judgeId, completed: false });
      }
    }

    const { data: finalMatch } = await supabase.from("tournament_matches").select("*").eq("tournament_id", id).order("round_number", { ascending: false }).limit(1).single();
    if (finalMatch?.status === "complete" && finalMatch.winner_id) {
      await supabase.from("tournaments").update({ status: "complete", winner_id: finalMatch.winner_id }).eq("id", id);
      await supabase.from("tournament_participants").update({ status: "winner" }).eq("tournament_id", id).eq("user_id", finalMatch.winner_id);
    }

    setActionLoading(false);
    await load();
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "calc(100dvh - 44px)" }}>
      <div className="db-card" style={{ padding: "28px 40px", textAlign: "center" }}>
        <div className="gh-loading-dots"><span /><span /><span /></div>
      </div>
    </div>
  );

  if (!tournament) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "calc(100dvh - 44px)" }}>
      <p style={{ fontSize: 14, color: "rgba(255,255,255,0.50)" }}>Tournament not found.</p>
    </div>
  );

  const isCreator     = tournament.created_by === userId;
  const isParticipant = participants.some(p => p.user_id === userId);
  const isFull        = participants.length >= tournament.size;
  const isPrivate     = tournament.format === "private";
  const seedsValid    = isFull
    && participants.every(p => p.seed != null && p.seed >= 1 && p.seed <= tournament.size)
    && new Set(participants.map(p => p.seed)).size === participants.length;
  const canStart      = isCreator && tournament.status === "registration" && isFull && (!isPrivate || seedsValid);
  const myStatus      = participants.find(p => p.user_id === userId)?.status;
  const myAssignments = assignments
    .filter(a => a.judge_id === userId)
    .map(a => ({ assignment: a, match: matches.find(m => m.id === a.match_id) ?? null }))
    .filter(x => x.match !== null);
  const myActiveMatch = matches.find(m => (m.player1_id === userId || m.player2_id === userId) && m.status === "active");
  const winner = tournament.winner_id ? participants.find(p => p.user_id === tournament.winner_id) : null;

  // Resolves any user on this page — participants, or the creator when they organize without playing.
  const profileFor = (uid: string | null): Profile | null => {
    if (!uid) return null;
    return participants.find(p => p.user_id === uid)?.user ?? (creatorProfile?.id === uid ? creatorProfile : null);
  };

  const statusColor = { registration: "var(--accent)", active: "#fff", complete: "rgba(255,255,255,0.40)" }[tournament.status];
  const statusLabel = { registration: "Open", active: "Live", complete: "Complete" }[tournament.status];

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 clamp(24px, 5vw, 48px) 100px" }}>
      <style>{`.db-shell { background-image: url("/4.png") !important; }`}</style>

      {/* Back + status */}
      <div style={{ paddingTop: "clamp(20px, 4vh, 36px)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={() => router.push("/tournaments")} style={backBtn}>← Tournaments</button>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: statusColor }}>
          {statusLabel}
        </span>
      </div>

      {/* Hero */}
      <section style={{ paddingTop: "clamp(16px, 3vh, 28px)" }}>
        <h1 className="ab-hero-line" style={{ '--i': '0', fontFamily: "var(--font-display)", fontSize: "clamp(36px, 7vw, 72px)", fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", margin: "0 0 10px", lineHeight: 0.95, textShadow: "0 2px 20px rgba(0,0,0,0.45), 0 8px 40px rgba(0,0,0,0.22)", textWrap: "balance" } as CSSProperties}>
          {tournament.name}
        </h1>
        {tournament.topic && (
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", margin: "0 0 8px", textShadow: "0 1px 5px rgba(0,0,0,0.35)" }}>{tournament.topic}</p>
        )}
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(255,255,255,0.35)", letterSpacing: "0.06em", margin: 0 }}>
          {tournament.size}-person bracket · {participants.length}/{tournament.size} registered{isPrivate && " · Private"}
        </p>

        {isPrivate && tournament.join_code && tournament.status === "registration" && (
          <div style={{ marginTop: 18, display: "inline-flex", alignItems: "center", gap: 14, padding: "10px 16px", background: "rgba(255,255,255,0.06)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 8 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,200,80,0.85)" }}>Join code</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, letterSpacing: "0.22em", color: "#fff", textShadow: "0 1px 6px rgba(0,0,0,0.35)" }}>
              {tournament.join_code}
            </span>
            <button onClick={copyJoinCode} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: codeCopied ? "var(--accent)" : "rgba(255,255,255,0.50)", padding: 0 }}>
              {codeCopied ? "Copied ✓" : "Copy"}
            </button>
          </div>
        )}

        {tournament.status === "complete" && winner && (
          <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 28, lineHeight: 1 }}>🏆</span>
            <div>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--accent)", margin: "0 0 4px" }}>Champion</p>
              <p style={{ fontFamily: "var(--font-display)", fontSize: "clamp(20px, 3.5vw, 32px)", fontWeight: 700, color: "#fff", margin: 0, textShadow: "0 2px 14px rgba(0,0,0,0.40)" }}>
                {winner.user.display_name || winner.user.username}
              </p>
            </div>
          </div>
        )}
      </section>

      {error && (
        <p style={{ fontSize: 13, color: "oklch(0.70 0.20 28)", margin: "16px 0 0", textShadow: "0 1px 4px rgba(0,0,0,0.40)" }}>⚑ {error}</p>
      )}

      <div style={rule}><div style={ruleDot} /><div style={ruleLine} /></div>

      {/* ── Registration ───────────────────────────────────────────────────── */}
      {tournament.status === "registration" && (
        <>
          <section>
            <p style={eyebrow}>Participants — {participants.length}/{tournament.size}</p>

            {participants.length === 0 && (
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.40)", textShadow: "0 1px 5px rgba(0,0,0,0.35)" }}>No one has joined yet.</p>
            )}

            {participants.map(ptcp => (
              <div key={ptcp.user_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.08)", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 15, fontWeight: ptcp.user_id === userId ? 600 : 400, color: "#fff", textShadow: "0 1px 6px rgba(0,0,0,0.35)" }}>
                    {ptcp.user.display_name || ptcp.user.username}
                  </span>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", marginLeft: 8 }}>@{ptcp.user.username}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
                  {isPrivate && (isCreator ? (
                    <select
                      value={ptcp.seed ?? ""}
                      disabled={actionLoading}
                      onChange={e => assignSeed(ptcp.user_id, Number(e.target.value))}
                      style={darkSelect}
                    >
                      <option value="" disabled>Seed</option>
                      {Array.from({ length: tournament.size }, (_, si) => si + 1).map(s => (
                        <option key={s} value={s}>#{s}</option>
                      ))}
                    </select>
                  ) : ptcp.seed != null ? (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(255,200,80,0.85)" }}>#{ptcp.seed}</span>
                  ) : null)}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(255,255,255,0.38)" }}>
                    {ptcp.user.elo}
                  </span>
                </div>
              </div>
            ))}

            {isPrivate && isCreator && participants.length > 0 && (
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", marginTop: 14 }}>
                Assign a unique seed (1–{tournament.size}) to each player. Seed 1 meets the lowest seed in round one.
              </p>
            )}
          </section>

          <div style={{ display: "flex", gap: 12, marginTop: "clamp(28px, 5vh, 44px)", flexWrap: "wrap" }}>
            {!isParticipant && !isFull && (
              <button onClick={handleJoin} disabled={actionLoading} className="db-btn db-btn--accent db-btn--lg" style={{ flex: 1 }}>
                {actionLoading ? "Joining…" : "Join tournament"}
              </button>
            )}
            {isParticipant && (!isCreator || isPrivate) && (
              <button onClick={handleLeave} disabled={actionLoading} className="db-btn db-btn--glass" style={{ height: 46, padding: "0 24px", border: "1px solid rgba(200,60,60,0.35)", color: "rgba(255,160,160,0.85)", background: "rgba(200,60,60,0.08)" }}>
                {actionLoading ? "Leaving…" : "Leave"}
              </button>
            )}
            {isFull && !isParticipant && (
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)", margin: 0, alignSelf: "center" }}>Bracket is full.</p>
            )}
            {canStart && (
              <button onClick={startTournament} disabled={actionLoading} className="db-btn db-btn--accent db-btn--lg" style={{ flex: 1 }}>
                {actionLoading ? "Starting…" : "Start tournament →"}
              </button>
            )}
          </div>

          {!isFull && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", marginTop: 16 }}>
              Waiting for {tournament.size - participants.length} more player{tournament.size - participants.length !== 1 ? "s" : ""}.
              {isPrivate && " Share the join code so players can find this tournament."}
            </p>
          )}

          {isCreator && isPrivate && isFull && !seedsValid && (
            <p style={{ fontSize: 12, color: "rgba(255,200,80,0.85)", marginTop: 16 }}>
              Assign a unique seed to every player to unlock the start button.
            </p>
          )}
        </>
      )}

      {/* ── Active / complete ──────────────────────────────────────────────── */}
      {(tournament.status === "active" || tournament.status === "complete") && (
        <>
          {/* Bracket */}
          <section>
            <p style={eyebrow}>Bracket</p>
            <Bracket matches={matches} participants={participants} userId={userId} size={tournament.size} />
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(255,255,255,0.28)", marginTop: 12, letterSpacing: "0.04em" }}>
              Click any match to view the round.
            </p>
          </section>

          <div style={rule}><div style={{ ...ruleDot, background: "rgba(255,255,255,0.20)" }} /><div style={ruleLine} /></div>

          {/* Judge assignment — private creator only */}
          {isPrivate && isCreator && tournament.status === "active" && (
            <section style={{ marginBottom: "clamp(28px, 5vh, 44px)" }}>
              <p style={eyebrow}>Assign judges</p>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: "0 0 16px", textShadow: "0 1px 5px rgba(0,0,0,0.35)" }}>
                Pick a judge for each live match — including yourself, if you&apos;re not debating in it. New matches appear here as the bracket advances.
              </p>
              {matches.filter(m => m.status === "active" && m.round_id).length === 0 && (
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)" }}>No live matches right now.</p>
              )}
              {matches.filter(m => m.status === "active" && m.round_id).map(match => {
                const asgn = assignments.find(a => a.match_id === match.id);
                const mp1 = profileFor(match.player1_id);
                const mp2 = profileFor(match.player2_id);
                const eligible = [
                  ...participants.map(p => p.user),
                  ...(creatorProfile && !participants.some(p => p.user_id === creatorProfile.id) ? [creatorProfile] : []),
                ].filter(prof => prof.id !== match.player1_id && prof.id !== match.player2_id);
                return (
                  <div key={match.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.08)", gap: 16 }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 500, color: "#fff", textShadow: "0 1px 6px rgba(0,0,0,0.35)" }}>
                        {mp1?.display_name || mp1?.username || "TBD"} vs {mp2?.display_name || mp2?.username || "TBD"}
                      </p>
                      <p style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.04em" }}>
                        Round {match.round_number}, Match {match.match_number}
                      </p>
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      {asgn?.completed ? (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)", letterSpacing: "0.06em" }}>
                          ✓ {profileFor(asgn.judge_id)?.display_name || profileFor(asgn.judge_id)?.username || "Judged"}
                        </span>
                      ) : (
                        <select
                          value={asgn?.judge_id ?? ""}
                          disabled={actionLoading}
                          onChange={e => assignJudge(match.id, e.target.value)}
                          style={darkSelect}
                        >
                          <option value="" disabled>Assign judge…</option>
                          {eligible.map(j => (
                            <option key={j.id} value={j.id}>
                              {(j.display_name || j.username) + (j.id === userId ? " (you)" : "")}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {/* My current match */}
          {myActiveMatch && (
            <section style={{ marginBottom: "clamp(28px, 5vh, 44px)" }}>
              <p style={eyebrow}>My current match</p>
              {myActiveMatch.round_id ? (
                <Link href={`/round/${myActiveMatch.round_id}`} style={{ textDecoration: "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <p style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 600, color: "#fff", textShadow: "0 1px 8px rgba(0,0,0,0.38)" }}>
                        vs {participants.find(p => p.user_id === (myActiveMatch.player1_id === userId ? myActiveMatch.player2_id : myActiveMatch.player1_id))?.user.display_name || "Opponent"}
                      </p>
                      <p style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(255,255,255,0.38)", letterSpacing: "0.04em" }}>
                        Round {myActiveMatch.round_number}
                        {myActiveMatch.round_number === 1 && tournament.size === 4 && " · Semifinal"}
                        {myActiveMatch.round_number === 1 && tournament.size === 8 && " · Quarterfinal"}
                        {myActiveMatch.round_number === 2 && tournament.size === 8 && " · Semifinal"}
                        {myActiveMatch.round_number === tournament.size / 2 && " · Final"}
                      </p>
                    </div>
                    <span style={{ fontSize: 13, color: "var(--accent)" }}>View round →</span>
                  </div>
                </Link>
              ) : (
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)" }}>
                  Round not yet created — check back after the bracket advances.
                </p>
              )}
            </section>
          )}

          {/* Judging obligations */}
          {myAssignments.length > 0 && (
            <section style={{ marginBottom: "clamp(28px, 5vh, 44px)" }}>
              <p style={eyebrow}>My judging obligations</p>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: "0 0 16px", textShadow: "0 1px 5px rgba(0,0,0,0.35)" }}>
                Missing an obligation results in disqualification when the bracket advances.
              </p>
              {myAssignments.map(({ assignment, match }) => {
                if (!match) return null;
                const mp1 = participants.find(p => p.user_id === match.player1_id);
                const mp2 = participants.find(p => p.user_id === match.player2_id);
                const done = assignment.completed;
                return (
                  <div key={assignment.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.08)", gap: 16 }}>
                    <div>
                      <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 500, color: "#fff", textShadow: "0 1px 6px rgba(0,0,0,0.35)" }}>
                        {mp1?.user.display_name || "TBD"} vs {mp2?.user.display_name || "TBD"}
                      </p>
                      <p style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.04em" }}>
                        Round {match.round_number}, Match {match.match_number}
                      </p>
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      {done ? (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)", letterSpacing: "0.06em" }}>✓ Done</span>
                      ) : match.round_id ? (
                        <Link href={`/judge/${match.round_id}`} style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(255,200,80,0.90)", textDecoration: "none", letterSpacing: "0.04em" }}>
                          Judge →
                        </Link>
                      ) : (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(255,255,255,0.30)" }}>Awaiting</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {/* Standings */}
          <section>
            <p style={eyebrow}>Standings</p>
            {[...participants].sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99)).map(ptcp => {
              const statusCol =
                ptcp.status === "winner"       ? "var(--accent)"            :
                ptcp.status === "active"        ? "rgba(255,255,255,0.50)"   :
                ptcp.status === "disqualified" ? "rgba(255,80,80,0.70)"     : "rgba(255,255,255,0.28)";
              return (
                <div key={ptcp.user_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {ptcp.seed != null && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(255,255,255,0.28)", width: 22, letterSpacing: "0.04em" }}>
                        #{ptcp.seed}
                      </span>
                    )}
                    <span style={{ fontSize: 15, fontWeight: ptcp.user_id === userId ? 600 : 400, color: ptcp.status === "disqualified" ? "rgba(255,255,255,0.30)" : "#fff", textDecoration: ptcp.status === "disqualified" ? "line-through" : undefined, textShadow: "0 1px 6px rgba(0,0,0,0.35)" }}>
                      {ptcp.user.display_name || ptcp.user.username}
                    </span>
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.10em", color: statusCol }}>
                    {ptcp.status === "winner" ? "Champion" : ptcp.status}
                  </span>
                </div>
              );
            })}
          </section>

          {/* Sync — creator only */}
          {isCreator && tournament.status === "active" && (
            <div style={{ marginTop: "clamp(32px, 6vh, 52px)" }}>
              <button onClick={syncTournament} disabled={actionLoading} className="db-btn db-btn--accent db-btn--block db-btn--lg">
                {actionLoading ? "Syncing…" : "Sync results →"}
              </button>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", marginTop: 10, textAlign: "center" }}>
                Checks completed rounds, advances the bracket, and enforces judging obligations.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const backBtn: CSSProperties = { background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: 13, color: "rgba(255,255,255,0.65)", padding: "8px 0", textShadow: "0 1px 4px rgba(0,0,0,0.35)" };
const eyebrow: CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--accent)", margin: "0 0 16px", textShadow: "0 1px 4px rgba(0,0,0,0.30)" };
const darkSelect: CSSProperties = { background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 6, color: "#fff", fontFamily: "var(--font-mono)", fontSize: 12, padding: "6px 10px", cursor: "pointer", colorScheme: "dark" };
const rule: CSSProperties = { display: "flex", alignItems: "center", gap: 12, margin: "clamp(28px, 5vh, 44px) 0" };
const ruleDot: CSSProperties = { width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 };
const ruleLine: CSSProperties = { flex: 1, height: 1, background: "rgba(255,255,255,0.15)" };
