import type { Metadata } from "next";
import Link from "next/link";
import BackButton from "@/app/future/BackButton";

export const metadata: Metadata = {
  title: "Privacy Policy — debate.fish",
};

export default function PrivacyPage() {
  return (
    <div className="legal-page">
      <div className="legal-card">
        <BackButton style={{ fontSize: 15, color: "var(--muted)", textShadow: "none", marginBottom: 28 }} />

        <h1 className="legal-title">Privacy Policy</h1>
        <p className="legal-date">Effective: June 9, 2026</p>

        <section className="legal-section">
          <h2>1. Information We Collect</h2>
          <p>We collect the following categories of information:</p>
          <ul>
            <li>
              <strong>Account data:</strong> email address, username, and
              password (stored as a secure hash via Supabase Auth).
            </li>
            <li>
              <strong>Usage data:</strong> debate recordings, round history,
              ELO ratings, and tournament participation.
            </li>
            <li>
              <strong>Analytics:</strong> aggregated, anonymized page-view data
              via Vercel Analytics. No individual tracking cookies are set.
            </li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>2. How We Use Your Information</h2>
          <p>Your information is used to:</p>
          <ul>
            <li>Operate and improve the debate.fish platform</li>
            <li>Display leaderboards and tournament standings</li>
            <li>Send transactional emails (e.g., round notifications)</li>
          </ul>
          <p>We do not sell your personal data to third parties.</p>
        </section>

        <section className="legal-section">
          <h2>3. Data Storage &amp; Security</h2>
          <p>
            Your data is stored on Supabase infrastructure with encryption at
            rest and in transit. We follow industry-standard security practices,
            but no system is completely secure.
          </p>
        </section>

        <section className="legal-section">
          <h2>4. Third-Party Services</h2>
          <p>We use the following third-party services:</p>
          <ul>
            <li>
              <strong>Supabase</strong> — authentication and database
            </li>
            <li>
              <strong>Vercel</strong> — hosting and analytics
            </li>
          </ul>
          <p>
            Each service has its own privac
            y policy governing how they handle
            data.
          </p>
        </section>

        <section className="legal-section">
          <h2>5. Data Retention</h2>
          <p>
            We retain your data as long as your account is active. You may
            request deletion of your account and associated data at any time by
            contacting us.
          </p>
        </section>

        <section className="legal-section">
          <h2>6. Your Rights</h2>
          <p>
            Depending on your jurisdiction, you may have rights to access,
            correct, or delete your personal data. Contact us to exercise these
            rights.
          </p>
        </section>

        <section className="legal-section">
          <h2>7. Children&apos;s Privacy</h2>
          <p>
            debate.fish is not directed at children under 13. We do not
            knowingly collect personal information from children under 13. If
            you believe we have, please contact us so we can delete it.
          </p>
        </section>

        <section className="legal-section">
          <h2>8. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy periodically. We will notify users
            of material changes via the platform or email.
          </p>
        </section>

        <section className="legal-section">
          <h2>9. Contact</h2>
          <p>
            Privacy questions? Reach us at{" "}
            <a href="mailto:elichen314@gmail.com">elichen314@gmail.com</a>.
          </p>
        </section>

        <p className="legal-related">
          See also our{" "}
          <Link href="/terms">Terms &amp; Conditions</Link>.
        </p>
      </div>
    </div>
  );
}
