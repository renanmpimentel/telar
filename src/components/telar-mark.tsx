interface TelarMarkProps {
  className?: string;
  size?: number;
  title?: string;
}

/**
 * Telar brand mark: an emerald tile where a woven thread on the left resolves
 * into a small screen of pixels on the right — one of them golden, the freshly
 * "generated" cell. The name "Telar" means loom: the tool weaves raw threads
 * into interfaces.
 */
export function TelarMark({ className, size = 34, title = "Telar" }: TelarMarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id="telar-tile" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#13897a" />
          <stop offset="1" stopColor="#0b544a" />
        </linearGradient>
        <linearGradient id="telar-gold" x1="26" y1="11" x2="37" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f4c65a" />
          <stop offset="1" stopColor="#e0a12f" />
        </linearGradient>
      </defs>

      <rect x="0.5" y="0.5" width="39" height="39" rx="9.5" fill="url(#telar-tile)" />

      {/* The thread — woven, then feeding into the screen */}
      <g stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none">
        <path d="M6 12 Q10.5 16 6 20 Q1.5 24 6 28" />
        <path d="M7 20 H13" />
      </g>

      {/* The screen — three white pixels and one golden, freshly generated */}
      <rect x="14" y="11" width="10.5" height="10.5" rx="2.6" fill="#fff" />
      <rect x="26.5" y="11" width="10.5" height="10.5" rx="2.6" fill="url(#telar-gold)" />
      <rect x="14" y="23.5" width="10.5" height="10.5" rx="2.6" fill="#fff" />
      <rect x="26.5" y="23.5" width="10.5" height="10.5" rx="2.6" fill="#fff" />
    </svg>
  );
}
