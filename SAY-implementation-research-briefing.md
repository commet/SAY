> 목적: 이 문서는 `SAY-product-brief-kakao-agentic-player-10.md`(제품 기획서)를 실제로 구현하기 전에,
> Sonnet이 조사·수집한 대회 규정/기술 제약/참고 자산을 한 곳에 모은 **설계 착수용 브리핑**이다.
> 본격적인 아키텍처/구현 설계는 Fable이 진행한다. 이 문서는 결정을 내리지 않고, Fable이 결정할 때
> 필요한 사실과 아직 비어 있는 빈칸(확인 필요 항목)을 분리해서 정리한다 — 제품 자체의 원칙("확정 vs
> 확인 필요 분리")을 이 문서 작성에도 그대로 적용했다.
>
> 작성일: 2026-07-05
> 함께 읽을 문서: `SAY-product-brief-kakao-agentic-player-10.md` (제품 기획서, 이 문서보다 먼저 읽을 것)

---

## 1. 확정된 사실 — 대회 로지스틱스

### 1.1 일정 (공식 페이지 기준, 기획서와 다름 — 최신값 사용 권장)

기획서 4.1절은 "2026년 6월 13일 ~ 7월 9일"이라고 적혀 있으나, 공식 페이지
(https://b.kakao.com/views/PlayMCP/AGENTIC_PlAYER_10)와 PlayMCP in KC 유의사항 문서를 재확인한 결과
아래 일정이 더 최근/정확한 것으로 보인다.

- 예선 접수: 2026-06-15 ~ 2026-07-14
- 본선 개발: 2026-07-30 ~ 2026-08-27
- 공개 투표: 2026-08-31 ~ 2026-09-28
- 심사 기준(반복 키워드): 창의성, 편의성, 안정성
- PlayMCP 심사 소요: 통상 영업일 1~2일, 최대 영업일 7일
- **PlayMCP in KC(무료 배포 서비스)는 예선 접수 기간(6/15~7/14)에만 신규 발급 가능** — 이 창구를 놓치면
  예선 참가 자체가 막힌다. 일정상 최우선 제약.

> 확인 필요: 오늘(2026-07-05) 기준 예선 마감(7/14)까지 약 9일 남음. 착수를 서둘러야 하는 근거.

### 1.2 등록 절차 (5단계, PlayMCP 공식 가이드 원문 기준)

1. **MCP 서버 개발** — PlayMCP 개발가이드 준수, 로컬에서 먼저 개발/테스트 완료.
2. **PlayMCP in KC에서 배포** — 계정당 최대 2대. Git 소스 또는 컨테이너 이미지로 생성 가능.
3. **PlayMCP에 서버 등록** — 개발자 콘솔 "새로운 MCP 서버 등록" → Endpoint 입력 → "정보 불러오기"
   **성공해야 함** (실패 시 MCP 서버 자체에 문제가 있다는 뜻) → 반드시 "임시 등록"으로 저장(바로
   "등록 및 심사요청" 누르지 말 것) → 도구함에 추가해서 AI 채팅으로 충분히 테스트 → 이후 "심사 요청".
4. **심사 통과 후 공개 전환** — 기본값이 "나에게만 공개"이므로 반드시 "전체 공개"로 전환 후, 공개된
   상세페이지 URL을 복사(예: `https://playmcp.kakao.com/mcp/12345678901234567`).
5. **대회 페이지에서 비즈폼으로 예선 접수** — "제출은 1회만 가능", 최대 2개 서버 등록 가능.

### 1.3 PlayMCP in KC 이용 유의사항 (원문 요지)

- 공모전 참가작에 한해 **한시적 무상 지원**.
- 무상 지원 종료 후에는 유료 유지(사업자 한정) 또는 타 클라우드 이전 필요 — 언제 종료되는지는 "추후
  공지" 상태(미확정).
- 공모전 참가 외 용도로 쓰거나 예선 미접수 시 **임의 회수 조치될 수 있음**.
- PlayMCP in KC 자체 오류 외의 "MCP 개발 이슈"는 카카오가 별도 지원하지 않음 — 자력 해결 전제.

---

## 2. 확정된 사실 — MCP 서버 기술 스펙 (스크린샷 2건 + 가이드 원문에서 확인)

### 2.1 배포 방식: Git 소스 빌드

등록 폼("Git 소스 빌드") 필드:

| 필드 | 규칙 |
|---|---|
| MCP 서버 이름 | Kubernetes 리소스 이름(DNS 이름)과 동일 규칙 — 소문자 영문·숫자·하이픈(-), 점(.)으로 구간 구분 |
| 설명 | PlayMCP in KC 상에서만 보임(PlayMCP 상의 설명과는 무관) |
| Git URL | 저장소 루트(또는 지정 경로)에 **Dockerfile 필수** |
| 브랜치 / ref | 기본값 `main` |
| Dockerfile 경로 (선택) | 기본값 `Dockerfile` |
| PAT (선택) | private repo일 때만 필요 (public이면 비움) |

등록 후 흐름: 상태 `Starting` → (수십 초~수 분) → `Active`가 되면 상세정보에서 **Endpoint URL** 확인.
서버는 최대 2개까지, 언제든 중지/삭제 가능(삭제는 되돌릴 수 없음).

### 2.2 Endpoint / Transport (스크린샷에서 실물 확인)

등록된 서버 예시(`tools-team-now`)의 상세 페이지에서 확인된 사실:

- Endpoint URL 포맷: `https://{서버이름}.playmcp-endpoint.kakaocloud.io/mcp`
- **Streamable HTTP transport 확정.** 클라이언트 측 연결 설정 예시:

```json
{
  "mcpServers": {
    "tools-team-now": {
      "command": "로컬_MCP_PROXY_경로",
      "args": [
        "https://tools-team-now.playmcp-endpoint.kakaocloud.io/mcp",
        "--transport=streamablehttp"
      ],
      "env": {
        "TIMEOUT": "10000"
      }
    }
  }
}
```

즉 원격 서버 자체는 MCP 표준의 **Streamable HTTP transport**(경로 `/mcp`)로 응답해야 하고, stdio 기반
클라이언트는 로컬 프록시(예: mcporter류 — `mcp-connection-guide.md`에 "mcporter 설치"가 언급됨)를 거쳐
접속한다. → **SAY MCP 서버는 표준 MCP Streamable HTTP 서버로 구현되어야 하며, 리스닝 경로는
`/mcp`여야 한다.**

- "정보 불러오기"가 성공하려면 MCP 표준의 `initialize` / `tools/list` 같은 핸드셰이크가 정상 동작해야
  한다는 뜻으로 해석됨(원문에 명시되진 않았으나 실패 조건 = "MCP에 문제가 있는 것"이라는 문구로 유추).

### 2.3 도구 응답 = "Kakao Tools widget" (중요, 이전 세션에서 놓쳤던 부분)

상세페이지의 "지원 Tools" 표에 도구 설명이 다음과 같이 적혀 있었다:

> `tools_team_now` — *"Returns a Kakao Tools widget from ToolsTeamNow(툴즈팀나우) that says what
> [팀]이 하고 있는지 알려준다."*

→ **MCP 도구가 순수 텍스트/JSON이 아니라 "Kakao Tools widget" 형식의 결과를 반환한다는 것이 문서가 아닌
실물 예시로 처음 확인됨.** 이 위젯의 정확한 스키마(필드, 렌더링 가능한 컴포넌트 종류, 버튼 포함 여부
등)는 **아직 확보하지 못했다** — 3절 "확인 필요" 참조. 기획서 11절(어르신용/가족용 UI, 버튼 문구 등)이
사이의 카톡 내 실제 화면이 되려면, 이 위젯이 버튼/선택지(기획서의 `[내가 확인할게요]` 같은 버튼)를
지원하는지가 설계의 분기점이다.

---

## 3. 확인 필요 (자동으로 확보하지 못한 것 — 로그인 필요한 Notion 문서들)

아래 문서들은 `https://playmcp.kakao.com/llms.txt`에 공식 링크로 나열되어 있으나, 전부
`kko.kakao.com` 단축링크 → `notion.so`/`app.notion.com`으로 리다이렉트되고, 로그인 세션이 없어
Sonnet의 WebFetch로는 본문을 가져오지 못했다(빈 "Notion" 셸만 반환됨). **사람이 로그인한 브라우저로
열어서 내용을 붙여넣어 주거나 PDF/텍스트로 export해줘야 다음 단계가 가능하다.**

| 문서 | 링크 | 왜 필요한가 |
|---|---|---|
| PlayMCP 이용가이드 | https://kko.kakao.com/playmcp_guide → https://app.notion.com/p/2189b97b4888803dbbdcef264e7eff58 | MCP 개발가이드 본문, 도구 응답/위젯 스펙, 인증 흐름 |
| 심사 정책 | https://kko.kakao.com/playmcp_review → https://app.notion.com/p/21b9b97b48888024922ec3dfcacf97e5 | 심사 반려 사유, 안정성 기준의 구체적 체크리스트 |
| Claude 연결 방법 | https://kko.kakao.com/connectclaude | 외부 에이전트(Claude 등)에서 SAY를 테스트하는 방법 |
| ChatGPT 연결 방법 | https://kko.kakao.com/connectchatgpt | 동일 목적, 타 에이전트 |
| PlayMCP 연결 방법 | https://kko.kakao.com/connectplaymcp | PlayMCP 자체 채팅에서 연결 방법 |
| 이미 확보한 것(사용자가 붙여넣음) | (본문 인용, 위 1절에 반영) | Git 소스 빌드 등록 절차, 유의사항 |

또한 다음 항목은 공개 자료 어디에서도 아직 확인되지 않았다 — **Fable이 설계를 시작하기 전 반드시
막혀야 할 빈칸**들이다.

1. **이미지/캡처 입력의 실제 전달 형식** — 카카오톡에서 사용자가 캡처를 보내면, MCP 도구 호출 시
   그 이미지가 base64로 오는지, 업로드된 파일의 URL로 오는지, 아니면 카카오 쪽에서 자체 OCR을 거쳐
   텍스트만 넘기는지 불명. 사이의 핵심 입력 경로(기획서 8.1, 10.1)이므로 이게 정해지지 않으면
   `analyze_notice` 도구의 입력 스키마를 확정할 수 없다.
2. **Kakao Tools widget의 정확한 JSON 스키마** — 버튼/선택지 포함 가능 여부, 텍스트 길이 제한, 여러
   섹션 레이아웃 지원 여부. 기획서의 "행동 카드"(10.3 스키마: 상태/버튼 `[내가 확인할게요]` 등)를
   그대로 위젯으로 옮길 수 있는지가 여기 달려 있다.
3. **본선용 "Widget 추가 스펙"** — 공식 페이지가 "본선 진출 시 Widget 추가 스펙으로 향상된 답변 제공,
   약 1개월 추가 개발기간"이라 언급했는데 예선 단계에서 이 스펙이 이미 필요한지, 본선 때만 필요한지
   불명확. 예선은 "기본 MCP 표준"만 따르면 된다고 하니 **예선 MVP는 순수 텍스트/마크다운 응답으로도
   통과 가능할 가능성**이 있음 — 이 경우 위젯 스펙 확보 전이라도 착수 가능.
4. **알림(reminder) 실제 발송 메커니즘** — 기획서 10.6/14.1의 `create_reminders`가 만드는 건 "알림
   후보"인데, 실제로 카카오톡에 푸시를 넣는 주체가 Kakao Tools 플랫폼인지, SAY 서버가 자체적으로
   스케줄링/발송해야 하는지 불명. MCP 도구는 보통 요청-응답(stateless)이라 서버 자체 발송이라면 별도
   백그라운드 프로세스/큐가 필요해진다.
5. **인증/세션 모델** — 가족 여러 명이 하나의 `NoticeCard`를 공유하려면(기획서 8.3 여정 C, 데이터모델의
   `familyId`) 카카오톡 사용자 식별자를 MCP 서버가 어떻게 받는지 알아야 한다. `mcp-connection-guide.md`에
   OAuth 스코프(`auth oauth --scope home`)가 언급되지만 이건 "외부 에이전트가 PlayMCP에 붙는" 방향의
   가이드였고, 반대로 "카카오톡 사용자가 SAY를 호출할 때 SAY가 사용자를 식별하는 방법"은 별도 확인
   필요.
6. **PlayMCP in KC 무료 지원 종료 시점** — "추후 공지"로만 되어 있어, 대회 이후 지속 운영 계획에 영향.

---

## 4. Argus 참고 자산 (재사용 가능/불가능 구분)

`C:\Users\admin\Documents\GitHub\Argus`는 전혀 다른 제품(개발자용 "판단 하네스" — 4단계 decompose→
recast→rehearse→refine, 17 에이전트, 16 MBTI 보스 타입)이지만, 아래는 SAY에 그대로 넘길 만한 자산이다.

### 4.1 재사용 가능 — 원칙/패턴

- **"구조화 JSON 우선, UI는 렌더링만" 원칙** — Argus의 `FinalScaffold` JSON 우선 설계와 SAY 기획서
  14.3절("LLM은 항상 구조화된 JSON을 먼저 만들고 UI는 JSON을 렌더링한다")이 사실상 동일한 원칙.
  Argus의 `argus-plugin-v2/data/schemas/*.json` (9개 JSON Schema 파일)이 "타입 먼저 정의 → 검증 →
  렌더링" 흐름의 실제 구현 예시로 참고할 수 있음.
- **"Zero-Judgment Gate" 철학** (`CLAUDE.md`) — "이 기능이 사용자 대신 판단/서술하는가?"를 매 기능마다
  통과시키는 게이트. SAY의 "사이는 가족을 대신하지 않는다"(기획서 3절), "원문에 없는 내용은 단정하지
  않는다"(12절) 원칙과 정확히 같은 계열 — Argus에서 이미 4라운드 스트레스 테스트를 거쳐 검증된 규칙들
  (예: "확정하지 않고 질문 하나만 표면화", "직접 발화가 아니라 중립적 크럭스 질문 형태")이 SAY의
  "확인 필요 분리" 로직 설계에 그대로 참고 가치가 있음.
- **Defensive Data Access 패턴** (`CLAUDE.md`) — LLM 출력 필드 누락 시 `(data.field || fallback)`,
  optional chaining 강제. SAY의 `MissingField`/`RiskSignal` 같은 LLM 출력 배열을 다룰 때 그대로 적용
  가능한 규칙.
- **Schema Sync 규약** (`CLAUDE.md`) — 동기화 인터페이스에 필드 추가 시 같은 커밋에서 DB 마이그레이션도
  추가하고 스키마 드리프트 테스트로 막는 관행. SAY가 Supabase 등 DB를 쓴다면 그대로 적용할 가치.

### 4.2 재사용 가능 — 인프라/의존성 (이미 세팅되어 있어 낯설지 않음)

`Argus/package.json` 기준 이미 사용 중인 스택 (자격 증명은 `.env.local`에 있을 것으로 추정 — 값은
확인하지 않음, 필요시 재사용 여부만 사용자에게 확인):

- `@anthropic-ai/sdk` ^0.78.0 — Claude API (Vision 포함) 연동 이미 경험 있음.
- `@google/genai` ^1.48.0 — Gemini API도 병행 사용 중 (OCR/비전 대안).
- `@supabase/supabase-js` ^2.99.2 — Postgres 기반 영속성, 가족/상태 데이터 저장소 후보.
- `openai` ^6.33.0 — OpenAI SDK도 이미 설치돼 있음.
- TypeScript 5.9 strict, Vitest — 코드 품질 관행.

### 4.3 재사용 불가 / 무관

- Argus의 Next.js 웹앱(`src/`), Zustand 17개 스토어, 3D 시각화(Three.js/R3F), MBTI/사주 로직은 SAY와
  무관 — SAY는 카카오톡 내 MCP 도구 응답이 화면이라 별도 프론트엔드가 필요 없을 가능성이 높음(위젯이
  그 역할을 대신).
- Argus는 **Claude Code 플러그인 + 웹앱** 구조이지 **원격 MCP 서버**가 아니다. `argus-plugin-v2`는
  로컬 `~/.claude/skills/`에 설치되는 구조(install.sh)라 카카오가 요구하는 "Streamable HTTP로 응답하는
  컨테이너"와는 배포 형태가 다르다. → **MCP 서버 골격 자체는 Argus에서 가져올 코드가 없고 새로 작성
  필요.**

---

## 5. 제품 기획서 핵심 재정리 (Fable 빠른 참조용, 원본은 `SAY-product-brief-kakao-agentic-player-10.md`)

- **한 줄 정의**: 가족이 받은 어려운 안내(병원/관공서/보험/택배)를 행동 카드로 바꿔, 가족이 확인하고
  완료까지 챙기게 돕는 카톡 AI.
- **핵심 개념 "닫힌 안내"**: 읽음 → 이해함 → 빈칸 확인 → 가족이 맡음 → 알림 → 완료. 항목 상태값:
  미확인/내가 확인할게요/가족에게 물어봤어요/확인 중/완료/보류/해당 없음.
- **MVP 4개 문서 유형**: 병원/검진, 관공서/복지/서류, 보험/카드/납부, 택배/스미싱 의심.
- **MVP 아웃 오브 스코프**: 의료/법률/금융 판단, 감정 대체, 자동 메시지 발송, 허락 없는 알림 등록.
- **MCP 도구 9개 (기획서 14.1)**: `analyze_notice`, `classify_notice_type`, `extract_action_items`,
  `detect_missing_fields`, `detect_risk_signals`, `create_family_message`, `create_reminders`,
  `update_task_status`, `get_open_items`.
- **데이터 모델 초안 (기획서 14.2)**: `NoticeCard`(+ `NoticeType`, `NoticeStatus`, `ActionItem`,
  `MissingField`, `RiskSignal`, `FamilyMessageDraft`, `ReminderDraft`) — TypeScript 인터페이스로 이미
  기획서에 초안 있음, 이 브리핑에는 재복사하지 않음(원본 참조).
- **안전 원칙**: 의료/법률/금융 "판단" 금지, 원문에 없는 정보는 "확인 필요"로 격리, 스미싱은 100%
  단정하지 않고 위험 신호+공식 채널 확인 권고로 표현.
- **말투 원칙**: 따뜻하지만 사무적으로 정확하게, "제가 다 알아서 할게요" 류 감정 대행 문장 금지.
- **버튼 문구 원칙**: "내가 확인할게요" 류는 허용, "담당자 지정/미처리자 독촉/효도 메시지 생성" 류 금지.

---

## 6. 이름 표기 메모

이전 대화에서 사용자가 "지금 문서(구 버전)는 SAI로 되어 있는데 SAY로 바꿀까 함"이라고 언급했으나
확정 지시는 아니었음 — 현재 `SAY-product-brief-kakao-agentic-player-10.md` 본문은 이미 "사이(Sai)"로
일관되게 표기되어 있고, 리포지토리명/파일명은 `SAY`. 제품명 표기(사이 vs SAY vs Sai)를 통일할지는
Fable 설계 단계 이전에 사용자 확인이 필요한 열린 항목으로 남겨둠.

---

## 7. Fable에게 남기는 요약 — 설계 착수 전 반드시 정리해야 할 5가지

1. 이미지 입력이 MCP 도구에 어떤 형태(base64/URL/사전 OCR 텍스트)로 들어오는지 확정 (3.1항).
2. Kakao Tools widget 스키마 확보 여부에 따라 예선 MVP를 "순수 텍스트 응답"으로 갈지 "위젯 응답"으로
   갈지 분기 결정 (2.3항, 3.2항, 3.3항).
3. 알림 발송 책임 소재(카카오 플랫폼 vs SAY 자체 백그라운드 프로세스) 확정 (3.4항) — 이후 필요한
   인프라(큐, 크론)가 완전히 달라짐.
4. 가족 간 카드 공유를 위한 사용자 식별/인증 모델 확정 (3.5항).
5. 예선 접수 마감(2026-07-14)까지 남은 기간을 고려해, MCP 서버 골격(Streamable HTTP, `/mcp` 경로,
   Dockerfile)부터 먼저 세워 "정보 불러오기"가 통과하는 최소 서버를 조기에 검증하는 순서를 권장.
