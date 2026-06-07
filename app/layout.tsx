import type { Metadata } from "next";
import { Geist_Mono, Barlow_Condensed, Chivo } from "next/font/google";
import "./globals.css";
import NavBar from "./components/NavBar";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  style: ["normal", "italic"],
});

const chivo = Chivo({
  variable: "--font-chivo",
  subsets: ["latin"],
  weight: ["300", "400", "700"],
});

export const metadata: Metadata = {
  title: "Async Debate — challenge anyone, anytime",
  description:
    "Asynchronous public-forum debate. Send a challenge, record your speeches on your own schedule, and climb the rankings.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: the boot script sets data-mode/data-scheme on
    // <html> before React hydrates, so the server markup intentionally differs.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistMono.variable} ${barlowCondensed.variable} ${chivo.variable} antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <div className="db-shell">
          <NavBar />
          <main className="db-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
