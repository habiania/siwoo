import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchOrders, formatKRW } from "@/lib/queries";
import { processOrders } from "@/lib/orders.functions";
import { toast } from "sonner";
import { ShoppingCart, RefreshCw, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/orders")({
  head: () => ({
    meta: [
      { title: "주문 현황 | AI Commerce Agent" },
      { name: "description", content: "자동 발주·송장 처리 현황" },
    ],
  }),
  component: Orders,
});

const STATUS: Record<string, { label: string; cls: string }> = {
  collected: { label: "수집됨", cls: "bg-slate-50 text-slate-700 border-slate-200" },
  ordered: { label: "발주완료", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  shipped: { label: "출고", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  invoiced: { label: "송장입력", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  completed: { label: "발송완료", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  failed: { label: "실패", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  cancelled: { label: "취소", cls: "bg-gray-50 text-gray-600 border-gray-200" },
};

function Orders() {
  const qc = useQueryClient();
  const { data: orders = [] } = useQuery({ queryKey: ["orders"], queryFn: fetchOrders });
  const processFn = useServerFn(processOrders);

  const run = useMutation({
    mutationFn: () => processFn({ data: {} }),
    onSuccess: (r) => {
      toast.success("주문 처리 실행", {
        description: `수집 ${r.collected} · 발주 ${r.ordered} · 송장 ${r.invoiced} · 대기 ${r.pendingKeys}`,
      });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
    onError: (e) => toast.error("주문 처리 실패", { description: String(e) }),
  });

  const byStatus = orders.reduce<Record<string, number>>((a, o) => {
    a[o.status] = (a[o.status] ?? 0) + 1;
    return a;
  }, {});

  return (
    <div className="mx-auto max-w-6xl px-4 py-2 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">주문 현황</h1>
          <p className="text-sm text-muted-foreground mt-1">
            주문 수집 → 공급사 발주 → 송장 입력 자동화
          </p>
        </div>
        <Button className="rounded-xl" onClick={() => run.mutate()} disabled={run.isPending}>
          {run.isPending ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-1.5" />
          )}
          주문 처리 실행
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.entries(STATUS).map(([k, v]) => (
          <Badge key={k} variant="outline" className={`rounded-full ${v.cls}`}>
            {v.label} {byStatus[k] ?? 0}
          </Badge>
        ))}
      </div>

      <Card className="rounded-2xl border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" /> 주문 ({orders.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              주문이 없습니다. 마켓 주문 API 키 등록 후 "주문 처리 실행"이 동작합니다.
            </p>
          ) : (
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="text-left border-b border-border/60">
                    <th className="px-2 py-2 font-medium">주문번호</th>
                    <th className="px-2 py-2 font-medium">상품</th>
                    <th className="px-2 py-2 font-medium">수량</th>
                    <th className="px-2 py-2 font-medium">금액</th>
                    <th className="px-2 py-2 font-medium">플랫폼</th>
                    <th className="px-2 py-2 font-medium">송장</th>
                    <th className="px-2 py-2 font-medium">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const st = STATUS[o.status] ?? STATUS.collected;
                    return (
                      <tr key={o.id} className="border-b border-border/30 last:border-0">
                        <td className="px-2 py-2 text-xs">{o.market_order_no}</td>
                        <td className="px-2 py-2 max-w-[200px] truncate">
                          {o.product_name ?? "-"}
                        </td>
                        <td className="px-2 py-2">{o.quantity}</td>
                        <td className="px-2 py-2">{formatKRW(o.order_amount)}</td>
                        <td className="px-2 py-2">{o.platform}</td>
                        <td className="px-2 py-2 text-xs text-muted-foreground">
                          {o.tracking_no ?? "-"}
                        </td>
                        <td className="px-2 py-2">
                          <Badge variant="outline" className={`rounded-full border ${st.cls}`}>
                            {st.label}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
