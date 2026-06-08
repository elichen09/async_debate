import type { Metadata } from "next";
import { Geist_Mono, Barlow_Condensed, Chivo } from "next/font/google";
import "./globals.css";
import NavBar from "./components/NavBar";

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
  title: "Grasshopper",
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
      className={`${geistMono.variable} ${barlowCondensed.variable} ${chivo.variable} antialiased`}
    >
      <head />
      <body>
        <div className="db-shell">
          <NavBar />
          <main className="db-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
