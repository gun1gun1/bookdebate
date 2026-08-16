"use client";

import { useState, useTransition } from "react";
import { verifyPasswordAction, loginAction } from "./actions";

type Member = { id: string; name: string };
type Step = "password" | "name" | "pin";

export function LoginForm({ requirePin }: { requirePin: boolean }) {
  const [step, setStep] = useState<Step>("password");
  const [password, setPassword] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await verifyPasswordAction(password);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMembers(result.members);
      setStep("name");
    });
  }

  function handleSelectMember(memberId: string) {
    setSelectedMemberId(memberId);
    setError(null);
    if (requirePin) {
      setStep("pin");
      return;
    }
    startTransition(async () => {
      const result = await loginAction(memberId);
      if (result && !result.ok) {
        setError(result.error);
      }
    });
  }

  function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMemberId) return;
    setError(null);
    startTransition(async () => {
      const result = await loginAction(selectedMemberId, pin);
      if (result && !result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="w-full max-w-[420px] rounded-lg border border-gray-200 p-8 shadow-sm">
      <h1 className="mb-6 text-lg font-semibold">독서토론</h1>

      {step === "password" && (
        <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            공통 암호
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2"
              required
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={isPending}
            className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
          >
            다음
          </button>
        </form>
      )}

      {step === "name" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">이름을 선택해 주세요.</p>
          <div className="grid grid-cols-2 gap-3">
            {members.map((member) => (
              <button
                key={member.id}
                type="button"
                disabled={isPending}
                onClick={() => handleSelectMember(member.id)}
                className="rounded border border-gray-300 px-4 py-3 text-center hover:border-gray-900 disabled:opacity-50"
              >
                {member.name}
              </button>
            ))}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}

      {step === "pin" && (
        <form onSubmit={handlePinSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            PIN 4자리
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2"
              required
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={isPending}
            className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
          >
            로그인
          </button>
        </form>
      )}
    </div>
  );
}
