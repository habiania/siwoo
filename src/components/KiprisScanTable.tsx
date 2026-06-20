import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert } from "lucide-react";

type Row = {
  id: string;
  source_name: string;
  trademark_risk: "safe" | "caution" | "danger";
  status: string;
  risk_reason: string | null;
  trademark_checked_at: string | null;
};

const riskMap = {
  safe: { label: "안전", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  caution: { label: "주의", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  danger: { label: "위험", cls: "bg-rose-50 text-rose-700 border-rose-200" },
} as const;

const statusLabel: Record<string, string> = {
  pending: "검수대기",
  approved: "승인",
  rejected: "삭제",
  hold: "보류",
  sold_out: "품절",
  paused: "중지",
};

function fmt(t: string | null) {
  if (!t) return "-";
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function KiprisScanTable({ limit = 15, compact = false }: { limit?: number; compact?: boolean }) {
  const { data: rows = [] } = useQuery({
    queryKey: ["kipris-scan", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, source_name, trademark_risk, status, risk_reason, trademark_checked_at")
        .not("trademark_checked_at", "is", null)
        .order("trademark_checked_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    refetchInterval: 15000,
  });

  const summary = rows.reduce(
    (a, r) => ({ ...a, [r.trademark_risk]: (a[r.trademark_risk] ?? 0) + 1 }),
    { safe: 0, caution: 0, danger: 0 } as Record<string, number>,
  );

  return (
    <Card className="rounded-2xl border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-600" /> 최근 KIPRIS 스캔 결과
        </CardTitle>
        <CardDescription className="flex flex-wrap gap-2 pt-1">
          <span>처리 {rows.length}건</span>
          <Badge variant="outline" className={`rounded-full ${riskMap.danger.cls}`}>위험 {summary.danger}</Badge>
          <Badge variant="outline" className={`rounded-full ${riskMap.caution.cls}`}>주의 {summary.caution}</Badge>
          <Badge variant="outline" className={`rounded-full ${riskMap.safe.cls}`}>안전 {summary.safe}</Badge>
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            아직 스캔 이력이 없습니다. "지금 검수 대기 상품 스캔"을 실행해주세요.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="text-left border-b border-border/60">
                  <th className="px-2 py-2 font-medium">상품명</th>
                  <th className="px-2 py-2 font-medium">위험도</th>
                  <th className="px-2 py-2 font-medium">상태</th>
                  {!compact && <th className="px-2 py-2 font-medium">사유</th>}
                  <th className="px-2 py-2 font-medium whitespace-nowrap">검사 시각</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const rk = riskMap[r.trademark_risk] ?? riskMap.safe;
                  return (
                    <tr key={r.id} className="border-b border-border/30 last:border-0 align-top">
                      <td className="px-2 py-2 max-w-[180px] truncate">{r.source_name}</td>
                      <td className="px-2 py-2">
                        <Badge variant="outline" className={`rounded-full border ${rk.cls}`}>
                          {rk.label}
                        </Badge>
                      </td>
                      <td className="px-2 py-2 text-xs">{statusLabel[r.status] ?? r.status}</td>
                      {!compact && (
                        <td className="px-2 py-2 text-xs text-muted-foreground max-w-[280px]">
                          {r.risk_reason ?? "-"}
                        </td>
                      )}
                      <td className="px-2 py-2 text-xs text-muted-foreground whitespace-nowrap">
                        {fmt(r.trademark_checked_at)}
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
  );
}