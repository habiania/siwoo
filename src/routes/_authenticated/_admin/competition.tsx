import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchMarketAnalysis, formatKRW } from "@/lib/queries";
import { BarChart3 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/competition")({
  head: () => ({
    meta: [
      { title: "경쟁 분석 | AI Commerce Agent" },
      { name: "description", content: "네이버쇼핑 경쟁 현황 분석 결과" },
    ],
  }),
  component: Competition,
});

function Competition() {
  const { data: rows = [] } = useQuery({
    queryKey: ["market_analysis"],
    queryFn: fetchMarketAnalysis,
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-2 space-y-5">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">경쟁 분석</h1>
        <p className="text-sm text-muted-foreground mt-1">네이버쇼핑 기준 가격대·경쟁강도</p>
      </div>

      <Card className="rounded-2xl border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> 분석 결과 ({rows.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              분석 결과가 없습니다. 상품 소싱 화면에서 "경쟁분석"을 실행하세요.
            </p>
          ) : (
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="text-left border-b border-border/60">
                    <th className="px-2 py-2 font-medium">키워드</th>
                    <th className="px-2 py-2 font-medium">상품명</th>
                    <th className="px-2 py-2 font-medium">경쟁 상품수</th>
                    <th className="px-2 py-2 font-medium">평균가</th>
                    <th className="px-2 py-2 font-medium">최저~최고</th>
                    <th className="px-2 py-2 font-medium">플랫폼</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-border/30 last:border-0">
                      <td className="px-2 py-2 font-medium">{r.keyword}</td>
                      <td className="px-2 py-2 max-w-[200px] truncate text-muted-foreground">
                        {(r.products as { source_name?: string } | null)?.source_name ?? "-"}
                      </td>
                      <td className="px-2 py-2">{r.product_count.toLocaleString("ko-KR")}</td>
                      <td className="px-2 py-2">
                        {r.avg_price > 0 ? formatKRW(r.avg_price) : "-"}
                      </td>
                      <td className="px-2 py-2 text-xs text-muted-foreground whitespace-nowrap">
                        {r.min_price > 0
                          ? `${formatKRW(r.min_price)} ~ ${formatKRW(r.max_price)}`
                          : "-"}
                      </td>
                      <td className="px-2 py-2">
                        <Badge variant="secondary" className="rounded-full">
                          {r.platform}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
