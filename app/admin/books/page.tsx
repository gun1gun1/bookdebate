import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createBookAction } from "./actions";
import { BookRow } from "./BookRow";

export const dynamic = "force-dynamic";

export default async function AdminBooksPage() {
  const supabase = getSupabaseServerClient();
  const { data: books } = await supabase
    .from("books")
    .select("id, title, author, cover_url, memo")
    .order("created_at", { ascending: false });

  return (
    <div className="max-w-3xl">
      <h1 className="mb-4 text-lg font-semibold">책</h1>

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-300 text-gray-500">
            <th className="py-2 pr-4">제목</th>
            <th className="py-2 pr-4">저자</th>
            <th className="py-2 pr-4">메모</th>
            <th className="py-2">동작</th>
          </tr>
        </thead>
        <tbody>
          {(books ?? []).map((book) => (
            <BookRow key={book.id} book={book} />
          ))}
        </tbody>
      </table>

      <h2 className="mt-8 mb-2 text-sm font-semibold">책 추가</h2>
      <form action={createBookAction} className="flex flex-wrap items-center gap-2">
        <input name="title" placeholder="제목" required className="rounded border border-gray-300 px-2 py-1" />
        <input name="author" placeholder="저자" className="rounded border border-gray-300 px-2 py-1" />
        <input name="cover_url" placeholder="표지 URL" className="rounded border border-gray-300 px-2 py-1" />
        <input name="memo" placeholder="메모" className="rounded border border-gray-300 px-2 py-1" />
        <button type="submit" className="rounded bg-gray-900 px-3 py-1 text-white">
          추가
        </button>
      </form>
    </div>
  );
}
