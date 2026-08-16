"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function createBookAction(formData: FormData) {
  await requireAdmin();

  const title = String(formData.get("title") ?? "").trim();
  const author = String(formData.get("author") ?? "").trim() || null;
  const coverUrl = String(formData.get("cover_url") ?? "").trim() || null;
  const memo = String(formData.get("memo") ?? "").trim() || null;

  if (!title) return;

  const supabase = getSupabaseServerClient();
  await supabase.from("books").insert({ title, author, cover_url: coverUrl, memo });

  revalidatePath("/admin/books");
}

export async function updateBookAction(id: string, formData: FormData) {
  await requireAdmin();

  const title = String(formData.get("title") ?? "").trim();
  const author = String(formData.get("author") ?? "").trim() || null;
  const coverUrl = String(formData.get("cover_url") ?? "").trim() || null;
  const memo = String(formData.get("memo") ?? "").trim() || null;

  if (!title) return;

  const supabase = getSupabaseServerClient();
  await supabase
    .from("books")
    .update({ title, author, cover_url: coverUrl, memo })
    .eq("id", id);

  revalidatePath("/admin/books");
}

export async function deleteBookAction(id: string) {
  await requireAdmin();

  const supabase = getSupabaseServerClient();

  const { count } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("book_id", id);

  if ((count ?? 0) > 0) {
    return { ok: false, error: "이 책을 참조하는 회차가 있어 삭제할 수 없습니다." };
  }

  await supabase.from("books").delete().eq("id", id);
  revalidatePath("/admin/books");
  return { ok: true };
}
