// 붙여넣기 일괄 이관 파서. docs/SECURITY.md "붙여넣기 이관 파서의 신뢰 경계"
// 원칙에 따라 이 파일은 DB에 손대지 않는 순수 함수만 담는다 — 신뢰할 수 없는
// 입력(관리자가 구글 문서에서 복사한 텍스트)을 구조화된 데이터로 바꿀 뿐이다.
// 실제 저장은 이 결과를 admin이 확인한 뒤 별도 Server Action이 담당한다.
//
// 규칙(CLAUDE.md "붙여넣기 이관 파서" 절):
// - "■" 또는 "숫자."로 시작하는 줄 = 새 논제
// - 논제 본문에 "발췌" 또는 "사유 더하기"가 있으면 kind='excerpt'
// - "별점" 문구가 있으면 has_rating=true
// - excerpt 안에서 "이름 발췌" 줄이 그 참여자의 answer를 시작, "이유" 라벨
//   이후가 excerpt_reason, "사유 더하기" 라벨 이후 "이름:" 줄들이 replies
// - free 안에서 "이름:" 줄이 그 참여자의 answer
// - 이름은 members.name/aliases와 정확히 일치할 때만 매칭한다(부분 매칭 없음)

import type { TopicKind } from "@/lib/supabase/types";

export type MemberForMatching = {
  id: string;
  name: string;
  aliases: string[];
};

export type ParsedReply = {
  memberId: string | null;
  rawName: string;
  body: string;
};

export type ParsedAnswer = {
  memberId: string | null;
  rawName: string;
  body: string | null;
  excerptText: string | null;
  excerptReason: string | null;
  replies: ParsedReply[];
};

export type ParsedTopic = {
  orderNo: number;
  kind: Exclude<TopicKind, "choice">;
  title: string;
  hasRating: boolean;
  answers: ParsedAnswer[];
};

export type ParseResult = {
  topics: ParsedTopic[];
  unmatchedNames: string[];
  counts: { topics: number; answers: number; replies: number };
};

const TOPIC_HEADER = /^(?:■|\d+\.)\s*(.*)$/;
const EXCERPT_START = /^(\S+)\s*발췌\s*$/;
const NAME_COLON = /^(\S+):\s*(.*)$/;
const REASON_LABEL = /^이유\s*:?\s*$/;
const ADD_REPLY_LABEL = /^사유\s*더하기\s*:?\s*$/;

function matchMember(rawName: string, members: MemberForMatching[]): string | null {
  const found = members.find(
    (m) => m.name === rawName || m.aliases.includes(rawName)
  );
  return found ? found.id : null;
}

