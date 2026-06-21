import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

// 구글 Gemini 직접 호출 (OpenAI 호환 엔드포인트). 별도 의존성 없이
// createOpenAICompatible 를 재사용한다. 키는 process.env.GEMINI_API_KEY 에서 읽으며
// 절대 코드에 하드코딩하지 않는다 (Lovable Cloud 시크릿 또는 .env 에 등록).
function createGeminiProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "google-gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

// OpenAI 직접 호출 (api.openai.com). process.env.OPENAI_API_KEY (sk-...) 를 사용한다.
function createOpenAIProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "openai",
    baseURL: "https://api.openai.com/v1",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

/** AI 호출에 쓸 수 있는 키가 하나라도 있는지 (graceful 폴백 판단용) */
export function aiAvailable(): boolean {
  return !!(
    process.env.OPENAI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.LOVABLE_API_KEY
  );
}

/**
 * 모델 ID 문자열을 받아 적절한 provider 의 모델 인스턴스를 반환한다.
 * - "google/..." 이고 GEMINI_API_KEY 가 있으면 → 내 Gemini 키로 직접 호출
 *   (ai-models.ts 의 google/* 항목이 여기로 라우팅된다)
 * - 그 외(openai/* 등) 또는 Gemini 키 미설정 → 기존 Lovable 게이트웨이
 */
export function resolveModel(modelId: string) {
  const gemKey = process.env.GEMINI_API_KEY;
  if (modelId.startsWith("google/") && gemKey) {
    const gemini = createGeminiProvider(gemKey);
    return gemini(modelId.replace(/^google\//, ""));
  }
  // openai/* 모델은 OPENAI_API_KEY 가 있으면 OpenAI 로 직접 호출한다.
  const openaiKey = process.env.OPENAI_API_KEY;
  if (modelId.startsWith("openai/") && openaiKey) {
    const openai = createOpenAIProvider(openaiKey);
    return openai(modelId.replace(/^openai\//, ""));
  }
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) {
    throw new Error(
      "AI 키 미설정: OPENAI_API_KEY 또는 GEMINI_API_KEY 또는 LOVABLE_API_KEY 가 필요합니다",
    );
  }
  const gateway = createLovableAiGatewayProvider(lovableKey);
  return gateway(modelId);
}
