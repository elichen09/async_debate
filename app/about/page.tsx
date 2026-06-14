import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import InfiniteGallery from "@/app/components/InfiniteGallery";
import ForceDarkScene from "@/app/components/ForceDarkScene";

export const metadata: Metadata = {
  title: "About — debate.fish",
  description:
    "debate.fish was built by Gary and Eli, competitive debaters from Lincoln-Sudbury who wanted to make getting better at debate easier. Chess.com, but for debate.",
};

const RECORD = [
  { tag: "Tournament of Champions", value: "Top 10" },
  { tag: "National Rankings", value: "Peak #1" },
  { tag: "Stanford Invitational", value: "Champions" },
  { tag: "Yale Invitational", value: "Finalists" },
];

const GP = "/grasshopper-photos";

/* Every about-page photo flows through the 3D gallery centerpiece. */
const GALLERY = [
  { src: `${GP}/PXL_20260328_222107788.jpg`, alt: "Gary and Eli at a tournament" },
  { src: `${GP}/PXL_20260328_222107477.jpg`, alt: "Tournament moments" },
  { src: `${GP}/PXL_20251019_173053599.jpg`, alt: "Debate tournament" },
  { src: `${GP}/PXL_20251017_194450361.jpg`, alt: "Team photo at a tournament" },
  { src: `${GP}/IMG_9621.jpeg`, alt: "Tournament action" },
  { src: `${GP}/IMG_8861.JPG`, alt: "Debate rounds" },
  { src: `${GP}/IMG_8860.JPG`, alt: "On the circuit" },
  { src: `${GP}/IMG_4706.jpeg`, alt: "With the team" },
  { src: `${GP}/IMG_0127.PNG`, alt: "The debate.fish team" },
  { src: `${GP}/PXL_20251018_170055704.jpg`, alt: "Between rounds" },
];

const CONTENT_BG = "#0a0d0b";

