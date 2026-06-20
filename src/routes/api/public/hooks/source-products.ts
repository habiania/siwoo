import { createFileRoute } from "@tanstack/react-router";
import { sourceProducts } from "@/lib/sourcing.functions";

// CRON_SECRET 이 설정돼 있으면 x-cron-secret 헤더 일치를 요구한다(미설정 시 공개).
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("x-cron-secret") === secret;
}

// 크론(매일 새벽, 트렌드 수집 직후) 또는 수동 트리거용 공개 훅.
export const Route = createFileRoute("/api/public/hooks/source-products")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
        const body = (await request.json().catch(() => ({}))) as {
          keywordCount?: number;
          perKeyword?: number;
        };
        const result = await sourceProducts({
          data: { keywordCount: body.keywordCount ?? 3, perKeyword: body.perKeyword ?? 3 },
        });
        return Response.json({ ok: true, ...result, ranAt: new Date().toISOString() });
      },
      GET: async ({ request }) => {
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
        const result = await sourceProducts({ data: { keywordCount: 3, perKeyword: 3 } });
        return Response.json({ ok: true, ...result, ranAt: new Date().toISOString() });
      },
    },
  },
});
