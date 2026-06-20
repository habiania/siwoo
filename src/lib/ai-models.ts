// 기능별 AI 모델 라우팅 (한 곳에서 관리).
// 모두 Lovable AI 게이트웨이(OpenAI 호환)를 통해 호출되므로, 모델 ID 문자열만
// 바꾸면 제공자가 바뀝니다. 게이트웨이가 해당 모델을 지원하지 않아 "model not found"
// 오류가 나면 아래 ID만 교체하세요. (직접 OpenAI 키를 쓰려면 ai-gateway.server.ts 참고)
export const MODELS = {
  // 상품 업로드: 플랫폼별 상품명·상세페이지 생성 → GPT (OPENAI_API_KEY 직접 호출)
  productContent: "openai/gpt-4o-mini",
  // 데이터 분석: 상품 점수/위험도 평가 → GPT
  productEvaluation: "openai/gpt-4o-mini",
  // 보조: 트렌드 추정 폴백 → Gemini
  trendFallback: "google/gemini-2.5-flash",
  // 보조: 상표 위험 휴리스틱 폴백 → Gemini
  trademarkHeuristic: "google/gemini-2.5-flash",
  // 재고 동기화: 재고/가격 변동 해석 및 조치 추천 → Gemini
  inventoryAnalysis: "google/gemini-2.5-flash",
} as const;
