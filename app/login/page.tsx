import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    redirect("/");
  }

  const requirePin = process.env.REQUIRE_MEMBER_PIN === "true";

  return (
    <main className="min-h-full flex items-center justify-center p-6">
      <LoginForm requirePin={requirePin} />
    </main>
  );
}
