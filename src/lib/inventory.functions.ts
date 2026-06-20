import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { generateText, Output } from "ai";
import { resolveModel, aiAvailable } from "./ai-provider.server";
import { MODELS } from "./ai-models";

type Change = {
  id: string;
  name: string;
  prevStock: number;
  newStock: number;
  prevPrice: number;
  newPrice: number;
  statusFrom: string;
  statusTo: string;
};

/** 재고/가격 변동 묶음을 Gemini로 해석해 상품별 조치(raise/pause/hold/keep)를 추천. */
async function analyzeChanges(
  changes: Change[],
): Promise<{ summary: string; items: { id: string; action: string; reason: string }[] } | null> {
  if (changes.length === 0 || !aiAvailable()) return null;
  try {
    const model = resolveModel(MODELS.inventoryAnalysis);
    const { output } = await generateText({
      model,
      experimental_output: Output.object({
        schema: z.object({
          summary: z.string(),
          items: z.array(
            z.object({
              id: z.string(),
              action: z.enum(["raise_price", "pause", "hold", "keep", "restock_alert"]),
              reason: z.string(),
            }),
          ),
        }),
      }),
      prompt: `너는 위탁판매 재고 운영 분석가다. 도매매 공급가/재고 변동 목록을 보고
각 상품에 대한 조치를 추천하라.
- 공급가가 크게 오르면 마진 보호를 위해 raise_price 또는 pause
- 재고가 0이면 pause, 재고가 적으면 restock_alert
- 변동이 미미하면 keep
- 애매하면 hold (관리자 검수)

변동 목록(JSON):
${JSON.stringify(changes)}

items[].id 는 위 목록의 id 를 그대로 사용. reason 은 한 문장 한국어. summary 는 전체 요약 한 문장.`,
    });
    return output as { summary: string; items: { id: string; action: string; reason: string }[] };
  } catch {
    return null;
  }
}

function admin() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function pick(xml: string, tag: string): string | null {
  const m = xml.match(
    new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`, "i"),
  );
  return m ? m[1].trim() : null;
}

/** 도매매 단일 상품 현재 재고/공급가 조회. 실패 시 null. */
async function domeItemView(
  sourceId: string,
  apiKey: string,
): Promise<{ price: number; stock: number } | null> {
  const url =
    `https://domeggook.com/ssl/api/?ver=4.1&mode=getItemView&aid=${encodeURIComponent(apiKey)}` +
    `&no=${encodeURIComponent(sourceId)}&om=xml`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const xml = await res.text();
    const price = Number((pick(xml, "price") ?? "").replace(/[^\d]/g, ""));
    const stock = Number((pick(xml, "qty") ?? pick(xml, "unit") ?? "").replace(/[^\d]/g, ""));
    if (Number.isNaN(price) && Number.isNaN(stock)) return null;
    return { price: price || 0, stock: Number.isNaN(stock) ? 0 : stock };
  } catch {
    return null;
  }
}

/** 추적 대상 상품의 도매매 재고/공급가를 동기화.
 *  - 재고 0 → status=sold_out, 재고 회복 → 다시 approved
 *  - 공급가 변동 시 auto_price_update 면 판매가 자동 재계산, 아니면 가격만 보존 후 보류 */
