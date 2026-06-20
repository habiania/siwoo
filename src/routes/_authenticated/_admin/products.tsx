import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchProducts, fetchPlatformListings, fetchFailedListings, formatKRW } from "@/lib/queries";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useServerFn } from "@tanstack/react-start";
import { approveProduct, retryPlatformListing } from "@/lib/platform-listing.functions";
import { toast } from "sonner";
import { Loader2, CheckCircle2, RefreshCw, Trash2, Search, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useMemo, useState, useEffect } from "react";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

type PushKind = "success" | "failed" | "skipped" | "processing";
const PUSH_PREFS_KEY = "bulk-retry-push-prefs";
const DEFAULT_PUSH_PREFS: Record<PushKind, boolean> = {
  success: true,
  failed: true,
  skipped: false,
  processing: false,
};
function loadPushPrefs(): Record<PushKind, boolean> {
  if (typeof window === "undefined") return DEFAULT_PUSH_PREFS;
  try {
    const raw = window.localStorage.getItem(PUSH_PREFS_KEY);
    if (!raw) return DEFAULT_PUSH_PREFS;
    return { ...DEFAULT_PUSH_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PUSH_PREFS;
  }
}

type RetryKind = "network" | "server" | "timeout";
type PushAttempt = {
  attempt: number;
  status: "success" | "failed";
  errorKind?: RetryKind | "unknown";
  reason?: string;
};
type PushHistoryEntry = {
  id: string;
  startedAt: number;
  kind: PushKind;
  retryPrefsSnapshot: Record<RetryKind, boolean>;
  attempts: PushAttempt[];
  finalStatus: "success" | "failed" | "failed-no-retry";
  finalReason?: string;
  finalErrorKind?: RetryKind | "unknown";
};
const RETRY_PREFS_KEY = "bulk-retry-error-kinds";
const DEFAULT_RETRY_PREFS: Record<RetryKind, boolean> = {
  network: true,
  server: true,
  timeout: true,
};
const RETRY_LABELS: Record<RetryKind, string> = {
  network: "네트워크 오류",
  server: "서버 오류",
  timeout: "타임아웃",
};
function loadRetryPrefs(): Record<RetryKind, boolean> {
  if (typeof window === "undefined") return DEFAULT_RETRY_PREFS;
  try {
    const raw = window.localStorage.getItem(RETRY_PREFS_KEY);
    if (!raw) return DEFAULT_RETRY_PREFS;
    return { ...DEFAULT_RETRY_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_RETRY_PREFS;
  }
}
function classifyError(e: unknown): RetryKind | "unknown" {
  const msg = (e instanceof Error ? e.message : String(e ?? "")).toLowerCase();
  if (/timeout|timed out|etimedout/.test(msg)) return "timeout";
  if (/network|fetch|offline|connection|disconnect|enetunreach|econnreset/.test(msg)) return "network";
  if (/5\d\d|server|internal|service unavailable|bad gateway/.test(msg)) return "server";
  return "unknown";
}

const HISTORY_KEY = "bulk-retry-push-history";
const RETENTION_DAYS_KEY = "bulk-retry-retention-days";
const DEFAULT_RETENTION_DAYS = 30;
const RETENTION_OPTIONS = [
  { value: "7", label: "7일" },
  { value: "30", label: "30일" },
  { value: "90", label: "90일" },
];
function loadRetentionDays(): number {
  if (typeof window === "undefined") return DEFAULT_RETENTION_DAYS;
  try {
    const raw = window.localStorage.getItem(RETENTION_DAYS_KEY);
    if (!raw) return DEFAULT_RETENTION_DAYS;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_RETENTION_DAYS;
  } catch {
    return DEFAULT_RETENTION_DAYS;
  }
}
function loadHistory(): PushHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PushHistoryEntry[];
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - loadRetentionDays() * 86400000;
    return parsed.filter((h) => h.startedAt >= cutoff);
  } catch {
    return [];
  }
}

export const Route = createFileRoute("/_authenticated/_admin/products")({
  head: () => ({
    meta: [
      { title: "상품 목록 | AI Commerce Agent" },
      { name: "description", content: "전체 상품 현황을 상태별로 확인" },
    ],
  }),
  component: Products,
});

