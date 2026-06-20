import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchRiskProducts } from "@/lib/queries";
import { ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/risk")({
  head: () => ({
    meta: [
      { title: "위험 상품 | AI Commerce Agent" },
      { name: "description", content: "상표권·KC·법적 리스크 상품 목록" },
    ],
  }),
  component: Risk,
});

const riskMap: Record<string, { label: string; cls: string }> = {
  safe: { label: "안전", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  caution: { label: "주의", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  danger: { label: "위험", cls: "bg-rose-50 text-rose-700 border-rose-200" },
};
const statusLabel: Record<string, string> = {
  pending: "검수대기",
  approved: "승인",
  rejected: "삭제",
  hold: "보류",
  sold_out: "품절",
  paused: "중지",
};

function Risk() {
  const { data: rows = [] } = useQuery({ queryKey: ["risk-products"], queryFn: fetchRiskProducts });

  return (
    <div className="mx-auto max-w-6xl px-4 py-2 space-y-5">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">위험 상품</h1>
        <p className="text-sm text-muted-foreground mt-1">
          상표권 · KC 인증 · 법적 리스크 감지 목록
        </p>
      </div>

      <Card className="rounded-2xl border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-rose-600" /> 위험 감지 ({rows.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">위험 상품이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="text-left border-b border-border/60">
                    <th className="px-2 py-2 font-medium">상품명</th>
                    <th className="px-2 py-2 font-medium">상표 위험</th>
                    <th className="px-2 py-2 font-medium">KC</th>
                    <th className="px-2 py-2 font-medium">상태</th>
                    <th className="px-2 py-2 font-medium">사유</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const rk = riskMap[p.trademark_risk] ?? riskMap.safe;
                    return (
                      <tr key={p.id} className="border-b border-border/30 last:border-0 align-top">
                        <td className="px-2 py-2 max-w-[220px] truncate">{p.source_name}</td>
                        <td className="px-2 py-2">
                          <Badge variant="outline" className={`rounded-full border ${rk.cls}`}>
                            {rk.label}
                          </Badge>
                        </td>
                        <td className="px-2 py-2 text-xs">
                          {p.kc_required ? (
                            <span className={p.kc_certified ? "text-emerald-600" : "text-rose-600"}>
                              {p.kc_certified ? "인증 OK" : "번호 없음"}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">불필요</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-xs">{statusLabel[p.status] ?? p.status}</td>
                        <td className="px-2 py-2 text-xs text-muted-foreground max-w-[280px]">
                          {p.risk_reason ?? "-"}
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