export function parseImportText(
  text: string,
  members: MemberForMatching[]
): ParseResult {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  const topics: ParsedTopic[] = [];
  const unmatchedNames = new Set<string>();
  let nextOrderNo = 1;

  // 현재 논제를 만드는 동안의 상태
  let introLines: string[] = [];
  let currentTopic: ParsedTopic | null = null;
  let currentAnswer: ParsedAnswer | null = null;
  let currentReply: ParsedReply | null = null;
  // "excerpt-text" | "reason" | "replies" | null — excerpt 논제 안에서 지금
  // 어느 필드에 줄을 쌓고 있는지
  let excerptSubState: "excerpt-text" | "reason" | "replies" | null = null;

  function resolveName(rawName: string): string | null {
    const memberId = matchMember(rawName, members);
    if (!memberId) unmatchedNames.add(rawName);
    return memberId;
  }

  function flushReply() {
    if (currentReply && currentAnswer) {
      currentReply.body = currentReply.body.trim();
      currentAnswer.replies.push(currentReply);
    }
    currentReply = null;
  }

  function flushAnswer() {
    flushReply();
    if (currentAnswer && currentTopic) {
      if (currentAnswer.excerptText !== null) {
        currentAnswer.excerptText = currentAnswer.excerptText.trim();
      }
      if (currentAnswer.excerptReason !== null) {
        currentAnswer.excerptReason = currentAnswer.excerptReason.trim();
      }
      if (currentAnswer.body !== null) {
        currentAnswer.body = currentAnswer.body.trim();
      }
      currentTopic.answers.push(currentAnswer);
    }
    currentAnswer = null;
    excerptSubState = null;
  }

  function finalizeTopicHeader() {
    if (!currentTopic) return;
    // 제목 줄 자체에 "발췌"/"사유 더하기"가 포함되는 경우도 있으므로
    // (예: "■ 인상 깊게 읽은 부분이나 발췌") 제목 + 안내문을 함께 본다.
    const introText = currentTopic.title + "\n" + introLines.join("\n");
    currentTopic.kind = /발췌|사유\s*더하기/.test(introText) ? "excerpt" : "free";
    currentTopic.hasRating = /별점/.test(introText);
    introLines = [];
  }

  function flushTopic() {
    flushAnswer();
    if (currentTopic) {
      // 내용 줄을 하나도 못 만난 논제(예: 논제만 있고 답변 없음)도 여기서
      // kind/hasRating을 확정한다.
      if (introLines.length > 0 || currentTopic.answers.length === 0) {
        finalizeTopicHeader();
      }
      topics.push(currentTopic);
    }
    currentTopic = null;
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    const topicMatch = line.match(TOPIC_HEADER);
    if (topicMatch) {
      flushTopic();
      currentTopic = {
        orderNo: nextOrderNo++,
        kind: "free",
        title: topicMatch[1].trim(),
        hasRating: false,
        answers: [],
      };
      introLines = [];
      continue;
    }

    if (!currentTopic) {
      // 첫 논제 헤더를 만나기 전의 줄은 버린다(문서 상단 안내문 등).
      continue;
    }

    // 아직 이 논제의 kind가 확정 전(첫 콘텐츠 줄을 못 만남) — intro 누적
    const isExcerptStart = EXCERPT_START.test(line);
    const isNameColon = NAME_COLON.test(line);

    if (excerptSubState === null && currentTopic.answers.length === 0 && !currentAnswer) {
      if (!isExcerptStart && !isNameColon) {
        if (line.length > 0) introLines.push(line);
        continue;
      }
      // 첫 콘텐츠 줄에 도달 — kind 확정
      finalizeTopicHeader();
    }

    if (currentTopic.kind === "excerpt") {
      const excerptMatch = line.match(EXCERPT_START);
      if (excerptMatch) {
        flushAnswer();
        const rawName = excerptMatch[1];
        currentAnswer = {
          memberId: resolveName(rawName),
          rawName,
          body: null,
          excerptText: "",
          excerptReason: null,
          replies: [],
        };
        excerptSubState = "excerpt-text";
        continue;
      }

      if (!currentAnswer) continue; // 발췌 시작 전 잡음 줄은 무시

      if (REASON_LABEL.test(line)) {
        currentAnswer.excerptReason = "";
        excerptSubState = "reason";
        continue;
      }

      if (ADD_REPLY_LABEL.test(line)) {
        flushReply();
        excerptSubState = "replies";
        continue;
      }

      if (excerptSubState === "replies") {
        const replyMatch = line.match(NAME_COLON);
        if (replyMatch) {
          flushReply();
          const rawName = replyMatch[1];
          currentReply = {
            memberId: resolveName(rawName),
            rawName,
            body: replyMatch[2],
          };
          continue;
        }
        if (currentReply && line.length > 0) {
          currentReply.body += "\n" + line;
        }
        continue;
      }

      if (excerptSubState === "excerpt-text" && line.length > 0) {
        currentAnswer.excerptText = (currentAnswer.excerptText ?? "") + (currentAnswer.excerptText ? "\n" : "") + line;
        continue;
      }

      if (excerptSubState === "reason" && line.length > 0) {
        currentAnswer.excerptReason = (currentAnswer.excerptReason ?? "") + (currentAnswer.excerptReason ? "\n" : "") + line;
        continue;
      }

      continue;
    }

    // free
    const nameMatch = line.match(NAME_COLON);
    if (nameMatch) {
      flushAnswer();
      const rawName = nameMatch[1];
      currentAnswer = {
        memberId: resolveName(rawName),
        rawName,
        body: nameMatch[2],
        excerptText: null,
        excerptReason: null,
        replies: [],
      };
      continue;
    }
    if (currentAnswer && line.length > 0) {
      currentAnswer.body = (currentAnswer.body ?? "") + "\n" + line;
    }
  }

  flushTopic();

  const answerCount = topics.reduce((sum, t) => sum + t.answers.length, 0);
  const replyCount = topics.reduce(
    (sum, t) => sum + t.answers.reduce((s, a) => s + a.replies.length, 0),
    0
  );

  return {
    topics,
    unmatchedNames: Array.from(unmatchedNames).sort(),
    counts: { topics: topics.length, answers: answerCount, replies: replyCount },
  };
}
