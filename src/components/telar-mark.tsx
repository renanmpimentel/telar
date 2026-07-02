interface TelarMarkProps {
  className?: string;
  size?: number;
  title?: string;
}

/**
 * Telar brand mark: a rounded tile with a monogram "T" whose stroke (traço) ends
 * in a design cursor — the app draws screens the way you point and sketch.
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
      </defs>
      <rect x="0.5" y="0.5" width="39" height="39" rx="9.5" fill="url(#telar-tile)" />
      {/* T bar — the stroke */}
      <path d="M11 13.5h18" stroke="#fff" strokeWidth="3.1" strokeLinecap="round" />
      {/* T stem */}
      <path d="M20 13.5v8.5" stroke="#fff" strokeWidth="3.1" strokeLinecap="round" />
      {/* cursor resting at the end of the stroke */}
      <path
        d="M20 21.4l8.4 3.5-3.4 1.1 1.9 4.1-2.4 1.1-1.9-4.1-2.6 2.2z"
        fill="#fff"
        stroke="url(#telar-tile)"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
