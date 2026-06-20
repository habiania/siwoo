import { createFileRoute } from "@tanstack/react-router";
import { collectTrends } from "@/lib/trends.functions";

// CRON_SECRET 이 설정돼 있으면 x-cron-secret 헤더 일치를 요구한다(미설정 시 공개).
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("x-cron-secret") === secret;
}

// 크론(매일 새벽) 또는 수동 트리거용 공개 훅.
export const Route = createFileRoute("/api/public/hooks/collect-trends")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
        const body = (await request.json().catch(() => ({}))) as { limit?: number };
        const result = await collectTrends({ data: { limit: body.limit ?? 10 } });
        return Response.json({ ok: true, ...result, ranAt: new Date().toISOString() });
      },
      GET: async ({ request }) => {
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
        const result = await collectTrends({ data: { limit: 10 } });
        return Response.json({ ok: true, ...result, ranAt: new Date().toISOString() });
      },
    },
  },
});
