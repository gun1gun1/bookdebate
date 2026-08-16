import Link from "next/link";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="flex flex-col">
      <nav className="flex gap-4 border-b border-gray-200 px-6 py-3 text-sm">
        <Link href="/admin/members">회원</Link>
        <Link href="/admin/books">책</Link>
        <Link href="/admin/sessions">회차</Link>
        <Link href="/admin/templates">템플릿</Link>
      </nav>
      <div className="p-6">{children}</div>
    </div>
  );
}
