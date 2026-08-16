export type TopicKind = "free" | "excerpt" | "choice";
export type MemberRole = "member" | "admin";
export type SessionStatus = "draft" | "open" | "closed";

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
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["topics"]["Insert"]>;
      };
      answers: {
        Row: {
          id: string;
          topic_id: string;
          member_id: string;
          body: string | null;
          excerpt_text: string | null;
          excerpt_reason: string | null;
          submitted_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          topic_id: string;
          member_id: string;
          body?: string | null;
          excerpt_text?: string | null;
          excerpt_reason?: string | null;
          submitted_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["answers"]["Insert"]>;
      };
      replies: {
        Row: {
          id: string;
          answer_id: string;
          member_id: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          answer_id: string;
          member_id: string;
          body: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["replies"]["Insert"]>;
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
      };
      votes: {
        Row: {
          id: string;
          topic_id: string;
          member_id: string;
          choice: string;
        };
        Insert: {
          id?: string;
          topic_id: string;
          member_id: string;
          choice: string;
        };
        Update: Partial<Database["public"]["Tables"]["votes"]["Insert"]>;
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
      };
    };
  };
}
