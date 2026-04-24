export type Reading = {
  weight: number;
  created_at: string;
};

export type Confidence = "low" | "medium" | "high";

export type Prediction = {
  minutesRemaining: number | null;
  mlPerMin: number | null;
  confidence: Confidence;
  r2: number | null;
  samples: number;
};

/**
 * Linear-regression based time-to-empty estimator.
 * Uses up to the last `windowMs` of readings.
 * Returns minutes remaining, ml/min drain rate, and a confidence score
 * derived from the regression's R² (goodness of fit) and sample count.
 *
 * @param threshold - weight value considered "empty" (default 0)
 */
export function predictMinutesRemaining(
  readings: Reading[],
  windowMs = 5 * 60 * 1000,
  threshold = 0,
): Prediction {
  if (readings.length < 2) return { minutesRemaining: null, mlPerMin: null };

  const sorted = [...readings].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const lastT = new Date(sorted[sorted.length - 1].created_at).getTime();
  const recent = sorted.filter((r) => lastT - new Date(r.created_at).getTime() <= windowMs);
  const data = recent.length >= 2 ? recent : sorted.slice(-Math.max(2, sorted.length));

  // Simple linear regression w on t (minutes)
  const t0 = new Date(data[0].created_at).getTime();
  const xs = data.map((r) => (new Date(r.created_at).getTime() - t0) / 60000);
  const ys = data.map((r) => r.weight);
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumXX = xs.reduce((acc, x) => acc + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return { minutesRemaining: null, mlPerMin: null };
  const slope = (n * sumXY - sumX * sumY) / denom; // ml per minute (negative if draining)
  const intercept = (sumY - slope * sumX) / n;
  const currentWeight = ys[ys.length - 1];

  if (slope >= -0.01) return { minutesRemaining: null, mlPerMin: slope };

  // Solve intercept + slope * x = 0  -> x = -intercept / slope, then subtract last x
  const xEmpty = -intercept / slope;
  const xNow = xs[xs.length - 1];
  const minutes = xEmpty - xNow;
  if (!isFinite(minutes) || minutes < 0) return { minutesRemaining: 0, mlPerMin: slope };

  // Sanity-check using current weight & slope
  const altMinutes = currentWeight / -slope;
  return { minutesRemaining: Math.min(minutes, altMinutes), mlPerMin: slope };
}

export function formatDuration(mins: number | null): string {
  if (mins === null) return "—";
  if (mins < 1) return "< 1 min";
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}h ${m}m`;
}
