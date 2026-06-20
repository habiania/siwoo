import { createFileRoute } from "@tanstack/react-router";
import { runDailyPipeline } from "@/lib/pipeline.functions";

// CRON_SECRET 이 설정돼 있으면 x-cron-secret 헤더 일치를 요구한다(미설정 시 공개).
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("x-cron-secret") === secret;
}

// 매일 새벽 1회 크론으로 호출 → 전체 자동화 파이프라인 실행.
export const Route = createFileRoute("/api/public/hooks/daily-pipeline")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
        const result = await runDailyPipeline({ data: {} });
        return Response.json(result);
      },
      GET: async ({ request }) => {
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
        const result = await runDailyPipeline({ data: {} });
        return Response.json(result);
      },
    },
  },
});
