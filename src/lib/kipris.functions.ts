import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { generateText, Output } from "ai";
import { resolveModel, aiAvailable } from "./ai-provider.server";
import { MODELS } from "./ai-models";

type Risk = "safe" | "caution" | "danger";

/** 단어 단위 토큰 추출 (한/영, 2자 이상) */
function extractTokens(name: string): string[] {
  const cleaned = name
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^가-힣A-Za-z0-9\s]/g, " ");
  const tokens = cleaned.split(/\s+/).filter((t) => t.length >= 2);
  // 너무 흔한 단어 제거
  const stop = new Set([
    "남성",
    "여성",
    "아동",
    "무료배송",
    "특가",
    "세트",
    "정품",
    "박스",
    "사이즈",
    "컬러",
    "new",
    "NEW",
    "best",
    "BEST",
    "대용량",
    "미니",
    "프리미엄",
    "행사",
    "무배",
    "당일발송",
  ]);
  return Array.from(new Set(tokens.filter((t) => !stop.has(t)))).slice(0, 6);
}

/** KIPRIS 오픈API 호출 (실키 있을 때) */
async function kiprisLookup(token: string, serviceKey: string): Promise<number> {
  const url =
    `http://plus.kipris.or.kr/openapi/rest/KpatTrademarkInfoSearchService/trademarkSearchInfo` +
    `?searchString=${encodeURIComponent(token)}&ServiceKey=${encodeURIComponent(serviceKey)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return -1;
    const xml = await res.text();
    const m = xml.match(/<totalCount>(\d+)<\/totalCount>/i) ?? xml.match(/<count>(\d+)<\/count>/i);
    return m ? Number(m[1]) : 0;
  } catch {
    return -1;
  }
}

/** AI 휴리스틱 폴백 */
async function aiHeuristic(name: string): Promise<{ risk: Risk; reason: string; hits: string[] }> {
  if (!aiAvailable()) return { risk: "safe", reason: "검사 불가 (AI 키 미설정)", hits: [] };
  const model = resolveModel(MODELS.trademarkHeuristic); // 상표 휴리스틱 → Gemini
  const { output } = await generateText({
    model,
    experimental_output: Output.object({
      schema: z.object({
        risk: z.enum(["safe", "caution", "danger"]),
        reason: z.string(),
        hits: z.array(z.string()),
      }),
    }),
    prompt: `한국 상표권 침해 위험 판단. 상품명: "${name}"
- 유명 브랜드(나이키/샤넬/디즈니/뽀로로/카카오 등)나 캐릭터/로고 명칭이 포함되면 danger
- 상표로 보이는 고유명사가 의심스럽게 포함되면 caution
- 일반명사 위주면 safe
hits 에는 위험 토큰만 나열.`,
  });
  return output as { risk: Risk; reason: string; hits: string[] };
}

function admin() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** 단일 상품명 상표 검사 */
export const checkTrademark = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ name: z.string().min(1) }).parse(i))
  .handler(async ({ data }) => {
    const sb = admin();
    const { data: s } = await sb
      .from("settings")
      .select("kipris_api_key")
      .eq("id", 1)
      .maybeSingle();
    const apiKey = s?.kipris_api_key ?? null;

    if (apiKey) {
      const tokens = extractTokens(data.name);
      const hits: { token: string; count: number }[] = [];
      for (const t of tokens) {
        const c = await kiprisLookup(t, apiKey);
        if (c > 0) hits.push({ token: t, count: c });
      }
      const top = hits.sort((a, b) => b.count - a.count)[0];
      let risk: Risk = "safe";
      let reason = "유사 상표 없음";
      if (top) {
        if (top.count >= 50) {
          risk = "danger";
          reason = `KIPRIS 등록 상표 "${top.token}" 약 ${top.count}건 — 침해 위험 매우 높음`;
        } else if (top.count >= 5) {
          risk = "caution";
          reason = `KIPRIS 등록 상표 "${top.token}" ${top.count}건 — 주의 필요`;
        }
      }
      return { risk, reason, hits, source: "kipris" as const };
    }

    const h = await aiHeuristic(data.name);
    return {
      risk: h.risk,
      reason: `(AI 휴리스틱) ${h.reason}`,
      hits: h.hits.map((t) => ({ token: t, count: 0 })),
      source: "ai" as const,
    };
  });

/** 검수 대기 상품 전체 스캔 + 자동 상태 변경
 *  danger → rejected (삭제), caution → hold (보류), safe → 유지 */
export const scanPendingProducts = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ limit: z.number().int().min(1).max(200).default(50) }).parse(i ?? {}),
  )
  .handler(async ({ data }) => {
    const sb = admin();
    const { data: products, error } = await sb
      .from("products")
      .select("id, source_name, status")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw error;

    const counts = { safe: 0, caution: 0, danger: 0, processed: 0 };
    for (const p of products ?? []) {
      const r = await checkTrademark({ data: { name: p.source_name } });
      counts.processed++;
      counts[r.risk]++;
      const nextStatus =
        r.risk === "danger" ? "rejected" : r.risk === "caution" ? "hold" : "pending";
      await sb
        .from("products")
        .update({
          trademark_risk: r.risk as never,
          risk_reason: r.reason,
          trademark_hits: r.hits as never,
          trademark_checked_at: new Date().toISOString(),
          status: nextStatus as never,
        })
        .eq("id", p.id);

      if (r.risk !== "safe") {
        await sb.from("activity_log").insert({
          action: r.risk === "danger" ? "trademark_rejected" : "trademark_hold",
          target_type: "product",
          target_id: p.id,
          message: `[KIPRIS] ${p.source_name} → ${nextStatus} (${r.reason})`,
          metadata: { risk: r.risk, hits: r.hits, source: r.source } as never,
        });
      }
    }
    return counts;
  });
