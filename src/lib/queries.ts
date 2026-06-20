import { supabase } from "@/integrations/supabase/client";

export async function fetchProducts(status?: string) {
  let q = supabase.from("products").select("*").order("ai_score", { ascending: false });
  if (status) q = q.eq("status", status as never);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function fetchSettings() {
  const { data, error } = await supabase.from("settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchTrends() {
  const { data, error } = await supabase
    .from("trend_keywords")
    .select("*")
    .order("rank", { ascending: true })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

export async function fetchInventoryLogs() {
  const { data, error } = await supabase
    .from("inventory_logs")
    .select("*, products(source_name)")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

export async function fetchActivity() {
  const { data, error } = await supabase
    .from("activity_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

export async function fetchPlatformListings(productIds: string[]) {
  if (productIds.length === 0) return [];
  const { data, error } = await supabase
    .from("platform_listings")
    .select("product_id, platform, status, error_message, external_listing_id")
    .in("product_id", productIds);
  if (error) throw error;
  return data ?? [];
}

export async function fetchFailedListings() {
  const { data, error } = await supabase
    .from("platform_listings")
    .select(
      "product_id, platform, status, error_message, external_listing_id, platform_title, thumbnail_url, price, listed_at, products(source_name, thumbnail_url)",
    )
    .eq("status", "failed")
    .order("listed_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchSourcingCandidates(minScore = 0) {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .gte("ai_score", minScore)
    .order("ai_score", { ascending: false })
    .limit(200);
  if (error) {
    console.warn("[fetchSourcingCandidates]", error.message);
    return [];
  }
  return data ?? [];
}

// 신규 테이블(마이그레이션 미적용) 또는 권한 문제로 실패해도 대시보드가 깨지지 않도록
// 빈 배열로 폴백한다. 실제 운영 데이터는 마이그레이션 적용 후 채워진다.
export async function fetchMarketAnalysis() {
  const { data, error } = await supabase
    .from("market_analysis")
    .select("*, products(source_name)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    console.warn("[fetchMarketAnalysis]", error.message);
    return [];
  }
  return data ?? [];
}

export async function fetchOrders() {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    console.warn("[fetchOrders]", error.message);
    return [];
  }
  return data ?? [];
}

export async function fetchRiskProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .or(
      "trademark_risk.neq.safe,and(kc_required.eq.true,kc_certified.eq.false),status.eq.hold,status.eq.rejected",
    )
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) {
    console.warn("[fetchRiskProducts]", error.message);
    return [];
  }
  return data ?? [];
}

export function formatKRW(n: number) {
  return new Intl.NumberFormat("ko-KR").format(n) + "원";
}
