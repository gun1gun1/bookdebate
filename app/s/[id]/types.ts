import type { TopicKind } from "@/lib/supabase/types";

export type Member = { id: string; name: string };

export type Reply = {
  id: string;
  member_id: string;
  body: string;
  choice: string | null;
  created_at: string;
  member: { name: string } | null;
};

export type Answer = {
  id: string;
  member_id: string;
  body: string | null;
  quote_text: string | null;
  quote_reason: string | null;
  title: string | null;
  slot: number;
  submitted_at: string | null;
  member: { name: string } | null;
  replies: Reply[];
};

export type Topic = {
  id: string;
  order_no: number;
  kind: TopicKind;
  title: string;
  body: string | null;
  has_rating: boolean;
  choice_options: string[];
  answers: Answer[];
};

export type Rating = { member_id: string; stars: number };
