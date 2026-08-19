export type TopicKind = "free" | "excerpt" | "difficult" | "choice" | "appendix";
export type MemberRole = "member" | "admin";
export type SessionStatus = "draft" | "open" | "closed";
export type TemplateAssignedRole = "selector" | "host";

export interface Database {
  public: {
    Tables: {
      books: {
        Row: {
          id: string;
          title: string;
          author: string | null;
          cover_url: string | null;
          memo: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          author?: string | null;
          cover_url?: string | null;
          memo?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["books"]["Insert"]>;
        Relationships: [];
      };
      members: {
        Row: {
          id: string;
          name: string;
          aliases: string[];
          role: MemberRole;
          is_active: boolean;
          pin_hash: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          aliases?: string[];
          role?: MemberRole;
          is_active?: boolean;
          pin_hash?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["members"]["Insert"]>;
        Relationships: [];
      };
      sessions: {
        Row: {
          id: string;
          book_id: string;
          meets_at: string;
          deadline_at: string | null;
          selector_member_id: string | null;
          host_member_id: string | null;
          status: SessionStatus;
          blind_enabled: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          book_id: string;
          meets_at: string;
          deadline_at?: string | null;
          selector_member_id?: string | null;
          host_member_id?: string | null;
          status?: SessionStatus;
          blind_enabled?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sessions"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "sessions_book_id_fkey";
            columns: ["book_id"];
            referencedRelation: "books";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sessions_selector_member_id_fkey";
            columns: ["selector_member_id"];
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sessions_host_member_id_fkey";
            columns: ["host_member_id"];
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      topics: {
        Row: {
          id: string;
          session_id: string;
          order_no: number;
          kind: TopicKind;
          title: string;
          body: string | null;
          assigned_member_id: string | null;
          has_rating: boolean;
          choice_options: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          order_no: number;
          kind: TopicKind;
          title: string;
          body?: string | null;
          assigned_member_id?: string | null;
          has_rating?: boolean;
          choice_options?: string[];
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["topics"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "topics_session_id_fkey";
            columns: ["session_id"];
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "topics_assigned_member_id_fkey";
            columns: ["assigned_member_id"];
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      answers: {
        Row: {
          id: string;
          topic_id: string;
          member_id: string;
          body: string | null;
          quote_text: string | null;
          quote_reason: string | null;
          title: string | null;
          choice: string | null;
          slot: number;
          submitted_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          topic_id: string;
          member_id: string;
          body?: string | null;
          quote_text?: string | null;
          quote_reason?: string | null;
          title?: string | null;
          choice?: string | null;
          slot?: number;
          submitted_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["answers"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "answers_topic_id_fkey";
            columns: ["topic_id"];
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "answers_member_id_fkey";
            columns: ["member_id"];
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      replies: {
        Row: {
          id: string;
          answer_id: string;
          member_id: string;
          body: string;
          choice: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          answer_id: string;
          member_id: string;
          body: string;
          choice?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["replies"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "replies_answer_id_fkey";
            columns: ["answer_id"];
            referencedRelation: "answers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "replies_member_id_fkey";
            columns: ["member_id"];
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      ratings: {
        Row: {
          id: string;
          session_id: string;
          member_id: string;
          stars: number;
        };
        Insert: {
          id?: string;
          session_id: string;
          member_id: string;
          stars: number;
        };
        Update: Partial<Database["public"]["Tables"]["ratings"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "ratings_session_id_fkey";
            columns: ["session_id"];
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ratings_member_id_fkey";
            columns: ["member_id"];
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      login_attempts: {
        Row: {
          id: string;
          ip: string;
          attempted_at: string;
          success: boolean;
        };
        Insert: {
          id?: string;
          ip: string;
          attempted_at?: string;
          success: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["login_attempts"]["Insert"]>;
        Relationships: [];
      };
      topic_templates: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["topic_templates"]["Insert"]>;
        Relationships: [];
      };
      topic_template_items: {
        Row: {
          id: string;
          template_id: string;
          order_no: number;
          kind: TopicKind;
          title: string;
          body: string | null;
          assigned_role: TemplateAssignedRole | null;
          has_rating: boolean;
        };
        Insert: {
          id?: string;
          template_id: string;
          order_no: number;
          kind: TopicKind;
          title: string;
          body?: string | null;
          assigned_role?: TemplateAssignedRole | null;
          has_rating?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["topic_template_items"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "topic_template_items_template_id_fkey";
            columns: ["template_id"];
            referencedRelation: "topic_templates";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