export default function AboutPage() {
  return (
    <>
      <ForceDarkScene />
      <style>{`
        .db-shell { background-image: url("/fish/fish2.png") !important; }
        .db-main { padding-top: 0 !important; }

        /* ── Full-bleed gallery: the centerpiece, no box ─────────────── */
        /* Tall track + sticky viewport = the gallery pins while you scroll the
           photos by, then releases into the content below. */
        .gh-hero3d { position: relative; width: 100%; height: 300vh; }
        .gh-hero3d__sticky { position: sticky; top: 0; height: 100vh; overflow: hidden; }
        .gh-hero3d__canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
        .gh-hero3d__canvas canvas { display: block; touch-action: pan-y; }
        .gh-hero3d, .gh-hero3d__canvas { touch-action: pan-y; }
        /* Melt the bottom of the gallery into the content band below it */
        .gh-hero3d__sticky::after { content: ""; position: absolute; left: 0; right: 0; bottom: -1px; height: 240px; background: linear-gradient(180deg, rgba(10,13,11,0) 0%, ${CONTENT_BG} 92%); pointer-events: none; z-index: 1; }

        .gh-hero3d__bar { position: absolute; top: 0; left: 0; right: 0; z-index: 2; display: flex; align-items: center; justify-content: space-between; padding: clamp(16px, 3vh, 26px) clamp(20px, 5vw, 56px); }
        .gh-hero3d__back { display: inline-flex; align-items: center; gap: 6px; font-family: var(--font-body); font-size: 13px; color: rgba(255,255,255,0.85); text-decoration: none; padding: 8px 14px; border-radius: 999px; background: rgba(8,11,9,0.55); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.12); transition: background .15s ease; }
        .gh-hero3d__back:hover { background: rgba(8,11,9,0.8); }
        .gh-hero3d__tag { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(255,255,255,0.6); }
        .gh-hero3d__hint { position: absolute; left: 0; right: 0; bottom: 26px; z-index: 2; text-align: center; font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: rgba(255,255,255,0.6); pointer-events: none; }
        @media (max-width: 640px) { .gh-hero3d { height: 240vh; } }

        /* ── Content band: solid dark so text is always legible ──────── */
        .gh-content { position: relative; z-index: 1; background: ${CONTENT_BG}; }
        .gh-about { max-width: 1000px; margin: 0 auto; padding: clamp(8px, 2vh, 24px) clamp(22px, 5vw, 64px) 120px; color: #fff; }

        .gh-about__eyebrow { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent); margin: 0 0 18px; }

        .gh-about__names { font-family: var(--font-display); font-weight: 800; font-size: clamp(56px, 11vw, 132px); line-height: 0.9; letter-spacing: -0.03em; margin: 0; color: #fff; }
        .gh-about__names em { font-style: italic; color: var(--accent); }
        .gh-about__sub { font-family: var(--font-body); font-size: clamp(16px, 2.2vw, 21px); color: rgba(255,255,255,0.88); margin: 22px 0 0; max-width: 46ch; line-height: 1.55; }

        .gh-about__h { font-family: var(--font-display); font-weight: 700; font-size: clamp(34px, 6vw, 64px); line-height: 1.0; letter-spacing: -0.02em; margin: 0 0 28px; color: #fff; }
        .gh-about__h em { font-style: italic; color: var(--accent); }

        .gh-about__rule { height: 1px; background: rgba(255,255,255,0.16); margin: clamp(48px, 8vh, 88px) 0; transform-origin: left center; }

        /* Achievement grid */
        .gh-record { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; overflow: hidden; }
        .gh-record__cell { background: rgba(255,255,255,0.04); padding: clamp(18px, 3vw, 30px) clamp(16px, 2.4vw, 26px); }
        .gh-record__val { font-family: var(--font-display); font-weight: 800; font-size: clamp(26px, 4vw, 44px); letter-spacing: -0.02em; margin: 0 0 8px; color: #fff; }
        .gh-record__tag { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.62); margin: 0; line-height: 1.4; }
        @media (max-width: 720px) { .gh-record { grid-template-columns: repeat(2, 1fr); } }

        /* Mission */
        .gh-mission { display: grid; grid-template-columns: 1.3fr 1fr; gap: clamp(28px, 5vw, 64px); align-items: center; }
        .gh-mission__body p { font-family: var(--font-body); font-size: clamp(16px, 1.9vw, 19px); line-height: 1.75; color: rgba(255,255,255,0.9); margin: 0 0 18px; max-width: 60ch; }
        .gh-mission__photo { position: relative; aspect-ratio: 3 / 4; border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 24px 70px -24px rgba(0,0,0,0.8); }
        .gh-mission__photo img { object-fit: cover; }
        @media (max-width: 760px) { .gh-mission { grid-template-columns: 1fr; } .gh-mission__photo { aspect-ratio: 4 / 3; } }

        /* Join */
        .gh-join { display: grid; grid-template-columns: 1fr 1fr; gap: clamp(28px, 5vw, 56px); align-items: start; }
        .gh-join__lead { font-family: var(--font-body); font-size: clamp(16px, 1.9vw, 19px); line-height: 1.7; color: rgba(255,255,255,0.9); margin: 0 0 26px; }
        .gh-perks { list-style: none; padding: 0; margin: 0 0 30px; }
        .gh-perks li { display: flex; align-items: flex-start; gap: 12px; font-family: var(--font-body); font-size: 16px; color: rgba(255,255,255,0.92); padding: 13px 0; border-top: 1px solid rgba(255,255,255,0.12); }
        .gh-perks li:last-child { border-bottom: 1px solid rgba(255,255,255,0.12); }
        .gh-perks__check { flex: none; width: 22px; height: 22px; border-radius: 50%; background: var(--accent); color: #07140c; display: grid; place-items: center; font-size: 13px; font-weight: 800; margin-top: 1px; }
        .gh-join__note { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.5); margin: 16px 0 0; }
        @media (max-width: 760px) { .gh-join { grid-template-columns: 1fr; } }

        /* Closer */
        .gh-closer { text-align: center; }
        .gh-closer__text { font-family: var(--font-display); font-style: italic; font-weight: 500; font-size: clamp(22px, 3.4vw, 34px); line-height: 1.35; color: #fff; margin: 0 auto 28px; max-width: 24ch; }
        .gh-emails { display: inline-flex; flex-wrap: wrap; gap: 10px 14px; justify-content: center; }
        .gh-email { font-family: var(--font-mono); font-size: 13px; color: #fff; text-decoration: none; padding: 9px 16px; border: 1px solid rgba(255,255,255,0.22); border-radius: 999px; transition: background .15s ease, border-color .15s ease; }
        .gh-email:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.4); }
      `}</style>

      {/* ── Pinned scrollytelling gallery: scroll drives the photos by while the
            page stays put, then it releases into the content below ─────────── */}
      <div className="gh-hero3d">
        <div className="gh-hero3d__sticky">
          <InfiniteGallery images={GALLERY} visibleCount={10} speed={1} autoplay={false} className="gh-hero3d__canvas" />
          <div className="gh-hero3d__bar">
            <Link href="/" className="gh-hero3d__back">← debate.fish</Link>
            <span className="gh-hero3d__tag">About</span>
          </div>
          <p className="gh-hero3d__hint">Keep scrolling — the photos come to you</p>
        </div>
      </div>

      {/* ── All text lives below the gallery, on a solid dark band ───── */}
      <div className="gh-content">
        <div className="gh-about">
          {/* 01 · Who are we */}
          <section style={{ paddingTop: "clamp(40px, 7vh, 80px)" }}>
            <p className="gh-about__eyebrow ab-hero-line" style={{ "--i": "0" } as CSSProperties}>01 — Who we are</p>
            <h1 className="gh-about__names ab-hero-line" style={{ "--i": "1" } as CSSProperties}>
              Gary <em>&</em> Eli
            </h1>
            <p className="gh-about__sub ab-hero-line" style={{ "--i": "2" } as CSSProperties}>
              We built debate.fish for people who love the game. 
            </p>
          </section>

          {/* Achievements */}
          <section style={{ marginTop: "clamp(36px, 6vh, 56px)" }}>
            <div className="gh-record">
              {RECORD.map((r, i) => (
                <div key={r.tag} className="gh-record__cell ab-step-in" style={{ "--i": String(i) } as CSSProperties}>
                  <p className="gh-record__val">{r.value}</p>
                  <p className="gh-record__tag">{r.tag}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="gh-about__rule ab-rule-draw" />

          {/* 02 · Our mission */}
          <section className="gh-mission">
            <div className="gh-mission__body">
              <p className="gh-about__eyebrow">02 — Our mission</p>
              <h2 className="gh-about__h">Just debate <em>more.</em></h2>
              <p>
                The biggest question Eli and I get asked is &ldquo;How do I get better at debate?&rdquo; The answer is
                pretty simple. Debate more! But while that might seem easy, often times it&rsquo;s not. So we created this
                website to make the process easier.
              </p>
              <p>
                Imagine chess.com but for debate. You can upload speeches, judge rounds, or create tournaments. There is
                also an Elo ranking system for competing with your friends. Or you can use this website in unranked mode
                as a tool to improve and practice rounds with teammates, mentees, or anyone around the world.
              </p>
            </div>
            <div className="gh-mission__photo">
              <Image
                src={`${GP}/PXL_20251018_170055704.jpg`}
                alt="Giving a speech during a practice round"
                fill
                sizes="(max-width: 760px) 100vw, 420px"
                style={{ objectFit: "cover" }}
              />
            </div>
          </section>

          <div className="gh-about__rule ab-rule-draw" />

          {/* 03 · Join the team */}
          <section>
            <p className="gh-about__eyebrow">03 — Join the team</p>
            <h2 className="gh-about__h">Help us <em>build</em> it.</h2>
            <div className="gh-join">
              <div>
                <p className="gh-join__lead">
                  We&rsquo;re looking for debaters with coding skills — or coders with a debate interest. Or people who
                  want to help advertise! Share your accomplishments and we&rsquo;ll be in touch.
                </p>
                <a
                  className="db-btn db-btn--accent db-btn--lg"
                  href="mailto:gary.r.ayala@gmail.com,elichen314@gmail.com?subject=Joining%20the%20debate.fish%20team"
                >
                  Apply via email
                  <span className="db-btn__arrow" aria-hidden="true">→</span>
                </a>
                <p className="gh-join__note">We read every message.</p>
              </div>

              <ul className="gh-perks">
                <li><span className="gh-perks__check" aria-hidden="true">✓</span> Free prep materials</li>
                <li><span className="gh-perks__check" aria-hidden="true">✓</span> Coaching from experienced debaters</li>
                <li><span className="gh-perks__check" aria-hidden="true">✓</span> A direct role in the website&rsquo;s development</li>
              </ul>
            </div>
          </section>

          <div className="gh-about__rule ab-rule-draw" />

          {/* Closer */}
          <section className="gh-closer">
            <p className="gh-closer__text">
              Thanks for using debate.fish. We&rsquo;d love to hear how we can make it better.
            </p>
            <div className="gh-emails">
              <a className="gh-email" href="mailto:gary.r.ayala@gmail.com">gary.r.ayala@gmail.com</a>
              <a className="gh-email" href="mailto:elichen314@gmail.com">elichen314@gmail.com</a>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
