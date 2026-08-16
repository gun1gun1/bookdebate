"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/lib/supabase/types";

function parseAliases(csv: string): string[] {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function createMemberAction(formData: FormData) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const aliases = parseAliases(String(formData.get("aliases") ?? ""));
  const role = String(formData.get("role") ?? "member") as MemberRole;

  if (!name) return;

  const supabase = getSupabaseServerClient();
  await supabase.from("members").insert({ name, aliases, role });

  revalidatePath("/admin/members");
}

export async function updateMemberAction(id: string, formData: FormData) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const aliases = parseAliases(String(formData.get("aliases") ?? ""));
  const role = String(formData.get("role") ?? "member") as MemberRole;

  if (!name) return;

  const supabase = getSupabaseServerClient();
  await supabase.from("members").update({ name, aliases, role }).eq("id", id);

  revalidatePath("/admin/members");
}

export async function setMemberActiveAction(id: string, isActive: boolean) {
  await requireAdmin();

  const supabase = getSupabaseServerClient();
  await supabase.from("members").update({ is_active: isActive }).eq("id", id);

  revalidatePath("/admin/members");
}
