import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchTrends } from "@/lib/queries";
import { collectTrends } from "@/lib/trends.functions";
import { sourceProducts } from "@/lib/sourcing.functions";
import { toast } from "sonner";
import { TrendingUp, RefreshCw, PackageSearch, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/trends")({
  head: () => ({
    meta: [
      { title: "트렌드 | AI Commerce Agent" },
      { name: "description", content: "네이버 데이터랩 기반 일일 트렌드 키워드" },
    ],
  }),
  component: Trends,
});

function Trends() {
  const qc = useQueryClient();
  const { data: trends = [] } = useQuery({ queryKey: ["trends"], queryFn: fetchTrends });

  const collectFn = useServerFn(collectTrends);
  const collect = useMutation({
    mutationFn: () => collectFn({ data: { limit: 10 } }),
    onSuccess: (r) => {
      toast.success("트렌드 수집 완료", {
        description: `${r.collected}개 키워드 · 출처 ${r.source === "datalab" ? "네이버 데이터랩" : "AI 추정"}`,
      });
      qc.invalidateQueries({ queryKey: ["trends"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
    onError: (e) => toast.error("트렌드 수집 실패", { description: String(e) }),
  });

  const sourceFn = useServerFn(sourceProducts);
  const source = useMutation({
    mutationFn: () => sourceFn({ data: { keywordCount: 3, perKeyword: 3 } }),
    onSuccess: (r) => {
      toast.success("상품 소싱 완료", {
        description: `후보 ${r.inserted}개 등록 · AI 평가 ${r.evaluated}건 (검색 ${r.found})`,
      });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
    onError: (e) => toast.error("상품 소싱 실패", { description: String(e) }),
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-2 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">오늘의 트렌드</h1>
          <p className="text-sm text-muted-foreground mt-1">
            네이버 데이터랩 인기 검색어 · 매일 새벽 자동 수집
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => collect.mutate()}
            disabled={collect.isPending}
          >
            {collect.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> 수집 중...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-1.5" /> 트렌드 수집
              </>
            )}
          </Button>
          <Button
            className="rounded-xl"
            onClick={() => source.mutate()}
            disabled={source.isPending}
          >
            {source.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> 소싱 중...
              </>
            ) : (
              <>
                <PackageSearch className="h-4 w-4 mr-1.5" /> 이 트렌드로 상품 소싱
              </>
            )}
          </Button>
        </div>
      </div>
      <Card className="rounded-2xl border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> 급상승 키워드
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {trends.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">
              수집된 트렌드가 없습니다. "트렌드 수집"을 실행하세요.
            </p>
          )}
          {trends.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between p-3 rounded-xl bg-muted/40"
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                  {t.rank}
                </div>
                <div>
                  <div className="font-semibold">{t.keyword}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.category} · {t.source}
                  </div>
                </div>
              </div>
              <Badge variant="secondary" className="rounded-full">
                점수 {t.trend_score}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
