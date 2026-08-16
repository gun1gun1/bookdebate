"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { TemplateAssignedRole, TopicKind } from "@/lib/supabase/types";

export type TemplateItemInput = {
  orderNo: number;
  kind: TopicKind;
  title: string;
  body: string;
  assignedRole: TemplateAssignedRole | "" ;
  hasRating: boolean;
};

export async function createTemplateAction(name: string, items: TemplateItemInput[]) {
  await requireAdmin();

  const trimmedName = name.trim();
  const validItems = items.filter((item) => item.title.trim().length > 0);
  if (!trimmedName || validItems.length === 0) {
    return { ok: false, error: "템플릿 이름과 논제를 하나 이상 입력하세요." };
  }

  const supabase = getSupabaseServerClient();

  const { data: template, error: templateError } = await supabase
    .from("topic_templates")
    .insert({ name: trimmedName })
    .select("id")
    .single();

  if (templateError || !template) {
    return { ok: false, error: "템플릿을 만들지 못했습니다." };
  }

  const rows = validItems.map((item) => ({
    template_id: template.id,
    order_no: item.orderNo,
    kind: item.kind,
    title: item.title.trim(),
    body: item.body.trim() || null,
    assigned_role: item.assignedRole || null,
    has_rating: item.hasRating,
  }));

  const { error: itemsError } = await supabase.from("topic_template_items").insert(rows);
  if (itemsError) {
    await supabase.from("topic_templates").delete().eq("id", template.id);
    return { ok: false, error: "논제를 저장하지 못했습니다." };
  }

  revalidatePath("/admin/templates");
  return { ok: true };
}

export async function deleteTemplateAction(id: string) {
  await requireAdmin();

  const supabase = getSupabaseServerClient();
  await supabase.from("topic_templates").delete().eq("id", id);

  revalidatePath("/admin/templates");
  return { ok: true };
}
