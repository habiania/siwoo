import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function admin() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// KC 인증이 필수인 카테고리/상품 키워드 (전기용품안전관리법·어린이제품안전특별법 등).
// 키워드가 상품명/카테고리에 포함되면 KC 필수로 판정한다.
const KC_REQUIRED_KEYWORDS: { group: string; words: string[] }[] = [
  {
    group: "전기·전자",
    words: [
      "선풍기",
      "손선풍기",
      "충전기",
      "보조배터리",
      "배터리",
      "어댑터",
      "led",
      "전기",
      "전동",
      "히터",
      "전기장판",
      "온열",
      "가습기",
      "제습기",
      "전기포트",
      "토스터",
      "안마",
      "마사지건",
      "이어폰",
      "헤드폰",
      "스피커",
    ],
  },
  {
    group: "어린이제품",
    words: ["유아", "아동", "어린이", "완구", "장난감", "유모차", "카시트", "젖병", "기저귀"],
  },
  { group: "생활용품", words: ["led마스크", "미용기기", "전자담배"] },
];

function detectKc(text: string): { required: boolean; group: string | null; matched: string[] } {
  const lower = text.toLowerCase();
  const matched: string[] = [];
  let group: string | null = null;
  for (const g of KC_REQUIRED_KEYWORDS) {
    for (const w of g.words) {
      if (lower.includes(w.toLowerCase())) {
        matched.push(w);
        group ??= g.group;
      }
    }
  }
  return { required: matched.length > 0, group, matched };
}

/** 단일 상품 KC 판정. 필수인데 KC번호 없으면 등록 차단(hold). */
export const checkKc = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ productId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const sb = admin();
    const { data: p, error } = await sb
      .from("products")
      .select("id, source_name, category, kc_number, status")
      .eq("id", data.productId)
      .maybeSingle();
    if (error) throw error;
    if (!p) throw new Error("상품을 찾을 수 없습니다");

    const det = detectKc(`${p.source_name} ${p.category ?? ""}`);
    const hasNumber = !!(p.kc_number && p.kc_number.trim());
    const certified = det.required ? hasNumber : true;
    const block = det.required && !hasNumber;

    const update: Database["public"]["Tables"]["products"]["Update"] = {
      kc_required: det.required,
      kc_certified: certified,
    };
    if (block && p.status !== "rejected") update.status = "hold";

    await sb.from("products").update(update).eq("id", p.id);

    if (block) {
      await sb.from("activity_log").insert({
        action: "kc_blocked",
        target_type: "product",
        target_id: p.id,
        message: `[KC] ${p.source_name} → 등록 차단 (KC 필수: ${det.group}, 번호 없음)`,
        metadata: { group: det.group, matched: det.matched } as never,
      });
    }

    return {
      productId: p.id,
      required: det.required,
      certified,
      blocked: block,
      group: det.group,
      matched: det.matched,
    };
  });

/** 검수 대기 상품 일괄 KC 스캔 */
export const scanKcPending = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ limit: z.number().int().min(1).max(200).default(100) }).parse(i ?? {}),
  )
  .handler(async ({ data }) => {
    const sb = admin();
    const { data: products, error } = await sb
      .from("products")
      .select("id, source_name, category, kc_number, status")
      .eq("status", "pending")
      .limit(data.limit);
    if (error) throw error;

    const counts = { checked: 0, required: 0, blocked: 0, certified: 0 };
    for (const p of products ?? []) {
      const det = detectKc(`${p.source_name} ${p.category ?? ""}`);
      const hasNumber = !!(p.kc_number && p.kc_number.trim());
      const certified = det.required ? hasNumber : true;
      const block = det.required && !hasNumber;
      counts.checked++;
      if (det.required) counts.required++;
      if (certified) counts.certified++;
      if (block) counts.blocked++;

      const update: Database["public"]["Tables"]["products"]["Update"] = {
        kc_required: det.required,
        kc_certified: certified,
      };
      if (block) update.status = "hold";
      await sb.from("products").update(update).eq("id", p.id);

      if (block) {
        await sb.from("activity_log").insert({
          action: "kc_blocked",
          target_type: "product",
          target_id: p.id,
          message: `[KC] ${p.source_name} → 등록 차단 (${det.group})`,
          metadata: { group: det.group, matched: det.matched } as never,
        });
      }
    }

    return counts;
  });
