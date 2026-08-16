import { isAnswerComplete } from "@/lib/topics";
import type { Member, Topic } from "./types";

export function MatrixPanel({
  topics,
  members,
  onCellClick,
}: {
  topics: Topic[];
  members: Member[];
  onCellClick: (topicId: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border-b border-gray-300 p-2 text-left">참여자</th>
            {topics.map((t) => (
              <th key={t.id} className="border-b border-gray-300 p-2 text-left">
                {t.order_no}. {t.title.slice(0, 12)}
                {t.title.length > 12 ? "…" : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td className="border-b border-gray-100 p-2 font-semibold">{m.name}</td>
              {topics.map((t) => {
                const answer = t.answers.find((a) => a.member_id === m.id) ?? null;
                const done = isAnswerComplete(t.kind, answer);
                const preview = t.kind === "excerpt" ? answer?.excerpt_text : answer?.body;

                return (
                  <td
                    key={t.id}
                    onClick={() => onCellClick(t.id)}
                    className="cursor-pointer border-b border-gray-100 p-2 hover:bg-gray-50"
                  >
                    <span className={done ? "text-green-600" : "text-gray-300"}>{done ? "✓" : "·"}</span>{" "}
                    <span className="text-gray-500">{preview ? preview.slice(0, 20) : ""}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
