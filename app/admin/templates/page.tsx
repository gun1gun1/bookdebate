import { getSupabaseServerClient } from "@/lib/supabase/server";
import { NewTemplateForm } from "./NewTemplateForm";
import { TemplateCard } from "./TemplateCard";

export const dynamic = "force-dynamic";

export default async function AdminTemplatesPage() {
  const supabase = getSupabaseServerClient();

  const { data: templates } = await supabase
    .from("topic_templates")
    .select("id, name, topic_template_items(order_no, kind, title, assigned_role, has_rating)")
    .order("created_at");

  return (
    <div className="max-w-3xl">
      <h1 className="mb-4 text-lg font-semibold">회차 템플릿</h1>

      <ul className="mb-8 flex flex-col gap-4">
        {(templates ?? []).map((template) => (
          <TemplateCard
            key={template.id}
            templateId={template.id}
            name={template.name}
            items={[...template.topic_template_items].sort((a, b) => a.order_no - b.order_no)}
          />
        ))}
      </ul>

      <h2 className="mb-2 text-sm font-semibold">새 템플릿</h2>
      <NewTemplateForm />
    </div>
  );
}
