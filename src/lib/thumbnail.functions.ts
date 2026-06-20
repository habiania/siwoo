import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const BUCKET = "product-thumbnails";

function admin() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Lovable AI 이미지 게이트웨이로 정사각 마스터 이미지 생성 → bytes 반환 */
async function generateMaster(prompt: string, key: string): Promise<Uint8Array> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-image",
      prompt: `Korean e-commerce product thumbnail, square 1:1, clean white background, centered product, bold Korean promotional text, high contrast, no watermark. Product: ${prompt}`,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok)
    throw new Error(`이미지 생성 실패 HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
  const item = json.data?.[0];
  if (item?.b64_json) return base64ToBytes(item.b64_json);
  if (item?.url) {
    const img = await fetch(item.url, { signal: AbortSignal.timeout(15000) });
    if (!img.ok) throw new Error(`이미지 다운로드 실패 HTTP ${img.status}`);
    return new Uint8Array(await img.arrayBuffer());
  }
  throw new Error("이미지 응답 형식을 해석할 수 없습니다");
}

/**
 * 상품 썸네일 생성 → Supabase Storage 업로드 → 600x600 / 1000x1000 변환 URL 생성.
 * (Storage 이미지 변환은 Supabase Pro 필요. 미지원 시 변환 URL은 마스터로 폴백됨)
 * AI 키 미설정 시 "대기" 에러로 처리하고 Mock 이미지는 만들지 않는다.
 */
export const generateThumbnails = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ productId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI 이미지 키(LOVABLE_API_KEY) 미설정 · 대기");

    const sb = admin();
    const { data: p, error } = await sb
      .from("products")
      .select("id, source_name")
      .eq("id", data.productId)
      .maybeSingle();
    if (error) throw error;
    if (!p) throw new Error("상품을 찾을 수 없습니다");

    const bytes = await generateMaster(p.source_name, key);
    const path = `${p.id}/master.png`;
    const { error: upErr } = await sb.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: "image/png", upsert: true });
    if (upErr) throw new Error(`스토리지 업로드 실패: ${upErr.message}`);

    const master = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const w600 = sb.storage.from(BUCKET).getPublicUrl(path, {
      transform: { width: 600, height: 600, resize: "cover" },
    }).data.publicUrl;
    const w1000 = sb.storage.from(BUCKET).getPublicUrl(path, {
      transform: { width: 1000, height: 1000, resize: "cover" },
    }).data.publicUrl;

    const thumbnails = { master, w600, w1000, generatedAt: new Date().toISOString() };
    await sb
      .from("products")
      .update({ thumbnail_url: w1000, thumbnails: thumbnails as never })
      .eq("id", p.id);

    await sb.from("activity_log").insert({
      action: "thumbnail_generated",
      target_type: "product",
      target_id: p.id,
      message: `[썸네일] ${p.source_name} 600/1000 규격 생성`,
      metadata: thumbnails as never,
    });

    return thumbnails;
  });
