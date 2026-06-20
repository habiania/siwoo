import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchSourcingCandidates, formatKRW } from "@/lib/queries";
import { sourceProducts } from "@/lib/sourcing.functions";
import { analyzePendingCompetition } from "@/lib/competition.functions";
import { scanKcPending } from "@/lib/kc.functions";
import { repriceAll } from "@/lib/pricing.functions";
import { generateProductName } from "@/lib/naming.functions";
import { generateThumbnails } from "@/lib/thumbnail.functions";
import { toast } from "sonner";
import {
  PackageSearch,
  BarChart3,
  ShieldCheck,
  Calculator,
  Loader2,
  Trophy,
  ChevronDown,
  Wand2,
  Image as ImageIcon,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/sourcing")({
  head: () => ({
    meta: [
      { title: "상품 소싱 | AI Commerce Agent" },
      { name: "description", content: "AI 8요소 스코어링 기반 소싱 후보 (80점 이상)" },
    ],
  }),
  component: Sourcing,
});

type Breakdown = Record<string, number>;
type NameRationale = {
  name?: string;
  used_keywords?: string[];
  seo_score?: number;
  reason?: string;
};

const FACTOR_LABEL: Record<string, string> = {
  margin: "마진",
  sales: "판매",
  review: "리뷰",
  reviewVelocity: "리뷰속도",
  competition: "경쟁",
  seasonality: "계절성",
  shipping: "배송",
  supplier: "공급사",
};

