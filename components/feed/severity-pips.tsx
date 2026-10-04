export function SeverityPips({ severity, className = "" }: { severity: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label={`Severity ${severity} of 5`}
      title={`Severity ${severity}/5`}
      className={`inline-flex items-end gap-0.5 ${className}`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          aria-hidden
          className={`w-1 ${n <= severity ? (severity >= 4 ? "bg-danger" : severity === 3 ? "bg-warn" : "bg-accent") : "bg-border"}`}
          style={{ height: `${4 + n * 2}px` }}
        />
      ))}
    </span>
  );
}
