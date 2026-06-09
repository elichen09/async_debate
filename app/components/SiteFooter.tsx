import Link from "next/link";

export default function SiteFooter() {
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
