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
    <div className="ad-container ad-page ad-home">
      <section className="ad-home__hero ad-rise">
        <p className="ad-eyebrow">Public Forum · Asynchronous</p>
        <h1 className="ad-home__title">
          Debate anyone,
          <br />
          <span className="ad-home__title-em">anywhere</span>, anytime.
        </h1>
        <p className="ad-home__lede">
          Real rounds without the scheduling headache. Send a challenge, record your
          speeches whenever you have a free minute, and let the ladder show who is sharpest.
        </p>
        <div className="ad-home__cta">
          <Link href="/signup" className="ad-btn ad-btn--accent">
            Start debating
          </Link>
          <Link href="/login" className="ad-btn ad-btn--ghost">
            Sign in
          </Link>
        </div>
      </section>

      <section className="ad-home__steps">
        {STEPS.map((s, i) => (
          <div
            key={s.n}
            className="ad-card ad-home__step ad-rise"
            style={{ animationDelay: `${0.08 * (i + 1)}s` }}
          >
            <span className="ad-home__step-n">{s.n}</span>
            <h3 className="ad-home__step-t">{s.t}</h3>
            <p className="ad-home__step-d">{s.d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
