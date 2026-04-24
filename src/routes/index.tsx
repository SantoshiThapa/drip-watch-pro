import { useEffect, useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  Activity,
  Droplet,
  Lightbulb,
  Volume2,
  VolumeX,
  MessageSquare,
  AlertTriangle,
  Clock,
  Settings as SettingsIcon,
  Wifi,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { format, formatDistanceToNow } from "date-fns";
import { predictMinutesRemaining, formatDuration } from "@/lib/predict";

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "MediFlow — IV Drip Monitoring" },
      {
        name: "description",
        content:
          "Real-time IoT IV drip monitoring dashboard with weight tracking, drip-rate analytics and depletion prediction.",
      },
    ],
  }),
});

type Reading = {
  id: string;
  weight: number;
  drip_rate: number;
  led_status: boolean;
  buzzer_status: boolean;
  gsm_sent: boolean;
  created_at: string;
};

type Settings = { id: number; empty_threshold: number };

function Dashboard() {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [now, setNow] = useState(Date.now());
  const [thresholdInput, setThresholdInput] = useState("");

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: rs }, { data: s }] = await Promise.all([
        supabase
          .from("drip_readings")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase.from("drip_settings").select("*").eq("id", 1).single(),
      ]);
      if (cancelled) return;
      if (rs) setReadings(rs as Reading[]);
      if (s) {
        setSettings(s as Settings);
        setThresholdInput(String((s as Settings).empty_threshold));
      }
    })();

    const ch = supabase
      .channel("drip-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "drip_readings" },
        (payload) => {
          setReadings((prev) => [payload.new as Reading, ...prev].slice(0, 50));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "drip_settings" },
        (payload) => setSettings(payload.new as Settings),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, []);

  const latest = readings[0];
  const threshold = settings?.empty_threshold ?? 50;

  const status: "normal" | "warning" | "critical" = useMemo(() => {
    if (!latest) return "normal";
    if (latest.weight <= threshold) return "critical";
    if (latest.weight <= threshold * 1.6) return "warning";
    return "normal";
  }, [latest, threshold]);

  const prediction = useMemo(
    () =>
      predictMinutesRemaining(
        readings.map((r) => ({ weight: r.weight, created_at: r.created_at })),
        5 * 60 * 1000,
        threshold,
      ),
    [readings, threshold],
  );

  const emptyClock = useMemo(() => {
    const m = prediction.minutesRemaining;
    if (m === null || !isFinite(m)) return null;
    const d = new Date(now + m * 60_000);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }, [prediction.minutesRemaining, now]);

  const predictionTone: "normal" | "warning" | "critical" =
    prediction.minutesRemaining === null
      ? "normal"
      : prediction.minutesRemaining < 5
        ? "critical"
        : prediction.minutesRemaining < 15
          ? "warning"
          : "normal";

  const chartData = useMemo(() => {
    const ordered = [...readings].reverse();
    // Compute a trend line from the same regression used for prediction
    let slope = 0;
    let intercept = 0;
    if (ordered.length >= 2) {
      const t0 = new Date(ordered[0].created_at).getTime();
      const xs = ordered.map((r) => (new Date(r.created_at).getTime() - t0) / 60000);
      const ys = ordered.map((r) => Number(r.weight));
      const n = xs.length;
      const sX = xs.reduce((a, b) => a + b, 0);
      const sY = ys.reduce((a, b) => a + b, 0);
      const sXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
      const sXX = xs.reduce((a, x) => a + x * x, 0);
      const denom = n * sXX - sX * sX;
      if (denom !== 0) {
        slope = (n * sXY - sX * sY) / denom;
        intercept = (sY - slope * sX) / n;
      }
    }
    const t0 = ordered.length ? new Date(ordered[0].created_at).getTime() : 0;
    return ordered.map((r) => {
      const x = (new Date(r.created_at).getTime() - t0) / 60000;
      return {
        time: format(new Date(r.created_at), "HH:mm:ss"),
        weight: Number(r.weight),
        dripRate: Number(r.drip_rate),
        trend: ordered.length >= 2 ? Math.max(0, intercept + slope * x) : null,
      };
    });
  }, [readings]);

  const saveThreshold = async () => {
    const v = Number(thresholdInput);
    if (!Number.isFinite(v) || v < 0) return;
    await supabase
      .from("drip_settings")
      .update({ empty_threshold: v, updated_at: new Date().toISOString() })
      .eq("id", 1);
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border/60 bg-card/70 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center text-primary-foreground shadow-lg">
              <Droplet className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-semibold tracking-tight">
                MediFlow Monitor
              </h1>
              <p className="text-xs text-muted-foreground">IV Drip Telemetry · IoT</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            <Wifi className="h-3.5 w-3.5" /> Live
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-6">
        {/* Critical alert banner */}
        {status === "critical" && (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 flex items-center gap-3 animate-pulse-critical">
            <div className="h-10 w-10 rounded-full bg-destructive flex items-center justify-center text-destructive-foreground animate-blink">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-destructive">Critical — Bottle Almost Empty</p>
              <p className="text-sm text-muted-foreground">
                Weight has fallen below the configured threshold of {threshold} ml. Replace IV
                bottle immediately.
              </p>
            </div>
          </div>
        )}

        {/* Top KPIs */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Current Weight"
            value={latest ? `${Math.round(latest.weight)}` : "—"}
            unit="ml"
            icon={<Droplet className="h-5 w-5" />}
            tone={status}
          />
          <KpiCard
            label="Drip Rate"
            value={latest ? `${Math.round(latest.drip_rate)}` : "—"}
            unit="drops/min"
            icon={<Activity className="h-5 w-5" />}
            tone="normal"
          />
          <KpiCard
            label="Time Remaining"
            value={formatDuration(prediction.minutesRemaining)}
            unit={
              prediction.mlPerMin && prediction.mlPerMin < 0
                ? `${Math.abs(prediction.mlPerMin).toFixed(1)} ml/min`
                : "estimating…"
            }
            icon={<Clock className="h-5 w-5" />}
            tone={predictionTone}
          />
          <KpiCard
            label="Last Update"
            value={latest ? formatDistanceToNow(new Date(latest.created_at), { addSuffix: false }) : "—"}
            unit={latest ? "ago" : "no data"}
            icon={<Clock className="h-5 w-5" />}
            tone="normal"
            subtle={latest ? format(new Date(latest.created_at), "HH:mm:ss") : ""}
            tickKey={now}
          />
        </section>

        {/* Status indicators */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatusCard
            icon={<Lightbulb className="h-5 w-5" />}
            label="LED Indicator"
            on={!!latest?.led_status}
            onText="Working"
            offText="Off"
          />
          <StatusCard
            icon={latest?.buzzer_status ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            label="Buzzer"
            on={!!latest?.buzzer_status}
            onText="Sounding"
            offText="Silent"
            warnWhenOn
          />
          <StatusCard
            icon={<MessageSquare className="h-5 w-5" />}
            label="GSM Module"
            on={!!latest?.gsm_sent}
            onText="Message Sent"
            offText="No Message"
          />
        </section>

        {/* Prediction card */}
        <PredictionCard
          minutesRemaining={prediction.minutesRemaining}
          emptyClock={emptyClock}
          confidence={prediction.confidence}
          mlPerMin={prediction.mlPerMin}
          tone={predictionTone}
          threshold={threshold}
        />

        {/* Charts */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Weight vs Time" subtitle="ml">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="wGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <Tooltip contentStyle={tooltipStyle} />
                <Area
                  type="monotone"
                  dataKey="weight"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  fill="url(#wGrad)"
                />
                <Line
                  type="monotone"
                  dataKey="trend"
                  stroke="var(--warning)"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Drip Rate vs Time" subtitle="drops/min">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <Tooltip contentStyle={tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="dripRate"
                  stroke="var(--success)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </section>

        {/* Settings */}
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <SettingsIcon className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold">Alert Settings</h2>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">Empty-bottle threshold (ml)</label>
              <input
                type="number"
                min={0}
                value={thresholdInput}
                onChange={(e) => setThresholdInput(e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              onClick={saveThreshold}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition"
            >
              Save threshold
            </button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Critical alert triggers when weight ≤ threshold. Warning state triggers below{" "}
            {Math.round(threshold * 1.6)} ml.
          </p>
        </section>

        {/* Device API hint */}
        <section className="rounded-2xl border border-dashed border-border bg-muted/40 p-5 text-sm">
          <p className="font-medium mb-1">Device Integration</p>
          <p className="text-muted-foreground text-xs mb-2">
            ESP32 / Arduino posts JSON to <code className="px-1 py-0.5 rounded bg-background">POST /api/data</code>
            with header <code className="px-1 py-0.5 rounded bg-background">x-api-key: &lt;DEVICE_API_KEY&gt;</code>.
          </p>
          <pre className="text-xs bg-background border border-border rounded-lg p-3 overflow-x-auto">{`{
  "weight": 450,
  "dripRate": 15,
  "ledStatus": true,
  "buzzerStatus": false,
  "gsmSent": true
}`}</pre>
        </section>
      </main>
    </div>
  );
}

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
} as const;

function KpiCard({
  label,
  value,
  unit,
  icon,
  tone,
  subtle,
  tickKey,
}: {
  label: string;
  value: string;
  unit?: string;
  icon: React.ReactNode;
  tone: "normal" | "warning" | "critical";
  subtle?: string;
  tickKey?: number;
}) {
  const toneClasses =
    tone === "critical"
      ? "border-destructive/40 bg-destructive/5"
      : tone === "warning"
        ? "border-warning/40 bg-warning/10"
        : "border-border bg-card";
  const iconBg =
    tone === "critical"
      ? "bg-destructive text-destructive-foreground"
      : tone === "warning"
        ? "bg-warning text-warning-foreground"
        : "bg-primary/10 text-primary";
  return (
    <div
      className={`rounded-2xl border ${toneClasses} p-5 transition-shadow hover:shadow-md`}
      data-tick={tickKey}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${iconBg}`}>{icon}</div>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-bold tabular-nums">{value}</span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
      {subtle && <p className="mt-1 text-xs text-muted-foreground">{subtle}</p>}
    </div>
  );
}

function StatusCard({
  icon,
  label,
  on,
  onText,
  offText,
  warnWhenOn = false,
}: {
  icon: React.ReactNode;
  label: string;
  on: boolean;
  onText: string;
  offText: string;
  warnWhenOn?: boolean;
}) {
  const activeColor = warnWhenOn ? "warning" : "success";
  const dotClass = on
    ? warnWhenOn
      ? "bg-warning"
      : "bg-success"
    : "bg-destructive";
  const pillClass = on
    ? warnWhenOn
      ? "bg-warning/15 text-warning-foreground"
      : "bg-success/15 text-success"
    : "bg-destructive/15 text-destructive";
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center bg-${activeColor}/10 text-foreground`}>
          {icon}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${dotClass} ${on && warnWhenOn ? "animate-blink" : ""}`} />
        <span className="text-base font-semibold">{on ? onText : offText}</span>
      </div>
      <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${pillClass}`}>
        {on ? "ACTIVE" : "INACTIVE"}
      </span>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-semibold">{title}</h3>
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}
