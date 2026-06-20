import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { fetchSettings } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { scanPendingProducts } from "@/lib/kipris.functions";
import { getSystemStatus } from "@/lib/status.functions";
import { KiprisScanTable } from "@/components/KiprisScanTable";
import { toast } from "sonner";
import {
  Key,
  Sparkles,
  CheckCircle2,
  ShieldAlert,
  Loader2,
  CircleCheck,
  CircleAlert,
} from "lucide-react";

function StatusDot({ ok, label, note }: { ok: boolean; label: string; note?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? (
        <CircleCheck className="h-4 w-4 text-emerald-600 shrink-0" />
      ) : (
        <CircleAlert className="h-4 w-4 text-amber-500 shrink-0" />
      )}
      <span className={ok ? "" : "text-muted-foreground"}>{label}</span>
      <span className={`text-xs ${ok ? "text-emerald-600" : "text-amber-600"}`}>
        {ok ? "준비됨" : (note ?? "설정 필요")}
      </span>
    </div>
  );
}

function SystemStatusCard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["system-status"],
    queryFn: () => getSystemStatus(),
    retry: false,
  });

  return (
    <Card className="rounded-2xl border-border/50">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" /> 시스템 상태 · 키 점검
        </CardTitle>
        <CardDescription>
          키가 없는 단계는 "설정 필요/대기"로 표시됩니다. 앱은 멈추지 않습니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid sm:grid-cols-2 gap-2">
        {isLoading && <p className="text-sm text-muted-foreground">상태 확인 중…</p>}
        {isError && (
          <p className="text-sm text-amber-600">
            상태를 불러오지 못했습니다 (Supabase 연결 확인 필요).
          </p>
        )}
        {data && (
          <>
            <StatusDot ok={data.ready.ai} label="AI 엔진 (상품명·평가·분석)" note="AI 키 필요" />
            <StatusDot ok={data.ready.trends} label="트렌드 수집" note="네이버 or AI 키" />
            <StatusDot ok={data.ready.sourcing} label="도매매 소싱" note="도매매 키 필요" />
            <StatusDot
              ok={data.ready.competition}
              label="경쟁 분석 (네이버쇼핑)"
              note="네이버 키 필요"
            />
            <StatusDot ok={data.ready.listing11st} label="11번가 등록" note="11번가 키 필요" />
            <StatusDot ok={data.ready.orders} label="주문 자동화" note="11번가+도매매 키" />
            <StatusDot ok={data.env.gemini} label="내 Gemini 키 직접호출" note="GEMINI_API_KEY" />
            <StatusDot ok={data.env.dryRun11st} label="11번가 DRY-RUN 모드" note="비활성(실등록)" />
          </>
        )}
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute("/_authenticated/_admin/settings")({
  head: () => ({
    meta: [
      { title: "설정 | AI Commerce Agent" },
      { name: "description", content: "API 키 및 운영 설정" },
    ],
  }),
  component: Settings,
});

type SettingsForm = {
  domemae_api_key: string;
  naver_client_id: string;
  naver_client_secret: string;
  toss_api_key: string;
  api_11st_key: string;
  gmarket_api_key: string;
  auction_api_key: string;
  kipris_api_key: string;
  target_margin_rate: number;
  min_stock_alert: number;
  auto_price_update: boolean;
  auto_trademark_check: boolean;
};

function ApiField({
  label,
  field,
  placeholder,
  form,
  setForm,
}: {
  label: string;
  field: keyof SettingsForm;
  placeholder?: string;
  form: SettingsForm;
  setForm: React.Dispatch<React.SetStateAction<SettingsForm>>;
}) {
  const val = form[field] as string;
  const filled = !!val;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        {filled && (
          <Badge variant="secondary" className="text-[10px] gap-1 rounded-full">
            <CheckCircle2 className="h-3 w-3" /> 입력됨
          </Badge>
        )}
      </div>
      <Input
        type="password"
        value={val}
        placeholder={placeholder ?? "API 키 입력"}
        onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
        className="rounded-xl h-11"
      />
    </div>
  );
}

