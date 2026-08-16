import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/lib/supabase/types";

// docs/SECURITY.md의 인증 모델을 구현한다. 이 파일 밖으로는 세션을 읽는 3개
// (getSession/requireSession/requireAdmin)와 로그인 흐름을 구성하는 3개
// (verifySitePassword/login/logout)만 내보낸다 — 그 외 로직(비밀번호/PIN 검증,
// rate limit, 쿠키 서명)은 전부 이 파일 안의 비공개 함수다. 3개가 아니라 6개를
// 내보내는 이유는 docs/DECISIONS.md "Phase 2" 항목 참고.

export type Session = { memberId: string; role: MemberRole };

const SESSION_COOKIE = "session";
const PREAUTH_COOKIE = "preauth";
const SESSION_MAX_AGE_SECONDS = 90 * 24 * 60 * 60; // 90일
const PREAUTH_MAX_AGE_SECONDS = 15 * 60; // 15분
const RATE_LIMIT_WINDOW_MINUTES = 10;
const RATE_LIMIT_MAX_FAILURES = 5;

function getSessionSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET 환경변수가 없거나 32자 미만이다.");
  }
  return new TextEncoder().encode(secret);
}

async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwardedFor = h.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  const realIp = h.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

async function checkRateLimit(ip: string): Promise<boolean> {
  const supabase = getSupabaseServerClient();
  const since = new Date(
    Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000
  ).toISOString();

  const { count } = await supabase
    .from("login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .eq("success", false)
    .gte("attempted_at", since);

  return (count ?? 0) < RATE_LIMIT_MAX_FAILURES;
}

async function recordLoginAttempt(ip: string, success: boolean) {
  const supabase = getSupabaseServerClient();
  await supabase.from("login_attempts").insert({ ip, success });
}

async function signSessionToken(payload: Session): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSessionSecretKey());
}

/**
 * 세션 JWT 자체를 검증하는 순수 함수. getSession()이 쓰지만, middleware.ts는
 * next/headers의 cookies()를 쓸 수 없어(Edge에서 요청 객체의 쿠키를 직접
 * 읽어야 함) 이 함수를 그대로 재사용한다 — DB 조회 없는 서명 검증 로직을
 * 두 곳에 중복 구현하지 않기 위해 내보낸다.
 */
export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, getSessionSecretKey());
    if (typeof payload.memberId !== "string" || typeof payload.role !== "string") {
      return null;
    }
    return { memberId: payload.memberId, role: payload.role as MemberRole };
  } catch {
    return null;
  }
}

async function signPreauthToken(): Promise<string> {
  return new SignJWT({ preauth: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${PREAUTH_MAX_AGE_SECONDS}s`)
    .sign(getSessionSecretKey());
}

async function verifyPreauthToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getSessionSecretKey());
    return payload.preauth === true;
  } catch {
    return false;
  }
}

/** 세션 쿠키만 검증한다(DB 조회 없음). 미들웨어와 헤더 표시처럼 가벼운 확인에 쓴다. */
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * 세션을 확인하고, 없으면 /login으로 보낸다. 있으면 DB에서 계정이 여전히
 * 활성 상태인지 재확인한다 — 비활성화된 멤버의 예전 세션이 계속 통과하지
 * 않도록 한다(docs/SECURITY.md: 민감한 판단은 매 요청 시 DB를 다시 조회).
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = getSupabaseServerClient();
  const { data: member } = await supabase
    .from("members")
    .select("is_active")
    .eq("id", session.memberId)
    .maybeSingle();

  if (!member || !member.is_active) {
    await logout();
    redirect("/login");
  }

  return session;
}

/** requireSession()에 더해, DB에서 role을 다시 조회해 admin이 아니면 돌려보낸다. */
export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();

  const supabase = getSupabaseServerClient();
  const { data: member } = await supabase
    .from("members")
    .select("role")
    .eq("id", session.memberId)
    .maybeSingle();

  if (!member || member.role !== "admin") {
    redirect("/");
  }

  return session;
}

const GENERIC_RATE_LIMIT_ERROR = "잠시 후 다시 시도해 주세요.";

/**
 * 1단계: 공통 암호 검증. 성공하면 preauth 쿠키를 심고 활성 멤버 목록을
 * 돌려준다 — 암호를 통과하기 전까지 멤버 이름은 브라우저에 노출하지 않는다.
 */
export async function verifySitePassword(
  password: string
): Promise<
  | { ok: true; members: { id: string; name: string }[] }
  | { ok: false; error: string }
> {
  const ip = await getClientIp();

  if (!(await checkRateLimit(ip))) {
    return { ok: false, error: GENERIC_RATE_LIMIT_ERROR };
  }

  const hash = process.env.SITE_PASSWORD_HASH;
  if (!hash) {
    throw new Error("SITE_PASSWORD_HASH 환경변수가 설정되지 않았다.");
  }

  const valid = await bcrypt.compare(password, hash);
  await recordLoginAttempt(ip, valid);

  if (!valid) {
    return { ok: false, error: "암호가 올바르지 않습니다." };
  }

  const cookieStore = await cookies();
  cookieStore.set(PREAUTH_COOKIE, await signPreauthToken(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: PREAUTH_MAX_AGE_SECONDS,
  });

  const supabase = getSupabaseServerClient();
  const { data: members } = await supabase
    .from("members")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  return { ok: true, members: members ?? [] };
}

/**
 * 2단계: 이름 선택(+옵션 PIN). preauth 쿠키가 유효할 때만 진행한다 — 이게
 * 없으면 공통 암호를 몰라도 memberId만 알면 로그인되는 구멍이 생긴다.
 */
export async function login(
  memberId: string,
  pin?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cookieStore = await cookies();
  const preauthToken = cookieStore.get(PREAUTH_COOKIE)?.value;

  if (!preauthToken || !(await verifyPreauthToken(preauthToken))) {
    return { ok: false, error: "다시 시도해 주세요." };
  }

  const ip = await getClientIp();
  if (!(await checkRateLimit(ip))) {
    return { ok: false, error: GENERIC_RATE_LIMIT_ERROR };
  }

  const supabase = getSupabaseServerClient();
  const { data: member } = await supabase
    .from("members")
    .select("id, role, is_active, pin_hash")
    .eq("id", memberId)
    .maybeSingle();

  if (!member || !member.is_active) {
    await recordLoginAttempt(ip, false);
    return { ok: false, error: "선택한 참여자를 찾을 수 없습니다." };
  }

  if (process.env.REQUIRE_MEMBER_PIN === "true") {
    if (!pin || !member.pin_hash || !(await bcrypt.compare(pin, member.pin_hash))) {
      await recordLoginAttempt(ip, false);
      return { ok: false, error: "PIN이 올바르지 않습니다." };
    }
  }

  await recordLoginAttempt(ip, true);

  cookieStore.set(SESSION_COOKIE, await signSessionToken({
    memberId: member.id,
    role: member.role,
  }), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  cookieStore.delete(PREAUTH_COOKIE);

  return { ok: true };
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(PREAUTH_COOKIE);
}
