import { createFileRoute } from "@tanstack/react-router";
import { processOrders } from "@/lib/orders.functions";

// CRON_SECRET 이 설정돼 있으면 x-cron-secret 헤더 일치를 요구한다(미설정 시 공개).
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("x-cron-secret") === secret;
}

// 예: 1시간마다 크론 호출 → 주문 수집/발주/송장 처리.
export const Route = createFileRoute("/api/public/hooks/process-orders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
        const result = await processOrders({ data: {} });
        return Response.json({ ok: true, ...result, ranAt: new Date().toISOString() });
      },
      GET: async ({ request }) => {
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
        const result = await processOrders({ data: {} });
        return Response.json({ ok: true, ...result, ranAt: new Date().toISOString() });
      },
    },
  },
});
