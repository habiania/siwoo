import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { calcPricing, type Platform } from "./pricing";

function admin() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function targetMargin(sb: ReturnType<typeof admin>): Promise<number> {
  const { data } = await sb.from("settings").select("target_margin_rate").eq("id", 1).maybeSingle();
  const pct = Number(data?.target_margin_rate ?? 20);
  return pct > 1 ? pct / 100 : pct; // 25(%) → 0.25
}

/** 단일 상품 재가격 책정: 정상가/판매가/예상순이익 갱신 */
export const repriceProduct = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ productId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const sb = admin();
    const { data: p, error } = await sb
      .from("products")
      .select("id, supply_price, shipping_fee, selected_platforms")
      .eq("id", data.productId)
      .maybeSingle();
    if (error) throw error;
    if (!p) throw new Error("상품을 찾을 수 없습니다");

    const margin = await targetMargin(sb);
    const platforms = ((p.selected_platforms as Platform[] | null) ?? []) as Platform[];
    const pricing = calcPricing(p.supply_price, p.shipping_fee ?? 0, platforms, margin);
    const top = pricing.perPlatform.reduce((a, b) => (b.salePrice >= a.salePrice ? b : a));

    const { error: uErr } = await sb
      .from("products")
      .update({
        normal_price: pricing.normalPrice,
        suggested_price: pricing.recommendedSalePrice,
        expected_profit: top.netProfit,
        margin_rate: Math.round(top.netMarginRate * 10000) / 100,
      })
      .eq("id", p.id);
    if (uErr) throw uErr;

    return { productId: p.id, ...pricing };
  });

/** 검수대기/승인 상품 일괄 재가격 책정 */
export const repriceAll = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ limit: z.number().int().min(1).max(500).default(200) }).parse(i ?? {}),
  )
  .handler(async ({ data }) => {
    const sb = admin();
    const margin = await targetMargin(sb);
    const { data: products, error } = await sb
      .from("products")
      .select("id, supply_price, shipping_fee, selected_platforms")
      .in("status", ["pending", "approved", "hold"])
      .limit(data.limit);
    if (error) throw error;

    let updated = 0;
    for (const p of products ?? []) {
      const platforms = ((p.selected_platforms as Platform[] | null) ?? []) as Platform[];
      const pricing = calcPricing(p.supply_price, p.shipping_fee ?? 0, platforms, margin);
      const top = pricing.perPlatform.reduce((a, b) => (b.salePrice >= a.salePrice ? b : a));
      const { error: uErr } = await sb
        .from("products")
        .update({
          normal_price: pricing.normalPrice,
          suggested_price: pricing.recommendedSalePrice,
          expected_profit: top.netProfit,
          margin_rate: Math.round(top.netMarginRate * 10000) / 100,
        })
        .eq("id", p.id);
      if (!uErr) updated++;
    }

    await sb.from("activity_log").insert({
      action: "reprice_all",
      target_type: "product",
      message: `[가격] ${updated}개 상품 재가격 책정 (목표 순이익률 ${Math.round(margin * 100)}%)`,
      metadata: { updated, targetNetMargin: margin } as never,
    });

    return { updated };
  });
