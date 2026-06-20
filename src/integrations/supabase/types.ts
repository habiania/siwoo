export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      market_analysis: {
        Row: {
          avg_price: number
          created_at: string
          id: string
          keyword: string
          max_price: number
          min_price: number
          platform: string
          product_count: number
          product_id: string | null
          raw: Json | null
          top_titles: Json | null
          total_reviews: number
        }
        Insert: {
          avg_price?: number
          created_at?: string
          id?: string
          keyword: string
          max_price?: number
          min_price?: number
          platform: string
          product_count?: number
          product_id?: string | null
          raw?: Json | null
          top_titles?: Json | null
          total_reviews?: number
        }
        Update: {
          avg_price?: number
          created_at?: string
          id?: string
          keyword?: string
          max_price?: number
          min_price?: number
          platform?: string
          product_count?: number
          product_id?: string | null
          raw?: Json | null
          top_titles?: Json | null
          total_reviews?: number
        }
        Relationships: [
          {
            foreignKeyName: "market_analysis_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address: string | null
          buyer_name: string | null
          buyer_phone: string | null
          created_at: string
          error_message: string | null
          id: string
          market_order_no: string
          order_amount: number
          platform: Database["public"]["Enums"]["platform"]
          product_id: string | null
          product_name: string | null
          quantity: number
          status: Database["public"]["Enums"]["order_status"]
          supplier_order_no: string | null
          tracking_no: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          buyer_name?: string | null
          buyer_phone?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          market_order_no: string
          order_amount?: number
          platform: Database["public"]["Enums"]["platform"]
          product_id?: string | null
          product_name?: string | null
          quantity?: number
          status?: Database["public"]["Enums"]["order_status"]
          supplier_order_no?: string | null
          tracking_no?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          buyer_name?: string | null
          buyer_phone?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          market_order_no?: string
          order_amount?: number
          platform?: Database["public"]["Enums"]["platform"]
          product_id?: string | null
          product_name?: string | null
          quantity?: number
          status?: Database["public"]["Enums"]["order_status"]
          supplier_order_no?: string | null
          tracking_no?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          action: string
          created_at: string
          id: string
          message: string | null
          metadata: Json | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          message?: string | null
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          message?: string | null
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      inventory_logs: {
        Row: {
          created_at: string
          event_type: string
          id: string
          message: string | null
          new_price: number | null
          new_stock: number | null
          prev_price: number | null
          prev_stock: number | null
          product_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          message?: string | null
          new_price?: number | null
          new_stock?: number | null
          prev_price?: number | null
          prev_stock?: number | null
          product_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          message?: string | null
          new_price?: number | null
          new_stock?: number | null
          prev_price?: number | null
          prev_stock?: number | null
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_listings: {
        Row: {
          created_at: string
          detail_html: string | null
          error_message: string | null
          external_listing_id: string | null
          id: string
          is_listed: boolean | null
          listed_at: string | null
          platform: Database["public"]["Enums"]["platform"]
          platform_title: string | null
          price: number | null
          product_id: string
          promo_text: string | null
          status: Database["public"]["Enums"]["listing_status"]
          tags: string[] | null
          thumbnail_url: string | null
        }
        Insert: {
          created_at?: string
          detail_html?: string | null
          error_message?: string | null
          external_listing_id?: string | null
          id?: string
          is_listed?: boolean | null
          listed_at?: string | null
          platform: Database["public"]["Enums"]["platform"]
          platform_title?: string | null
          price?: number | null
          product_id: string
          promo_text?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          tags?: string[] | null
          thumbnail_url?: string | null
        }
        Update: {
          created_at?: string
          detail_html?: string | null
          error_message?: string | null
          external_listing_id?: string | null
          id?: string
          is_listed?: boolean | null
          listed_at?: string | null
          platform?: Database["public"]["Enums"]["platform"]
          platform_title?: string | null
          price?: number | null
          product_id?: string
          promo_text?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          tags?: string[] | null
          thumbnail_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_listings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          ai_evaluation: Json | null
          ai_score: number
          category: string | null
          created_at: string
          description: string | null
          expected_profit: number
          id: string
          margin_rate: number
          review_count: number | null
          risk_reason: string | null
          sales_count: number | null
          selected_platforms: Database["public"]["Enums"]["platform"][] | null
          shipping_fee: number
          source_id: string | null
          source_name: string
          status: Database["public"]["Enums"]["product_status"]
          stock_qty: number
          suggested_price: number
          supply_price: number
          thumbnail_url: string | null
          trademark_checked_at: string | null
          trademark_hits: Json | null
          trademark_risk: Database["public"]["Enums"]["risk_level"]
          score_breakdown: Json | null
          normal_price: number
          kc_required: boolean
          kc_number: string | null
          kc_certified: boolean
          name_rationale: Json | null
          thumbnails: Json | null
          supplier: string | null
          supplier_trust: number
          updated_at: string
        }
        Insert: {
          ai_evaluation?: Json | null
          ai_score?: number
          category?: string | null
          created_at?: string
          description?: string | null
          expected_profit?: number
          id?: string
          margin_rate?: number
          review_count?: number | null
          risk_reason?: string | null
          sales_count?: number | null
          selected_platforms?: Database["public"]["Enums"]["platform"][] | null
          shipping_fee?: number
          source_id?: string | null
          source_name: string
          status?: Database["public"]["Enums"]["product_status"]
          stock_qty?: number
          suggested_price?: number
          supply_price?: number
          thumbnail_url?: string | null
          trademark_checked_at?: string | null
          trademark_hits?: Json | null
          trademark_risk?: Database["public"]["Enums"]["risk_level"]
          score_breakdown?: Json | null
          normal_price?: number
          kc_required?: boolean
          kc_number?: string | null
          kc_certified?: boolean
          name_rationale?: Json | null
          thumbnails?: Json | null
          supplier?: string | null
          supplier_trust?: number
          updated_at?: string
        }
        Update: {
          ai_evaluation?: Json | null
          ai_score?: number
          category?: string | null
          created_at?: string
          description?: string | null
          expected_profit?: number
          id?: string
          margin_rate?: number
          review_count?: number | null
          risk_reason?: string | null
          sales_count?: number | null
          selected_platforms?: Database["public"]["Enums"]["platform"][] | null
          shipping_fee?: number
          source_id?: string | null
          source_name?: string
          status?: Database["public"]["Enums"]["product_status"]
          stock_qty?: number
          suggested_price?: number
          supply_price?: number
          thumbnail_url?: string | null
          trademark_checked_at?: string | null
          trademark_hits?: Json | null
          trademark_risk?: Database["public"]["Enums"]["risk_level"]
          score_breakdown?: Json | null
          normal_price?: number
          kc_required?: boolean
          kc_number?: string | null
          kc_certified?: boolean
          name_rationale?: Json | null
          thumbnails?: Json | null
          supplier?: string | null
          supplier_trust?: number
          updated_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          api_11st_key: string | null
          auction_api_key: string | null
          auto_price_update: boolean | null
          auto_trademark_check: boolean | null
          default_platforms: Database["public"]["Enums"]["platform"][] | null
          domemae_api_key: string | null
          gmarket_api_key: string | null
          id: number
          kipris_api_key: string | null
          min_stock_alert: number | null
          naver_client_id: string | null
          naver_client_secret: string | null
          target_margin_rate: number | null
          toss_api_key: string | null
          updated_at: string
        }
        Insert: {
          api_11st_key?: string | null
          auction_api_key?: string | null
          auto_price_update?: boolean | null
          auto_trademark_check?: boolean | null
          default_platforms?: Database["public"]["Enums"]["platform"][] | null
          domemae_api_key?: string | null
          gmarket_api_key?: string | null
          id?: number
          kipris_api_key?: string | null
          min_stock_alert?: number | null
          naver_client_id?: string | null
          naver_client_secret?: string | null
          target_margin_rate?: number | null
          toss_api_key?: string | null
          updated_at?: string
        }
        Update: {
          api_11st_key?: string | null
          auction_api_key?: string | null
          auto_price_update?: boolean | null
          auto_trademark_check?: boolean | null
          default_platforms?: Database["public"]["Enums"]["platform"][] | null
          domemae_api_key?: string | null
          gmarket_api_key?: string | null
          id?: number
          kipris_api_key?: string | null
          min_stock_alert?: number | null
          naver_client_id?: string | null
          naver_client_secret?: string | null
          target_margin_rate?: number | null
          toss_api_key?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      trend_keywords: {
        Row: {
          category: string | null
          collected_at: string
          created_at: string
          id: string
          keyword: string
          rank: number | null
          source: string | null
          trend_score: number | null
        }
        Insert: {
          category?: string | null
          collected_at?: string
          created_at?: string
          id?: string
          keyword: string
          rank?: number | null
          source?: string | null
          trend_score?: number | null
        }
        Update: {
          category?: string | null
          collected_at?: string
          created_at?: string
          id?: string
          keyword?: string
          rank?: number | null
          source?: string | null
          trend_score?: number | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      listing_status: "pending" | "success" | "failed" | "skipped"
      order_status:
        | "collected"
        | "ordered"
        | "shipped"
        | "invoiced"
        | "completed"
        | "failed"
        | "cancelled"
      platform: "toss" | "11st" | "gmarket" | "auction"
      product_status:
        | "pending"
        | "approved"
        | "rejected"
        | "hold"
        | "sold_out"
        | "paused"
      risk_level: "safe" | "caution" | "danger"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      listing_status: ["pending", "success", "failed", "skipped"],
      order_status: [
        "collected",
        "ordered",
        "shipped",
        "invoiced",
        "completed",
        "failed",
        "cancelled",
      ],
      platform: ["toss", "11st", "gmarket", "auction"],
      product_status: [
        "pending",
        "approved",
        "rejected",
        "hold",
        "sold_out",
        "paused",
      ],
      risk_level: ["safe", "caution", "danger"],
    },
  },
} as const