function ProductGrid({ status }: { status?: string }) {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["products", status ?? "all"],
    queryFn: () => fetchProducts(status),
  });
  const productIds = data.map((p) => p.id);
  const { data: listings = [] } = useQuery({
    queryKey: ["platform_listings", productIds],
    queryFn: () => fetchPlatformListings(productIds),
    enabled: productIds.length > 0,
  });
  const approveFn = useServerFn(approveProduct);
  const retryFn = useServerFn(retryPlatformListing);
  const approve = useMutation({
    mutationFn: (productId: string) => approveFn({ data: { productId } }),
    onSuccess: (r) => {
      const summary = r.results
        .map((x) => `${x.platform}:${x.status === "success" ? "✅" : x.status === "skipped" ? "⏭️" : "❌"}`)
        .join(" · ");
      toast.success("승인 및 플랫폼 등록 완료", { description: summary });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["platform_listings"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
    onError: (e) => toast.error("승인 실패", { description: String(e) }),
  });
  const retry = useMutation({
    mutationFn: (v: { productId: string; platform?: "toss" | "11st" | "gmarket" | "auction" }) =>
      retryFn({ data: v }),
    onSuccess: (r) => {
      if (r.results.length === 0) {
        toast.info("재시도할 실패 항목이 없습니다");
        return;
      }
      const summary = r.results
        .map((x) => `${x.platform}:${x.status === "success" ? "✅" : x.status === "skipped" ? "⏭️" : "❌"}`)
        .join(" · ");
      toast.success("재시도 완료", { description: summary });
      qc.invalidateQueries({ queryKey: ["platform_listings"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
    onError: (e) => toast.error("재시도 실패", { description: String(e) }),
  });
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground py-12 text-center">상품이 없습니다.</p>;
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {data.map((p) => {
        const ls = listings.filter((l) => l.product_id === p.id);
        const failed = ls.filter((l) => l.status === "failed");
        return (
        <Card key={p.id} className="overflow-hidden rounded-2xl border-border/50">
          <div className="aspect-square bg-muted">
            {p.thumbnail_url && (
              <img src={p.thumbnail_url} alt={p.source_name} className="h-full w-full object-cover" />
            )}
          </div>
          <CardContent className="p-3 space-y-1.5">
            <div className="text-xs text-muted-foreground">{p.category}</div>
            <div className="text-sm font-semibold line-clamp-2 min-h-[2.5rem]">{p.source_name}</div>
            <div className="flex items-center justify-between pt-1">
              <div className="text-sm font-bold">{formatKRW(p.suggested_price)}</div>
              <Badge variant="secondary" className="text-xs">
                AI {p.ai_score}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground">재고 {p.stock_qty}개</div>
            {ls.length > 0 && (
              <div className="space-y-1 pt-1">
                {ls.map((l) => {
                  const isRetrying =
                    retry.isPending &&
                    retry.variables?.productId === p.id &&
                    retry.variables?.platform === l.platform;
                  return (
                    <div key={l.platform} className="flex items-center justify-between gap-1">
                      <Badge
                        variant={
                          l.status === "success"
                            ? "default"
                            : l.status === "failed"
                              ? "destructive"
                              : "outline"
                        }
                        className="text-[10px] gap-1"
                        title={l.error_message ?? l.external_listing_id ?? ""}
                      >
                        {l.platform}{" "}
                        {l.status === "success" ? "✅" : l.status === "failed" ? "❌" : "⏭️"}
                      </Badge>
                      {l.status !== "success" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[10px]"
                          disabled={isRetrying}
                          title={l.error_message ?? `${l.platform} 재시도`}
                          onClick={() =>
                            retry.mutate({
                              productId: p.id,
                              platform: l.platform as "toss" | "11st" | "gmarket" | "auction",
                            })
                          }
                        >
                          {isRetrying ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <><RefreshCw className="h-3 w-3 mr-1" />재시도</>
                          )}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {p.status === "approved" ? (
              <div className="space-y-1.5 pt-1">
                <Button size="sm" variant="secondary" disabled className="w-full rounded-lg h-9">
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> 승인됨
                </Button>
                {failed.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full rounded-lg h-8 text-xs"
                    disabled={
                      retry.isPending &&
                      retry.variables?.productId === p.id &&
                      !retry.variables?.platform
                    }
                    onClick={() => retry.mutate({ productId: p.id })}
                  >
                    {retry.isPending &&
                    retry.variables?.productId === p.id &&
                    !retry.variables?.platform ? (
                      <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> 재시도 중...</>
                    ) : (
                      <><RefreshCw className="h-3 w-3 mr-1" /> 실패 {failed.length}건 일괄 재시도</>
                    )}
                  </Button>
                )}
              </div>
            ) : p.status === "pending" || p.status === "hold" ? (
              <Button
                size="sm"
                className="w-full rounded-lg h-9 mt-1"
                disabled={approve.isPending && approve.variables === p.id}
                onClick={() => approve.mutate(p.id)}
              >
                {approve.isPending && approve.variables === p.id ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> 등록 중...</>
                ) : (
                  <>승인 → 플랫폼 등록</>
                )}
              </Button>
            ) : null}
          </CardContent>
        </Card>
        );
      })}
    </div>
  );
}

function Products() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-2 space-y-5">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">상품 목록</h1>
        <p className="text-sm text-muted-foreground mt-1">상태별 전체 상품 현황</p>
      </div>
      <Tabs defaultValue="all">
        <TabsList className="rounded-xl">
          <TabsTrigger value="all">전체</TabsTrigger>
          <TabsTrigger value="pending">검수 대기</TabsTrigger>
          <TabsTrigger value="approved">승인</TabsTrigger>
          <TabsTrigger value="hold">보류</TabsTrigger>
          <TabsTrigger value="rejected">삭제</TabsTrigger>
          <TabsTrigger value="failed">실패 재시도</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="mt-4"><ProductGrid /></TabsContent>
        <TabsContent value="pending" className="mt-4"><ProductGrid status="pending" /></TabsContent>
        <TabsContent value="approved" className="mt-4"><ProductGrid status="approved" /></TabsContent>
        <TabsContent value="hold" className="mt-4"><ProductGrid status="hold" /></TabsContent>
        <TabsContent value="rejected" className="mt-4"><ProductGrid status="rejected" /></TabsContent>
        <TabsContent value="failed" className="mt-4"><FailedListings /></TabsContent>
      </Tabs>
    </div>
  );
}

type PlatformName = "toss" | "11st" | "gmarket" | "auction";
const PLATFORMS: PlatformName[] = ["toss", "11st", "gmarket", "auction"];

function FailedListings() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ["failed_listings"],
    queryFn: fetchFailedListings,
  });
  const [platformFilter, setPlatformFilter] = useState<PlatformName | "all">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(
    () => (platformFilter === "all" ? data : data.filter((d) => d.platform === platformFilter)),
    [data, platformFilter],
  );
  const key = (productId: string, platform: string) => `${productId}::${platform}`;
  const allSelected = filtered.length > 0 && filtered.every((d) => selected.has(key(d.product_id, d.platform)));

  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) {
      filtered.forEach((d) => next.delete(key(d.product_id, d.platform)));
    } else {
      filtered.forEach((d) => next.add(key(d.product_id, d.platform)));
    }
    setSelected(next);
  };

  const toggleOne = (productId: string, platform: string) => {
    const next = new Set(selected);
    const k = key(productId, platform);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setSelected(next);
  };

  const retryFn = useServerFn(retryPlatformListing);
  const [pushPrefs, setPushPrefs] = useState<Record<PushKind, boolean>>(loadPushPrefs);
  const togglePref = (k: PushKind) => {
    setPushPrefs((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      try { window.localStorage.setItem(PUSH_PREFS_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };
  const [retryPrefs, setRetryPrefs] = useState<Record<RetryKind, boolean>>(loadRetryPrefs);
  const toggleRetryPref = (k: RetryKind) => {
    setRetryPrefs((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      try { window.localStorage.setItem(RETRY_PREFS_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };
  const [pushHistory, setPushHistory] = useState<PushHistoryEntry[]>(loadHistory);
  const [retentionDays, setRetentionDays] = useState<number>(loadRetentionDays);
  const changeRetention = (days: number) => {
    setRetentionDays(days);
    try { window.localStorage.setItem(RETENTION_DAYS_KEY, String(days)); } catch { /* noop */ }
    const cutoff = Date.now() - days * 86400000;
    setPushHistory((prev) => prev.filter((h) => h.startedAt >= cutoff));
  };
  const [historyFrom, setHistoryFrom] = useState<string>("");
  const [historyTo, setHistoryTo] = useState<string>("");
  const [historyErrorFilter, setHistoryErrorFilter] = useState<"all" | RetryKind | "unknown">("all");
  const [historySearch, setHistorySearch] = useState<string>("");
  useEffect(() => {
    try { window.localStorage.setItem(HISTORY_KEY, JSON.stringify(pushHistory)); } catch { /* noop */ }
  }, [pushHistory]);
  const notify = (
    kind: "success" | "failed" | "skipped" | "processing" | "info",
    title: string,
    body: string,
  ) => {
    if (kind === "success") toast.success(title, { description: body });
    else if (kind === "failed") toast.error(title, { description: body });
    else if (kind === "skipped") toast.warning(title, { description: body });
    else toast(title, { description: body });
    if (kind !== "info" && !pushPrefs[kind as PushKind]) return;
    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      try {
        new Notification(title, {
          body,
          tag: "bulk-retry",
          icon: "/favicon.ico",
        });
      } catch { /* noop */ }
    }
  };
  const sendTestPush = async (kind: PushKind) => {
    const testTitles: Record<PushKind, string> = {
      success: "✅ 성공 테스트 푸시",
      failed: "❌ 실패 테스트 푸시",
      skipped: "⏭️ 스킵 테스트 푸시",
      processing: "⏳ 처리중 테스트 푸시",
    };
    const testBodies: Record<PushKind, string> = {
      success: "성공 상태의 테스트 모바일 푸시입니다.",
      failed: "실패 상태의 테스트 모바일 푸시입니다.",
      skipped: "스킵 상태의 테스트 모바일 푸시입니다.",
      processing: "처리중 상태의 테스트 모바일 푸시입니다.",
    };

    const perm =
      typeof window !== "undefined" && "Notification" in window
        ? Notification.permission
        : "unsupported";
    if (perm === "unsupported") {
      toast.error("브라우저 알림 미지원", {
        description: "이 브라우저는 알림 기능을 지원하지 않습니다.",
      });
      return;
    }
    if (perm === "denied") {
      toast.error("알림 권한 거부됨", {
        description: "브라우저 설정에서 알림 권한을 허용해주세요.",
      });
      return;
    }

    if (perm === "default") {
      let newPerm: NotificationPermission = "default";
      try { newPerm = await Notification.requestPermission(); } catch { /* noop */ }
      if (newPerm !== "granted") {
        toast.warning("알림 권한 미허용", {
          description: "푸시 테스트를 위해 알림 권한이 필요합니다.",
        });
        return;
      }
      toast.success("알림 권한 허용됨", {
        description: "푸시 테스트를 진행합니다.",
      });
    } else {
      toast.info("알림 권한: 허용됨", {
        description: "푸시 테스트를 진행합니다.",
      });
    }

    const MAX_ATTEMPTS = 3;
    let lastError: unknown = null;
    let lastKind: RetryKind | "unknown" = "unknown";
    const entryId =
      (typeof crypto !== "undefined" && "randomUUID" in crypto)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const attempts: PushAttempt[] = [];
    const retrySnapshot = { ...retryPrefs };
    const startedAt = Date.now();
    const commitHistory = (
      finalStatus: PushHistoryEntry["finalStatus"],
      finalReason?: string,
      finalErrorKind?: RetryKind | "unknown",
    ) => {
      const entry: PushHistoryEntry = {
        id: entryId,
        startedAt,
        kind,
        retryPrefsSnapshot: retrySnapshot,
        attempts: [...attempts],
        finalStatus,
        finalReason,
        finalErrorKind,
      };
      const cutoff = Date.now() - retentionDays * 86400000;
      setPushHistory((prev) => [entry, ...prev].filter((h) => h.startedAt >= cutoff).slice(0, 20));
    };
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        new Notification(testTitles[kind], {
          body: testBodies[kind],
          tag: "bulk-retry",
          icon: "/favicon.ico",
        });
        attempts.push({ attempt, status: "success" });
        if (attempt === 1) {
          toast.success("푸시 발송 성공", { description: testTitles[kind] });
        } else {
          toast.success("푸시 발송 성공 (재시도)", {
            description: `${attempt}회차 시도에서 성공했습니다.`,
          });
        }
        commitHistory("success");
        return;
      } catch (e) {
        lastError = e;
        lastKind = classifyError(e);
        const reason = e instanceof Error ? e.message : String(e);
        const kindLabel = lastKind === "unknown" ? "알 수 없는 오류" : RETRY_LABELS[lastKind];
        attempts.push({ attempt, status: "failed", errorKind: lastKind, reason });
        if (lastKind === "unknown" || !retryPrefs[lastKind]) {
          toast.error(`푸시 발송 실패 - 재시도 안 함 (${kindLabel})`, {
            description: `해당 오류 유형은 재시도 대상이 아닙니다. 사유: ${reason}`,
          });
          commitHistory("failed-no-retry", reason, lastKind);
          return;
        }
        if (attempt < MAX_ATTEMPTS) {
          toast.warning(`푸시 발송 실패 - 재시도 ${attempt}/${MAX_ATTEMPTS - 1} (${kindLabel})`, {
            description: `사유: ${reason}`,
          });
          await new Promise((r) => setTimeout(r, 500 * attempt));
        }
      }
    }
    const finalKindLabel = lastKind === "unknown" ? "알 수 없는 오류" : RETRY_LABELS[lastKind];
    const finalReason = lastError instanceof Error ? lastError.message : String(lastError);
    toast.error(`푸시 발송 최종 실패 (${MAX_ATTEMPTS}회 시도 · ${finalKindLabel})`, {
      description: `최종 실패 사유: ${finalReason}`,
    });
    commitHistory("failed", finalReason, lastKind);
  };
  const [progress, setProgress] = useState<{
    running: boolean;
    total: number;
    done: number;
    success: number;
    failed: number;
    skipped: number;
    current: string | null;
  }>({ running: false, total: 0, done: 0, success: 0, failed: 0, skipped: 0, current: null });
  const [itemResults, setItemResults] = useState<Record<string, "success" | "failed" | "skipped">>({});

  const runBulk = async (items: { productId: string; platform: PlatformName; label: string }[]) => {
    if (items.length === 0 || progress.running) return;
    // 모바일 푸시 권한 요청 (브라우저 Notification API)
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        try { await Notification.requestPermission(); } catch { /* noop */ }
      }
    }
    setItemResults({});
    setProgress({ running: true, total: items.length, done: 0, success: 0, failed: 0, skipped: 0, current: null });
    notify("info", "일괄 재시도 시작", `총 ${items.length}건 처리합니다`);
    for (const it of items) {
      const k = key(it.productId, it.platform);
      setProgress((p) => ({ ...p, current: `${it.platform} · ${it.label}` }));
      notify("processing", `⏳ ${it.platform} 처리 중`, it.label);
      try {
        const r = await retryFn({ data: { productId: it.productId, platform: it.platform } });
        const status = (r.results[0]?.status ?? "failed") as "success" | "failed" | "skipped";
        setItemResults((prev) => ({ ...prev, [k]: status }));
        setProgress((p) => ({
          ...p,
          done: p.done + 1,
          success: p.success + (status === "success" ? 1 : 0),
          failed: p.failed + (status === "failed" ? 1 : 0),
          skipped: p.skipped + (status === "skipped" ? 1 : 0),
        }));
        const emoji = status === "success" ? "✅" : status === "skipped" ? "⏭️" : "❌";
        notify(
          status,
          `${emoji} ${it.platform} ${status === "success" ? "성공" : status === "skipped" ? "스킵" : "실패"}`,
          it.label,
        );
      } catch {
        setItemResults((prev) => ({ ...prev, [k]: "failed" }));
        setProgress((p) => ({ ...p, done: p.done + 1, failed: p.failed + 1 }));
        notify("failed", `❌ ${it.platform} 실패`, it.label);
      }
    }
    setProgress((p) => ({ ...p, running: false, current: null }));
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["failed_listings"] });
    qc.invalidateQueries({ queryKey: ["platform_listings"] });
    qc.invalidateQueries({ queryKey: ["activity"] });
    const finalState = await new Promise<typeof progress>((resolve) => {
      setProgress((p) => { resolve(p); return p; });
    });
    notify(
      "success",
      "일괄 재시도 완료",
      `성공 ${finalState.success} · 실패 ${finalState.failed} · 스킵 ${finalState.skipped}`,
    );
  };

  const runSelected = () => {
    const items = Array.from(selected)
      .map((k) => {
        const [productId, platform] = k.split("::");
        const row = data.find((d) => d.product_id === productId && d.platform === platform);
        return {
          productId,
          platform: platform as PlatformName,
          label: row?.platform_title || row?.products?.source_name || productId,
        };
      });
    runBulk(items);
  };

  const runAllFiltered = () => {
    const items = filtered.map((d) => ({
      productId: d.product_id,
      platform: d.platform as PlatformName,
      label: d.platform_title || d.products?.source_name || d.product_id,
    }));
    runBulk(items);
  };

  const filteredHistory = useMemo(() => {
    const fromMs = historyFrom ? new Date(historyFrom).getTime() : 0;
    const toMs = historyTo ? new Date(historyTo).getTime() + 86400000 - 1 : Infinity;
    const searchLower = historySearch.trim().toLowerCase();
    return pushHistory.filter((h) => {
      if (h.startedAt < fromMs || h.startedAt > toMs) return false;
      if (historyErrorFilter !== "all") {
        const hasKind =
          h.finalErrorKind === historyErrorFilter ||
          h.attempts.some((a) => a.errorKind === historyErrorFilter);
        if (!hasKind) return false;
      }
      if (searchLower) {
        const haystack = [
          h.finalReason ?? "",
          ...h.attempts.map((a) => a.reason ?? ""),
          h.finalErrorKind === "unknown" ? "알 수 없음" : h.finalErrorKind ? RETRY_LABELS[h.finalErrorKind] : "",
          ...h.attempts.map((a) =>
            a.errorKind === "unknown" ? "알 수 없음" : a.errorKind ? RETRY_LABELS[a.errorKind] : ""
          ),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(searchLower)) return false;
      }
      return true;
    });
  }, [pushHistory, historyFrom, historyTo, historyErrorFilter, historySearch]);

  // 최근 실패 사유 기반 자동 필터 제안
  const suggestions = useMemo(() => {
    const lastFailed = pushHistory.find((h) => h.finalStatus !== "success");
    if (!lastFailed) return [] as Array<{
      id: string;
      label: string;
      apply: () => void;
    }>;
    const list: Array<{ id: string; label: string; apply: () => void }> = [];
    const d = new Date(lastFailed.startedAt);
    const toIso = (x: Date) => x.toISOString().slice(0, 10);
    const dayStr = toIso(d);
    const weekAgo = toIso(new Date(d.getTime() - 6 * 86400000));

    list.push({
      id: "same-day",
      label: `📅 같은 날 (${dayStr})`,
      apply: () => { setHistoryFrom(dayStr); setHistoryTo(dayStr); },
    });
    list.push({
      id: "last-7d",
      label: `📅 직전 7일`,
      apply: () => { setHistoryFrom(weekAgo); setHistoryTo(dayStr); },
    });

    if (lastFailed.finalErrorKind && lastFailed.finalErrorKind !== "unknown") {
      const kind = lastFailed.finalErrorKind;
      list.push({
        id: `kind-${kind}`,
        label: `⚠️ ${RETRY_LABELS[kind]}만 보기`,
        apply: () => setHistoryErrorFilter(kind),
      });
    } else if (lastFailed.finalErrorKind === "unknown") {
      list.push({
        id: "kind-unknown",
        label: `⚠️ 알 수 없음만 보기`,
        apply: () => setHistoryErrorFilter("unknown"),
      });
    }

    // 실패 사유에서 의미 있는 키워드 추출 (영문/한글 단어, 4자 이상, 상위 2개)
    const reason = lastFailed.finalReason ?? "";
    if (reason) {
      const stop = new Set(["error", "failed", "request", "fetch", "the", "and", "for", "with", "from", "this", "that"]);
      const tokens = Array.from(
        new Set(
          (reason.toLowerCase().match(/[a-z0-9]{4,}|[가-힣]{2,}/g) ?? [])
            .filter((t) => !stop.has(t))
        )
      ).slice(0, 2);
      for (const t of tokens) {
        list.push({
          id: `kw-${t}`,
          label: `🔍 "${t}"`,
          apply: () => setHistorySearch(t),
        });
      }
    }

    return list;
  }, [pushHistory]);

  const isBulking = progress.running;

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-12 text-center">불러오는 중…</p>;
  }

  return (
    <div className="space-y-3">
      <Card className="rounded-2xl border-border/50">
        <CardContent className="p-3 flex flex-wrap items-center gap-3">
          <div className="text-xs font-medium text-muted-foreground">📱 푸시 알림 조건</div>
          {([
            ["success", "성공"],
            ["failed", "실패"],
            ["skipped", "스킵"],
            ["processing", "처리중"],
          ] as [PushKind, string][]).map(([k, label]) => (
            <label
              key={k}
              className="flex items-center gap-1.5 text-xs cursor-pointer select-none"
            >
              <Checkbox
                checked={pushPrefs[k]}
                onCheckedChange={() => togglePref(k)}
              />
              {label}
            </label>
          ))}
          <span className="text-[10px] text-muted-foreground ml-auto">
            토스트는 항상 표시 · 푸시만 선택 적용
          </span>
          <div className="w-full" />
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[10px] text-muted-foreground">재시도 대상 오류:</span>
            {(Object.keys(RETRY_LABELS) as RetryKind[]).map((k) => (
              <label
                key={k}
                className="flex items-center gap-1.5 text-xs cursor-pointer select-none"
              >
                <Checkbox
                  checked={retryPrefs[k]}
                  onCheckedChange={() => toggleRetryPref(k)}
                />
                {RETRY_LABELS[k]}
              </label>
            ))}
            <span className="text-[10px] text-muted-foreground">
              선택된 유형만 자동 재시도, 그 외는 즉시 실패 처리
            </span>
          </div>
          <div className="w-full" />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] text-muted-foreground">테스트 푸시:</span>
            {(["success", "failed", "skipped", "processing"] as PushKind[]).map((k) => {
              const testLabels: Record<PushKind, string> = {
                success: "✅ 성공",
                failed: "❌ 실패",
                skipped: "⏭️ 스킵",
                processing: "⏳ 처리중",
              };
              return (
                <Button
                  key={k}
                  size="sm"
                  variant="outline"
                  className="h-6 rounded-md text-[10px] px-2"
                  onClick={() => sendTestPush(k)}
                >
                  {testLabels[k]}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-border/50">
        <CardContent className="p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs font-medium text-muted-foreground">🧾 푸시 재시도 이력</div>
            <span className="text-[10px] text-muted-foreground">
              {filteredHistory.length === pushHistory.length
                ? `최근 ${pushHistory.length}건 (최대 20)`
                : `필터 결과 ${filteredHistory.length} / ${pushHistory.length}건`}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground">보관 기간</span>
                <Select
                  value={String(retentionDays)}
                  onValueChange={(v) => changeRetention(Number(v))}
                >
                  <SelectTrigger className="h-6 w-20 text-[10px] rounded-md px-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RETENTION_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value} className="text-xs">
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {pushHistory.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 rounded-md text-[10px] px-2 text-destructive hover:text-destructive"
                  onClick={() => {
                    setPushHistory([]);
                    toast.info("푸시 재시도 이력이 삭제되었습니다");
                  }}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  전체 삭제
                </Button>
              )}
            </div>
          </div>
          {pushHistory.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 p-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">날짜 범위</span>
                <Input
                  type="date"
                  value={historyFrom}
                  onChange={(e) => setHistoryFrom(e.target.value)}
                  className="h-6 text-[10px] rounded-md px-2 w-32"
                />
                <span className="text-[10px] text-muted-foreground">~</span>
                <Input
                  type="date"
                  value={historyTo}
                  onChange={(e) => setHistoryTo(e.target.value)}
                  className="h-6 text-[10px] rounded-md px-2 w-32"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">실패 유형</span>
                <Select
                  value={historyErrorFilter}
                  onValueChange={(v) =>
                    setHistoryErrorFilter(v as "all" | RetryKind | "unknown")
                  }
                >
                  <SelectTrigger className="h-6 w-28 text-[10px] rounded-md px-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">전체</SelectItem>
                    {(Object.keys(RETRY_LABELS) as RetryKind[]).map((k) => (
                      <SelectItem key={k} value={k} className="text-xs">
                        {RETRY_LABELS[k]}
                      </SelectItem>
                    ))}
                    <SelectItem value="unknown" className="text-xs">알 수 없음</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1.5 flex-1 min-w-[12rem]">
                <Search className="h-3 w-3 text-muted-foreground" />
                <Input
                  placeholder="실패 사유 검색…"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="h-6 text-[10px] rounded-md px-2 flex-1"
                />
                {(historyFrom || historyTo || historyErrorFilter !== "all" || historySearch) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 rounded-md"
                    onClick={() => {
                      setHistoryFrom("");
                      setHistoryTo("");
                      setHistoryErrorFilter("all");
                      setHistorySearch("");
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          )}
          {pushHistory.length > 0 && suggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-border/50 p-2">
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                💡 추천 필터
              </span>
              {suggestions.map((s) => (
                <Button
                  key={s.id}
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[10px] rounded-full"
                  onClick={s.apply}
                >
                  {s.label}
                </Button>
              ))}
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[10px] rounded-full"
                onClick={() => suggestions.forEach((s) => s.apply())}
              >
                모두 적용
              </Button>
            </div>
          )}
          {pushHistory.length === 0 ? (
            <p className="text-[11px] text-muted-foreground py-2">
              아직 기록된 테스트 푸시가 없습니다. 위 테스트 버튼으로 발송해 보세요.
            </p>
          ) : filteredHistory.length === 0 ? (
            <p className="text-[11px] text-muted-foreground py-2">
              조건에 맞는 이력이 없습니다. 필터를 조정해 보세요.
            </p>
          ) : (
            <ul className="space-y-2">
              {filteredHistory.map((h) => {
                const enabledKinds = (Object.keys(RETRY_LABELS) as RetryKind[])
                  .filter((k) => h.retryPrefsSnapshot[k])
                  .map((k) => RETRY_LABELS[k]);
                const time = new Date(h.startedAt).toLocaleTimeString("ko-KR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                });
                const date = new Date(h.startedAt).toLocaleDateString("ko-KR", {
                  month: "short",
                  day: "numeric",
                });
                const finalBadge =
                  h.finalStatus === "success" ? (
                    <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15">성공</Badge>
                  ) : h.finalStatus === "failed-no-retry" ? (
                    <Badge className="bg-amber-500/15 text-amber-600 hover:bg-amber-500/15">재시도 없이 실패</Badge>
                  ) : (
                    <Badge className="bg-red-500/15 text-red-600 hover:bg-red-500/15">최종 실패</Badge>
                  );
                return (
                  <li key={h.id} className="rounded-lg border border-border/50 p-2 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="font-mono text-muted-foreground">{date} {time}</span>
                      <Badge variant="outline" className="text-[10px]">{h.kind}</Badge>
                      {finalBadge}
                      <span className="text-muted-foreground">
                        시도 {h.attempts.length}회
                      </span>
                      <span className="ml-auto text-muted-foreground">
                        재시도 조건: {enabledKinds.length > 0 ? enabledKinds.join(", ") : "없음"}
                      </span>
                    </div>
                    <ol className="text-[11px] space-y-0.5">
                      {h.attempts.map((a) => (
                        <li key={a.attempt} className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-muted-foreground">#{a.attempt}</span>
                          {a.status === "success" ? (
                            <span className="text-emerald-600">성공</span>
                          ) : (
                            <>
                              <span className="text-red-600">실패</span>
                              {a.errorKind && (
                                <Badge variant="outline" className="text-[10px]">
                                  {a.errorKind === "unknown" ? "알 수 없음" : RETRY_LABELS[a.errorKind]}
                                </Badge>
                              )}
                              {a.reason && (
                                <span className="text-muted-foreground truncate">— {a.reason}</span>
                              )}
                            </>
                          )}
                        </li>
                      ))}
                    </ol>
                    {h.finalStatus !== "success" && h.finalReason && (
                      <div className="text-[11px] text-red-600">
                        최종 실패 사유: <span className="text-muted-foreground">{h.finalReason}</span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant={platformFilter === "all" ? "default" : "outline"}
            className="h-8 rounded-lg text-xs"
            onClick={() => setPlatformFilter("all")}
          >
            전체 ({data.length})
          </Button>
          {PLATFORMS.map((p) => {
            const count = data.filter((d) => d.platform === p).length;
            return (
              <Button
                key={p}
                size="sm"
                variant={platformFilter === p ? "default" : "outline"}
                className="h-8 rounded-lg text-xs"
                onClick={() => setPlatformFilter(p)}
              >
                {p} ({count})
              </Button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-lg text-xs"
            disabled={isBulking || selected.size === 0}
            onClick={runSelected}
          >
            {isBulking ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
            )}
            선택 {selected.size}건 재시도
          </Button>
          <Button
            size="sm"
            className="h-8 rounded-lg text-xs"
            disabled={isBulking || filtered.length === 0}
            onClick={runAllFiltered}
          >
            {isBulking ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
            )}
            필터된 {filtered.length}건 전체 재시도
          </Button>
        </div>
      </div>

      {(isBulking || progress.done > 0) && (
        <Card className="rounded-2xl border-border/50">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                {isBulking && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span className="font-medium">
                  {progress.done} / {progress.total}
                </span>
                <span className="text-muted-foreground truncate max-w-[260px]">
                  {progress.current ?? (isBulking ? "준비 중…" : "완료")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="default" className="text-[10px]">성공 {progress.success}</Badge>
                <Badge variant="destructive" className="text-[10px]">실패 {progress.failed}</Badge>
                <Badge variant="outline" className="text-[10px]">스킵 {progress.skipped}</Badge>
              </div>
            </div>
            <Progress value={progress.total === 0 ? 0 : (progress.done / progress.total) * 100} className="h-1.5" />
          </CardContent>
        </Card>
      )}

      {filtered.length === 0 ? (
        <Card className="rounded-2xl border-border/50">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            실패한 등록이 없습니다.
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-2xl border-border/50">
          <CardContent className="p-0">
            <div className="flex items-center gap-3 px-4 py-2 border-b text-xs text-muted-foreground">
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
              <div className="flex-1">상품 / 플랫폼</div>
              <div className="hidden md:block w-28 text-right">가격</div>
              <div className="flex-1 hidden lg:block">에러</div>
            </div>
            <ul className="divide-y">
              {useMemo(() => {
                const statusOrder: Record<string, number> = { pending: 0, success: 1, skipped: 2, failed: 3 };
                return [...filtered].sort((a, b) => {
                  const ak = key(a.product_id, a.platform);
                  const bk = key(b.product_id, b.platform);
                  const as = itemResults[ak] ?? "pending";
                  const bs = itemResults[bk] ?? "pending";
                  return statusOrder[as] - statusOrder[bs];
                });
              }, [filtered, itemResults]).map((d) => {
                const k = key(d.product_id, d.platform);
                const checked = selected.has(k);
                const title = d.platform_title || d.products?.source_name || d.product_id;
                const thumb = d.thumbnail_url || d.products?.thumbnail_url || null;
                const result = itemResults[k];
                return (
                  <li key={k} className="flex items-center gap-3 px-4 py-2.5">
                    <Checkbox checked={checked} onCheckedChange={() => toggleOne(d.product_id, d.platform)} disabled={progress.running} />
                    <div className="h-10 w-10 rounded-md bg-muted overflow-hidden flex-shrink-0">
                      {thumb && <img src={thumb} alt={title} className="h-full w-full object-cover" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{title}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {result === "success" ? (
                          <Badge variant="default" className="text-[10px]">{d.platform} ✅</Badge>
                        ) : result === "failed" ? (
                          <Badge variant="destructive" className="text-[10px]">{d.platform} ❌</Badge>
                        ) : result === "skipped" ? (
                          <Badge variant="outline" className="text-[10px]">{d.platform} ⏭️</Badge>
                        ) : progress.running ? (
                          <Badge variant="secondary" className="text-[10px] gap-1"><Loader2 className="h-3 w-3 animate-spin" />{d.platform} 처리 중</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">{d.platform} ❌</Badge>
                        )}
                      </div>
                    </div>
                    <div className="hidden md:block w-28 text-right text-sm">
                      {d.price ? formatKRW(d.price) : "-"}
                    </div>
                    <div className="flex-1 hidden lg:block text-xs text-muted-foreground truncate" title={d.error_message ?? ""}>
                      {d.error_message ?? "-"}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}