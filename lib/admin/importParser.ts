// 붙여넣기 일괄 이관 파서. docs/SECURITY.md "붙여넣기 이관 파서의 신뢰 경계"
// 원칙에 따라 이 파일은 DB에 손대지 않는 순수 함수만 담는다 — 신뢰할 수 없는
// 입력(관리자가 구글 문서에서 복사한 텍스트)을 구조화된 데이터로 바꿀 뿐이다.
// 실제 저장은 이 결과를 admin이 확인한 뒤 별도 Server Action이 담당한다.
//
// 규칙(CLAUDE.md "붙여넣기 이관 파서" 절):
// - "■" 또는 "숫자."로 시작하는 줄 = 새 논제
// - 논제 본문/제목에 아래 우선순위(REFACTOR_PLAN.md 4.8절)로 kind를 판정한다:
//   1. 찬반/선택논제/찬성/반대 → choice   2. 발췌/사유 더하기 → excerpt
//   3. 힘든/어려운/걸린 구절   → difficult  4. 부록 → appendix  5. 그 외 → free
// - "별점" 문구가 있으면 has_rating=true
// - excerpt 안에서 "이름 발췌" 줄이 그 참여자의 answer를 시작, "이유" 라벨
//   이후가 excerpt_reason, "사유 더하기" 라벨 이후 "이름:" 줄들이 replies
// - difficult 안에서는 "이름" 줄 다음에 "힘든 구절" 라벨이 와야 answer가
//   시작된다(R1-c1 정정, docs/DECISIONS.md 참고 — 파서가 인식하는 옛 문서
//   고정 문구 "같이 생각하니…"는 현재 라이브 UI 레이블 "같이 생각해 보니"와
//   다른 문자열이다. 둘을 같게 맞추지 말 것). 구조는 excerpt의 "사유 더하기"
//   이관과 동일 — "저는 이리 생각했는데…" 이후가 quote_reason, "같이
//   생각하니…" 이후 "이름:" 줄들이 replies.
// - free 안에서 "이름:" 줄이 그 참여자의 answer
// - choice/appendix로 판정된 논제는 이번 턴에는 구조 파싱하지 않는다 —
//   원문 그대로 unclassified 블록으로 모아 관리자가 수동 처리하게 둔다.
// - difficult 안에서 구조를 못 맞춘 줄(이름 후보가 확정되지 못함, 댓글 줄에
//   이름이 없음 등)도 버리지 않고 그 논제의 unclassified 블록에 담는다.
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
  kind: TopicKind;
  title: string;
  hasRating: boolean;
  answers: ParsedAnswer[];
};

// choice/appendix로 판정된 논제 전체, 그리고 difficult 안에서 구조를 못 맞춘
// 줄들을 원문 그대로 보존하는 블록. 관리자가 미리보기 화면에서 읽고 수동으로
// 배정하거나 무시할 수 있게 한다(자동으로 answers/replies를 만들지 않는다).
export type UnclassifiedBlock = {
  topicOrderNo: number;
  topicTitle: string;
  text: string;
};

export type ParseResult = {
  topics: ParsedTopic[];
  unmatchedNames: string[];
  unclassified: UnclassifiedBlock[];
  counts: { topics: number; answers: number; replies: number };
};

const TOPIC_HEADER = /^(?:■|\d+\.)\s*(.*)$/;
const EXCERPT_START = /^(\S+)\s*발췌\s*$/;
const NAME_COLON = /^(\S+):\s*(.*)$/;
const REASON_LABEL = /^이유\s*:?\s*$/;
const ADD_REPLY_LABEL = /^사유\s*더하기\s*:?\s*$/;

const CHOICE_HINT = /찬반|선택논제|찬성|반대/;
const EXCERPT_HINT = /발췌|사유\s*더하기/;
const DIFFICULT_HINT = /힘든|어려운|걸린\s*구절/;
const APPENDIX_HINT = /부록/;

