/** Small inline-SVG ornaments. Decorative: always aria-hidden. Colour comes from `currentColor`. */

/** 24-spoke Ashoka-chakra-style wheel. */
export function Chakra({ className = "h-5 w-5" }: { className?: string }) {
  const spokes = Array.from({ length: 12 }, (_, i) => i * 15);
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="10.5" strokeWidth="1.4" />
      <circle cx="12" cy="12" r="2" fill="currentColor" strokeWidth="0" />
      {spokes.map((a) => (
        <line key={a} x1="12" y1="2.5" x2="12" y2="21.5" strokeWidth="0.8" transform={`rotate(${a} 12 12)`} />
      ))}
    </svg>
  );
}

/** Eight-petal lotus, for section dividers where a CSS background will not do. */
export function Lotus({ className = "h-4 w-6" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 26 14" className={className} fill="currentColor">
      <path d="M13 1C10.5 4 10.5 8 13 11 15.5 8 15.5 4 13 1Z" />
      <path opacity=".8" d="M12 11C8.5 10.5 6 8 5.5 5 8.5 5 11 7 12 11ZM14 11C17.5 10.5 20 8 20.5 5 17.5 5 15 7 14 11Z" />
      <path opacity=".6" d="M11 12C6 12.5 2.5 11 .5 8 4 7.5 8.5 9 11 12ZM15 12C20 12.5 23.5 11 25.5 8 22 7.5 17.5 9 15 12Z" />
    </svg>
  );
}
