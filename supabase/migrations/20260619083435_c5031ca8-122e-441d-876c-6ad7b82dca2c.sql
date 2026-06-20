
-- Enums
CREATE TYPE product_status AS ENUM ('pending', 'approved', 'rejected', 'hold', 'sold_out', 'paused');
CREATE TYPE risk_level AS ENUM ('safe', 'caution', 'danger');
CREATE TYPE platform AS ENUM ('toss', '11st', 'gmarket', 'auction');

-- Products (candidate + approved)
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id TEXT,
  source_name TEXT NOT NULL,
  category TEXT,
  supply_price INTEGER NOT NULL DEFAULT 0,
  shipping_fee INTEGER NOT NULL DEFAULT 0,
  suggested_price INTEGER NOT NULL DEFAULT 0,
  expected_profit INTEGER NOT NULL DEFAULT 0,
  margin_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  stock_qty INTEGER NOT NULL DEFAULT 0,
  thumbnail_url TEXT,
  description TEXT,
  ai_score INTEGER NOT NULL DEFAULT 0,
  trademark_risk risk_level NOT NULL DEFAULT 'safe',
  risk_reason TEXT,
  sales_count INTEGER DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  status product_status NOT NULL DEFAULT 'pending',
  ai_evaluation JSONB,
  selected_platforms platform[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO anon, authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Open access products" ON public.products FOR ALL USING (true) WITH CHECK (true);

-- Platform listings
CREATE TABLE public.platform_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  platform platform NOT NULL,
  platform_title TEXT,
  promo_text TEXT,
  tags TEXT[],
  detail_html TEXT,
  thumbnail_url TEXT,
  price INTEGER,
  is_listed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, platform)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_listings TO anon, authenticated;
GRANT ALL ON public.platform_listings TO service_role;
ALTER TABLE public.platform_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Open access platform_listings" ON public.platform_listings FOR ALL USING (true) WITH CHECK (true);

-- Trend keywords
CREATE TABLE public.trend_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL,
  rank INTEGER,
  source TEXT,
  category TEXT,
  trend_score INTEGER DEFAULT 0,
  collected_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trend_keywords TO anon, authenticated;
GRANT ALL ON public.trend_keywords TO service_role;
ALTER TABLE public.trend_keywords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Open access trend_keywords" ON public.trend_keywords FOR ALL USING (true) WITH CHECK (true);

-- Inventory logs
CREATE TABLE public.inventory_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  prev_stock INTEGER,
  new_stock INTEGER,
  prev_price INTEGER,
  new_price INTEGER,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_logs TO anon, authenticated;
GRANT ALL ON public.inventory_logs TO service_role;
ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Open access inventory_logs" ON public.inventory_logs FOR ALL USING (true) WITH CHECK (true);

-- Settings (singleton row)
CREATE TABLE public.settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  domemae_api_key TEXT,
  naver_client_id TEXT,
  naver_client_secret TEXT,
  toss_api_key TEXT,
  api_11st_key TEXT,
  gmarket_api_key TEXT,
  auction_api_key TEXT,
  target_margin_rate NUMERIC(5,2) DEFAULT 25.0,
  min_stock_alert INTEGER DEFAULT 10,
  auto_price_update BOOLEAN DEFAULT false,
  default_platforms platform[] DEFAULT ARRAY['toss','11st','gmarket','auction']::platform[],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO anon, authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Open access settings" ON public.settings FOR ALL USING (true) WITH CHECK (true);
INSERT INTO public.settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Activity log
CREATE TABLE public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_log TO anon, authenticated;
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Open access activity_log" ON public.activity_log FOR ALL USING (true) WITH CHECK (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER settings_updated_at BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed sample products
INSERT INTO public.products (source_id, source_name, category, supply_price, shipping_fee, suggested_price, expected_profit, margin_rate, stock_qty, thumbnail_url, description, ai_score, trademark_risk, sales_count, review_count, status) VALUES
('DM-10001', '여름 시즌 쿨링 메쉬 티셔츠 (남성용)', '의류', 8500, 3000, 19900, 6200, 31.2, 245, 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600', '시원한 쿨링 원단으로 여름철 야외 활동에 최적화된 메쉬 티셔츠입니다.', 87, 'safe', 1240, 312, 'pending'),
('DM-10002', '무선 블루투스 이어폰 노이즈캔슬링', '전자기기', 18900, 0, 39900, 12400, 31.1, 89, 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600', '액티브 노이즈캔슬링 지원 무선 이어폰. 최대 30시간 재생.', 92, 'safe', 3210, 891, 'pending'),
('DM-10003', '대용량 스테인리스 텀블러 1L', '주방', 6700, 2500, 16900, 5300, 31.4, 412, 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=600', '24시간 보온/보냉, 식기세척기 사용 가능, BPA-Free.', 81, 'safe', 890, 245, 'pending'),
('DM-10004', '미니 휴대용 선풍기 USB 충전식', '계절가전', 4500, 2500, 12900, 4100, 31.7, 8, 'https://images.unsplash.com/photo-1597392582469-a697322d5c16?w=600', '3단 풍속 조절, 최대 8시간 사용, 목걸이 스트랩 포함.', 78, 'caution', 2105, 567, 'pending'),
('DM-10005', '강아지 자동 급식기 스마트', '반려동물', 24000, 3000, 49900, 15600, 31.3, 67, 'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=600', '앱 연동 자동 급식, 카메라 내장, 음성 녹음 가능.', 89, 'safe', 654, 203, 'pending'),
('DM-10006', '여성 빅사이즈 원피스 린넨 롱', '의류', 12500, 3000, 29900, 9400, 31.4, 156, 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=600', '시원한 린넨 100%, 빅사이즈 전용 패턴, 4가지 컬러.', 84, 'safe', 1432, 421, 'pending'),
('DM-10007', '캠핑용 LED 랜턴 충전식 방수', '캠핑', 9800, 3000, 22900, 7200, 31.5, 234, 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=600', 'IPX5 방수, 360도 발광, 보조배터리 기능 포함.', 86, 'safe', 987, 312, 'pending'),
('DM-10008', '주방용 실리콘 식기 세트 6P', '주방', 7500, 2500, 18900, 5900, 31.2, 5, 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600', '식품등급 실리콘, 내열 230도, 식기세척기 가능.', 75, 'safe', 543, 178, 'pending');

-- Seed trend keywords
INSERT INTO public.trend_keywords (keyword, rank, source, category, trend_score) VALUES
('쿨링 티셔츠', 1, '네이버 데이터랩', '의류', 95),
('휴대용 선풍기', 2, '네이버 데이터랩', '계절가전', 91),
('무선 이어폰', 3, '네이버 데이터랩', '전자기기', 88),
('캠핑 용품', 4, '네이버 데이터랩', '레저', 86),
('빅사이즈 원피스', 5, '네이버 데이터랩', '의류', 82),
('반려동물 자동급식기', 6, '네이버 데이터랩', '반려동물', 79),
('대용량 텀블러', 7, '네이버 데이터랩', '주방', 77),
('LED 랜턴', 8, '네이버 데이터랩', '캠핑', 73);

-- Seed activity log
INSERT INTO public.activity_log (action, target_type, message) VALUES
('trend_collected', 'system', '오전 6시 트렌드 키워드 8개 수집 완료'),
('products_imported', 'system', '도매매에서 후보 상품 8개 수집'),
('ai_scored', 'system', 'AI 평가 및 상표권 검수 완료');