export const syncInventory = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ limit: z.number().int().min(1).max(200).default(100) }).parse(i ?? {}),
  )
  .handler(async ({ data }) => {
    const sb = admin();

    const { data: s } = await sb
      .from("settings")
      .select("domemae_api_key, auto_price_update, target_margin_rate")
      .eq("id", 1)
      .maybeSingle();
    const apiKey = s?.domemae_api_key ?? null;
    if (!apiKey) {
      throw new Error("도매매 API 키가 설정되지 않았습니다 (설정 → 도매매 API 키)");
    }
    const autoPrice = s?.auto_price_update ?? false;
    const margin = Number(s?.target_margin_rate ?? 25);

    // source_id 가 있고 승인/판매중/품절 상태인 상품만 추적
    const { data: products, error } = await sb
      .from("products")
      .select(
        "id, source_id, source_name, supply_price, suggested_price, stock_qty, shipping_fee, status",
      )
      .not("source_id", "is", null)
      .in("status", ["approved", "sold_out", "paused", "pending"])
      .limit(data.limit);
    if (error) throw error;

    const counts = {
      checked: 0,
      stockChanged: 0,
      priceChanged: 0,
      soldOut: 0,
      restocked: 0,
      unreachable: 0,
    };
    const changes: Change[] = [];

    for (const p of products ?? []) {
      const view = await domeItemView(p.source_id!, apiKey);
      counts.checked++;
      if (!view) {
        counts.unreachable++;
        continue;
      }

      const stockChanged = view.stock !== p.stock_qty;
      const priceChanged = view.price > 0 && view.price !== p.supply_price;
      if (!stockChanged && !priceChanged) continue;

      const update: Database["public"]["Tables"]["products"]["Update"] = {};
      let nextStatus = p.status;

      if (stockChanged) {
        update.stock_qty = view.stock;
        counts.stockChanged++;
        if (view.stock === 0 && p.status !== "sold_out") {
          nextStatus = "sold_out";
          counts.soldOut++;
        } else if (view.stock > 0 && p.status === "sold_out") {
          nextStatus = "approved";
          counts.restocked++;
        }
      }

      if (priceChanged) {
        update.supply_price = view.price;
        counts.priceChanged++;
        if (autoPrice) {
          const suggested =
            Math.round((view.price * (1 + margin / 100) + (p.shipping_fee ?? 0)) / 100) * 100;
          update.suggested_price = suggested;
          update.expected_profit = suggested - view.price - (p.shipping_fee ?? 0);
        } else if (p.status === "approved") {
          // 자동 가격수정 OFF → 관리자 검수 대기로 보류
          nextStatus = "hold";
        }
      }

      update.status = nextStatus as never;
      await sb.from("products").update(update).eq("id", p.id);

      changes.push({
        id: p.id,
        name: p.source_name,
        prevStock: p.stock_qty,
        newStock: view.stock,
        prevPrice: p.supply_price,
        newPrice: view.price,
        statusFrom: p.status,
        statusTo: nextStatus,
      });

      await sb.from("inventory_logs").insert({
        product_id: p.id,
        event_type: stockChanged && priceChanged ? "stock_price" : stockChanged ? "stock" : "price",
        prev_stock: p.stock_qty,
        new_stock: view.stock,
        prev_price: p.supply_price,
        new_price: view.price,
        message:
          [
            stockChanged ? `재고 ${p.stock_qty}→${view.stock}` : null,
            priceChanged ? `공급가 ${p.supply_price}→${view.price}` : null,
            nextStatus !== p.status ? `상태 ${p.status}→${nextStatus}` : null,
          ]
            .filter(Boolean)
            .join(" · ") || "변동",
      });
    }

    await sb.from("activity_log").insert({
      action: "inventory_synced",
      target_type: "inventory",
      message: `[재고] ${counts.checked}건 점검 · 재고변동 ${counts.stockChanged} · 가격변동 ${counts.priceChanged} · 품절 ${counts.soldOut}`,
      metadata: counts as never,
    });

    // Gemini 분석: 변동 묶음을 해석해 상품별 조치 추천 (코멘트만, 자동 적용 X)
    const analysis = await analyzeChanges(changes);
    if (analysis) {
      await sb.from("activity_log").insert({
        action: "inventory_ai_analysis",
        target_type: "inventory",
        message: `[재고 AI] ${analysis.summary}`,
        metadata: { items: analysis.items } as never,
      });
    }

    return {
      ...counts,
      aiSummary: analysis?.summary ?? null,
      recommendations: analysis?.items ?? [],
    };
  });
