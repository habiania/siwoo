import { createFileRoute } from "@tanstack/react-router";
import { scanPendingProducts } from "@/lib/kipris.functions";

export const Route = createFileRoute("/api/public/hooks/kipris-scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { limit?: number };
        const result = await scanPendingProducts({ data: { limit: body.limit ?? 50 } });
        return Response.json({ ok: true, ...result, ranAt: new Date().toISOString() });
      },
      GET: async () => {
        const result = await scanPendingProducts({ data: { limit: 50 } });
        return Response.json({ ok: true, ...result, ranAt: new Date().toISOString() });
      },
    },
  },
});