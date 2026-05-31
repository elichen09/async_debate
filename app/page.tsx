import Link from "next/link";

const STEPS = [
  {
    n: "01",
    t: "Challenge anyone",
    d: "Search for a debater, pick your side, send the resolution. Skip the calendar entirely.",
  },
  {
    n: "02",
    t: "Speak on your clock",
    d: "Record and upload each speech whenever it suits you. The round moves at your pace.",
  },
  {
    n: "03",
    t: "Get judged, climb",
    d: "A real judge writes a full ballot. Win your round and your ELO climbs.",
  },
];

export default function Home() {
  return (
    <div className="db-container db-page db-home">
      <section className="db-home__hero db-rise">
        <p className="db-eyebrow">Public Forum · Asynchronous</p>
        <h1 className="db-home__title">
          Debate anyone,
          <br />
          <span className="db-home__title-em">anywhere</span>, anytime.
        </h1>
        <p className="db-home__lede">
          Real rounds without the scheduling headache. Send a challenge, record your
          speeches whenever you have a free minute, and let the ladder show who is sharpest.
        </p>
        <div className="db-home__cta">
          <Link href="/signup" className="db-btn db-btn--accent">
            Start debating
          </Link>
          <Link href="/login" className="db-btn db-btn--ghost">
            Sign in
          </Link>
        </div>
      </section>

      <section className="db-home__steps">
        {STEPS.map((s, i) => (
          <div
            key={s.n}
            className="db-card db-home__step db-rise"
            style={{ animationDelay: `${0.08 * (i + 1)}s` }}
          >
            <span className="db-home__step-n">{s.n}</span>
            <h3 className="db-home__step-t">{s.t}</h3>
            <p className="db-home__step-d">{s.d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}