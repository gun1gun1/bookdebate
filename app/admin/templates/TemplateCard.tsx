"use client";

import { deleteTemplateAction } from "./actions";
import { DeleteButton } from "@/components/DeleteButton";
import type { TemplateAssignedRole, TopicKind } from "@/lib/supabase/types";

type Item = {
  order_no: number;
  kind: TopicKind;
  title: string;
  assigned_role: TemplateAssignedRole | null;
  has_rating: boolean;
};

export function TemplateCard({
  templateId,
  name,
  items,
}: {
  templateId: string;
  name: string;
  items: Item[];
}) {
  return (
    <li className="rounded border border-gray-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold">{name}</span>
        <DeleteButton action={() => deleteTemplateAction(templateId)} />
      </div>
      <ol className="list-inside list-decimal text-sm text-gray-600">
        {items.map((item) => (
          <li key={item.order_no}>
            [{item.kind}] {item.title}
            {item.assigned_role ? ` · 담당: ${item.assigned_role === "selector" ? "선정자" : "진행자"}` : ""}
            {item.has_rating ? " · 별점" : ""}
          </li>
        ))}
      </ol>
    </li>
  );
}