function Settings() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: fetchSettings });
  const [form, setForm] = useState<SettingsForm>({
    domemae_api_key: "",
    naver_client_id: "",
    naver_client_secret: "",
    toss_api_key: "",
    api_11st_key: "",
    gmarket_api_key: "",
    auction_api_key: "",
    kipris_api_key: "",
    target_margin_rate: 25,
    min_stock_alert: 10,
    auto_price_update: false,
    auto_trademark_check: true,
  });

  useEffect(() => {
    if (settings) {
      setForm({
        domemae_api_key: settings.domemae_api_key ?? "",
        naver_client_id: settings.naver_client_id ?? "",
        naver_client_secret: settings.naver_client_secret ?? "",
        toss_api_key: settings.toss_api_key ?? "",
        api_11st_key: settings.api_11st_key ?? "",
        gmarket_api_key: settings.gmarket_api_key ?? "",
        auction_api_key: settings.auction_api_key ?? "",
        kipris_api_key: (settings as { kipris_api_key?: string }).kipris_api_key ?? "",
        target_margin_rate: Number(settings.target_margin_rate ?? 25),
        min_stock_alert: settings.min_stock_alert ?? 10,
        auto_price_update: settings.auto_price_update ?? false,
        auto_trademark_check:
          (settings as { auto_trademark_check?: boolean }).auto_trademark_check ?? true,
      });
    }
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("settings").update(form).eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("설정이 저장되었습니다");
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e) => toast.error("저장 실패", { description: String(e) }),
  });

  const scanFn = useServerFn(scanPendingProducts);
  const scan = useMutation({
    mutationFn: () => scanFn({ data: { limit: 50 } }),
    onSuccess: (r) => {
      toast.success("상표 위험도 검사 완료", {
        description: `${r.processed}건 검사 · 위험 ${r.danger} · 주의 ${r.caution} · 안전 ${r.safe}`,
      });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
    onError: (e) => toast.error("검사 실패", { description: String(e) }),
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-2 space-y-5">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">설정</h1>
        <p className="text-sm text-muted-foreground mt-1">API 키와 운영 정책을 관리합니다</p>
      </div>

      <Card className="rounded-2xl border-primary/20 bg-primary/5">
        <CardHeader className="flex flex-row items-center gap-3">
          <Sparkles className="h-5 w-5 text-primary" />
          <div>
            <CardTitle className="text-base">AI 기능은 이미 작동 중</CardTitle>
            <CardDescription>
              상품명·상세페이지·썸네일 AI 생성은 별도 키 없이 바로 사용 가능합니다.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      <SystemStatusCard />

      <Card className="rounded-2xl border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Key className="h-4 w-4" /> 데이터 소스 API
          </CardTitle>
          <CardDescription>도매매와 네이버 데이터랩 연동용</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ApiField label="도매매 API 키" field="domemae_api_key" form={form} setForm={setForm} />
          <div className="grid md:grid-cols-2 gap-4">
            <ApiField
              label="네이버 Client ID"
              field="naver_client_id"
              form={form}
              setForm={setForm}
            />
            <ApiField
              label="네이버 Client Secret"
              field="naver_client_secret"
              form={form}
              setForm={setForm}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Key className="h-4 w-4" /> 판매 플랫폼 API
          </CardTitle>
          <CardDescription>판매자 승인 후 발급받은 키를 입력하세요</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ApiField label="토스쇼핑 API 키" field="toss_api_key" form={form} setForm={setForm} />
          <ApiField label="11번가 API 키" field="api_11st_key" form={form} setForm={setForm} />
          <ApiField label="G마켓 API 키" field="gmarket_api_key" form={form} setForm={setForm} />
          <ApiField label="옥션 API 키" field="auction_api_key" form={form} setForm={setForm} />
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-600" /> 상표 위험도 검사 (KIPRIS)
          </CardTitle>
          <CardDescription>
            검수 대기 상품을 자동 스캔. 위험 → 삭제(rejected), 주의 → 보류(hold). 키가 없으면 AI
            휴리스틱으로 대체합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ApiField
            label="KIPRIS ServiceKey"
            field="kipris_api_key"
            placeholder="plus.kipris.or.kr 에서 발급"
            form={form}
            setForm={setForm}
          />
          <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3">
            <div>
              <div className="text-sm font-medium">새 상품 자동 상표 검사</div>
              <div className="text-xs text-muted-foreground">
                매일 새벽 검수 대기 상품을 일괄 스캔합니다
              </div>
            </div>
            <Switch
              checked={form.auto_trademark_check}
              onCheckedChange={(v) => setForm((f) => ({ ...f, auto_trademark_check: v }))}
            />
          </div>
          <Button
            variant="secondary"
            className="w-full rounded-xl h-11"
            onClick={() => scan.mutate()}
            disabled={scan.isPending}
          >
            {scan.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> 스캔 중...
              </>
            ) : (
              <>지금 검수 대기 상품 스캔</>
            )}
          </Button>
        </CardContent>
      </Card>

      <KiprisScanTable limit={20} />

      <Card className="rounded-2xl border-border/50">
        <CardHeader>
          <CardTitle className="text-base">운영 정책</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">목표 마진율 (%)</Label>
              <Input
                type="number"
                value={form.target_margin_rate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, target_margin_rate: Number(e.target.value) }))
                }
                className="rounded-xl h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">재고 부족 알림 기준 (개)</Label>
              <Input
                type="number"
                value={form.min_stock_alert}
                onChange={(e) =>
                  setForm((f) => ({ ...f, min_stock_alert: Number(e.target.value) }))
                }
                className="rounded-xl h-11"
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3">
            <div>
              <div className="text-sm font-medium">공급가 변동 시 자동 가격 수정</div>
              <div className="text-xs text-muted-foreground">꺼두면 관리자 검수 대기로 전환</div>
            </div>
            <Switch
              checked={form.auto_price_update}
              onCheckedChange={(v) => setForm((f) => ({ ...f, auto_price_update: v }))}
            />
          </div>
        </CardContent>
      </Card>

      <Button
        size="lg"
        className="w-full rounded-xl h-12"
        onClick={() => save.mutate()}
        disabled={save.isPending}
      >
        {save.isPending ? "저장 중..." : "설정 저장"}
      </Button>
    </div>
  );
}
