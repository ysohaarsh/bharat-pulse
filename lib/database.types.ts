// Generated from Supabase project schema (helpers trimmed). Regenerate after migrations:
//   npx supabase gen types typescript --project-id ckhzvkfkmpuenmfvipew > lib/database.types.ts
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
      briefs: {
        Row: {
          content: string
          created_at: string
          id: number
          model: string | null
          period_end: string
          period_start: string
          scope: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: never
          model?: string | null
          period_end: string
          period_start: string
          scope: string
        }
        Update: {
          content?: string
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
          country: string | null
          created_at: string
          external_id: string
          id: number
          lat: number | null
          lng: number | null
          occurred_at: string
          raw: Json | null
          severity: number
          source: string
          summary: string | null
          title: string
          url: string | null
        }
        Insert: {
          category: string
          country?: string | null
          created_at?: string
          external_id: string
          id?: never
          lat?: number | null
          lng?: number | null
          occurred_at: string
          raw?: Json | null
          severity: number
          source: string
          summary?: string | null
          title: string
          url?: string | null
        }
        Update: {
          category?: string
          country?: string | null
          created_at?: string
          external_id?: string
          id?: never
          lat?: number | null
          lng?: number | null
          occurred_at?: string
          raw?: Json | null
          severity?: number
          source?: string
          summary?: string | null
          title?: string
          url?: string | null
        }
        Relationships: []
      }
      watchlists: {
        Row: {
          categories: string[]
          countries: string[]
          created_at: string
          id: number
          keywords: string[]
          min_severity: number
          name: string
          user_id: string
        }
        Insert: {
          categories?: string[]
          countries?: string[]
          created_at?: string
          id?: never
          keywords?: string[]
          min_severity?: number
          name: string
          user_id?: string
        }
        Update: {
          categories?: string[]
          countries?: string[]
          created_at?: string
          id?: never
          keywords?: string[]
          min_severity?: number
          name?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
