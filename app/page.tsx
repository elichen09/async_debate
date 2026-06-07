import Link from "next/link";
import React from "react";

const STEPS = [
  {
    n: "1",
    t: "Challenge anyone",
    d: "Search for a debater, pick your side, send the resolution. Skip the calendar entirely.",
    accent: true,
  },
  {
    n: "2",
    t: "Speak on your clock",
    d: "Record and upload each speech whenever it suits you. The round moves at your pace.",
  },
  {
    n: "3",
    t: "Get judged, climb",
    d: "A real judge writes a full ballot. Win your round and your ELO climbs.",
  },
];

const ROUNDS_VISUAL = [
  {
    slot: "a",
    num: "Round #247",
    live: true,
    resolution:
      "Developed nations have an obligation to fund green energy transitions in the Global South.",
    pro: { name: "Sarah Chen", elo: "1,842" },
    con: { name: "Marcus Webb", elo: "1,791" },
    speech: "3 of 8",
    time: "4:32",
    fillPct: 37.5,
  },
  {
    slot: "b",
    num: "Round #251",
    live: false,
    status: "Awaiting",
    resolution:
      "The US federal government should adopt ranked-choice voting.",
    pro: { name: "Priya Nair", elo: "1,756" },
    con: { name: "Jordan Lee", elo: "1,803" },
    speech: "6 of 8",
    time: "1:48",
    fillPct: 75,
  },
  {
    slot: "c",
    num: "Round #238",
    live: false,
    status: "Judged",
    resolution:
      "Economic sanctions are an effective tool of foreign policy.",
    pro: { name: "Alex Kim", elo: "1,680" },
    con: { name: "Chris Rivera", elo: "1,722" },
    speech: "8 of 8",
    time: "0:00",
    fillPct: 100,
  },
] as const;

function RoundCard({ r }: { r: (typeof ROUNDS_VISUAL)[number] }) {
  return (
    <div className="db-round-card">
      <div className="db-round-card__header">
        <span className="db-round-card__num">{r.num}</span>
        <span className="db-round-card__live">
          {r.live ? (
            <>
              <span className="db-round-card__dot" />
              Live
            </>
          ) : (
            <span className="db-round-card__status">{r.status}</span>
          )}
        </span>
      </div>
      <div className="db-round-card__resolution">
        <p className="db-round-card__res-label">Resolution</p>
        <p className="db-round-card__res-text">{r.resolution}</p>
      </div>
      <div className="db-round-card__sides">
        <div className="db-round-card__side db-round-card__side--pro">
          <span className="db-round-card__side-label">Pro</span>
          <span className="db-round-card__side-name">{r.pro.name}</span>
          <span className="db-round-card__side-elo">{r.pro.elo}</span>
        </div>
        <div className="db-round-card__side db-round-card__side--con">
          <span className="db-round-card__side-label">Con</span>
          <span className="db-round-card__side-name">{r.con.name}</span>
          <span className="db-round-card__side-elo">{r.con.elo}</span>
        </div>
      </div>
      <div className="db-round-card__footer">
        <div className="db-round-card__progress-meta">
          <span className="db-round-card__progress-label">
            Speech {r.speech}
          </span>
          <span className="db-round-card__progress-time">{r.time}</span>
        </div>
        <div className="db-round-card__track">
          <div
            className="db-round-card__fill"
            style={{ "--fill": `${r.fillPct}%` } as React.CSSProperties}
          />
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="db-home">

      {/* Attention — hero */}
      <section className="db-home__hero">

        <div className="db-home__hero-text db-rise">
          <p className="db-home__eyebrow">Public Forum · Async</p>
          <h1 className="db-home__title">
            Debate<br />
            <span className="db-home__title-em">anyone</span>,<br />
            anytime.
          </h1>
          <p className="db-home__lede">
            Real rounds without the scheduling headache. Send a challenge,
            record your speeches whenever you have a free minute, and let the
            ladder show who is sharpest.
          </p>
          <div className="db-home__cta">
            <Link href="/signup" className="db-btn db-btn--accent db-btn--lg">
              Start debating
              <span className="db-btn__arrow" aria-hidden="true">→</span>
            </Link>
            <Link href="/login" className="db-btn db-btn--ghost">
              Sign in
            </Link>
          </div>
        </div>

        <div
          className="db-home__hero-visual db-rise"
          style={{ animationDelay: "0.28s" }}
          aria-hidden="true"
        >
          <div className="db-round-cards">
            {ROUNDS_VISUAL.map((r) => (
              <div key={r.slot} className={`db-round-card-slot db-round-card-slot--${r.slot}`}>
                <RoundCard r={r} />
              </div>
            ))}
          </div>
        </div>

      </section>

      {/* Interest — how it works */}
      <section className="db-home__steps-wrap" aria-label="How it works">
        <div className="db-home__steps-header db-scroll-reveal">
          <h2 className="db-home__steps-title">How it works</h2>
          <p className="db-home__steps-sub">Three steps, zero scheduling</p>
        </div>
        <div className="db-home__steps">
          {STEPS.map((s) => (
            <div
              key={s.t}
              className={`db-home__step db-scroll-reveal${s.accent ? " db-home__step--accent" : ""}`}
            >
              <span className="db-home__step-num" aria-hidden="true">{s.n}</span>
              <h3 className="db-home__step-t">{s.t}</h3>
              <p className="db-home__step-d">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Action — CTA banner */}
      <section className="db-home__action db-scroll-reveal" aria-label="Get started">
        <p className="db-home__action-eyebrow">Ready to argue?</p>
        <h2 className="db-home__action-heading">Your first round is waiting.</h2>
        <Link href="/signup" className="db-btn db-btn--accent db-btn--lg">
          Start debating
          <span className="db-btn__arrow" aria-hidden="true">→</span>
        </Link>
      </section>

    </div>
  );
}
