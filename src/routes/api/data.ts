import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
};

const Schema = z.object({
  weight: z.number().min(0).max(10000),
  dripRate: z.number().min(0).max(1000).default(0),
  ledStatus: z.boolean().default(false),
  buzzerStatus: z.boolean().default(false),
  gsmSent: z.boolean().default(false),
});

export const Route = createFileRoute("/api/data")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const expected = process.env.DEVICE_API_KEY;
        const provided =
          request.headers.get("x-api-key") ||
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

        if (!expected || provided !== expected) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        const parsed = Schema.safeParse(body);
        if (!parsed.success) {
          return new Response(
            JSON.stringify({ error: "Validation failed", issues: parsed.error.issues }),
            { status: 400, headers: { "Content-Type": "application/json", ...CORS } },
          );
        }

        const d = parsed.data;
        const { error } = await supabaseAdmin.from("drip_readings").insert({
          weight: d.weight,
          drip_rate: d.dripRate,
          led_status: d.ledStatus,
          buzzer_status: d.buzzerStatus,
          gsm_sent: d.gsmSent,
        });

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        return new Response(JSON.stringify({ ok: true }), {
          status: 201,
          headers: { "Content-Type": "application/json", ...CORS },
        });
      },
    },
  },
});
