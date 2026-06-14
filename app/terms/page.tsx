import type { Metadata } from "next";
import Link from "next/link";
import BackButton from "@/app/future/BackButton";

export const metadata: Metadata = {
  title: "Terms & Conditions — debate.fish",
};

export default function TermsPage() {
  return (
    <div className="legal-page">
      <div className="legal-card">
        <BackButton style={{ fontSize: 15, color: "var(--muted)", textShadow: "none", marginBottom: 28 }} />

        <h1 className="legal-title">Terms &amp; Conditions</h1>
        <p className="legal-date">Effective: June 9, 2026</p>

        <section className="legal-section">
          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using debate.fish ("the Service"), you agree to be
            bound by these Terms &amp; Conditions. If you do not agree, please
            do not use the Service.
          </p>
        </section>

        <section className="legal-section">
          <h2>2. Eligibility</h2>
          <p>
            You must be at least 13 years old to create an account and use
            debate.fish. By registering, you confirm that you meet this
            requirement.
          </p>
        </section>

        <section className="legal-section">
          <h2>3. User Accounts</h2>
          <p>
            You are responsible for maintaining the confidentiality of your
            account credentials and for all activities that occur under your
            account. Notify us immediately of any unauthorized use.
          </p>
        </section>

        <section className="legal-section">
          <h2>4. User Content</h2>
          <p>
            You retain ownership of any debate recordings, arguments, or other
            content you submit ("User Content"). By submitting User Content, you
            grant debate.fish a non-exclusive, royalty-free license to host,
            display, and distribute that content within the Service.
          </p>
          <p>
            You agree not to upload content that is illegal, harassing,
            defamatory, or otherwise harmful. We reserve the right to remove
            content that violates these guidelines.
          </p>
        </section>

        <section className="legal-section">
          <h2>5. Prohibited Conduct</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Impersonate any person or entity</li>
            <li>Use the Service for any unlawful purpose</li>
            <li>Attempt to gain unauthorized access to any part of the Service</li>
            <li>Interfere with or disrupt the integrity or performance of the Service</li>
            <li>Scrape, crawl, or systematically extract data from the Service</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>6. Intellectual Property</h2>
          <p>
            All platform code, design, trademarks, and non-user content are the
            exclusive property of debate.fish and its creators. Nothing in these
            Terms grants you a right to use our trademarks or branding.
          </p>
        </section>

        <section className="legal-section">
          <h2>7. Disclaimers</h2>
          <p>
            The Service is provided "as is" without warranties of any kind.
            debate.fish does not guarantee uninterrupted access or that debate
            scores and ELO ratings are free of errors.
          </p>
        </section>

        <section className="legal-section">
          <h2>8. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, debate.fish and its creators
            shall not be liable for any indirect, incidental, or consequential
            damages arising from your use of the Service.
          </p>
        </section>

        <section className="legal-section">
          <h2>9. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. Continued use of the
            Service after changes constitutes your acceptance of the revised
            Terms.
          </p>
        </section>

        <section className="legal-section">
          <h2>10. Contact</h2>
          <p>
            Questions about these Terms? Reach us at{" "}
            <a href="mailto:elichen314@gmail.com">elichen314@gmail.com</a>.
          </p>
        </section>

        <p className="legal-related">
          See also our{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}
