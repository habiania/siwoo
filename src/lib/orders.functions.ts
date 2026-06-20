import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function admin() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// 지수 백오프 재시도
async function withRetry<T>(fn: () => Promise<T>, tries = 3, baseMs = 500): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, baseMs * Math.pow(2, i)));
    }
  }
  throw lastErr;
}

type OrderRow = Database["public"]["Tables"]["orders"]["Row"];

function pick(xml: string, tag: string): string | null {
  const m = xml.match(
    new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`, "i"),
  );
  return m ? m[1].trim() : null;
}

/** 11번가 신규 주문 수집 (실제 주문조회 API). 키 없으면 수집 안 함. */
async function collect11st(sb: ReturnType<typeof admin>): Promise<number> {
  const key = process.env.ELEVENST_API_KEY;
  if (!key) return 0;
  // 11번가 주문 조회: /rest/ordservices/complete (배송요청 주문). EUC-KR XML 응답.
  const res = await withRetry(() =>
    fetch("https://api.11st.co.kr/rest/ordservices/complete", {
      headers: { openapikey: key },
      signal: AbortSignal.timeout(10000),
    }),
  );
  const buf = await res.arrayBuffer();
  let text: string;
  try {
    text = new TextDecoder("euc-kr").decode(buf);
  } catch {
    text = new TextDecoder("utf-8").decode(buf);
  }
  if (!res.ok) throw new Error(`11st 주문조회 HTTP ${res.status}`);

  const blocks = text.match(/<order>[\s\S]*?<\/order>/gi) ?? [];
  let upserted = 0;
  for (const b of blocks) {
    const ordNo = pick(b, "ordNo") ?? pick(b, "orderNo");
    if (!ordNo) continue;
    const prdNo = pick(b, "prdNo");
    const qty = Number((pick(b, "ordQty") ?? "1").replace(/[^\d]/g, "")) || 1;
    const amount =
      Number((pick(b, "ordPrc") ?? pick(b, "ordAmt") ?? "0").replace(/[^\d]/g, "")) || 0;

    // 내부 상품과 매칭 (external_listing_id == prdNo)
    let productId: string | null = null;
    let productName: string | null = pick(b, "prdNm");
    if (prdNo) {
      const { data: pl } = await sb
        .from("platform_listings")
        .select("product_id, platform_title")
        .eq("platform", "11st")
        .eq("external_listing_id", prdNo)
        .maybeSingle();
      productId = pl?.product_id ?? null;
      productName = productName ?? pl?.platform_title ?? null;
    }

    const { error } = await sb.from("orders").upsert(
      {
        platform: "11st",
        market_order_no: ordNo,
        product_id: productId,
        product_name: productName,
        quantity: qty,
        buyer_name: pick(b, "ordNm"),
        buyer_phone: pick(b, "ordPrtblTelNo") ?? pick(b, "ordTelNo"),
        address: pick(b, "rcvrBaseAddr"),
        order_amount: amount,
        status: "collected",
      },
      { onConflict: "platform,market_order_no", ignoreDuplicates: true },
    );
    if (!error) upserted++;
  }
  return upserted;
}

/** 공급사(도매매) 발주 — collected → ordered. 키 없으면 보류. */
async function placeSupplierOrder(
  sb: ReturnType<typeof admin>,
  order: OrderRow,
  domemeKey: string,
): Promise<boolean> {
  if (!order.product_id) return false;
  const { data: product } = await sb
    .from("products")
    .select("source_id")
    .eq("id", order.product_id)
    .maybeSingle();
  if (!product?.source_id) return false;

  // 도매매 발주 API (실제 엔드포인트/파라미터는 발급 플랜에 맞춰 조정).
  const url =
    `https://domeggook.com/ssl/api/?ver=4.1&mode=addOrder&aid=${encodeURIComponent(domemeKey)}` +
    `&no=${encodeURIComponent(product.source_id)}&qty=${order.quantity}` +
    `&rcvr=${encodeURIComponent(order.buyer_name ?? "")}` +
    `&tel=${encodeURIComponent(order.buyer_phone ?? "")}` +
    `&addr=${encodeURIComponent(order.address ?? "")}`;
  const res = await withRetry(() => fetch(url, { signal: AbortSignal.timeout(10000) }));
  const xml = await res.text();
  const supplierOrderNo = pick(xml, "orderNo") ?? pick(xml, "no");
  if (!res.ok || !supplierOrderNo) throw new Error(`도매매 발주 실패: ${xml.slice(0, 200)}`);

  await sb
    .from("orders")
    .update({
      status: "ordered",
      supplier_order_no: supplierOrderNo,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id);
  return true;
}

/** 공급사 송장 조회 → 마켓 송장 입력 (ordered/shipped → invoiced). 키 없으면 보류. */
async function pushTracking(
  sb: ReturnType<typeof admin>,
  order: OrderRow,
  domemeKey: string,
): Promise<boolean> {
  if (!order.supplier_order_no) return false;
  // 1) 도매매 송장 조회
  const url =
    `https://domeggook.com/ssl/api/?ver=4.1&mode=getOrderInvoice&aid=${encodeURIComponent(domemeKey)}` +
    `&orderNo=${encodeURIComponent(order.supplier_order_no)}`;
  const res = await withRetry(() => fetch(url, { signal: AbortSignal.timeout(10000) }));
  const xml = await res.text();
  const invoice = pick(xml, "invoice") ?? pick(xml, "trackingNo");
  if (!invoice) return false; // 아직 송장 미발급

  // 2) 마켓 송장 입력 (11번가)
  const key = process.env.ELEVENST_API_KEY;
  if (order.platform === "11st" && key) {
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<SendGoods><ordNo>${order.market_order_no}</ordNo><dlvNo>${invoice}</dlvNo><dlvEtprsCd>00045</dlvEtprsCd></SendGoods>`;
    const r = await withRetry(() =>
      fetch("https://api.11st.co.kr/rest/deliveryservices/delivery", {
        method: "POST",
        headers: { openapikey: key, "Content-Type": "text/xml; charset=UTF-8" },
        body,
        signal: AbortSignal.timeout(10000),
      }),
    );
    if (!r.ok) throw new Error(`11st 송장입력 HTTP ${r.status}`);
  }

  await sb
    .from("orders")
    .update({ status: "invoiced", tracking_no: invoice, updated_at: new Date().toISOString() })
    .eq("id", order.id);
  return true;
}

/** 주문 자동화 1회 실행: 수집 → 발주 → 송장. 키 없는 단계는 건너뛴다(보류). */
export const processOrders = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({}).parse(i ?? {}))
  .handler(async () => {
    const sb = admin();
    const { data: s } = await sb
      .from("settings")
      .select("domemae_api_key")
      .eq("id", 1)
      .maybeSingle();
    const domemeKey = s?.domemae_api_key ?? null;

    const counts = { collected: 0, ordered: 0, invoiced: 0, failed: 0, pendingKeys: 0 };

    // 1) 수집 (11번가)
    try {
      counts.collected += await collect11st(sb);
    } catch (e) {
      counts.failed++;
      await sb.from("activity_log").insert({
        action: "order_collect_failed",
        target_type: "order",
        message: `[주문수집] 11번가 실패: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
    if (!process.env.ELEVENST_API_KEY) counts.pendingKeys++;

    // 2) 발주 (도매매)
    if (domemeKey) {
      const { data: collected } = await sb
        .from("orders")
        .select("*")
        .eq("status", "collected")
        .limit(50);
      for (const o of collected ?? []) {
        try {
          if (await placeSupplierOrder(sb, o, domemeKey)) counts.ordered++;
        } catch (e) {
          counts.failed++;
          await sb
            .from("orders")
            .update({ error_message: e instanceof Error ? e.message : String(e) })
            .eq("id", o.id);
        }
      }

      // 3) 송장 (도매매 → 마켓)
      const { data: ordered } = await sb
        .from("orders")
        .select("*")
        .in("status", ["ordered", "shipped"])
        .limit(50);
      for (const o of ordered ?? []) {
        try {
          if (await pushTracking(sb, o, domemeKey)) counts.invoiced++;
        } catch (e) {
          counts.failed++;
          await sb
            .from("orders")
            .update({ error_message: e instanceof Error ? e.message : String(e) })
            .eq("id", o.id);
        }
      }
    } else {
      counts.pendingKeys++;
    }

    await sb.from("activity_log").insert({
      action: "orders_processed",
      target_type: "order",
      message: `[주문] 수집 ${counts.collected} · 발주 ${counts.ordered} · 송장 ${counts.invoiced} · 실패 ${counts.failed}`,
      metadata: counts as never,
    });

    return counts;
  });
