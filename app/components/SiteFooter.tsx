"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SiteFooter() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return (
    <footer className="site-footer">
      <span className="site-footer__text">
        &copy; {new Date().getFullYear()} Grasshopper. By using this site, you agree to our{" "}
        <Link href="/terms" className="site-footer__link">Terms</Link>
        {" "}and{" "}
        <Link href="/privacy" className="site-footer__link">Privacy Policy</Link>.
      </span>
    </footer>
  );
}
