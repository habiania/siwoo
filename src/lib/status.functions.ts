import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// 키 "값"은 절대 반환하지 않고 설정 여부(boolean)만 노출한다.
export const getSystemStatus = createServerFn({ method: "GET" }).handler(async () => {
  const env = {
    supabaseService: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    lovableAi: !!process.env.LOVABLE_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
    elevenst: !!process.env.ELEVENST_API_KEY,
    cronSecret: !!process.env.CRON_SECRET,
    dryRun11st: process.env.ELEVENST_DRY_RUN === "true",
  };

  // settings DB 키 존재 여부 (service role 로 안전하게 조회, 값은 노출 안 함)
  const settingsKeys = {
    domeme: false,
    naver: false,
    kipris: false,
    toss: false,
    gmarket: false,
    auction: false,
  };
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const sb = createClient<Database>(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const { data } = await sb
        .from("settings")
        .select(
          "domemae_api_key, naver_client_id, naver_client_secret, kipris_api_key, toss_api_key, api_11st_key, gmarket_api_key, auction_api_key",
        )
        .eq("id", 1)
        .maybeSingle();
      if (data) {
        settingsKeys.domeme = !!data.domemae_api_key;
        settingsKeys.naver = !!(data.naver_client_id && data.naver_client_secret);
        settingsKeys.kipris = !!data.kipris_api_key;
        settingsKeys.toss = !!data.toss_api_key;
        settingsKeys.gmarket = !!data.gmarket_api_key;
        settingsKeys.auction = !!data.auction_api_key;
      }
    } catch {
      // settings 조회 실패해도 상태 화면은 동작해야 한다
    }
  }

  const ready = {
    ai: env.lovableAi || env.gemini, // AI 엔진 동작 가능
    trends: settingsKeys.naver || env.lovableAi || env.gemini, // 네이버 or AI 폴백
    sourcing: settingsKeys.domeme, // 도매매 소싱
    competition: settingsKeys.naver, // 네이버쇼핑 경쟁분석
    listing11st: env.elevenst, // 11번가 등록
    orders: env.elevenst && settingsKeys.domeme, // 주문 자동화
  };

  return { env, settingsKeys, ready };
});
