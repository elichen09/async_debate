// Parses app/rounds.csv — an archive of recorded public-forum rounds — into
// typed records for the "The Past" galaxy. The CSV has no header; each row is:
//   teamA, "vs", teamB, tournament(+year), stage, youtube url, topic
// Blank separator rows and the odd note row (no video link) are dropped.

export type PastRound = {
  id: string;
  teamA: string;
  teamB: string;
  tournament: string; // raw, e.g. "Silver TOC 2021"
  event: string; // name without the year, e.g. "Silver TOC"
  year: number | null;
  stage: string; // e.g. "Finals", "R5", "Demo"
  stageRank: number; // higher = deeper elim, for sorting
  topic: string; // resolution shorthand, "—" when blank
  url: string; // original link (may be a redirect)
  videoId: string;
  thumb: string; // youtube thumbnail
};

// Quote-aware split so the one note row with commas inside quotes can't shift
// columns. (That row has no video id and gets dropped anyway.)
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else if (c === '"') {
      inQ = true;
    } else cur += c;
  }
  out.push(cur);
  return out;
}

// Pull a YouTube id out of plain, shortened, or URL-encoded redirect links.
function youTubeId(raw: string): string | null {
  if (!raw) return null;
  const find = (s: string): string | null => {
    let m = s.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
    if (m) return m[1];
    m = s.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
    if (m) return m[1];
    m = s.match(/\/embed\/([A-Za-z0-9_-]{6,})/);
    if (m) return m[1];
    return null;
  };
  let id = find(raw);
  if (id) return id;
  try {
    id = find(decodeURIComponent(raw)); // unwraps yahoo-style %3d%2f redirects
    if (id) return id;
  } catch {
    /* malformed escapes — fall through */
  }
  const enc = raw.match(/v%3[dD]([A-Za-z0-9_-]{6,})/);
  return enc ? enc[1] : null;
}

function parseEvent(tournament: string): { year: number | null; event: string } {
  let m = tournament.match(/\b(20\d{2})\b/);
  if (m) {
    return {
      year: parseInt(m[1], 10),
      event: tournament.replace(/\s*\b20\d{2}\b\s*/, " ").trim(),
    };
  }
  m = tournament.match(/'(\d{2})\b/);
  if (m) {
    return {
      year: 2000 + parseInt(m[1], 10),
      event: tournament.replace(/\s*'?\d{2}\b\s*/, " ").trim(),
    };
  }
  return { year: null, event: tournament };
}

function stageRank(stageRaw: string): number {
  const s = stageRaw.toLowerCase();
  if (/final/.test(s)) return 100;
  if (/semi/.test(s)) return 90;
  if (/quarter/.test(s)) return 80;
  if (/octo/.test(s)) return 70;
  if (/double|dubs/.test(s)) return 60;
  if (/triple|trips/.test(s)) return 50;
  if (/runoff/.test(s)) return 45;
  if (/demo/.test(s)) return 5;
  const r = s.match(/r\s*(\d+)/); // prelim rounds R1–R16
  if (r) return 20 + Math.min(19, parseInt(r[1], 10));
  return s ? 25 : 1;
}

export function parseRounds(csv: string): PastRound[] {
  const rounds: PastRound[] = [];
  let idx = 0;
  for (const line of csv.split(/\r?\n/)) {
    if (!line.trim() || /^,+$/.test(line.trim())) continue;
    const f = splitCsvLine(line).map((s) => s.trim());
    const videoId = youTubeId(f[5] ?? "");
    if (!videoId) continue; // drops blanks + the "made private" note row
    const { year, event } = parseEvent(f[3] ?? "");
    const stage = f[4] ?? "";
    rounds.push({
      id: `r${idx++}-${videoId}`,
      teamA: f[0] ?? "",
      teamB: f[2] ?? "",
      tournament: f[3] ?? "",
      event,
      year,
      stage,
      stageRank: stageRank(stage),
      topic: (f[6] ?? "").trim() || "—",
      url: f[5] ?? "",
      videoId,
      thumb: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
    });
  }
  return rounds;
}
