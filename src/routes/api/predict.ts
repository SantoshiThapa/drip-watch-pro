import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { predictMinutesRemaining } from "@/lib/predict";

/**
 * GET /api/predict
 *
 * Fetches the most recent drip readings, computes a linear-regression
 * estimate of time-to-empty (down to the configured empty_threshold),
 * and returns remaining minutes, the expected empty clock time, and a
 * confidence level derived from regression fit quality + sample count.
 */
export const Route = createFileRoute("/api/predict")({
  server: {
    handlers: {
      GET: async () => {
        try {
          // Pull last 20 readings + configured empty threshold in parallel
          const [{ data: readings, error: rErr }, { data: settings }] = await Promise.all([
            supabaseAdmin
              .from("drip_readings")
              .select("weight, created_at")
              .order("created_at", { ascending: false })
              .limit(20),
            supabaseAdmin.from("drip_settings").select("empty_threshold").eq("id", 1).maybeSingle(),
          ]);

          if (rErr) {
            return json({ error: "Failed to load readings" }, 500);
          }

          const threshold = Number(settings?.empty_threshold ?? 0);
          const prediction = predictMinutesRemaining(
            (readings ?? []).map((r) => ({
              weight: Number(r.weight),
              created_at: r.created_at as string,
            })),
            5 * 60 * 1000,
            threshold,
          );

          const mins = prediction.minutesRemaining;
          const estimatedTime =
            mins !== null && isFinite(mins)
              ? formatClock(new Date(Date.now() + mins * 60_000))
              : null;

          return json({
            estimatedMinutesLeft: mins === null ? null : Math.round(mins),
            estimatedTime,
            confidence: prediction.confidence,
            mlPerMin: prediction.mlPerMin,
            r2: prediction.r2,
            samples: prediction.samples,
            threshold,
          });
        } catch (err) {
          console.error("/api/predict failed:", err);
          return json({ error: "Prediction service unavailable" }, 500);
        }
      },
    },
  },
});

function formatClock(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
