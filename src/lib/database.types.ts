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
      app_config: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      client_quotes: {
        Row: {
          client_price_pence: number
          client_rate_minimum_pence: number | null
          client_rate_value_pence: number | null
          contractor_display_label: string
          contractor_id: string
          contractor_note: string | null
          contractor_quote_id: string
          contractor_rating_avg: number | null
          contractor_rating_count: number
          contractor_real_name: string | null
          created_at: string
          distance_miles: number | null
          id: string
          markup_rate: number
          price_basis: string
          site_visit_required: boolean
          status: string
          submission_id: string
          unit_label: string | null
          unit_quantity: number | null
          valid_until: string
          viewed_at: string | null
        }
        Insert: {
          client_price_pence: number
          client_rate_minimum_pence?: number | null
          client_rate_value_pence?: number | null
          contractor_display_label: string
          contractor_id: string
          contractor_note?: string | null
          contractor_quote_id: string
          contractor_rating_avg?: number | null
          contractor_rating_count?: number
          contractor_real_name?: string | null
          created_at?: string
          distance_miles?: number | null
          id?: string
          markup_rate: number
          price_basis?: string
          site_visit_required?: boolean
          status?: string
          submission_id: string
          unit_label?: string | null
          unit_quantity?: number | null
          valid_until: string
          viewed_at?: string | null
        }
        Update: {
          client_price_pence?: number
          client_rate_minimum_pence?: number | null
          client_rate_value_pence?: number | null
          contractor_display_label?: string
          contractor_id?: string
          contractor_note?: string | null
          contractor_quote_id?: string
          contractor_rating_avg?: number | null
          contractor_rating_count?: number
          contractor_real_name?: string | null
          created_at?: string
          distance_miles?: number | null
          id?: string
          markup_rate?: number
          price_basis?: string
          site_visit_required?: boolean
          status?: string
          submission_id?: string
          unit_label?: string | null
          unit_quantity?: number | null
          valid_until?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_quotes_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_quotes_contractor_quote_id_fkey"
            columns: ["contractor_quote_id"]
            isOneToOne: true
            referencedRelation: "contractor_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_quotes_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "job_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_quotes_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "my_sq_invitations"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "client_quotes_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "my_sq_won_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_quotes_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "sq_payout_ready"
            referencedColumns: ["submission_id"]
          },
        ]
      }
      contact_reveals: {
        Row: {
          contractor_id: string | null
          id: string
          job_id: string
          revealed_at: string
          route: string
        }
        Insert: {
          contractor_id?: string | null
          id?: string
          job_id: string
          revealed_at?: string
          route: string
        }
        Update: {
          contractor_id?: string | null
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
            referencedRelation: "my_opened_jobs"
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
      contractor_quotes: {
        Row: {
          confirm_token: string | null
          confirmed_by_contractor: boolean
          contractor_id: string
          contractor_price_pence: number
          created_at: string
          id: string
          invitation_id: string
          note_to_client: string | null
          notes_internal: string | null
          price_basis: string
          quote_type: string
          rate_minimum_pence: number | null
          rate_value_pence: number | null
          site_visit_required: boolean
          source: string
          submission_id: string
          superseded_by: string | null
          unit_label: string | null
          unit_quantity: number | null
          valid_until: string
        }
        Insert: {
          confirm_token?: string | null
          confirmed_by_contractor?: boolean
          contractor_id: string
          contractor_price_pence: number
          created_at?: string
          id?: string
          invitation_id: string
          note_to_client?: string | null
          notes_internal?: string | null
          price_basis?: string
          quote_type?: string
          rate_minimum_pence?: number | null
          rate_value_pence?: number | null
          site_visit_required?: boolean
          source: string
          submission_id: string
          superseded_by?: string | null
          unit_label?: string | null
          unit_quantity?: number | null
          valid_until: string
        }
        Update: {
          confirm_token?: string | null
          confirmed_by_contractor?: boolean
          contractor_id?: string
          contractor_price_pence?: number
          created_at?: string
          id?: string
          invitation_id?: string
          note_to_client?: string | null
          notes_internal?: string | null
          price_basis?: string
          quote_type?: string
          rate_minimum_pence?: number | null
          rate_value_pence?: number | null
          site_visit_required?: boolean
          source?: string
          submission_id?: string
          superseded_by?: string | null
          unit_label?: string | null
          unit_quantity?: number | null
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_quotes_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_quotes_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "job_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_quotes_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "my_sq_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_quotes_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "job_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_quotes_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "my_sq_invitations"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "contractor_quotes_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "my_sq_won_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_quotes_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "sq_payout_ready"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "contractor_quotes_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "contractor_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_ratings: {
        Row: {
          comment: string | null
          contractor_id: string
          created_at: string
          id: string
          stars: number
          submission_id: string
        }
        Insert: {
          comment?: string | null
          contractor_id: string
          created_at?: string
          id?: string
          stars: number
          submission_id: string
        }
        Update: {
          comment?: string | null
          contractor_id?: string
          created_at?: string
          id?: string
          stars?: number
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_ratings_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_ratings_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: true
            referencedRelation: "job_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_ratings_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: true
            referencedRelation: "my_sq_invitations"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "contractor_ratings_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: true
            referencedRelation: "my_sq_won_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_ratings_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: true
            referencedRelation: "sq_payout_ready"
            referencedColumns: ["submission_id"]
          },
        ]
      }
      contractors: {
        Row: {
          base_lat: number | null
          base_lng: number | null
          base_postcode: string
          business_name: string
          contact_name: string
          created_at: string
          email: string
          id: string
          notify_new_jobs: boolean
          payout_before_balance: boolean
          phone: string
          rating_avg: number | null
          rating_count: number
          services: number[]
          status: string
          vetted_at: string | null
        }
        Insert: {
          base_lat?: number | null
          base_lng?: number | null
          base_postcode: string
          business_name: string
          contact_name: string
          created_at?: string
          email: string
          id: string
          notify_new_jobs?: boolean
          payout_before_balance?: boolean
          phone: string
          rating_avg?: number | null
          rating_count?: number
          services?: number[]
          status?: string
          vetted_at?: string | null
        }
        Update: {
          base_lat?: number | null
          base_lng?: number | null
          base_postcode?: string
          business_name?: string
          contact_name?: string
          created_at?: string
          email?: string
          id?: string
          notify_new_jobs?: boolean
          payout_before_balance?: boolean
          phone?: string
          rating_avg?: number | null
          rating_count?: number
          services?: number[]
          status?: string
          vetted_at?: string | null
        }
        Relationships: []
      }
      counties: {
        Row: {
          country: string
          covers: string | null
          id: number
          name: string
          region: string
        }
        Insert: {
          country?: string
          covers?: string | null
          id?: number
          name: string
          region: string
        }
        Update: {
          country?: string
          covers?: string | null
          id?: number
          name?: string
          region?: string
        }
        Relationships: []
      }
      cron_runs: {
        Row: {
          detail: Json | null
          error: string | null
          finished_at: string | null
          id: string
          name: string
          ok: boolean | null
          started_at: string
        }
        Insert: {
          detail?: Json | null
          error?: string | null
          finished_at?: string | null
          id?: string
          name: string
          ok?: boolean | null
          started_at?: string
        }
        Update: {
          detail?: Json | null
          error?: string | null
          finished_at?: string | null
          id?: string
          name?: string
          ok?: boolean | null
          started_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          contact_name: string | null
          created_at: string
          email: string
          id: string
          phone: string | null
        }
        Insert: {
          contact_name?: string | null
          created_at?: string
          email: string
          id: string
          phone?: string | null
        }
        Update: {
          contact_name?: string | null
          created_at?: string
          email?: string
          id?: string
          phone?: string | null
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
      feedback: {
        Row: {
          created_at: string
          email: string | null
          handled_at: string | null
          handled_by: string | null
          id: string
          message: string
          path: string | null
          role: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          message: string
          path?: string | null
          role?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          message?: string
          path?: string | null
          role?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      gsc_auth: {
        Row: {
          connected_at: string | null
          connected_email: string | null
          id: boolean
          refresh_token: string | null
        }
        Insert: {
          connected_at?: string | null
          connected_email?: string | null
          id?: boolean
          refresh_token?: string | null
        }
        Update: {
          connected_at?: string | null
          connected_email?: string | null
          id?: boolean
          refresh_token?: string | null
        }
        Relationships: []
      }
      inbound_email_events: {
        Row: {
          created_at: string
          from_email: string
          id: number
          invitation_id: string | null
          outcome: string
          parsed: Json | null
          raw_excerpt: string | null
          to_email: string
        }
        Insert: {
          created_at?: string
          from_email: string
          id?: number
          invitation_id?: string | null
          outcome: string
          parsed?: Json | null
          raw_excerpt?: string | null
          to_email: string
        }
        Update: {
          created_at?: string
          from_email?: string
          id?: number
          invitation_id?: string | null
          outcome?: string
          parsed?: Json | null
          raw_excerpt?: string | null
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbound_email_events_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "job_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_email_events_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "my_sq_invitations"
            referencedColumns: ["id"]
          },
        ]
      }
      invitation_events: {
        Row: {
          contractor_id: string
          created_at: string
          event_type: string
          id: number
          invitation_id: string
          metadata: Json
        }
        Insert: {
          contractor_id: string
          created_at?: string
          event_type: string
          id?: number
          invitation_id: string
          metadata?: Json
        }
        Update: {
          contractor_id?: string
          created_at?: string
          event_type?: string
          id?: number
          invitation_id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "invitation_events_invitation_fk"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "job_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitation_events_invitation_fk"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "my_sq_invitations"
            referencedColumns: ["id"]
          },
        ]
      }
      job_events: {
        Row: {
          actor_id: string | null
          actor_type: string
          created_at: string
          event_type: string
          from_status: string | null
          id: number
          job_id: string
          metadata: Json
          reason: string | null
          to_status: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_type: string
          created_at?: string
          event_type: string
          from_status?: string | null
          id?: number
          job_id: string
          metadata?: Json
          reason?: string | null
          to_status?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          event_type?: string
          from_status?: string | null
          id?: number
          job_id?: string
          metadata?: Json
          reason?: string | null
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "my_sq_invitations"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "job_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "my_sq_won_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "sq_payout_ready"
            referencedColumns: ["submission_id"]
          },
        ]
      }
      job_invitations: {
        Row: {
          contractor_id: string
          decline_reason: string | null
          display_label: string | null
          distance_miles: number | null
          id: string
          opened_at: string | null
          sent_at: string
          status: string
          submission_id: string
          token: string
        }
        Insert: {
          contractor_id: string
          decline_reason?: string | null
          display_label?: string | null
          distance_miles?: number | null
          id?: string
          opened_at?: string | null
          sent_at?: string
          status?: string
          submission_id: string
          token: string
        }
        Update: {
          contractor_id?: string
          decline_reason?: string | null
          display_label?: string | null
          distance_miles?: number | null
          id?: string
          opened_at?: string | null
          sent_at?: string
          status?: string
          submission_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_invitations_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_invitations_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "job_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_invitations_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "my_sq_invitations"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "job_invitations_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "my_sq_won_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_invitations_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "sq_payout_ready"
            referencedColumns: ["submission_id"]
          },
        ]
      }
      job_messages: {
        Row: {
          alerted_at: string | null
          body: string
          created_at: string
          id: string
          invitation_id: string
          phase: string
          read_at: string | null
          sender: string
          submission_id: string
        }
        Insert: {
          alerted_at?: string | null
          body: string
          created_at?: string
          id?: string
          invitation_id: string
          phase: string
          read_at?: string | null
          sender: string
          submission_id: string
        }
        Update: {
          alerted_at?: string | null
          body?: string
          created_at?: string
          id?: string
          invitation_id?: string
          phase?: string
          read_at?: string | null
          sender?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_messages_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "job_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_messages_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "my_sq_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_messages_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "job_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_messages_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "my_sq_invitations"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "job_messages_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "my_sq_won_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_messages_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "sq_payout_ready"
            referencedColumns: ["submission_id"]
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
            referencedRelation: "my_opened_jobs"
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
      job_parse_events: {
        Row: {
          action: string
          created_at: string
          id: number
          ip: string
          outcome: string
          reason: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: number
          ip: string
          outcome: string
          reason?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: number
          ip?: string
          outcome?: string
          reason?: string | null
        }
        Relationships: []
      }
      job_payments: {
        Row: {
          amount_pence: number
          attempts: number
          client_quote_id: string
          created_at: string
          currency: string
          due_at: string | null
          expires_at: string
          id: string
          kind: string
          last_attempt_at: string | null
          last_error: string | null
          paid_at: string | null
          refunded_at: string | null
          refunded_pence: number | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_payment_intent_id: string | null
          stripe_payment_method_id: string | null
          submission_id: string
        }
        Insert: {
          amount_pence: number
          attempts?: number
          client_quote_id: string
          created_at?: string
          currency?: string
          due_at?: string | null
          expires_at: string
          id?: string
          kind?: string
          last_attempt_at?: string | null
          last_error?: string | null
          paid_at?: string | null
          refunded_at?: string | null
          refunded_pence?: number | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_payment_method_id?: string | null
          submission_id: string
        }
        Update: {
          amount_pence?: number
          attempts?: number
          client_quote_id?: string
          created_at?: string
          currency?: string
          due_at?: string | null
          expires_at?: string
          id?: string
          kind?: string
          last_attempt_at?: string | null
          last_error?: string | null
          paid_at?: string | null
          refunded_at?: string | null
          refunded_pence?: number | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_payment_method_id?: string | null
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_payments_client_quote_id_fkey"
            columns: ["client_quote_id"]
            isOneToOne: false
            referencedRelation: "client_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_payments_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "job_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_payments_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "my_sq_invitations"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "job_payments_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "my_sq_won_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_payments_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "sq_payout_ready"
            referencedColumns: ["submission_id"]
          },
        ]
      }
      job_schedules: {
        Row: {
          active: boolean
          contractor_id: string | null
          contractor_mode: string
          created_at: string
          customer_id: string
          id: string
          interval_months: number
          last_run_at: string | null
          next_run_at: string
          runs: number
          source_submission_id: string
        }
        Insert: {
          active?: boolean
          contractor_id?: string | null
          contractor_mode?: string
          created_at?: string
          customer_id: string
          id?: string
          interval_months: number
          last_run_at?: string | null
          next_run_at: string
          runs?: number
          source_submission_id: string
        }
        Update: {
          active?: boolean
          contractor_id?: string | null
          contractor_mode?: string
          created_at?: string
          customer_id?: string
          id?: string
          interval_months?: number
          last_run_at?: string | null
          next_run_at?: string
          runs?: number
          source_submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_schedules_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_schedules_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_schedules_source_submission_id_fkey"
            columns: ["source_submission_id"]
            isOneToOne: false
            referencedRelation: "job_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_schedules_source_submission_id_fkey"
            columns: ["source_submission_id"]
            isOneToOne: false
            referencedRelation: "my_sq_invitations"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "job_schedules_source_submission_id_fkey"
            columns: ["source_submission_id"]
            isOneToOne: false
            referencedRelation: "my_sq_won_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_schedules_source_submission_id_fkey"
            columns: ["source_submission_id"]
            isOneToOne: false
            referencedRelation: "sq_payout_ready"
            referencedColumns: ["submission_id"]
          },
        ]
      }
      job_submission_parses: {
        Row: {
          created_at: string
          deterministic_output: Json
          error: string | null
          id: string
          latency_ms: number | null
          model_output: Json | null
          model_version: string | null
          parse_source: string | null
          prompt_version: string | null
          submission_id: string
        }
        Insert: {
          created_at?: string
          deterministic_output?: Json
          error?: string | null
          id?: string
          latency_ms?: number | null
          model_output?: Json | null
          model_version?: string | null
          parse_source?: string | null
          prompt_version?: string | null
          submission_id: string
        }
        Update: {
          created_at?: string
          deterministic_output?: Json
          error?: string | null
          id?: string
          latency_ms?: number | null
          model_output?: Json | null
          model_version?: string | null
          parse_source?: string | null
          prompt_version?: string | null
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_submission_parses_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "job_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_submission_parses_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "my_sq_invitations"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "job_submission_parses_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "my_sq_won_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_submission_parses_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "sq_payout_ready"
            referencedColumns: ["submission_id"]
          },
        ]
      }
      job_submissions: {
        Row: {
          accepted_client_quote_id: string | null
          access_notes: string | null
          amended_at: string | null
          area_mapped_value: number | null
          area_source: string
          area_unit: string | null
          area_value: number | null
          awarded_at: string | null
          awarded_contractor_id: string | null
          boundary: Json | null
          client_token: string | null
          client_token_revoked_at: string | null
          completed_by_contractor_at: string | null
          confirmed_at: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contact_preference: string | null
          contractor_invoice_at: string | null
          contractor_invoice_name: string | null
          contractor_invoice_path: string | null
          county_id: number | null
          created_at: string
          customer_id: string | null
          details_text: string | null
          distributed_at: string | null
          draft_chased_at: string | null
          expires_at: string | null
          extra_work_of: string | null
          extra_work_origin: string | null
          first_refusal: boolean
          gate_w3w: string | null
          gate_width: string | null
          gclid: string | null
          hidden_at: string | null
          hidden_by: string | null
          id: string
          lat: number | null
          lng: number | null
          location_raw: string | null
          market_opens_at: string | null
          missing_fields: string[]
          model_version: string | null
          obstacles: string | null
          parse_confidence: Json
          parse_source: string | null
          parsed_at: string | null
          photo_paths: string[]
          postcode: string | null
          preferred_contractor_id: string | null
          prompt_version: string | null
          quotes_notified_at: string | null
          raw_text: string
          repeat_of: string | null
          service_alternatives: string[]
          service_attributes: Json
          service_confirmed: boolean | null
          service_id: number | null
          service_verbatim: string | null
          status: string
          target_date: string | null
          urgency: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          accepted_client_quote_id?: string | null
          access_notes?: string | null
          amended_at?: string | null
          area_mapped_value?: number | null
          area_source?: string
          area_unit?: string | null
          area_value?: number | null
          awarded_at?: string | null
          awarded_contractor_id?: string | null
          boundary?: Json | null
          client_token?: string | null
          client_token_revoked_at?: string | null
          completed_by_contractor_at?: string | null
          confirmed_at?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_preference?: string | null
          contractor_invoice_at?: string | null
          contractor_invoice_name?: string | null
          contractor_invoice_path?: string | null
          county_id?: number | null
          created_at?: string
          customer_id?: string | null
          details_text?: string | null
          distributed_at?: string | null
          draft_chased_at?: string | null
          expires_at?: string | null
          extra_work_of?: string | null
          extra_work_origin?: string | null
          first_refusal?: boolean
          gate_w3w?: string | null
          gate_width?: string | null
          gclid?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          location_raw?: string | null
          market_opens_at?: string | null
          missing_fields?: string[]
          model_version?: string | null
          obstacles?: string | null
          parse_confidence?: Json
          parse_source?: string | null
          parsed_at?: string | null
          photo_paths?: string[]
          postcode?: string | null
          preferred_contractor_id?: string | null
          prompt_version?: string | null
          quotes_notified_at?: string | null
          raw_text: string
          repeat_of?: string | null
          service_alternatives?: string[]
          service_attributes?: Json
          service_confirmed?: boolean | null
          service_id?: number | null
          service_verbatim?: string | null
          status?: string
          target_date?: string | null
          urgency?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          accepted_client_quote_id?: string | null
          access_notes?: string | null
          amended_at?: string | null
          area_mapped_value?: number | null
          area_source?: string
          area_unit?: string | null
          area_value?: number | null
          awarded_at?: string | null
          awarded_contractor_id?: string | null
          boundary?: Json | null
          client_token?: string | null
          client_token_revoked_at?: string | null
          completed_by_contractor_at?: string | null
          confirmed_at?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_preference?: string | null
          contractor_invoice_at?: string | null
          contractor_invoice_name?: string | null
          contractor_invoice_path?: string | null
          county_id?: number | null
          created_at?: string
          customer_id?: string | null
          details_text?: string | null
          distributed_at?: string | null
          draft_chased_at?: string | null
          expires_at?: string | null
          extra_work_of?: string | null
          extra_work_origin?: string | null
          first_refusal?: boolean
          gate_w3w?: string | null
          gate_width?: string | null
          gclid?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          location_raw?: string | null
          market_opens_at?: string | null
          missing_fields?: string[]
          model_version?: string | null
          obstacles?: string | null
          parse_confidence?: Json
          parse_source?: string | null
          parsed_at?: string | null
          photo_paths?: string[]
          postcode?: string | null
          preferred_contractor_id?: string | null
          prompt_version?: string | null
          quotes_notified_at?: string | null
          raw_text?: string
          repeat_of?: string | null
          service_alternatives?: string[]
          service_attributes?: Json
          service_confirmed?: boolean | null
          service_id?: number | null
          service_verbatim?: string | null
          status?: string
          target_date?: string | null
          urgency?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_submissions_accepted_quote_fk"
            columns: ["accepted_client_quote_id"]
            isOneToOne: false
            referencedRelation: "client_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_submissions_awarded_contractor_id_fkey"
            columns: ["awarded_contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_submissions_county_id_fkey"
            columns: ["county_id"]
            isOneToOne: false
            referencedRelation: "counties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_submissions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_submissions_extra_work_of_fkey"
            columns: ["extra_work_of"]
            isOneToOne: false
            referencedRelation: "job_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_submissions_extra_work_of_fkey"
            columns: ["extra_work_of"]
            isOneToOne: false
            referencedRelation: "my_sq_invitations"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "job_submissions_extra_work_of_fkey"
            columns: ["extra_work_of"]
            isOneToOne: false
            referencedRelation: "my_sq_won_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_submissions_extra_work_of_fkey"
            columns: ["extra_work_of"]
            isOneToOne: false
            referencedRelation: "sq_payout_ready"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "job_submissions_preferred_contractor_id_fkey"
            columns: ["preferred_contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_submissions_repeat_of_fkey"
            columns: ["repeat_of"]
            isOneToOne: false
            referencedRelation: "job_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_submissions_repeat_of_fkey"
            columns: ["repeat_of"]
            isOneToOne: false
            referencedRelation: "my_sq_invitations"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "job_submissions_repeat_of_fkey"
            columns: ["repeat_of"]
            isOneToOne: false
            referencedRelation: "my_sq_won_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_submissions_repeat_of_fkey"
            columns: ["repeat_of"]
            isOneToOne: false
            referencedRelation: "sq_payout_ready"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "job_submissions_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          bidding_opens_at: string
          budget_hint: string | null
          consent_at: string | null
          consent_to_share: boolean
          consent_wording_version: string | null
          county_id: number
          created_at: string
          created_by: string | null
          customer_email: string | null
          customer_first_name: string | null
          customer_name: string
          customer_phone: string
          description: string
          id: string
          postcode: string | null
          postcode_district: string | null
          service_ids: number[]
          status: string
          title: string
          town: string | null
        }
        Insert: {
          bidding_opens_at: string
          budget_hint?: string | null
          consent_at?: string | null
          consent_to_share?: boolean
          consent_wording_version?: string | null
          county_id: number
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_first_name?: string | null
          customer_name: string
          customer_phone: string
          description: string
          id?: string
          postcode?: string | null
          postcode_district?: string | null
          service_ids?: number[]
          status?: string
          title: string
          town?: string | null
        }
        Update: {
          bidding_opens_at?: string
          budget_hint?: string | null
          consent_at?: string | null
          consent_to_share?: boolean
          consent_wording_version?: string | null
          county_id?: number
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_first_name?: string | null
          customer_name?: string
          customer_phone?: string
          description?: string
          id?: string
          postcode?: string | null
          postcode_district?: string | null
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
      landing_views: {
        Row: {
          created_at: string
          gclid: string | null
          id: number
          ip: string | null
          path: string
          referrer: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          created_at?: string
          gclid?: string | null
          id?: number
          ip?: string | null
          path?: string
          referrer?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          created_at?: string
          gclid?: string | null
          id?: number
          ip?: string | null
          path?: string
          referrer?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
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
          submission_id: string | null
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
          submission_id?: string | null
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
          submission_id?: string | null
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
            referencedRelation: "my_opened_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "public_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "job_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "my_sq_invitations"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "leads_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "my_sq_won_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "sq_payout_ready"
            referencedColumns: ["submission_id"]
          },
        ]
      }
      notes: {
        Row: {
          content_md: string
          created_at: string
          excerpt: string | null
          featured: boolean
          hero_alt: string | null
          hero_path: string | null
          id: string
          primary_tag: string | null
          published: boolean
          published_at: string | null
          slug: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          content_md?: string
          created_at?: string
          excerpt?: string | null
          featured?: boolean
          hero_alt?: string | null
          hero_path?: string | null
          id?: string
          primary_tag?: string | null
          published?: boolean
          published_at?: string | null
          slug: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          content_md?: string
          created_at?: string
          excerpt?: string | null
          featured?: boolean
          hero_alt?: string | null
          hero_path?: string | null
          id?: string
          primary_tag?: string | null
          published?: boolean
          published_at?: string | null
          slug?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      page_events: {
        Row: {
          created_at: string
          depth_pct: number | null
          doc_h: number | null
          has_gclid: boolean | null
          id: number
          kind: string
          label: string | null
          path: string
          seconds: number | null
          session_key: string
          utm_medium: string | null
          utm_source: string | null
          viewport_w: number | null
          x_pct: number | null
          y_pct: number | null
        }
        Insert: {
          created_at?: string
          depth_pct?: number | null
          doc_h?: number | null
          has_gclid?: boolean | null
          id?: never
          kind: string
          label?: string | null
          path: string
          seconds?: number | null
          session_key: string
          utm_medium?: string | null
          utm_source?: string | null
          viewport_w?: number | null
          x_pct?: number | null
          y_pct?: number | null
        }
        Update: {
          created_at?: string
          depth_pct?: number | null
          doc_h?: number | null
          has_gclid?: boolean | null
          id?: never
          kind?: string
          label?: string | null
          path?: string
          seconds?: number | null
          session_key?: string
          utm_medium?: string | null
          utm_source?: string | null
          viewport_w?: number | null
          x_pct?: number | null
          y_pct?: number | null
        }
        Relationships: []
      }
      pending_emails: {
        Row: {
          attempts: number
          created_at: string
          delivery_at: string | null
          delivery_detail: string | null
          delivery_status: string | null
          id: string
          kind: string
          payload: Json
          provider_message_id: string | null
          retry_count: number
          retry_of: string | null
          send_after: string | null
          sent_at: string | null
          status: string
          to_email: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          delivery_at?: string | null
          delivery_detail?: string | null
          delivery_status?: string | null
          id?: string
          kind: string
          payload?: Json
          provider_message_id?: string | null
          retry_count?: number
          retry_of?: string | null
          send_after?: string | null
          sent_at?: string | null
          status?: string
          to_email: string
        }
        Update: {
          attempts?: number
          created_at?: string
          delivery_at?: string | null
          delivery_detail?: string | null
          delivery_status?: string | null
          id?: string
          kind?: string
          payload?: Json
          provider_message_id?: string | null
          retry_count?: number
          retry_of?: string | null
          send_after?: string | null
          sent_at?: string | null
          status?: string
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_emails_retry_of_fkey"
            columns: ["retry_of"]
            isOneToOne: false
            referencedRelation: "pending_emails"
            referencedColumns: ["id"]
          },
        ]
      }
      recent_work_seed: {
        Row: {
          amount_pence: number
          created_at: string
          id: number
          note: string | null
          service_id: number
          sort_order: number
          source: string
        }
        Insert: {
          amount_pence: number
          created_at?: string
          id?: never
          note?: string | null
          service_id: number
          sort_order?: number
          source?: string
        }
        Update: {
          amount_pence?: number
          created_at?: string
          id?: never
          note?: string | null
          service_id?: number
          sort_order?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "recent_work_seed_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          area_priced: boolean
          id: number
          listed: boolean
          name: string
        }
        Insert: {
          area_priced?: boolean
          id?: number
          listed?: boolean
          name: string
        }
        Update: {
          area_priced?: boolean
          id?: number
          listed?: boolean
          name?: string
        }
        Relationships: []
      }
      submission_notifications: {
        Row: {
          kind: string
          recipient: string
          sent_at: string
          submission_id: string
        }
        Insert: {
          kind: string
          recipient: string
          sent_at?: string
          submission_id: string
        }
        Update: {
          kind?: string
          recipient?: string
          sent_at?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_notifications_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "job_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_notifications_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "my_sq_invitations"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "submission_notifications_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "my_sq_won_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_notifications_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "sq_payout_ready"
            referencedColumns: ["submission_id"]
          },
        ]
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
      undeliverable_emails: {
        Row: {
          bounces: number
          email: string
          first_seen_at: string
          last_detail: string | null
          last_kind: string | null
          last_seen_at: string
        }
        Insert: {
          bounces?: number
          email: string
          first_seen_at?: string
          last_detail?: string | null
          last_kind?: string | null
          last_seen_at?: string
        }
        Update: {
          bounces?: number
          email?: string
          first_seen_at?: string
          last_detail?: string | null
          last_kind?: string | null
          last_seen_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      jobs_in_progress: {
        Row: {
          county: string | null
          created_on: string | null
          ord: number | null
          service: string | null
          size_label: string | null
        }
        Relationships: []
      }
      my_opened_jobs: {
        Row: {
          budget_hint: string | null
          county: string | null
          county_id: number | null
          customer_first_name: string | null
          description: string | null
          id: string | null
          opened_at: string | null
          postcode_district: string | null
          service_ids: number[] | null
          status: string | null
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
      my_sq_invitations: {
        Row: {
          access_notes: string | null
          area_mapped_value: number | null
          area_source: string | null
          area_unit: string | null
          area_value: number | null
          boundary: Json | null
          county: string | null
          decline_reason: string | null
          distance_miles: number | null
          expires_at: string | null
          gate_width: string | null
          id: string | null
          job_state: string | null
          obstacles: string | null
          offered_until: string | null
          opened_at: string | null
          postcode_district: string | null
          sent_at: string | null
          service: string | null
          service_attributes: Json | null
          status: string | null
          submission_id: string | null
          target_date: string | null
          token: string | null
          urgency: string | null
        }
        Relationships: []
      }
      my_sq_won_jobs: {
        Row: {
          access_notes: string | null
          area_mapped_value: number | null
          area_unit: string | null
          area_value: number | null
          awarded_at: string | null
          boundary: Json | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contact_preference: string | null
          contractor_invoice_at: string | null
          contractor_invoice_name: string | null
          contractor_price_pence: number | null
          county: string | null
          gate_w3w: string | null
          gate_width: string | null
          id: string | null
          lat: number | null
          lng: number | null
          obstacles: string | null
          postcode: string | null
          service: string | null
          service_attributes: Json | null
          status: string | null
          target_date: string | null
          urgency: string | null
        }
        Relationships: []
      }
      public_jobs: {
        Row: {
          budget_hint: string | null
          county: string | null
          county_id: number | null
          created_at: string | null
          customer_first_name: string | null
          description: string | null
          id: string | null
          is_exclusive: boolean | null
          opened_at: string | null
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
      recent_work: {
        Row: {
          amount_pence: number | null
          ord: number | null
          service_name: string | null
          source: string | null
          stars: number | null
        }
        Relationships: []
      }
      sq_payout_ready: {
        Row: {
          business_name: string | null
          collected_pence: number | null
          contractor_id: string | null
          contractor_invoice_at: string | null
          owed_pence: number | null
          payout_before_balance: boolean | null
          status: string | null
          submission_id: string | null
          total_pence: number | null
        }
        Relationships: [
          {
            foreignKeyName: "job_submissions_awarded_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_add_extra_work: {
        Args: {
          p_actor_id: string
          p_contractor_price_pence: number
          p_description: string
          p_price_basis: string
          p_reason: string
          p_submission_id: string
        }
        Returns: Json
      }
      admin_dashboard: { Args: never; Returns: Json }
      contractor_add_extra_work: {
        Args: {
          p_contractor_id: string
          p_contractor_price_pence: number
          p_description: string
          p_note_to_client?: string
          p_price_basis: string
          p_submission_id: string
        }
        Returns: Json
      }
      admin_delete_submission: {
        Args: { p_submission_id: string }
        Returns: Json
      }
      admin_hide_drafts: {
        Args: { p_actor: string; p_ids: string[] }
        Returns: Json
      }
      admin_metrics: { Args: never; Returns: Json }
      admin_submission_board: {
        Args: {
          p_include_hidden?: boolean
          p_limit?: number
          p_statuses?: string[]
        }
        Returns: Json
      }
      admin_unhide_drafts: { Args: { p_ids: string[] }; Returns: Json }
      anon_exposed_functions: {
        Args: never
        Returns: {
          fn: string
        }[]
      }
      app_config_num: {
        Args: { p_default: number; p_key: string }
        Returns: number
      }
      auto_confirm_due_completions: { Args: never; Returns: number }
      award_submission: { Args: { p_session_id: string }; Returns: Json }
      begin_acceptance: {
        Args: {
          p_checkout_url: string
          p_client_quote_id: string
          p_client_token: string
          p_deposit_pence?: number
          p_session_expires_at: string
          p_session_id: string
        }
        Returns: Json
      }
      cancel_job_by_client: {
        Args: {
          p_fee_pence: number
          p_refund_pence: number
          p_submission_id: string
        }
        Returns: Json
      }
      claim_submission_for_customer: {
        Args: { p_customer_id: string; p_token: string }
        Returns: Json
      }
      client_price_pence: {
        Args: { p_contractor_pence: number; p_rate: number }
        Returns: number
      }
      confirm_completion_by_client: {
        Args: { p_submission_id: string }
        Returns: Json
      }
      confirm_email_quote: { Args: { p_confirm_token: string }; Returns: Json }
      cron_jobs_health: {
        Args: never
        Returns: {
          active: boolean
          command: string
          failures_24h: number
          jobname: string
          last_end: string
          last_message: string
          last_start: string
          last_status: string
          runs_24h: number
          schedule: string
        }[]
      }
      decline_invitation: {
        Args: { p_reason: string; p_token: string }
        Returns: Json
      }
      distribute_submission: {
        Args: { p_submission_id: string }
        Returns: Json
      }
      drain_emails_tick: { Args: never; Returns: number }
      email_drain_health: {
        Args: { p_limit?: number }
        Returns: {
          body: string
          called_at: string
          status_code: number
        }[]
      }
      haversine_miles: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      invite_contractor_to_open_jobs: {
        Args: { p_contractor_id: string; p_county_id?: number }
        Returns: number
      }
      is_active_subscriber: { Args: { p_contractor: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      log_first_contact: {
        Args: { p_contractor_id: string; p_submission_id: string }
        Returns: Json
      }
      log_job_event: {
        // HAND-CORRECTED, and it will be lost on the next `gen types` run.
        // Supabase types a function argument as required and non-null when the
        // SQL declares no DEFAULT, regardless of whether the parameter accepts
        // null. Every one of these does: 38 job_events rows in production have
        // from_status and to_status both null (quote_received, job_amended,
        // consent_recorded — events that are not status transitions).
        // Re-apply this after regenerating, or give the SQL arguments defaults.
        Args: {
          p_actor_id: string | null
          p_actor_type: string
          p_event_type: string
          p_from: string | null
          p_job_id: string
          p_metadata: Json
          p_reason: string | null
          p_to: string | null
        }
        Returns: undefined
      }
      mark_completed_by_contractor: {
        Args: { p_contractor_id: string; p_submission_id: string }
        Returns: Json
      }
      mark_submission_completed: {
        Args: {
          p_operator_id: string
          p_reason: string
          p_submission_id: string
        }
        Returns: Json
      }
      notify_job_open: { Args: { p_job_id: string }; Returns: undefined }
      notify_paid_members: { Args: { p_job_id: string }; Returns: undefined }
      open_due_jobs: { Args: never; Returns: undefined }
      open_job: {
        Args: { p_job_id: string }
        Returns: {
          customer_email: string
          customer_name: string
          customer_phone: string
        }[]
      }
      open_submission_to_market: {
        Args: { p_reason?: string; p_submission_id: string }
        Returns: Json
      }
      record_invitation_view: { Args: { p_token: string }; Returns: Json }
      record_undeliverable_email: {
        Args: { p_detail: string; p_email: string; p_kind: string }
        Returns: undefined
      }
      run_due_job_schedules: { Args: never; Returns: number }
      sealed_quote_tick: { Args: never; Returns: undefined }
      send_chase_emails: { Args: never; Returns: Json }
      service_label_from_text: { Args: { p_text: string }; Returns: string }
      sq_alert_overdue_balances: { Args: never; Returns: number }
      sq_cancellation_split: {
        Args: { p_submission_id: string }
        Returns: Json
      }
      sq_claim_due_balances: {
        Args: { p_limit?: number }
        Returns: {
          amount_pence: number
          attempts: number
          client_token: string
          contact_email: string
          max_attempts: number
          payment_id: string
          stripe_customer_id: string
          stripe_payment_method_id: string
          submission_id: string
        }[]
      }
      sq_clear_client_note: {
        Args: { p_client_quote_id: string }
        Returns: undefined
      }
      sq_deposit_pence: {
        Args: { p_client_price_pence: number; p_rate: number }
        Returns: number
      }
      sq_direct_window_tick: { Args: never; Returns: number }
      sq_fail_balance: {
        Args: { p_error: string; p_final?: boolean; p_payment_id: string }
        Returns: Json
      }
      sq_invitation_label: {
        Args: { p_invitation_id: string }
        Returns: string
      }
      sq_invite_contractor: {
        Args: {
          p_contractor_id: string
          p_extra?: Json
          p_submission_id: string
        }
        Returns: boolean
      }
      sq_job_facts: { Args: { p_submission_id: string }; Returns: Json }
      sq_mark_quotes_viewed: {
        Args: { p_submission_id: string }
        Returns: number
      }
      sq_mark_thread_read: {
        Args: { p_invitation_id: string; p_reader: string }
        Returns: undefined
      }
      sq_notify_once: {
        Args: {
          p_kind: string
          p_payload: Json
          p_recipient: string
          p_submission_id: string
          p_to_email: string
        }
        Returns: boolean
      }
      sq_open_balance: { Args: { p_submission_id: string }; Returns: number }
      sq_payment_plan: { Args: { p_client_quote_id: string }; Returns: Json }
      sq_post_message: {
        Args: {
          p_body: string
          p_checked_as: string
          p_invitation_id: string
          p_sender: string
        }
        Returns: Json
      }
      sq_publish_quote: { Args: { p_quote_id: string }; Returns: undefined }
      sq_quote_position: {
        Args: { p_contractor_id: string; p_submission_id: string }
        Returns: {
          price_position: number
          price_rank: number
          price_total: number
          viewed_at: string
        }[]
      }
      sq_service_label: {
        Args: { p_service_id: number; p_verbatim: string }
        Returns: string
      }
      sq_settle_balance: {
        Args: { p_intent_id: string; p_payment_id: string }
        Returns: Json
      }
      sq_submission_threads: {
        Args: { p_submission_id: string }
        Returns: {
          business_name: string
          display_label: string
          invitation_id: string
          state: string
        }[]
      }
      sq_thread_state: { Args: { p_invitation_id: string }; Returns: string }
      sq_token: { Args: never; Returns: string }
      submit_client_rating: {
        Args: { p_client_token: string; p_comment: string; p_stars: number }
        Returns: Json
      }
      submit_contractor_quote: {
        Args: {
          p_confirmed: boolean
          p_note_to_client?: string
          p_notes: string
          p_price_basis?: string
          p_price_pence: number
          p_quote_type: string
          p_rate_minimum_pence: number
          p_rate_value_pence: number
          p_site_visit: boolean
          p_source: string
          p_token: string
          p_unit_label?: string
          p_unit_quantity?: number
          p_valid_until: string
        }
        Returns: Json
      }
      void_acceptance: { Args: { p_session_id: string }; Returns: Json }
      working_days_since: { Args: { p_from: string }; Returns: number }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
