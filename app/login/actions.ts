"use server";

import { redirect } from "next/navigation";
import { verifySitePassword, login, logout } from "@/lib/auth";

export async function verifyPasswordAction(password: string) {
  return verifySitePassword(password);
}

export async function loginAction(memberId: string, pin?: string) {
  const result = await login(memberId, pin);
  if (result.ok) {
    redirect("/");
  }
  return result;
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}
