import type { Metadata } from "next";
import { Geist_Mono, Fraunces, Lora, Libre_Caslon_Display, Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import NavBar from "./components/NavBar";
import ParticleField from "./components/ParticleField";
import EtherealShadow from "./components/EtherealShadow";
import CustomCursor from "./components/CustomCursor";
import SiteFooter from "./components/SiteFooter";
import { Analytics } from "@vercel/analytics/next"

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
  style: ["normal", "italic"],
});

const lora = Lora({
  variable: "--font-chivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

// Flow workspace premium pairing (scoped to .flow-shell in globals.css):
// Libre Caslon Display for the heading/masthead moments, Hanken Grotesk for the
// functional chrome. Calibri still owns the document surfaces.
const libreCaslon = Libre_Caslon_Display({
  variable: "--font-caslon",
  subsets: ["latin"],
  weight: "400",
});

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "debate.fish",
  description:
    "Debate anyone, on your schedule. Record speeches whenever you have a free minute and climb the ladder.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistMono.variable} ${fraunces.variable} ${lora.variable} ${libreCaslon.variable} ${hankenGrotesk.variable} antialiased`}
    >
      <head>
        <script
          // Apply the saved scene (gh-bg-grid / gh-bg-dots / gh-bg-shadow /
          // gh-bg-off…) before first paint; paper scenes also get gh-light.
          dangerouslySetInnerHTML={{
            __html:
              "try{var v=localStorage.getItem('gh-bg');if(v&&v!=='on'){var c=document.documentElement.classList;c.add('gh-bg-'+v);if(v==='grid'||v==='dots'||v==='off')c.add('gh-light')}}catch(e){}",
          }}
        />
      </head>
      <body>
        <div className="db-shell">
          <ParticleField />
          <EtherealShadow />
          <NavBar />
          <main className="db-main">{children}</main>
          <SiteFooter />
        </div>
        <CustomCursor />
        <Analytics />
      </body>
    </html>
  );
}
