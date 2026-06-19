// Lightweight fuzzy matcher for the "/trigger" autocomplete. Tolerates typos (a
// small edit distance scaled to the query length), plus prefix / substring /
// subsequence matches, and ranks the best candidates first. Matches against both
// a block's trigger and its label. Used by the flow outline and the speech editor.

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  const curr = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr.slice();
  }
  return prev[n];
}

function isSubsequence(q: string, t: string): boolean {
  let i = 0;
  for (let j = 0; j < t.length && i < q.length; j++) if (t[j] === q[i]) i++;
  return i === q.length;
}

// Higher score = better match; null = no match.
export function fuzzyScore(query: string, target: string): number | null {
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase();
  if (!q) return 1;
  if (t.startsWith(q)) return 1000 - t.length;                  // best: prefix
  const idx = t.indexOf(q);
  if (idx >= 0) return 800 - idx - t.length * 0.1;              // substring
  if (isSubsequence(q, t)) return 600 - t.length;              // chars in order
  const tol = Math.max(1, Math.floor(q.length / 3));            // typo budget
  const d = levenshtein(q, t);
  if (d <= tol) return 400 - d * 60;                           // close to whole target
  if (t.length > q.length) {                                   // typo vs a prefix of a longer target
    const dp = levenshtein(q, t.slice(0, q.length));
    if (dp <= tol) return 380 - dp * 60;
  }
  return null;
}

export interface FuzzyOption { trigger: string; label: string }

// Rank options by the best fuzzy match of the query against trigger OR label.
export function fuzzyRank<T extends FuzzyOption>(query: string, options: T[]): T[] {
  return options
    .map((o) => {
      const st = fuzzyScore(query, o.trigger);
      const sl = fuzzyScore(query, o.label);
      const s = st === null && sl === null ? null : Math.max(st ?? -Infinity, sl ?? -Infinity);
      return { o, s };
    })
    .filter((x): x is { o: T; s: number } => x.s !== null)
    .sort((a, b) => b.s - a.s || a.o.trigger.localeCompare(b.o.trigger))
    .map((x) => x.o);
}
