import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchProducts, fetchInventoryLogs, fetchSettings } from "@/lib/queries";
import { syncInventory } from "@/lib/inventory.functions";
import { toast } from "sonner";
import { AlertTriangle, Package, RefreshCw, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/inventory")({
  head: () => ({
    meta: [
      { title: "재고 모니터 | AI Commerce Agent" },
      { name: "description", content: "재고 부족·품절·가격 변동 실시간 모니터링" },
    ],
  }),
  component: Inventory,
});

function Inventory() {
  const qc = useQueryClient();
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: () => fetchProducts(),
  });
  const { data: logs = [] } = useQuery({
    queryKey: ["inventory_logs"],
    queryFn: fetchInventoryLogs,
  });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: fetchSettings });

  // 재고 부족 기준은 설정값(min_stock_alert)을 따른다 (기본 10)
  const lowThreshold = settings?.min_stock_alert ?? 10;
  const lowStock = products.filter((p) => p.stock_qty > 0 && p.stock_qty <= lowThreshold);
  const soldOut = products.filter((p) => p.stock_qty === 0);

  const syncFn = useServerFn(syncInventory);
  const sync = useMutation({
    mutationFn: () => syncFn({ data: { limit: 100 } }),
    onSuccess: (r) => {
      const base = `${r.checked}건 점검 · 재고변동 ${r.stockChanged} · 가격변동 ${r.priceChanged} · 품절 ${r.soldOut}`;
      toast.success("재고 동기화 완료", {
        description: r.aiSummary ? `${base}\n🤖 ${r.aiSummary}` : base,
      });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["inventory_logs"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
    onError: (e) => toast.error("재고 동기화 실패", { description: String(e) }),
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-2 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">재고 모니터</h1>
          <p className="text-sm text-muted-foreground mt-1">
            30분마다 자동 동기화 · 도매매 API 기준
          </p>
        </div>
        <Button
          variant="secondary"
          className="rounded-full gap-1"
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
        >
          {sync.isPending ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> 동기화 중...
            </>
          ) : (
            <>
              <RefreshCw className="h-3 w-3" /> 지금 동기화
            </>
          )}
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="rounded-2xl border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-[oklch(0.5_0.2_25)]">
              <Package className="h-4 w-4" /> 품절 ({soldOut.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {soldOut.length === 0 && (
              <p className="text-sm text-muted-foreground">품절 상품 없음</p>
            )}
            {soldOut.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-2 rounded-lg bg-muted/40"
              >
                <span className="text-sm line-clamp-1">{p.source_name}</span>
                <Badge variant="destructive">0개</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-[oklch(0.45_0.14_75)]">
              <AlertTriangle className="h-4 w-4" /> 재고 부족 ({lowStock.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {lowStock.length === 0 && (
              <p className="text-sm text-muted-foreground">재고 부족 상품 없음</p>
            )}
            {lowStock.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-2 rounded-lg bg-muted/40"
              >
                <span className="text-sm line-clamp-1">{p.source_name}</span>
                <Badge className="bg-[oklch(0.95_0.07_75)] text-[oklch(0.45_0.14_75)] border-0">
                  {p.stock_qty}개
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-border/50">
        <CardHeader>
          <CardTitle className="text-base">재고 변동 이력</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {logs.length === 0 && (
            <p className="text-sm text-muted-foreground">
              변동 이력 없음. 자동 동기화 활성화 시 채워집니다.
            </p>
          )}
          {logs.map((l) => (
            <div
              key={l.id}
              className="flex items-center justify-between text-sm py-2 border-b border-border/40 last:border-0"
            >
              <div>
                <div className="font-medium">
                  {(l.products as { source_name?: string } | null)?.source_name ?? "—"}
                </div>
                <div className="text-xs text-muted-foreground">{l.message}</div>
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(l.created_at).toLocaleString("ko-KR")}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
