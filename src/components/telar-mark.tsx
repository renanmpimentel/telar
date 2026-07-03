interface TelarMarkProps {
  className?: string;
  size?: number;
  title?: string;
}

/**
 * Telar brand mark: an emerald tile holding a small loom — four white warp
 * threads with a single golden weft thread woven over and under them. The name
 * "Telar" means loom; the tool weaves screens the way a loom weaves cloth.
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
        <linearGradient id="telar-weft" x1="7" y1="20" x2="33" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f4c65a" />
          <stop offset="1" stopColor="#e0a12f" />
        </linearGradient>
      </defs>

      <rect x="0.5" y="0.5" width="39" height="39" rx="9.5" fill="url(#telar-tile)" />

      {/* Warp — four vertical threads */}
      <g stroke="#fff" strokeWidth="2.8" strokeLinecap="round">
        <path d="M11 8v24" />
        <path d="M17 8v24" />
        <path d="M23 8v24" />
        <path d="M29 8v24" />
      </g>

      {/* Weft — a single golden thread woven through the warp */}
      <path
        d="M7 20 Q11 15 14 20 Q17 25 20 20 Q23 15 26 20 Q29 25 33 20"
        fill="none"
        stroke="url(#telar-weft)"
        strokeWidth="3"
        strokeLinecap="round"
      />

      {/* Restore the warp over the weft where the thread dips under */}
      <g stroke="#fff" strokeWidth="2.8" strokeLinecap="round">
        <path d="M17 20v6" />
        <path d="M29 20v6" />
      </g>
    </svg>
  );
}
