-- AI 엔진 확장: 스코어링/가격/상품명/KC/경쟁분석/주문 자동화
-- 기존 테이블은 유지하고 컬럼/테이블만 추가한다.

-- 1) 주문 상태 enum
DO $$ BEGIN
  CREATE TYPE public.order_status AS ENUM
    ('collected','ordered','shipped','invoiced','completed','failed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) products 확장 컬럼
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS score_breakdown JSONB,
  ADD COLUMN IF NOT EXISTS normal_price INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kc_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kc_number TEXT,
  ADD COLUMN IF NOT EXISTS kc_certified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS name_rationale JSONB,
  ADD COLUMN IF NOT EXISTS thumbnails JSONB,
  ADD COLUMN IF NOT EXISTS supplier TEXT,
  ADD COLUMN IF NOT EXISTS supplier_trust INTEGER NOT NULL DEFAULT 0;

-- 썸네일 저장용 공개 스토리지 버킷 (600/1000 규격 변환 URL 제공)
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-thumbnails', 'product-thumbnails', true)
ON CONFLICT (id) DO NOTHING;

-- 3) 경쟁 분석 결과
CREATE TABLE IF NOT EXISTS public.market_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  platform TEXT NOT NULL,
  product_count INTEGER NOT NULL DEFAULT 0,
  total_reviews INTEGER NOT NULL DEFAULT 0,
  avg_price INTEGER NOT NULL DEFAULT 0,
  min_price INTEGER NOT NULL DEFAULT 0,
  max_price INTEGER NOT NULL DEFAULT 0,
  top_titles JSONB,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_market_analysis_keyword ON public.market_analysis(keyword);
CREATE INDEX IF NOT EXISTS idx_market_analysis_product ON public.market_analysis(product_id);

-- 4) 주문 자동화
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform public.platform NOT NULL,
  market_order_no TEXT NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  buyer_name TEXT,
  buyer_phone TEXT,
  address TEXT,
  order_amount INTEGER NOT NULL DEFAULT 0,
  status public.order_status NOT NULL DEFAULT 'collected',
  supplier_order_no TEXT,
  tracking_no TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(platform, market_order_no)
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);

-- 5) RLS — 기존 앱 테이블과 동일하게 관리자 전용
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['market_analysis','orders']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'admin only ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(), ''admin'')) WITH CHECK (public.has_role(auth.uid(), ''admin''))',
      'admin only ' || t, t);
  END LOOP;
END $$;
