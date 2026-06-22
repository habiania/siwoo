import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Platform = "toss" | "11st" | "gmarket" | "auction";
type PlatformResult = {
  platform: Platform;
  status: "success" | "failed" | "skipped";
  external_listing_id?: string;
  error_message?: string;
};

type ProductRow = {
  id: string;
  source_name: string;
  category: string | null;
  suggested_price: number;
  stock_qty: number;
  thumbnail_url: string | null;
  description: string | null;
};

type Keys = { elevenst: string | null };

async function loadKeys(
  supabase: import("@supabase/supabase-js").SupabaseClient,
): Promise<Keys> {
  // 마켓 API 키는 설정 페이지(settings 테이블)에서 읽는다. (env 아님)
  const { data: s } = await supabase
    .from("settings")
    .select("api_11st_key")
    .eq("id", 1)
    .maybeSingle();
  return { elevenst: (s?.api_11st_key as string | null) || null };
}

async function listOn11st(
  product: ProductRow,
  key: string | null,
  dryRun: boolean,
): Promise<PlatformResult> {
  if (!key)
    return {
      platform: "11st",
      status: "skipped",
      error_message: "11번가 API 키 미설정 (설정 → 11번가 API 키)",
    };
  try {
    // 11번가 오픈 API: /rest/prodservices/product. 응답은 EUC-KR XML이며
    // 검증 오류여도 HTTP 200을 반환하므로 본문의 resultCode/message 를 파싱.
    // 브랜드 코드 미보유 → <brand> 자체 입력 + 자체등록 플래그.
    // CDATA 종료 시퀀스(]]>)가 값에 포함되면 XML이 깨지거나 주입될 수 있어 이스케이프한다.
    const cdata = (v: string) => v.replace(/]]>/g, "]]]]><![CDATA[>");
    const brand = cdata((product.category ?? "기타").slice(0, 30));
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Product>
  <selMthdCd>01</selMthdCd>
  <dispCtgrNo>1001</dispCtgrNo>
  <prdNm><![CDATA[${cdata(product.source_name)}]]></prdNm>
  <brand><![CDATA[${brand}]]></brand>
  <apiPrdAttrBrandCd>-1</apiPrdAttrBrandCd>
  <prdImage01>${encodeURI(product.thumbnail_url ?? "")}</prdImage01>
  <htmlDetail><![CDATA[${cdata(product.description ?? product.source_name)}]]></htmlDetail>
  <selPrc>${product.suggested_price}</selPrc>
  <prdStckQty>${product.stock_qty}</prdStckQty>
