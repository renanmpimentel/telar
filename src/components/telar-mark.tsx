interface TelarMarkProps {
  className?: string;
  size?: number;
  title?: string;
}

/**
 * Telar brand mark: a pencil set on an emerald tile — the instrument of design.
 * White barrel with a golden ferrule and sharpened tip, tipped with dark
 * graphite, drawn on the diagonal so it reads as "make / draw".
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
        <linearGradient id="telar-gold" x1="14" y1="6" x2="26" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f6cd63" />
          <stop offset="1" stopColor="#e0a12f" />
        </linearGradient>
      </defs>

      <rect x="0.5" y="0.5" width="39" height="39" rx="9.5" fill="url(#telar-tile)" />

      <g transform="rotate(45 20 20)">
        {/* Ferrule / eraser cap */}
        <rect x="16" y="5" width="8" height="3.4" rx="1.6" fill="url(#telar-gold)" />
        {/* Barrel */}
        <rect x="16" y="9" width="8" height="16.5" fill="#fff" />
        <line x1="20" y1="9.8" x2="20" y2="24.7" stroke="#e6e4de" strokeWidth="0.9" />
        {/* Sharpened wood tip */}
        <path d="M16 25.5 H24 L20 33 Z" fill="url(#telar-gold)" />
        {/* Graphite point */}
        <path d="M18.2 30.3 H21.8 L20 33 Z" fill="#0b3b35" />
      </g>
    </svg>
  );
}
