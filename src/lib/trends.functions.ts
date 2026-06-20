import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { generateText, Output } from "ai";
import { resolveModel, aiAvailable } from "./ai-provider.server";
import { MODELS } from "./ai-models";

type TrendItem = { keyword: string; category: string; score: number };

function admin() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** 후보 키워드 풀: 기존 트렌드 + 등록 상품 카테고리 + 기본 시드.
 *  네이버는 "급상승 검색어"를 주는 공개 API가 없으므로, 후보 풀을
 *  데이터랩 검색 트렌드로 점수화/랭킹하는 방식으로 구현한다. */
async function buildCandidates(
  sb: ReturnType<typeof admin>,
): Promise<{ keyword: string; category: string }[]> {
  const seed: { keyword: string; category: string }[] = [
    { keyword: "쿨링 티셔츠", category: "의류" },
    { keyword: "휴대용 선풍기", category: "계절가전" },
    { keyword: "무선 이어폰", category: "전자기기" },
    { keyword: "캠핑 용품", category: "레저" },
    { keyword: "빅사이즈 원피스", category: "의류" },
    { keyword: "반려동물 자동급식기", category: "반려동물" },
    { keyword: "대용량 텀블러", category: "주방" },
    { keyword: "LED 랜턴", category: "캠핑" },
  ];

  const map = new Map(seed.map((s) => [s.keyword, s]));

  // 기존 트렌드 키워드 재활용
  const { data: prev } = await sb
    .from("trend_keywords")
    .select("keyword, category")
    .order("collected_at", { ascending: false })
    .limit(30);
  for (const r of prev ?? []) {
    if (r.keyword && !map.has(r.keyword))
      map.set(r.keyword, { keyword: r.keyword, category: r.category ?? "기타" });
  }

  // 등록 상품의 카테고리도 후보로
  const { data: prods } = await sb
    .from("products")
    .select("source_name, category")
    .order("created_at", { ascending: false })
    .limit(20);
  for (const p of prods ?? []) {
    const kw = (p.category ?? "").trim();
    if (kw && !map.has(kw)) map.set(kw, { keyword: kw, category: p.category ?? "기타" });
  }

  return Array.from(map.values()).slice(0, 20);
}

/** 네이버 데이터랩 통합검색어 트렌드 API로 후보 키워드를 점수화.
 *  한 요청에 최대 5개 키워드 그룹 → 5개씩 끊어 호출.
 *  ratio 는 요청 내부 상대값(최대 100)이라 청크별로 정규화된다. */
async function scoreWithDataLab(
  candidates: { keyword: string; category: string }[],
  clientId: string,
  clientSecret: string,
): Promise<TrendItem[]> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 28);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const out: TrendItem[] = [];
  for (let i = 0; i < candidates.length; i += 5) {
    const chunk = candidates.slice(i, i + 5);
    try {
      const res = await fetch("https://openapi.naver.com/v1/datalab/search", {
        method: "POST",
        headers: {
          "X-Naver-Client-Id": clientId,
          "X-Naver-Client-Secret": clientSecret,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          startDate: fmt(start),
          endDate: fmt(end),
          timeUnit: "week",
          keywordGroups: chunk.map((c) => ({ groupName: c.keyword, keywords: [c.keyword] })),
        }),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        results?: { title: string; data: { period: string; ratio: number }[] }[];
      };
      for (const r of json.results ?? []) {
        const last = r.data.length ? r.data[r.data.length - 1].ratio : 0;
        const cat = chunk.find((c) => c.keyword === r.title)?.category ?? "기타";
        out.push({ keyword: r.title, category: cat, score: Math.round(last) });
      }
    } catch {
      // 청크 실패는 건너뛴다
    }
  }
  return out;
}

/** 네이버 키가 없을 때 AI 휴리스틱으로 트렌드 키워드를 생성 (source: ai) */
async function aiTrends(): Promise<TrendItem[]> {
  if (!aiAvailable()) return [];
  const model = resolveModel(MODELS.trendFallback); // 트렌드 추정 → Gemini
  const { output } = await generateText({
    model,
    experimental_output: Output.object({
      schema: z.object({
        items: z.array(
          z.object({
            keyword: z.string(),
            category: z.string(),
            score: z.number().min(0).max(100),
          }),
        ),
      }),
    }),
    prompt: `지금 한국 온라인 쇼핑(오픈마켓/스마트스토어)에서 수요가 높은 위탁판매용 상품 키워드 8개를 추정하라.
계절성과 최근 소비 트렌드를 반영. 각 항목: keyword(상품 키워드), category(카테고리), score(0~100 인기 추정 점수).
유명 브랜드명/상표는 제외하고 일반 상품 키워드만.`,
  });
  return (output as { items: TrendItem[] }).items;
}

/** 트렌드 수집 → trend_keywords 갱신. 키 있으면 데이터랩, 없으면 AI 폴백. */
export const collectTrends = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ limit: z.number().int().min(1).max(20).default(10) }).parse(i ?? {}),
  )
  .handler(async ({ data }) => {
    const sb = admin();
    const { data: s } = await sb
      .from("settings")
      .select("naver_client_id, naver_client_secret")
      .eq("id", 1)
      .maybeSingle();

    const clientId = s?.naver_client_id ?? null;
    const clientSecret = s?.naver_client_secret ?? null;

    let items: TrendItem[] = [];
    let source: "datalab" | "ai" = "datalab";

    if (clientId && clientSecret) {
      const candidates = await buildCandidates(sb);
      items = await scoreWithDataLab(candidates, clientId, clientSecret);
    }

    // 데이터랩 실패/미설정 → AI 폴백
    if (items.length === 0) {
      items = await aiTrends();
      source = "ai";
    }

    if (items.length === 0) {
      throw new Error(
        "트렌드 수집 실패: 네이버 키도 없고 AI 키(GEMINI_API_KEY/LOVABLE_API_KEY)도 없습니다",
      );
    }

    // 점수 내림차순 정렬 + 순위 부여
    items.sort((a, b) => b.score - a.score);
    const top = items.slice(0, data.limit);
    const today = new Date().toISOString().slice(0, 10);

    // 오늘자 기존 데이터 비우고 새로 적재
    await sb.from("trend_keywords").delete().eq("collected_at", today);
    const rows = top.map((t, idx) => ({
      keyword: t.keyword,
      rank: idx + 1,
      category: t.category,
      source: source === "datalab" ? "네이버 데이터랩" : "AI 추정",
      trend_score: t.score,
      collected_at: today,
    }));
    const { error } = await sb.from("trend_keywords").insert(rows);
    if (error) throw error;

    await sb.from("activity_log").insert({
      action: "trend_collected",
      target_type: "trend",
      message: `[트렌드] ${rows.length}개 키워드 수집 (${source === "datalab" ? "네이버 데이터랩" : "AI 추정"})`,
      metadata: { source, count: rows.length } as never,
    });

    return { collected: rows.length, source, top: rows.map((r) => r.keyword) };
  });