// difficult 서브파서 라벨 — 옛 구글 문서의 고정 문구 그대로(REFACTOR_PLAN.md
// 4.8절, DECISIONS.md "R1-c1 정정"). 라이브 UI 레이블("같이 생각해 보니")과는
// 별개다 — 이 정규식은 과거 문서를 읽는 용도로만 쓴다.
const DIFFICULT_LABEL = /^힘든\s*구절\s*$/;
const DIFFICULT_REASON_LABEL = /^저는\s*이리\s*생각했는데[….]*\s*$/;
const DIFFICULT_REPLY_LABEL = /^같이\s*생각하니[….]*\s*$/;

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
  const unclassified: UnclassifiedBlock[] = [];
  let nextOrderNo = 1;

  // 현재 논제를 만드는 동안의 상태
  let introLines: string[] = [];
  let currentTopic: ParsedTopic | null = null;
  let currentAnswer: ParsedAnswer | null = null;
  let currentReply: ParsedReply | null = null;
  // "excerpt-text" | "reason" | "replies" | null — excerpt 논제 안에서 지금
  // 어느 필드에 줄을 쌓고 있는지
  let excerptSubState: "excerpt-text" | "reason" | "replies" | null = null;
  // difficult 논제 안에서 지금 어느 필드에 줄을 쌓고 있는지(excerptSubState와
  // 동일한 역할, kind가 달라 상태를 따로 둔다)
  let difficultSubState: "quote-text" | "reason" | "replies" | null = null;
  // "이름" 줄을 만난 뒤 "힘든 구절" 라벨로 확정되기를 기다리는 후보
  let pendingNameLine: string | null = null;
  // choice/appendix 논제의 원문 전체를 그대로 보존(미분류 블록용)
  let currentTopicRawLines: string[] = [];
  // difficult 논제 안에서 구조를 못 맞춘 줄들(미분류 블록용)
  let difficultStray: string[] = [];
  // 이 논제의 kind가 확정됐는지 — "답변이 아직 하나도 없다"와는 별개 개념이다.
  // difficult는 "힘든 구절" 라벨에 이름 후보가 없으면 answers.length===0인
  // 채로 kind만 확정될 수 있어, 예전처럼 answers.length===0으로 "kind 미확정"을
  // 판단하면 그 뒤 줄들이 다시 intro 버퍼로 빨려 들어간다.
  let kindDecided = false;

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
    difficultSubState = null;
  }

  function finalizeTopicHeader() {
    if (!currentTopic) return;
    // 제목 줄 자체에 "발췌"/"사유 더하기"/"힘든 구절" 등이 포함되는 경우도
    // 있으므로(예: "■ 인상 깊게 읽은 부분이나 발췌") 제목 + 안내문을 함께 본다.
    // 우선순위는 REFACTOR_PLAN.md 4.8절: choice > excerpt > difficult >
    // appendix > free.
    const introText = currentTopic.title + "\n" + introLines.join("\n");
    if (CHOICE_HINT.test(introText)) currentTopic.kind = "choice";
    else if (EXCERPT_HINT.test(introText)) currentTopic.kind = "excerpt";
    else if (DIFFICULT_HINT.test(introText)) currentTopic.kind = "difficult";
    else if (APPENDIX_HINT.test(introText)) currentTopic.kind = "appendix";
    else currentTopic.kind = "free";
    currentTopic.hasRating = /별점/.test(introText);
    introLines = [];
    kindDecided = true;
  }

  function flushTopic() {
    flushAnswer();
    if (currentTopic) {
      // 이름 후보가 "힘든 구절" 라벨로 끝내 확정되지 못한 채 논제가 끝나면
      // 미분류로 보존한다.
      if (pendingNameLine) {
        difficultStray.push(pendingNameLine);
        pendingNameLine = null;
      }
      // 내용 줄을 하나도 못 만난 논제(예: 논제만 있고 답변 없음)도 여기서
      // kind/hasRating을 확정한다.
      if (introLines.length > 0 || currentTopic.answers.length === 0) {
        finalizeTopicHeader();
      }
      if (currentTopic.kind === "choice" || currentTopic.kind === "appendix") {
        const text = currentTopicRawLines.filter((l) => l.length > 0).join("\n");
        if (text) {
          unclassified.push({
            topicOrderNo: currentTopic.orderNo,
            topicTitle: currentTopic.title,
            text,
          });
        }
      }
      if (currentTopic.kind === "difficult" && difficultStray.length > 0) {
        const text = difficultStray.filter((l) => l.length > 0).join("\n");
        if (text) {
          unclassified.push({
            topicOrderNo: currentTopic.orderNo,
            topicTitle: currentTopic.title,
            text,
          });
        }
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
      currentTopicRawLines = [];
      difficultStray = [];
      pendingNameLine = null;
      difficultSubState = null;
      kindDecided = false;
      continue;
    }

    if (!currentTopic) {
      // 첫 논제 헤더를 만나기 전의 줄은 버린다(문서 상단 안내문 등).
      continue;
    }

    // choice/appendix로 판정될 경우를 대비해 논제 원문을 전부 보존해 둔다
    // (실제로 쓰이는 건 그 두 kind로 확정됐을 때뿐 — flushTopic 참고).
    currentTopicRawLines.push(line);

    // 아직 이 논제의 kind가 확정 전(첫 콘텐츠 줄을 못 만남) — intro 누적
    const isExcerptStart = EXCERPT_START.test(line);
    const isNameColon = NAME_COLON.test(line);
    const isDifficultLabel = DIFFICULT_LABEL.test(line);

    if (!kindDecided) {
      if (!isExcerptStart && !isNameColon && !isDifficultLabel) {
        if (line.length > 0) introLines.push(line);
        continue;
      }
      // 첫 콘텐츠 줄에 도달 — kind 확정. difficult라면 방금까지 intro로
      // 쌓이고 있던 마지막 줄이 "힘든 구절" 라벨의 이름 후보였을 수 있으니
      // finalizeTopicHeader가 introLines를 비우기 전에 챙겨 둔다.
      const introCandidate = introLines.length > 0 ? introLines[introLines.length - 1] : null;
      finalizeTopicHeader();
      if (currentTopic.kind === "difficult" && isDifficultLabel) {
        pendingNameLine = introCandidate;
      }
    }

    if (currentTopic.kind === "difficult") {
      if (isDifficultLabel) {
        flushAnswer();
        if (pendingNameLine) {
          const rawName = pendingNameLine;
          currentAnswer = {
            memberId: resolveName(rawName),
            rawName,
            body: null,
            excerptText: "",
            excerptReason: null,
            replies: [],
          };
          difficultSubState = "quote-text";
        } else {
          // "힘든 구절" 라벨인데 앞서 확정할 이름 후보가 없다 — 구조가
          // 안 맞으므로 이 줄은 미분류로 보존한다.
          difficultStray.push(line);
        }
        pendingNameLine = null;
        continue;
      }

      if (difficultSubState === null) {
        // 아직 answer 시작 전 — "힘든 구절" 라벨로 확정되기를 기다리는
        // 이름 후보를 한 줄씩 버퍼링한다.
        if (line.length === 0) continue;
        if (pendingNameLine !== null) {
          // 이전 후보가 라벨로 확정되지 못한 채 다음 줄이 왔다 — 미분류.
          difficultStray.push(pendingNameLine);
        }
        pendingNameLine = line;
        continue;
      }

      if (!currentAnswer) continue;

      if (DIFFICULT_REASON_LABEL.test(line)) {
        currentAnswer.excerptReason = "";
        difficultSubState = "reason";
        continue;
      }

      if (DIFFICULT_REPLY_LABEL.test(line)) {
        flushReply();
        difficultSubState = "replies";
        continue;
      }

      if (difficultSubState === "replies") {
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
        if (line.length === 0) continue;
        if (!/\s/.test(line)) {
          // 공백 없는 한 단어 줄 — 다음 답변의 "이름" 후보일 수 있다(댓글
          // 목록 뒤에 곧바로 다음 사람의 힘든 구절이 이어지는 경우, 사이에
          // 빈 줄이 없을 수도 있음). 지금 댓글에 이어붙이지 않고 보류했다가,
          // 다음 줄이 "힘든 구절" 라벨이면 새 answer의 이름으로 확정하고
          // 아니면 미분류로 보낸다(위 difficultSubState===null 분기 참고).
          flushReply();
          pendingNameLine = line;
          difficultSubState = null;
          continue;
        }
        if (currentReply) {
          currentReply.body += "\n" + line;
        } else {
          difficultStray.push(line);
        }
        continue;
      }

      if (difficultSubState === "quote-text" && line.length > 0) {
        currentAnswer.excerptText =
          (currentAnswer.excerptText ?? "") + (currentAnswer.excerptText ? "\n" : "") + line;
        continue;
      }

      if (difficultSubState === "reason" && line.length > 0) {
        currentAnswer.excerptReason =
          (currentAnswer.excerptReason ?? "") + (currentAnswer.excerptReason ? "\n" : "") + line;
        continue;
      }

      continue;
    }

    if (currentTopic.kind === "choice" || currentTopic.kind === "appendix") {
      // 이번 턴에는 구조 파싱하지 않는다 — 줄은 이미 currentTopicRawLines에
      // 쌓였고, flushTopic에서 논제 전체를 unclassified 블록으로 만든다.
      continue;
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
    unclassified,
    counts: { topics: topics.length, answers: answerCount, replies: replyCount },
  };
}
