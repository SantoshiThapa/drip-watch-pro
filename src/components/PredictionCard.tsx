import { TrendingDown, ShieldCheck } from "lucide-react";
import type { Confidence } from "@/lib/predict";

export function PredictionCard({
  minutesRemaining,
  emptyClock,
  confidence,
  mlPerMin,
  tone,
  threshold,
}: {
  minutesRemaining: number | null;
  emptyClock: string | null;
  confidence: Confidence;
  mlPerMin: number | null;
  tone: "normal" | "warning" | "critical";
  threshold: number;
}) {
  const toneBorder =
    tone === "critical"
      ? "border-destructive/50 bg-destructive/10"
      : tone === "warning"
        ? "border-warning/50 bg-warning/10"
        : "border-success/40 bg-success/5";
  const toneText =
    tone === "critical" ? "text-destructive" : tone === "warning" ? "text-warning" : "text-success";
  const iconBg =
    tone === "critical"
      ? "bg-destructive text-destructive-foreground"
      : tone === "warning"
        ? "bg-warning text-warning-foreground"
        : "bg-success text-success-foreground";
  const headline =
    minutesRemaining === null
      ? "Awaiting stable trend…"
      : minutesRemaining < 1
        ? "Less than 1 minute left"
        : `Approx. ${Math.round(minutesRemaining)} minute${Math.round(minutesRemaining) === 1 ? "" : "s"} left`;
  const confLabel = confidence.charAt(0).toUpperCase() + confidence.slice(1);
  const confPill =
    confidence === "high"
      ? "bg-success/15 text-success"
      : confidence === "medium"
        ? "bg-warning/15 text-warning"
        : "bg-muted text-muted-foreground";

  return (
    <section
      className={`rounded-2xl border p-5 ${toneBorder} ${tone === "critical" ? "animate-pulse-critical" : ""}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${iconBg}`}>
            <TrendingDown className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Prediction</p>
            <h3 className={`text-lg font-semibold ${toneText}`}>{headline}</h3>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${confPill}`}
        >
          <ShieldCheck className="h-3 w-3" /> {confLabel} confidence
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Expected empty at" value={emptyClock ?? "—"} mono />
        <Stat
          label="Drain rate"
          value={mlPerMin && mlPerMin < 0 ? `${Math.abs(mlPerMin).toFixed(2)} ml/min` : "—"}
        />
        <Stat label="Empty threshold" value={`${threshold} ml`} />
      </div>

      {tone !== "normal" && minutesRemaining !== null && (
        <p className={`mt-4 text-sm font-medium ${toneText}`}>
          {tone === "critical"
            ? "🚨 Critical — prepare replacement bottle now."
            : "⚠ Warning — bottle change needed soon."}
        </p>
      )}
    </section>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${mono ? "tabular-nums" : ""}`}>{value}</p>
    </div>
  );
}
