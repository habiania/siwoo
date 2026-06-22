import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  fetchProducts,
  fetchActivity,
  fetchTrends,
  formatKRW,
} from "@/lib/queries";
import { runDailyReview } from "@/lib/pipeline.functions";
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Package,
  ArrowRight,
  Activity,
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/")({
  head: () => ({
    meta: [
      { title: "대시보드 | AI Commerce Agent" },
      { name: "description", content: "위탁판매 자동화 대시보드. AI 추천 상품과 재고를 한눈에." },
      { property: "og:title", content: "AI Commerce Agent 대시보드" },
      { property: "og:description", content: "위탁판매 자동화 운영 시스템" },
    ],
  }),
  component: Dashboard,
});

function StatCard({
  label,
  value,
  hint,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "primary" | "success" | "warning" | "danger";
  icon: React.ComponentType<{ className?: string }>;
}) {
  const toneClasses: Record<string, string> = {
    default: "bg-card",
    primary: "bg-primary text-primary-foreground",
    success: "bg-[oklch(0.96_0.04_155)] text-[oklch(0.35_0.12_155)]",
    warning: "bg-[oklch(0.97_0.05_75)] text-[oklch(0.45_0.14_75)]",
    danger: "bg-[oklch(0.97_0.03_25)] text-[oklch(0.5_0.2_25)]",
  };
  return (
    <Card className={`border-0 shadow-sm rounded-2xl ${toneClasses[tone]}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="text-xs font-medium opacity-80">{label}</div>
          <Icon className="h-4 w-4 opacity-70" />
        </div>
        <div className="mt-3 text-2xl font-bold tracking-tight">{value}</div>
        {hint && <div className="mt-1 text-xs opacity-70">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => fetchProducts() });
  const { data: activity = [] } = useQuery({ queryKey: ["activity"], queryFn: fetchActivity });
  const { data: trends = [] } = useQuery({ queryKey: ["trends"], queryFn: fetchTrends });

  const qc = useQueryClient();
  const navigate = useNavigate();
  const runFn = useServerFn(runDailyReview);
  const run = useMutation({
    mutationFn: () => runFn({ data: {} }),
    onSuccess: (res: { sourced?: { detail?: string } }) => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
      qc.invalidateQueries({ queryKey: ["trends"] });
      let n = 0;
      try {
        n = JSON.parse(res?.sourced?.detail ?? "{}").inserted ?? 0;
      } catch {
        /* noop */
      }
      if (n > 0) {
        toast.success(`AI가 추천 상품 ${n}개를 준비했어요`, {
          description: "상품명·프로모션·가격까지 자동 생성됨. 검수에서 확인하세요.",
        });
        navigate({ to: "/review" });
      } else {
        toast.message("이번엔 새로 등록된 상품이 없어요", {
          description: "잠시 후 다시 누르거나, 트렌드 키워드를 바꿔보세요.",
        });
      }
    },
    onError: (e) => {
      toast.error("검수 자동화 실패", {
        description: e instanceof Error ? e.message : String(e),
      });
    },
  });

  const pending = products.filter((p) => p.status === "pending");
  const approved = products.filter((p) => p.status === "approved");
  const lowStock = products.filter((p) => p.stock_qty <= 10 && p.stock_qty > 0);
  const soldOut = products.filter((p) => p.stock_qty === 0);
  const expectedMonthly = approved.reduce((s, p) => s + (p.expected_profit ?? 0), 0) * 30;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-1">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">대시보드</h1>
          <p className="text-sm text-muted-foreground mt-1">
            오늘도 AI가 추천한 상품들을 검토하세요. 평균 검수시간 5분 이내.
          </p>
        </div>
        <Button
          onClick={() => run.mutate()}
          disabled={run.isPending}
          size="lg"
          className="rounded-xl"
        >
          {run.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          {run.isPending ? "AI 분석·소싱·상품명 생성 중…" : "오늘의 검수 시작"}
          {!run.isPending && <ArrowRight className="h-4 w-4 ml-2" />}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="오늘 추천 상품" value={`${pending.length}개`} hint="AI 큐레이션" icon={Sparkles} tone="primary" />
        <StatCard label="승인 완료" value={`${approved.length}개`} hint="등록 준비됨" icon={CheckCircle2} tone="success" />
        <StatCard label="재고 부족" value={`${lowStock.length}개`} hint="10개 이하" icon={AlertTriangle} tone="warning" />
        <StatCard label="품절" value={`${soldOut.length}개`} hint="자동 판매중지" icon={Package} tone="danger" />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="md:col-span-2 rounded-2xl border-border/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">예상 월 순이익</CardTitle>
            <Badge variant="secondary">승인 상품 기준</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold tracking-tight text-primary">
              {formatKRW(expectedMonthly)}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              하루 평균 {formatKRW(Math.round(expectedMonthly / 30))} · 승인된 상품 {approved.length}개 기준 단순 추산
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> 오늘의 트렌드
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {trends.slice(0, 5).map((t) => (
              <div key={t.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono w-5 text-muted-foreground">#{t.rank}</span>
                  <span className="font-medium">{t.keyword}</span>
                </div>
                <Badge variant="outline" className="rounded-full text-xs">
                  {t.trend_score}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" /> 최근 활동
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {activity.length === 0 && (
            <p className="text-sm text-muted-foreground">아직 활동이 없습니다.</p>
          )}
          {activity.map((a) => (
            <div key={a.id} className="flex items-center justify-between text-sm border-b border-border/40 pb-2 last:border-0">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-primary" />
                <span>{a.message}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(a.created_at).toLocaleString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
