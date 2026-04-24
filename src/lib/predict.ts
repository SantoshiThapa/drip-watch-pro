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
  const empty: Prediction = {
    minutesRemaining: null,
    mlPerMin: null,
    confidence: "low",
    r2: null,
    samples: readings.length,
  };
  if (readings.length < 2) return empty;

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
  if (denom === 0) return { ...empty, samples: n };

  const slope = (n * sumXY - sumX * sumY) / denom; // ml per minute (negative if draining)
  const intercept = (sumY - slope * sumX) / n;
  const currentWeight = ys[ys.length - 1];

  // Compute R² (coefficient of determination) to gauge trend reliability
  const meanY = sumY / n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const pred = intercept + slope * xs[i];
    ssTot += (ys[i] - meanY) ** 2;
    ssRes += (ys[i] - pred) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  // Confidence: combine fit quality (R²) with sample count
  let confidence: Confidence = "low";
  if (n >= 10 && r2 >= 0.85) confidence = "high";
  else if (n >= 5 && r2 >= 0.6) confidence = "medium";

  if (slope >= -0.01) {
    // No meaningful drain — flat or rising trend
    return { minutesRemaining: null, mlPerMin: slope, confidence: "low", r2, samples: n };
  }

  // Solve intercept + slope * x = threshold  -> x = (threshold - intercept) / slope
  const xTarget = (threshold - intercept) / slope;
  const xNow = xs[xs.length - 1];
  const minutes = xTarget - xNow;

  if (!isFinite(minutes) || minutes < 0) {
    return { minutesRemaining: 0, mlPerMin: slope, confidence, r2, samples: n };
  }

  // Sanity-check using current weight & slope (bound runaway projections)
  const altMinutes = Math.max(0, (currentWeight - threshold) / -slope);
  return {
    minutesRemaining: Math.min(minutes, altMinutes),
    mlPerMin: slope,
    confidence,
    r2,
    samples: n,
  };
}

export function formatDuration(mins: number | null): string {
  if (mins === null) return "—";
  if (mins < 1) return "< 1 min";
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}h ${m}m`;
}