</Product>`;
    // DRY-RUN: payload 까지만 검증하고 실제 등록 요청은 보내지 않는다.
    if (dryRun) {
      return {
        platform: "11st",
        status: "skipped",
        error_message: `DRY-RUN: 등록 미실행 · payload ${xml.length}자 생성 OK (selPrc=${product.suggested_price}, qty=${product.stock_qty})`,
      };
    }
    const res = await fetch("https://api.11st.co.kr/rest/prodservices/product", {
      method: "POST",
      headers: { openapikey: key, "Content-Type": "text/xml; charset=UTF-8" },
      body: xml,
    });
    const buf = await res.arrayBuffer();
    // EUC-KR 디코딩 (workerd에 내장)
    let text: string;
    try {
      text = new TextDecoder("euc-kr").decode(buf);
    } catch {
      text = new TextDecoder("utf-8").decode(buf);
    }
    if (!res.ok) {
      return {
        platform: "11st",
        status: "failed",
        error_message: `HTTP ${res.status}: ${text.slice(0, 500)}`,
      };
    }
    // 11번가는 검증 오류에도 200을 반환하므로 본문의 resultCode/ClientMessage 를 확인
    const codeMatch = text.match(/<resultCode>(\d+)<\/resultCode>/);
    const msgMatch = text.match(/<message>([\s\S]*?)<\/message>/);
    const idMatch = text.match(/<prdNo>(\d+)<\/prdNo>/);
    const isError = (codeMatch && codeMatch[1] !== "00" && codeMatch[1] !== "200") || !!msgMatch;
    if (isError && !idMatch) {
      return {
        platform: "11st",
        status: "failed",
        error_message: `code=${codeMatch?.[1] ?? "?"} · ${(msgMatch?.[1] ?? text).slice(0, 400)}`,
      };
    }
    return {
      platform: "11st",
      status: "success",
      external_listing_id: idMatch?.[1] ?? `11st_${Date.now()}`,
    };
  } catch (e) {
    return {
      platform: "11st",
      status: "failed",
      error_message: e instanceof Error ? e.message : String(e),
    };
  }
}

async function listOnToss(product: ProductRow): Promise<PlatformResult> {
  const accessKey = process.env.TOSS_ACCESS_KEY;
  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!accessKey || !secretKey) {
    return { platform: "toss", status: "skipped", error_message: "TOSS 키 미설정" };
  }
  // 토스커머스는 공개된 셀러 상품등록 REST API가 없어 자동 등록이 불가능합니다.
  // 키는 저장하되 등록 단계는 skipped 로 기록 — 토스 파트너 콘솔에서 받은
  // 실제 엔드포인트가 확인되면 fetch 호출로 교체하면 됩니다.
  void accessKey;
  void secretKey;
  void product;
  return {
    platform: "toss",
    status: "skipped",
    error_message:
      "토스커머스 공식 셀러 등록 API 미공개 — 파트너 콘솔 수동 등록 필요 (키는 저장됨)",
  };
}

function skipEsm(platform: "gmarket" | "auction"): PlatformResult {
  return { platform, status: "skipped", error_message: "ESM 판매자 승인 대기 중" };
}

// dryRun: env ELEVENST_DRY_RUN=true 또는 호출 시 명시. 11번가만 실제 등록을 수행하므로
// dry-run 도 11번가에만 의미가 있다.
function isDryRun(override?: boolean): boolean {
  if (typeof override === "boolean") return override;
  return process.env.ELEVENST_DRY_RUN === "true";
}

async function runPlatform(
  platform: Platform,
  product: ProductRow,
  keys: Keys,
  dryRun: boolean,
): Promise<PlatformResult> {
  if (platform === "11st") return listOn11st(product, keys.elevenst, dryRun);
  if (platform === "toss") return listOnToss(product);
  return skipEsm(platform);
}

async function recordResult(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  product: ProductRow,
  r: PlatformResult,
) {
  await supabase.from("platform_listings").upsert(
    {
      product_id: product.id,
      platform: r.platform,
      platform_title: product.source_name,
      thumbnail_url: product.thumbnail_url,
      price: product.suggested_price,
      is_listed: r.status === "success",
      status: r.status,
      external_listing_id: r.external_listing_id ?? null,
      error_message: r.error_message ?? null,
      listed_at: r.status === "success" ? new Date().toISOString() : null,
    },
    { onConflict: "product_id,platform" },
  );
  await supabase.from("activity_log").insert({
    action:
      r.status === "success"
        ? "platform_list_success"
        : r.status === "skipped"
          ? "platform_list_skipped"
          : "platform_list_failed",
    target_type: "product",
    target_id: product.id,
    message: `[${r.platform}] ${r.status}${r.error_message ? ` · ${r.error_message}` : ""}${r.external_listing_id ? ` · ${r.external_listing_id}` : ""}`,
    metadata: {
      platform: r.platform,
      status: r.status,
      external_listing_id: r.external_listing_id ?? null,
      error_message: r.error_message ?? null,
    },
  });
}

export const approveProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ productId: z.string().uuid(), dryRun: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const dryRun = isDryRun(data.dryRun);

    // 관리자만 승인 가능
    const { data: roleRow } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!roleRow) throw new Error("관리자 권한이 필요합니다");

    const { data: product, error: pErr } = await supabase
      .from("products")
      .select("id, source_name, category, suggested_price, stock_qty, thumbnail_url, description")
      .eq("id", data.productId)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!product) throw new Error("상품을 찾을 수 없습니다");

    // 1) 상태 변경 (dry-run 은 상태를 바꾸지 않고 등록 시뮬레이션만)
    if (!dryRun) {
      const { error: uErr } = await supabase
        .from("products")
        .update({ status: "approved" })
        .eq("id", product.id);
      if (uErr) throw uErr;
    }

    // 2) 플랫폼별 등록 시도 (개별 try/catch는 함수 내부)
    const keys = await loadKeys(supabase);
    const results = await Promise.all([
      runPlatform("toss", product as ProductRow, keys, dryRun),
      runPlatform("11st", product as ProductRow, keys, dryRun),
      runPlatform("gmarket", product as ProductRow, keys, dryRun),
      runPlatform("auction", product as ProductRow, keys, dryRun),
    ]);

    // 3) platform_listings upsert + activity_log 기록
    for (const r of results) await recordResult(supabase, product as ProductRow, r);

    return { productId: product.id, results };
  });

// 실패한 플랫폼만 재시도. platform 미지정 시 status='failed' 인 모든 플랫폼 재시도.
export const retryPlatformListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        productId: z.string().uuid(),
        platform: z.enum(["toss", "11st", "gmarket", "auction"]).optional(),
        dryRun: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const dryRun = isDryRun(data.dryRun);
    const { data: roleRow } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!roleRow) throw new Error("관리자 권한이 필요합니다");

    const { data: product, error: pErr } = await supabase
      .from("products")
      .select("id, source_name, category, suggested_price, stock_qty, thumbnail_url, description")
      .eq("id", data.productId)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!product) throw new Error("상품을 찾을 수 없습니다");

    // 재시도 대상 결정
    let targets: Platform[];
    if (data.platform) {
      targets = [data.platform];
    } else {
      const { data: rows } = await supabase
        .from("platform_listings")
        .select("platform, status")
        .eq("product_id", product.id)
        .eq("status", "failed");
      targets = (rows ?? []).map((r) => r.platform as Platform);
    }

    if (targets.length === 0) return { productId: product.id, results: [] };

    const keys = await loadKeys(supabase);
    const results = await Promise.all(
      targets.map((p) => runPlatform(p, product as ProductRow, keys, dryRun)),
    );
    for (const r of results) await recordResult(supabase, product as ProductRow, r);
    return { productId: product.id, results };
  });

// 여러 (productId, platform) 조합을 한 번에 재시도
export const retryPlatformListingsBulk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        items: z
          .array(
            z.object({
              productId: z.string().uuid(),
              platform: z.enum(["toss", "11st", "gmarket", "auction"]),
            }),
          )
          .min(1),
        dryRun: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const dryRun = isDryRun(data.dryRun);
    const { data: roleRow } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!roleRow) throw new Error("관리자 권한이 필요합니다");

    const productIds = Array.from(new Set(data.items.map((i) => i.productId)));
    const { data: products, error: pErr } = await supabase
      .from("products")
      .select("id, source_name, category, suggested_price, stock_qty, thumbnail_url, description")
      .in("id", productIds);
    if (pErr) throw pErr;
    const byId = new Map((products ?? []).map((p) => [p.id, p as ProductRow]));
    const keys = await loadKeys(supabase);

    const results = await Promise.all(
      data.items.map(async (it) => {
        const product = byId.get(it.productId);
        if (!product) {
          return {
            productId: it.productId,
            platform: it.platform,
            status: "failed" as const,
            error_message: "상품 없음",
          };
        }
        const r = await runPlatform(it.platform, product, keys, dryRun);
        await recordResult(supabase, product, r);
        return { productId: it.productId, ...r };
      }),
    );
    return { results };
  });
