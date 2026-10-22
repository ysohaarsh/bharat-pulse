import type { ReactNode } from "react";

const KIND = {
  error: { stamp: "stamp-danger", box: "border-danger/40 bg-danger/10", label: "त्रुटि / ERROR", role: "alert" },
  warn: { stamp: "stamp-warn", box: "border-warn/40 bg-haldi/15", label: "सूचना / NOTICE", role: "status" },
  ok: { stamp: "stamp-ok", box: "border-ok/40 bg-ok/10", label: "दर्ज / RECORDED", role: "status" },
} as const;

/** Register-style notice: a rubber stamp followed by the message. */
export function Notice({ kind, label, children }: { kind: keyof typeof KIND; label?: string; children: ReactNode }) {
  const k = KIND[kind];
  return (
    <div role={k.role} className={`flex flex-wrap items-start gap-x-3 gap-y-1.5 border px-3 py-2 text-sm text-ink ${k.box}`}>
      <span className={`stamp stamp-flat shrink-0 ${k.stamp}`}>{label ?? k.label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}
