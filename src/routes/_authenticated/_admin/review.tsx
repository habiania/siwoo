import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchProducts, formatKRW } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { generatePlatformContent } from "@/lib/ai.functions";
import { KiprisScanTable } from "@/components/KiprisScanTable";
import { toast } from "sonner";
import {
  Check, X, Pause, Sparkles, TrendingUp, Shield, Boxes, Wand2, Loader2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/review")({
  head: () => ({
    meta: [
      { title: "오늘의 검수 | AI Commerce Agent" },
      { name: "description", content: "모바일 최적화 상품 검수. 5분 내 완료." },
    ],
  }),
  component: Review,
});

function riskBadge(risk: string) {
  const map: Record<string, { label: string; cls: string }> = {
    safe: { label: "안전", cls: "bg-[oklch(0.95_0.05_155)] text-[oklch(0.4_0.13_155)]" },
    caution: { label: "주의", cls: "bg-[oklch(0.96_0.07_75)] text-[oklch(0.45_0.15_75)]" },
    danger: { label: "위험", cls: "bg-[oklch(0.95_0.05_25)] text-[oklch(0.5_0.2_25)]" },
  };
  const m = map[risk] ?? map.safe;
  return <Badge className={`rounded-full border-0 ${m.cls}`}>상표 {m.label}</Badge>;
}

function Review() {
  const qc = useQueryClient();
  const { data: products = [] } = useQuery({
    queryKey: ["products", "pending"],
    queryFn: () => fetchProducts("pending"),
  });
  const [idx, setIdx] = useState(0);
  const [aiBusy, setAiBusy] = useState(false);
  const generateFn = useServerFn(generatePlatformContent);

  const current = products[idx];

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("products").update({ status: status as never }).eq("id", id);
      if (error) throw error;
      await supabase.from("activity_log").insert({
        action: `product_${status}`,
        target_type: "product",
        target_id: id,
        message: `상품 ${status === "approved" ? "승인" : status === "hold" ? "보류" : "삭제"}됨`,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
      setIdx((i) => Math.min(i + 1, products.length - 1));
    },
  });

  async function handleAiGenerate() {
    if (!current) return;
    setAiBusy(true);
    try {
      const result = await generateFn({
        data: {
          sourceName: current.source_name,
          category: current.category ?? undefined,
          description: current.description ?? undefined,
          platforms: ["toss", "11st", "gmarket", "auction"],
        },
      });
      for (const l of result.listings) {
        await supabase.from("platform_listings").upsert(
          {
            product_id: current.id,
            platform: l.platform,
            platform_title: l.title,
            promo_text: l.promo,
            tags: l.tags,
            detail_html: result.detail_html,
            price: current.suggested_price,
          },
          { onConflict: "product_id,platform" },
        );
      }
      toast.success("AI 콘텐츠 생성 완료", {
        description: "4개 플랫폼별 상품명·태그·상세페이지 생성됨",
      });
    } catch (e) {
      toast.error("AI 생성 실패", {
        description: String(e instanceof Error ? e.message : e),
      });
    } finally {
      setAiBusy(false);
    }
  }

  if (products.length === 0) {
    return (
      <div className="mx-auto max-w-3xl p-4 space-y-4">
        <div className="text-center py-6">
          <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h2 className="text-lg font-bold">오늘의 검수가 모두 완료되었습니다</h2>
          <p className="text-sm text-muted-foreground mt-2">내일 새벽 6시에 새 추천이 도착해요.</p>
        </div>
        <KiprisScanTable limit={15} />
      </div>
    );
  }

  if (!current) return null;

  return (
    <div className="mx-auto max-w-md md:max-w-lg p-2 md:p-4 space-y-4">
      <div className="flex items-center justify-between px-2">
        <h1 className="text-lg font-bold">오늘의 검수</h1>
        <div className="text-sm text-muted-foreground">
          {idx + 1} / {products.length}
        </div>
      </div>

      <Card className="overflow-hidden rounded-3xl border-border/50 shadow-sm">
        <div className="relative aspect-square bg-muted">
          {current.thumbnail_url ? (
            <img src={current.thumbnail_url} alt={current.source_name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">No image</div>
          )}
          <div className="absolute top-3 left-3 flex gap-1.5">
            <Badge className="rounded-full bg-primary text-primary-foreground border-0 font-bold">
              AI {current.ai_score}점
            </Badge>
            {riskBadge(current.trademark_risk)}
          </div>
        </div>
        <CardContent className="p-5 space-y-4">
          <div>
            <div className="text-xs text-muted-foreground">{current.category}</div>
            <h2 className="text-base font-bold mt-1 leading-snug">{current.source_name}</h2>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-2xl bg-muted/50 p-4">
            <div>
              <div className="text-xs text-muted-foreground">예상 판매가</div>
              <div className="text-lg font-bold">{formatKRW(current.suggested_price)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">예상 순이익</div>
              <div className="text-lg font-bold text-primary">{formatKRW(current.expected_profit)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">마진율</div>
              <div className="text-sm font-semibold">{current.margin_rate}%</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">재고</div>
              <div className="text-sm font-semibold flex items-center gap-1">
                <Boxes className="h-3 w-3" />
                {current.stock_qty}개
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline" className="gap-1">
              <TrendingUp className="h-3 w-3" />판매 {current.sales_count}
            </Badge>
            <Badge variant="outline">리뷰 {current.review_count}</Badge>
            <Badge variant="outline" className="gap-1">
              <Shield className="h-3 w-3" />공급가 {formatKRW(current.supply_price)}
            </Badge>
          </div>

          <Button
            variant="secondary"
            className="w-full rounded-xl h-11"
            onClick={handleAiGenerate}
            disabled={aiBusy}
          >
            {aiBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}
            AI 플랫폼별 상품명·상세페이지 생성
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-2 sticky bottom-2">
        <Button
          variant="outline"
          className="h-14 rounded-2xl flex-col gap-0.5"
          onClick={() => updateStatus.mutate({ id: current.id, status: "rejected" })}
          disabled={updateStatus.isPending}
        >
          <X className="h-5 w-5" />
          <span className="text-xs">삭제</span>
        </Button>
        <Button
          variant="outline"
          className="h-14 rounded-2xl flex-col gap-0.5"
          onClick={() => updateStatus.mutate({ id: current.id, status: "hold" })}
          disabled={updateStatus.isPending}
        >
          <Pause className="h-5 w-5" />
          <span className="text-xs">보류</span>
        </Button>
        <Button
          className="h-14 rounded-2xl flex-col gap-0.5"
          onClick={() => updateStatus.mutate({ id: current.id, status: "approved" })}
          disabled={updateStatus.isPending}
        >
          <Check className="h-5 w-5" />
          <span className="text-xs">승인</span>
        </Button>
      </div>

      <KiprisScanTable limit={10} compact />
    </div>
  );
}