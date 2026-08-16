# 독서토론 (dokseo-toron)

사적 월간 독서모임을 위한 온라인 토론 기록 앱. 배경과 설계 결정은 `docs/` 아래 문서와 `독서토론앱.md`를 참고한다.

## 로컬 실행

```bash
npm install
cp .env.example .env.local   # 값 채우기, 아래 "환경변수" 참고
npm run dev
```

`http://localhost:3000`에서 확인한다. 최초 1회는 Supabase 프로젝트에 스키마와 시드를 넣어야 한다:

```bash
# supabase/migrations/*.sql 을 Supabase 대시보드 SQL Editor에서 순서대로 실행
# 이어서 supabase/seed.sql 실행
```

공통 암호 해시는 아래로 만든다(값에 `$`가 들어가므로 `.env.local`에 넣을 때 `\$`로 이스케이프해야 한다 — `.env.example` 주석 참고):

```bash
npm run hash-password -- <원하는 암호>
```

## 환경변수

| 이름 | 용도 | 클라이언트 노출 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | 가능 |
| `NEXT_PUBLIC_SITE_URL` | 공유 문구용 절대 URL | 가능 |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용 DB 접근 | **절대 금지** |
| `SITE_PASSWORD_HASH` | 공통 암호 bcrypt 해시 | 금지 |
| `SESSION_SECRET` | JWT 서명 키 (32자 이상) | 금지 |
| `REQUIRE_MEMBER_PIN` | 개인 PIN 사용 여부 (기본 false) | 금지 |
| `CRON_SECRET` | keep-alive 인증 | 금지 |

값의 위치: Supabase 대시보드 Project Settings > API(URL, service-role 키). 나머지는 직접 생성한다.

## 배포 (Vercel)

1. GitHub 저장소를 Vercel 프로젝트에 연결한다.
2. 위 환경변수 전부를 Vercel 프로젝트 설정에 등록한다(`SITE_PASSWORD_HASH`는 로컬과 달리 **이스케이프하지 않은** 원본 값을 넣는다 — Vercel은 `$` 변수 치환을 하지 않는다).
3. `vercel.json`에 정의된 `/api/keep-alive` cron(매일 03:00 UTC)이 자동으로 등록된다. Vercel이 `CRON_SECRET` 환경변수를 이용해 자동으로 `Authorization: Bearer` 헤더를 붙여 호출한다 — 별도 설정 불필요.
4. Vercel Hobby 플랜은 cron을 하루 1회까지만 허용한다. `vercel.json`의 스케줄을 하루 2회 이상으로 바꾸면 배포 자체가 실패하니 주의.

## 배포 전 점검

`docs/SECURITY.md`의 "서버 측 필수 검증 체크리스트"를 따른다. 특히:

- `.next` 빌드 산출물에 `SUPABASE_SERVICE_ROLE_KEY`의 실제 값이 없는지 확인(환경변수 이름 자체는 서버 전용 청크에 나타나는 게 정상이다).
- 클라이언트 컴포넌트(`"use client"`)에서 `@supabase/supabase-js`를 직접 import하는 곳이 없는지 확인.
- 모든 Server Action의 첫 줄이 `requireSession()`/`requireAdmin()`을 호출하는지 확인.

## 기술 스택

Next.js(App Router) + TypeScript + Tailwind CSS, Supabase(Postgres, service-role 전용 접근), Vercel 배포.
