// Supabase schema types, matching supabase/migrations/*. Regenerate after migrations:
//   npx supabase gen types typescript --local > lib/database.types.ts   (or --project-id <id>)
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      alerts: {
        Row: {
          created_at: string
          event_id: number
          id: number
          read_at: string | null
          user_id: string
          watchlist_id: number
        }
        Insert: {
          created_at?: string
          event_id: number
          id?: never
          read_at?: string | null
          user_id: string
          watchlist_id: number
        }
        Update: {
          created_at?: string
          event_id?: number
          id?: never
          read_at?: string | null
          user_id?: string
          watchlist_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "alerts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "watchlists"
            referencedColumns: ["id"]
          },
        ]
      }
      boundaries: {
        Row: {
          code: string
          geom: unknown
          id: number
          kind: string
          meta: Json
          name: string
          name_hi: string | null
          state_code: string | null
        }
        Insert: {
          code: string
          geom: unknown
          id?: never
          kind: string
          meta?: Json
          name: string
          name_hi?: string | null
          state_code?: string | null
        }
        Update: {
          code?: string
          geom?: unknown
          id?: never
          kind?: string
          meta?: Json
          name?: string
          name_hi?: string | null
          state_code?: string | null
        }
        Relationships: []
      }
      briefs: {
        Row: {
          content: string
          content_hi: string | null
          created_at: string
          id: number
          model: string | null
          period_end: string
          period_start: string
          scope: string
        }
        Insert: {
          content: string
          content_hi?: string | null
          created_at?: string
          id?: never
          model?: string | null
          period_end: string
          period_start: string
          scope: string
        }
        Update: {
          content?: string
          content_hi?: string | null
          created_at?: string
          id?: never
          model?: string | null
          period_end?: string
          period_start?: string
          scope?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          category: string
          created_at: string
          district: string | null
          external_id: string
          id: number
          lang: string
          lat: number | null
          lng: number | null
          occurred_at: string
          raw: Json | null
          severity: number
          source: string
          state: string | null
          summary: string | null
          title: string
          title_en: string | null
          title_hi: string | null
          url: string | null
        }
        Insert: {
          category: string
          created_at?: string
          district?: string | null
          external_id: string
          id?: never
          lang?: string
          lat?: number | null
          lng?: number | null
          occurred_at: string
          raw?: Json | null
          severity: number
          source: string
          state?: string | null
          summary?: string | null
          title: string
          title_en?: string | null
          title_hi?: string | null
          url?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          district?: string | null
          external_id?: string
          id?: never
          lang?: string
          lat?: number | null
          lng?: number | null
          occurred_at?: string
          raw?: Json | null
          severity?: number
          source?: string
          state?: string | null
          summary?: string | null
          title?: string
          title_en?: string | null
          title_hi?: string | null
          url?: string | null
        }
        Relationships: []
      }
      metric_history: {
        Row: {
          key: string
          observed_at: string
          region: string
          value: number
        }
        Insert: {
          key: string
          observed_at: string
          region: string
          value: number
        }
        Update: {
          key?: string
          observed_at?: string
          region?: string
          value?: number
        }
        Relationships: []
      }
      metrics: {
        Row: {
          key: string
          label: string
          lat: number | null
          lng: number | null
          meta: Json
          observed_at: string
          region: string
          state: string | null
          unit: string
          updated_at: string
          value: number
        }
        Insert: {
          key: string
          label: string
          lat?: number | null
          lng?: number | null
          meta?: Json
          observed_at: string
          region: string
          state?: string | null
          unit: string
          updated_at?: string
          value: number
        }
        Update: {
          key?: string
          label?: string
          lat?: number | null
          lng?: number | null
          meta?: Json
          observed_at?: string
          region?: string
          state?: string | null
          unit?: string
          updated_at?: string
          value?: number
        }
        Relationships: []
      }
      projects: {
        Row: {
          external_id: string
          first_seen: string
          id: number
          kind: string
          last_seen: string
          lat: number
          lng: number
          meta: Json
          name: string
          segments: number
          source: string
          state: string | null
          url: string | null
        }
        Insert: {
          external_id: string
          first_seen?: string
          id?: never
          kind: string
          last_seen?: string
          lat: number
          lng: number
          meta?: Json
          name: string
          segments?: number
          source: string
          state?: string | null
          url?: string | null
        }
        Update: {
          external_id?: string
          first_seen?: string
          id?: never
          kind?: string
          last_seen?: string
          lat?: number
          lng?: number
          meta?: Json
          name?: string
          segments?: number
          source?: string
          state?: string | null
          url?: string | null
        }
        Relationships: []
      }
      report_votes: {
        Row: {
          created_at: string
          report_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          report_id: number
          user_id?: string
        }
        Update: {
          created_at?: string
          report_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_votes_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          ac_code: string | null
          created_at: string
          description: string
          district: string | null
          id: number
          kind: string
          lat: number
          lng: number
          pc_code: string | null
          photo_path: string | null
          resolved_at: string | null
          state: string | null
          status: string
          upvotes: number
          user_id: string
        }
        Insert: {
          ac_code?: string | null
          created_at?: string
          description: string
          district?: string | null
          id?: never
          kind: string
          lat: number
          lng: number
          pc_code?: string | null
          photo_path?: string | null
          resolved_at?: string | null
          state?: string | null
          status?: string
          upvotes?: number
          user_id?: string
        }
        Update: {
          ac_code?: string | null
          created_at?: string
          description?: string
          district?: string | null
          id?: never
          kind?: string
          lat?: number
          lng?: number
          pc_code?: string | null
          photo_path?: string | null
          resolved_at?: string | null
          state?: string | null
          status?: string
          upvotes?: number
          user_id?: string
        }
        Relationships: []
      }
      representatives: {
        Row: {
          boundary_code: string | null
          constituency: string
          email: string | null
          external_id: string
          house: string
          id: number
          name: string
          party: string | null
          party_short: string | null
          photo_url: string | null
          profile_url: string | null
          refreshed_at: string
          source: string
          state_code: string | null
        }
        Insert: {
          boundary_code?: string | null
          constituency: string
          email?: string | null
          external_id: string
          house: string
          id?: never
          name: string
          party?: string | null
          party_short?: string | null
          photo_url?: string | null
          profile_url?: string | null
          refreshed_at?: string
          source: string
          state_code?: string | null
        }
        Update: {
          boundary_code?: string | null
          constituency?: string
          email?: string | null
          external_id?: string
          house?: string
          id?: never
          name?: string
          party?: string | null
          party_short?: string | null
          photo_url?: string | null
          profile_url?: string | null
          refreshed_at?: string
          source?: string
          state_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "representatives_boundary_code_fkey"
            columns: ["boundary_code"]
            isOneToOne: false
            referencedRelation: "boundaries"
            referencedColumns: ["code"]
          },
        ]
      }
      translations: {
        Row: {
          created_at: string
          hash: string
          lang: string
          provider: string
          text: string
        }
        Insert: {
          created_at?: string
          hash: string
          lang: string
          provider: string
          text: string
        }
        Update: {
          created_at?: string
          hash?: string
          lang?: string
          provider?: string
          text?: string
        }
        Relationships: []
      }
      watchlists: {
        Row: {
          categories: string[]
          created_at: string
          id: number
          keywords: string[]
          min_severity: number
          name: string
          states: string[]
          user_id: string
        }
        Insert: {
          categories?: string[]
          created_at?: string
          id?: never
          keywords?: string[]
          min_severity?: number
          name: string
          states?: string[]
          user_id?: string
        }
        Update: {
          categories?: string[]
          created_at?: string
          id?: never
          keywords?: string[]
          min_severity?: number
          name?: string
          states?: string[]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      locate: {
        Args: { p_lat: number; p_lng: number }
        Returns: { state_code: string | null; district: string | null; pc_code: string | null; ac_code: string | null }[]
      }
      load_boundaries: {
        Args: { rows: Json }
        Returns: number
      }
      whois: {
        Args: { p_lat: number; p_lng: number }
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
}

type PublicTables = Database["public"]["Tables"]
export type Tables<T extends keyof PublicTables> = PublicTables[T]["Row"]
export type TablesInsert<T extends keyof PublicTables> = PublicTables[T]["Insert"]
export type TablesUpdate<T extends keyof PublicTables> = PublicTables[T]["Update"]
