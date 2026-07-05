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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      bids: {
        Row: {
          amount_pence: number
          contractor_id: string
          created_at: string
          id: string
          job_id: string
          note: string | null
        }
        Insert: {
          amount_pence: number
          contractor_id: string
          created_at?: string
          id?: string
          job_id: string
          note?: string | null
        }
        Update: {
          amount_pence?: number
          contractor_id?: string
          created_at?: string
          id?: string
          job_id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bids_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bids_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bids_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "my_bid_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bids_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "public_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_reveals: {
        Row: {
          contractor_id: string
          id: string
          job_id: string
          revealed_at: string
          route: string
        }
        Insert: {
          contractor_id: string
          id?: string
          job_id: string
          revealed_at?: string
          route: string
        }
        Update: {
          contractor_id?: string
          id?: string
          job_id?: string
          revealed_at?: string
          route?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_reveals_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_reveals_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_reveals_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "my_bid_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_reveals_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "public_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_counties: {
        Row: {
          contractor_id: string
          county_id: number
        }
        Insert: {
          contractor_id: string
          county_id: number
        }
        Update: {
          contractor_id?: string
          county_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "contractor_counties_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_counties_county_id_fkey"
            columns: ["county_id"]
            isOneToOne: false
            referencedRelation: "counties"
            referencedColumns: ["id"]
          },
        ]
      }
      contractors: {
        Row: {
          base_postcode: string
          business_name: string
          contact_name: string
          created_at: string
          email: string
          id: string
          notify_new_jobs: boolean
          phone: string
          services: number[]
          status: string
        }
        Insert: {
          base_postcode: string
          business_name: string
          contact_name: string
          created_at?: string
          email: string
          id: string
          notify_new_jobs?: boolean
          phone: string
          services?: number[]
          status?: string
        }
        Update: {
          base_postcode?: string
          business_name?: string
          contact_name?: string
          created_at?: string
          email?: string
          id?: string
          notify_new_jobs?: boolean
          phone?: string
          services?: number[]
          status?: string
        }
        Relationships: []
      }
      counties: {
        Row: {
          country: string
          id: number
          name: string
          region: string
        }
        Insert: {
          country?: string
          id?: number
          name: string
          region: string
        }
        Update: {
          country?: string
          id?: number
          name?: string
          region?: string
        }
        Relationships: []
      }
      district_county_map: {
        Row: {
          admin_district: string
          county_id: number
        }
        Insert: {
          admin_district: string
          county_id: number
        }
        Update: {
          admin_district?: string
          county_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "district_county_map_county_id_fkey"
            columns: ["county_id"]
            isOneToOne: false
            referencedRelation: "counties"
            referencedColumns: ["id"]
          },
        ]
      }
      job_notifications: {
        Row: {
          contractor_id: string
          job_id: string
          kind: string
          sent_at: string
        }
        Insert: {
          contractor_id: string
          job_id: string
          kind: string
          sent_at?: string
        }
        Update: {
          contractor_id?: string
          job_id?: string
          kind?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_notifications_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_notifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_notifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "my_bid_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_notifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "public_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          awarded_bid_id: string | null
          bidding_closes_at: string
          bidding_opens_at: string
          budget_hint: string | null
          consent_at: string | null
          consent_to_share: boolean
          consent_wording_version: string | null
          county_id: number
          created_at: string
          created_by: string
          customer_email: string | null
          customer_first_name: string | null
          customer_name: string
          customer_phone: string
          description: string
          id: string
          postcode: string
          postcode_district: string
          service_ids: number[]
          status: string
          title: string
          town: string | null
        }
        Insert: {
          awarded_bid_id?: string | null
          bidding_closes_at: string
          bidding_opens_at: string
          budget_hint?: string | null
          consent_at?: string | null
          consent_to_share?: boolean
          consent_wording_version?: string | null
          county_id: number
          created_at?: string
          created_by: string
          customer_email?: string | null
          customer_first_name?: string | null
          customer_name: string
          customer_phone: string
          description: string
          id?: string
          postcode: string
          postcode_district: string
          service_ids?: number[]
          status?: string
          title: string
          town?: string | null
        }
        Update: {
          awarded_bid_id?: string | null
          bidding_closes_at?: string
          bidding_opens_at?: string
          budget_hint?: string | null
          consent_at?: string | null
          consent_to_share?: boolean
          consent_wording_version?: string | null
          county_id?: number
          created_at?: string
          created_by?: string
          customer_email?: string | null
          customer_first_name?: string | null
          customer_name?: string
          customer_phone?: string
          description?: string
          id?: string
          postcode?: string
          postcode_district?: string
          service_ids?: number[]
          status?: string
          title?: string
          town?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_county_id_fkey"
            columns: ["county_id"]
            isOneToOne: false
            referencedRelation: "counties"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          created_at: string
          details: Json
          email: string | null
          full_name: string
          id: string
          job_hint: string | null
          job_id: string | null
          phone: string | null
          postcode: string | null
          source: string
          status: string
        }
        Insert: {
          created_at?: string
          details?: Json
          email?: string | null
          full_name: string
          id?: string
          job_hint?: string | null
          job_id?: string | null
          phone?: string | null
          postcode?: string | null
          source?: string
          status?: string
        }
        Update: {
          created_at?: string
          details?: Json
          email?: string | null
          full_name?: string
          id?: string
          job_hint?: string | null
          job_id?: string | null
          phone?: string | null
          postcode?: string | null
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "my_bid_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "public_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_emails: {
        Row: {
          attempts: number
          created_at: string
          id: string
          kind: string
          payload: Json
          sent_at: string | null
          status: string
          to_email: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          kind: string
          payload?: Json
          sent_at?: string | null
          status?: string
          to_email: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          sent_at?: string | null
          status?: string
          to_email?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          id: number
          name: string
        }
        Insert: {
          id?: number
          name: string
        }
        Update: {
          id?: number
          name?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          contractor_id: string
          current_period_end: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          contractor_id: string
          current_period_end?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          contractor_id?: string
          current_period_end?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: true
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      my_bid_jobs: {
        Row: {
          awarded_bid_id: string | null
          bidding_closes_at: string | null
          budget_hint: string | null
          county: string | null
          county_id: number | null
          customer_first_name: string | null
          description: string | null
          id: string | null
          my_amount_pence: number | null
          my_bid_id: string | null
          my_note: string | null
          postcode_district: string | null
          service_ids: number[] | null
          status: string | null
          title: string | null
          town: string | null
          won: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_county_id_fkey"
            columns: ["county_id"]
            isOneToOne: false
            referencedRelation: "counties"
            referencedColumns: ["id"]
          },
        ]
      }
      public_jobs: {
        Row: {
          bid_count: number | null
          bidding_closes_at: string | null
          budget_hint: string | null
          county: string | null
          county_id: number | null
          customer_first_name: string | null
          description: string | null
          id: string | null
          is_exclusive: boolean | null
          paid_access: boolean | null
          postcode_district: string | null
          service_ids: number[] | null
          title: string | null
          town: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_county_id_fkey"
            columns: ["county_id"]
            isOneToOne: false
            referencedRelation: "counties"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_metrics: { Args: never; Returns: Json }
      award_job: {
        Args: { p_bid_id: string; p_job_id: string }
        Returns: undefined
      }
      close_due_jobs: { Args: never; Returns: undefined }
      get_job_contact: {
        Args: { p_job_id: string }
        Returns: {
          customer_email: string
          customer_name: string
          customer_phone: string
        }[]
      }
      is_active_subscriber: { Args: { p_contractor: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      mark_booked: { Args: { p_job_id: string }; Returns: undefined }
      notify_closing_soon: { Args: never; Returns: undefined }
      notify_job_open: { Args: { p_job_id: string }; Returns: undefined }
      notify_paid_members: { Args: { p_job_id: string }; Returns: undefined }
      open_due_jobs: { Args: never; Returns: undefined }
      place_bid: {
        Args: { p_amount_pence: number; p_job_id: string; p_note?: string }
        Returns: string
      }
    }
    Enums: {
      enum_listings_status: "draft" | "published" | "sold"
      enum_users_role: "admin" | "seller"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      enum_listings_status: ["draft", "published", "sold"],
      enum_users_role: ["admin", "seller"],
    },
  },
} as const