function Sourcing() {
  const qc = useQueryClient();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const { data: items = [] } = useQuery({
    queryKey: ["sourcing-candidates"],
    queryFn: () => fetchSourcingCandidates(0),
  });

  const sourceFn = useServerFn(sourceProducts);
  const compFn = useServerFn(analyzePendingCompetition);
  const kcFn = useServerFn(scanKcPending);
  const priceFn = useServerFn(repriceAll);
  const nameFn = useServerFn(generateProductName);
  const thumbFn = useServerFn(generateThumbnails);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["sourcing-candidates"] });
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["activity"] });
  };

  const sourceM = useMutation({
    mutationFn: () => sourceFn({ data: { keywordCount: 5, perKeyword: 5 } }),
    onSuccess: (r) => {
      toast.success("소싱 완료", {
        description: `80점↑ ${r.inserted}개 등록 · 저점탈락 ${r.lowScore}`,
      });
      refresh();
    },
    onError: (e) => toast.error("소싱 실패", { description: String(e) }),
  });
  const compM = useMutation({
    mutationFn: () => compFn({ data: { limit: 20 } }),
    onSuccess: (r) => {
      toast.success("경쟁분석 완료", { description: `${r.analyzed}개 분석` });
      refresh();
    },
    onError: (e) => toast.error("경쟁분석 실패", { description: String(e) }),
  });
  const kcM = useMutation({
    mutationFn: () => kcFn({ data: { limit: 100 } }),
    onSuccess: (r) => {
      toast.success("KC 스캔 완료", { description: `필수 ${r.required} · 차단 ${r.blocked}` });
      refresh();
    },
    onError: (e) => toast.error("KC 스캔 실패", { description: String(e) }),
  });
  const priceM = useMutation({
    mutationFn: () => priceFn({ data: { limit: 200 } }),
    onSuccess: (r) => {
      toast.success("재가격 완료", { description: `${r.updated}개 갱신` });
      refresh();
    },
    onError: (e) => toast.error("재가격 실패", { description: String(e) }),
  });
  const nameM = useMutation({
    mutationFn: (id: string) => nameFn({ data: { productId: id } }),
    onSuccess: (r) => {
      toast.success("상품명 생성 완료", { description: r.name });
      refresh();
    },
    onError: (e) => toast.error("상품명 생성 실패", { description: String(e) }),
  });
  const thumbM = useMutation({
    mutationFn: (id: string) => thumbFn({ data: { productId: id } }),
    onSuccess: () => {
      toast.success("썸네일 생성 완료", { description: "600/1000 규격 생성됨" });
      refresh();
    },
    onError: (e) => toast.error("썸네일 생성 실패 · 대기", { description: String(e) }),
  });

  const toggle = (id: string) =>
    setOpen((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const pending = (busy: boolean) =>
    busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-2 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">상품 소싱</h1>
          <p className="text-sm text-muted-foreground mt-1">
            8요소 스코어링 점수순 · 80점 이상만 등록 후보
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            className="rounded-xl"
            onClick={() => sourceM.mutate()}
            disabled={sourceM.isPending}
          >
            {pending(sourceM.isPending) ?? <PackageSearch className="h-4 w-4 mr-1.5" />} 트렌드로
            소싱
          </Button>
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => compM.mutate()}
            disabled={compM.isPending}
          >
            {pending(compM.isPending) ?? <BarChart3 className="h-4 w-4 mr-1.5" />} 경쟁분석
          </Button>
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => kcM.mutate()}
            disabled={kcM.isPending}
          >
            {pending(kcM.isPending) ?? <ShieldCheck className="h-4 w-4 mr-1.5" />} KC 스캔
          </Button>
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => priceM.mutate()}
            disabled={priceM.isPending}
          >
            {pending(priceM.isPending) ?? <Calculator className="h-4 w-4 mr-1.5" />} 재가격
          </Button>
        </div>
      </div>

      <Card className="rounded-2xl border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="h-4 w-4" /> 소싱 후보 ({items.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">
              후보가 없습니다. "트렌드로 소싱"을 실행하세요.
            </p>
          )}
          {items.map((p) => {
            const bd = (p.score_breakdown as Breakdown | null) ?? null;
            const nr = (p.name_rationale as NameRationale | null) ?? null;
            const isOpen = open.has(p.id);
            const nameBusy = nameM.isPending && nameM.variables === p.id;
            const thumbBusy = thumbM.isPending && thumbM.variables === p.id;
            return (
              <div key={p.id} className="rounded-xl bg-muted/40 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggle(p.id)}
                  className="w-full flex items-center gap-4 p-3 text-left"
                >
                  <div
                    className={`h-12 w-12 shrink-0 rounded-xl flex items-center justify-center text-base font-bold ${p.ai_score >= 80 ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}
                  >
                    {p.ai_score}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{nr?.name ?? p.source_name}</div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3">
                      <span>{p.category ?? "-"}</span>
                      <span>마진 {p.margin_rate}%</span>
                      <span>예상순익 {formatKRW(p.expected_profit)}</span>
                      {p.kc_required && (
                        <span className={p.kc_certified ? "text-emerald-600" : "text-rose-600"}>
                          KC {p.kc_certified ? "OK" : "필요"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold">{formatKRW(p.suggested_price)}</div>
                    {p.normal_price > 0 && (
                      <div className="text-xs text-muted-foreground line-through">
                        {formatKRW(p.normal_price)}
                      </div>
                    )}
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {isOpen && (
                  <div className="px-3 pb-3 space-y-3 text-sm border-t border-border/40 pt-3">
                    {/* AI 점수 근거 */}
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-1">
                        AI 점수 근거 (8요소)
                      </div>
                      {bd ? (
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(bd).map(([k, v]) => (
                            <span
                              key={k}
                              className="text-[11px] px-1.5 py-0.5 rounded bg-background border"
                            >
                              {FACTOR_LABEL[k] ?? k} {v}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">근거 데이터 없음</span>
                      )}
                    </div>

                    {/* 가격 근거 */}
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-1">
                        가격 결정 근거
                      </div>
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>공급가 {formatKRW(p.supply_price)}</span>
                        <span>→ 정상가 {p.normal_price > 0 ? formatKRW(p.normal_price) : "-"}</span>
                        <span>→ 판매가 {formatKRW(p.suggested_price)}</span>
                        <span>
                          예상순익 {formatKRW(p.expected_profit)} (순이익률 {p.margin_rate}%)
                        </span>
                      </div>
                    </div>

                    {/* 상품명 근거 */}
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-1">
                        상품명 생성 근거
                      </div>
                      {nr ? (
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          <div className="text-foreground font-medium">{nr.name}</div>
                          {typeof nr.seo_score === "number" && <div>SEO 점수 {nr.seo_score}</div>}
                          {nr.used_keywords?.length ? (
                            <div>키워드: {nr.used_keywords.join(", ")}</div>
                          ) : null}
                          {nr.reason && <div>{nr.reason}</div>}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">아직 생성 안 됨</span>
                      )}
                    </div>

                    {/* KC 판정 근거 */}
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-1">
                        KC 판정
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.kc_required
                          ? p.kc_certified
                            ? `KC 필수 · 인증번호 등록됨 (${p.kc_number ?? "-"})`
                            : "KC 필수 · 인증번호 없음 → 등록 차단(보류)"
                          : "KC 인증 불필요 카테고리"}
                      </div>
                    </div>

                    {/* 액션 */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-lg h-8 text-xs"
                        onClick={() => nameM.mutate(p.id)}
                        disabled={nameBusy}
                      >
                        {nameBusy ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        ) : (
                          <Wand2 className="h-3.5 w-3.5 mr-1" />
                        )}
                        AI 상품명 생성
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-lg h-8 text-xs"
                        onClick={() => thumbM.mutate(p.id)}
                        disabled={thumbBusy}
                      >
                        {thumbBusy ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        ) : (
                          <ImageIcon className="h-3.5 w-3.5 mr-1" />
                        )}
                        썸네일 생성 (600/1000)
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
