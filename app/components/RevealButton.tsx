"use client";

/* Show / hide password toggle for the auth forms. Inline SVG keeps it
   dependency-free; flipping it makes the AuthCharacters cover their eyes. */
export default function RevealButton({
  shown,
  onToggle,
}: {
  shown: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="gh-auth__reveal"
      onClick={onToggle}
      aria-label={shown ? "Hide password" : "Show password"}
      title={shown ? "Hide password" : "Show password"}
    >
      {shown ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 3l18 18" />
          <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
          <path d="M9.4 5.2A9.5 9.5 0 0 1 12 5c5.5 0 9 5.2 9 7 0 .8-.7 2.2-2 3.5" />
          <path d="M6.3 6.3C3.9 7.7 3 10.2 3 12c0 1.8 3.5 7 9 7 1.3 0 2.5-.3 3.6-.8" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="2.6" />
        </svg>
      )}
    </button>
  );
}
