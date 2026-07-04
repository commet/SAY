# 사이(SAY) MCP 서버 — 실행 설계도 (Design Blueprint)

작성일: 2026-07-05
작성자: Fable 5 (설계 담당)
실행자: 하위 실행 모델 (이 문서만 보고 구현 가능해야 함)
선행 문서:
- `SAY-product-brief-kakao-agentic-player-10.md` — 제품 기획서 (무엇을, 왜)
- `SAY-implementation-research-briefing.md` — 대회/기술 제약 조사 (환경 사실)

이 문서의 역할: 위 두 문서를 **실행 직전 상태의 결정**으로 변환한다.
Part A는 설계 질문과 결정(왜 이렇게 만드는가), Part B는 실행 스펙(정확히 무엇을 만드는가),
Part C는 일정/검증/제출 체크리스트다.

**실행 모델에게**: Part B는 계약이다. 임의로 바꾸지 말 것. 막히면 Part A의 해당 질문으로
돌아가 결정의 이유를 읽고, 이유가 깨지지 않는 범위에서만 조정하라. Part A에 없는 새로운
결정이 필요해지면 구현을 멈추고 보고하라.

---

# Part A. 설계 질문과 결정

Fable 5가 스스로에게 던진 질문들과 그 답(Q1~Q10 설계 결정, Q11 공식 문서 검수 기록).
각 결정에는 근거와 실패 시 대비책(fallback)을 함께 적는다.

---

## Q1. 지능을 어디에 둘 것인가 — 서버가 LLM을 부를 것인가, 호스트 LLM을 부릴 것인가?

**이것이 이 설계 전체에서 가장 중요한 결정이다.**

MCP 서버는 카카오 쪽 호스트 LLM(PlayMCP AI 채팅 / Kakao Tools의 에이전트)이 호출한다.
즉 우리 도구를 부르는 쪽에 이미 강력한 LLM이 있다. 선택지는 셋:

- (a) **서버 내장 LLM**: 서버가 Claude API 등을 직접 호출해 원문을 분석한다.
  → 품질 통제 가능. 그러나 API 키를 컨테이너에 넣어야 하고(KC 등록 폼에 환경변수 입력란이
  없음이 스크린샷으로 확인됨), 비용·지연·외부 장애점이 생기며, 심사 중 API 장애 = 심사 반려.
- (b) **호스트 LLM이 추출, 서버는 판단 구조만 제공**: 도구의 입력 스키마가 호스트에게
  "원문 전체 + 원문에서 찾은 값들"을 채워서 호출하게 하고, 서버는 결정적(deterministic)
  로직만 수행한다 — 체크리스트 대조, 근거 검증, 위험 신호 규칙, 카드 조립, 상태 관리.
- (c) 혼합.

**결정: (b). 사이 서버는 LLM을 단 한 번도 호출하지 않는다.**

근거:
1. **안정성이 심사 기준이다.** 외부 API 의존이 0이면 서버는 밀리초 단위로 응답하고, 장애
   확률이 구조적으로 낮다. 심사자가 언제 눌러도 같은 품질로 동작한다.
2. **기획서 13절의 방어력 자산이 전부 결정적 로직이다.** "생활문서 타입별 체크 스키마",
   "확정/추정/확인 필요 분리", "상태와 닫힘 추적" — 이것들은 LLM이 아니라 데이터와 코드다.
   LLM 요약은 누구나 하지만, 이 구조는 우리가 만든 데이터 자산이다.
3. **비밀키 문제가 사라진다.** API 키가 없으므로 저장소를 public으로 둘 수 있고, KC의
   환경변수 미지원 제약이 무의미해진다.
4. **환각 차단이 구조적으로 된다.** Q3의 근거 게이트(evidence gate) 참조 — 서버가 호스트
   LLM의 주장을 원문 대조로 검증한다. "AI가 원문에 없는 걸 지어내지 않는다"를 프롬프트가
   아니라 **코드로 보장**한다. 이것이 심사 포인트 "안정성"의 서사가 된다.

역할 분담을 한 문장으로:
> **호스트 LLM은 읽고(reader), 사이 서버는 따진다(judge).**

Fallback: 호스트 LLM의 추출 품질이 실사용에서 심하게 낮으면(M4 테스트에서 판정),
그때 (c)로 전환하되 서버 LLM은 "추출 보조"로만 제한. 단, 예선 제출 전에는 전환하지 않는다.

---

## Q2. 이미지(캡처) 입력을 어떻게 받을 것인가 — 스펙이 미확인인데?

브리핑 3절의 최대 빈칸: MCP 도구에 이미지가 어떤 형태로 오는지 모른다.

**결정: 이미지를 서버가 받지 않는다. 호스트 LLM이 캡처를 전사(transcribe)해서 텍스트로
넘기게 한다.** 도구 설명(description)에 다음을 명시한다:

> "사용자가 안내문 캡처/사진을 보낸 경우, 이미지 속 모든 텍스트를 빠짐없이 그대로 옮겨
> 적어 `raw_text`에 넣어 호출하세요. 요약하지 말고 원문 그대로 옮기세요."

근거:
1. 카카오톡/PlayMCP 채팅에서 이미지를 보는 주체는 호스트 LLM이다. 최신 호스트 모델은
   전부 비전을 갖고 있고, 한국어 문자 캡처 전사는 비전 모델의 가장 쉬운 과제군이다.
2. 미확인 스펙(이미지 전달 형식)에 대한 의존이 **설계에서 제거**된다. 스펙이 무엇이든
   동작한다.
3. 서버 입력이 항상 텍스트로 정규화되므로 근거 게이트(원문 부분문자열 대조)가 성립한다.

Fallback: 없음(필요 없음). 위젯 스펙 문서를 나중에 확보해 이미지 직접 전달이 가능함이
확인되면, `raw_text` 옆에 선택 입력을 추가하는 확장만 하면 된다. 기존 계약은 안 깨진다.

---

## Q3. 호스트 LLM의 추출을 어떻게 믿을 것인가 — 환각을 코드로 막는 방법

**결정: 근거 게이트(Evidence Gate). 사이의 3-상태 분류를 기계적으로 강제한다.**

호스트는 `extracted` 배열에 `{field_key, value, quote}`를 채워 보낸다. `quote`는 그 값의
근거가 되는 **원문 구절 그대로**여야 한다. 서버는:

```
quote가 raw_text의 부분문자열로 존재(공백 정규화 후) → 확정 (confirmed)
value는 있으나 quote가 없거나 원문에서 못 찾음        → 추정 (inferred) — 카드에 "확인 필요" 딱지
체크리스트 필드인데 value 자체가 없음                → 빈칸 (missing) — "아직 비어 있는 내용"
```

이 게이트 하나가 제품 철학("원문에 없는 내용은 단정하지 않는다")을 프롬프트 준수가 아닌
**검증 가능한 코드**로 바꾼다. 심사·시연에서 이렇게 말할 수 있다: "사이는 AI의 모든 주장을
원문과 대조합니다. 원문에 없으면 확정으로 표시되지 않습니다."

추가로 서버 자체도 보조 추출을 한다(정규식/키워드): 날짜·시각·금액·전화번호·URL 패턴.
호스트가 놓친 필드를 서버 패턴이 찾으면 그것은 원문에서 직접 찾은 것이므로 확정으로 승격.
호스트 추출과 서버 패턴 추출의 **합집합**이 카드가 된다.

---

## Q4. 도구를 몇 개, 어떤 모양으로 만들 것인가?

기획서 14.1은 9개 도구를 제안한다. 그러나 호스트 LLM에게 9개의 세분화된 도구는 혼란이다
(classify → extract → detect ×2 → create ×2를 순서대로 부르게 하는 건 실패 유도 설계다).

**결정: 6개로 통합. `analyze_notice`가 파이프라인 전체를 한 번에 수행한다.**

| 도구 | 역할 | 기획서 9개 중 흡수한 것 |
|---|---|---|
| `analyze_notice` | 원문 → 행동 카드 생성(분류+추출+빈칸+위험+카드코드 발급) | analyze, classify, extract_action_items, detect_missing_fields, detect_risk_signals |
| `check_scam_signals` | 스미싱/사기 위험 신호만 빠르게 검사 | detect_risk_signals (단독 진입점) |
| `get_card` | 카드코드로 카드 현재 상태 조회 | get_open_items 일부 |
| `update_item_status` | 항목 상태 변경("내가 확인할게요" 등) | update_task_status |
| `make_family_message` | 카드 기반 가족 전달 문안 조립 | create_family_message |
| `list_open_items` | 카드코드(들)의 안 닫힌 항목 조회 | get_open_items |

`create_reminders`는 도구에서 제외 — Q6 참조. `check_scam_signals`를 별도 도구로 남기는
이유: 사용자가 "이 문자 사기야?"라고 물을 때 호스트가 매핑할 명확한 표적이 되고, 작년
수상작(택배추적기)이 검증한 수요이며, 시연 시나리오 3번의 진입점이다. 구현은
`analyze_notice`의 위험 규칙 모듈을 그대로 재사용하는 얇은 래퍼다.

**PlayMCP 규칙 정합(공식 개발가이드로 확인):** 서버당 툴 20개 초과 금지, 3~10개 권장 →
6개는 권장 범위 안이다. 툴 이름 규칙(영문 대소문자/숫자/`_`/`-`, 1~128자, 중복 금지)도 전부
충족한다. 등록 폼의 "MCP 식별자"(영문/숫자, 최대 16자)가 모든 툴 이름 앞에 자동 prefix로
붙으므로 툴 이름에 자체 `say_` prefix를 붙이지 않는다 — 식별자는 `SAY`를 쓴다(§13).
이전 세션 문서(`SAY-mcp-handoff-index.md` 등)의 "3개 권장" 초안(analyze_notice /
create_followup_message / update_check_state)은 이 6개 설계로 대체한다 — Q11 참조.

---

## Q5. 가족 공유와 사용자 식별을 어떻게 할 것인가 — 인증 스펙이 미확인인데?

브리핑 3절 빈칸 5번: 카카오톡 사용자 식별자를 MCP 서버가 받는 방법이 미확인.

**결정: 카드 코드(card code)로 인증을 대체한다.** `analyze_notice`가 카드를 만들 때
`SAY-XXXXXX`(혼동 문자를 뺀 대문자+숫자 6자) 코드를 발급한다. 가족은 이 코드를 단톡방에
공유하고, 각자 자기 카톡에서 "사이, SAY-3F7KQ2 보여줘"라고 하면 `get_card`로 같은 카드를
보고 `update_item_status`로 상태를 바꾼다.

근거:
1. 미확인 스펙(사용자 식별) 의존이 제거된다. OAuth 없이 여정 C(가족 단톡방 역할 나눔)가
   성립한다.
2. 코드 공유라는 행위 자체가 "가족방에 붙는" 자연스러운 카톡 UX다 — 기획서의 "카카오톡
   네이티브 흐름"과 부합.
3. 상태 변경 시 `actor_name`(예: "민수")을 받아 카드에 기록하면 기획서 8.3의 "현재 상태:
   민수: 병원 동행 가능 여부 확인 중"이 그대로 구현된다.

프라이버시 규칙 (공식 가이드 검수 후 강화):
- **원문(raw_text)은 저장하지 않는다.** 분석 호출 동안만 메모리에 존재하고, 카드에는 파생
  결과(사실/빈칸/항목/상태)만 남긴다. 근거 인용(quote)은 120자로 잘라 저장한다.
- 카드는 마지막 접근 후 **7일** 뒤 자동 삭제(상수 `CARD_TTL_DAYS = 7`).
- 로그에 raw_text/quote를 남기지 않는다.
- 도구 설명에 "주민등록번호 등 민감정보는 가리고 보내달라"는 안내 포함.

**OAuth를 붙이지 않는 근거 (심사 대비 논리):** PlayMCP는 "사용자 인증이 필요한 경우"
OAuth 또는 커스텀 헤더를 요구한다. 사이는 사용자 식별자를 요구하지 않고, 계정·개인정보를
저장하지 않으며, 카드 코드는 익명 capability 토큰이다. 위 데이터 최소화(원문 미저장,
7일 만료)와 결합하면 인증 필요 조건에 해당하지 않는다. 단, 이전 세션 문서들
(`SAY-mcp-authorization-2025-03-26.md` §11 등)은 "서버가 아무 상태도 저장하지 않는 완전
무상태"를 더 보수적으로 권장한다 — 닫힘 추적은 제품의 핵심 차별점(Q10)이므로 위 최소화
조건으로 유지하되, **심사에서 상태 저장이 반려 사유로 지적되면** 비상 대응으로
`update_item_status`가 카드 JSON을 입력으로 받아 갱신본을 돌려주는 무상태 모드(대화를
통한 상태 왕복)로 전환한다. 이 전환은 도구 스키마 변경만으로 가능하도록 store 접근을
도구 레이어에서만 하게 구현한다.

Fallback: 본선에서 카카오 인증 스펙이 확인되면 familyId 기반 그룹핑을 얹는다. 카드 코드는
그때도 "링크 공유" 수단으로 유지(하위 호환).

---

## Q6. 알림(리마인더)을 어떻게 할 것인가 — 서버가 푸시를 못 보내는데?

MCP는 요청-응답이다. 사이 서버가 사용자에게 능동적으로 카톡을 보낼 방법은 예선 스펙상
없다(확인된 바 없음). 기획서 9.2도 "자동으로 가족에게 메시지 보내기, 허락 없는 알림 등록"을
명시적으로 금지한다.

**결정: 푸시를 흉내내지 않는다. 두 가지 정직한 대체 설계:**

1. **풀(pull) 기반 되살리기**: 카드에 `next_check_at`(다음 확인 시점)을 저장하고, 사용자가
   사이를 다시 열 때(`get_card`/`list_open_items` 호출 시) 지난 확인 시점이 있으면 카드
   상단에 "지난 확인 예정이 지났어요 — 혈압약 복용 여부가 아직 비어 있어요"를 먼저 보여준다.
2. **알림 문안 제공**: `analyze_notice` 결과에 "알림으로 걸어두면 좋은 것" 섹션을 포함 —
   시각 + 문안(예: "오늘 21:50 — 금식 시작 10분 전")을 주고, 사용자가 자기 폰 알람/캘린더/
   카톡 나에게 보내기에 직접 등록하게 안내한다.

근거: 기획서 3절 "가족을 대신하면 불쾌하고, 받쳐주면 좋다." 플랫폼이 못 하는 걸 하는 척하는
것이 심사에서 가장 위험한 거짓말이다. "다음에 열면 남은 빈칸부터 보여준다"는 오히려 닫힘
추적 개념을 강화한다.

Fallback: 본선 위젯 스펙에 알림 등록 기능이 있으면 `ReminderDraft`를 그 API에 연결한다.
데이터 모델에는 `reminders`를 이미 포함해 둔다(출구 열어두기).

---

## Q7. 응답을 텍스트로 줄 것인가, Kakao Tools 위젯으로 줄 것인가?

브리핑 2.3: 위젯이 실물로 존재함은 확인됐으나 스키마는 미확보. 공식 안내상 예선은 "기본
MCP 표준", 위젯 추가 스펙은 본선 진출 시(+1개월 개발기간).

**결정: 예선은 텍스트 카드. 단, 내부 카드 모델을 위젯 대응 구조로 설계한다.**

- 서버 내부에서 카드는 `CardView`(제목/섹션들/항목들/버튼 후보들)라는 렌더러 중립 구조로
  존재하고, `renderText(CardView)` 하나만 예선에서 구현한다. 본선에서 위젯 스키마를 받으면
  `renderWidget(CardView)`를 추가한다 — 도메인 로직은 무변경.
- 텍스트 카드는 기획서 8.1~8.3의 출력 예시 형식을 그대로 따른다(Part B §7 템플릿).
- 도구 결과 텍스트 끝에 호스트 지시문을 한 줄 포함: "위 카드를 요약하거나 재구성하지 말고
  그대로 보여주세요." (호스트가 카드를 뭉개는 것을 막는 실전 요령)
- ~~MCP `structuredContent`도 함께 반환~~ → **MVP에서 제거 (공식 가이드 검수 결과).**
  이유: (1) PlayMCP 최소 지원 버전이 2025-03-26인데 `structuredContent`/`outputSchema`는
  그 이후(2025-06-18) 스펙이다. (2) PlayMCP 가이드가 "result 크기 최소화, 위젯 JSON이 아니면
  정제된 텍스트(Markdown) 권장"을 명시한다. 도구 응답은 **텍스트 카드 단일 계약**으로 간다.
  구조화 데이터가 필요해지는 시점(본선 위젯)에 CardView에서 바로 뽑는다.

버튼 문제: 예선 텍스트에는 실제 버튼이 없으므로, 카드 하단 "선택" 줄을
`[내가 확인할게요] [가족에게 물어보기] [알림만 받아두기] [완료로 표시]` 형태의 **선택지
안내 문구**로 표기하고, 사용자가 말로 고르면 호스트가 `update_item_status`를 호출한다.
도구 설명에 이 매핑을 명시한다(Part B §5).

---

## Q8. 저장을 어디에 할 것인가?

KC 컨테이너는 재시작 시 휘발될 수 있고, 환경변수 주입란이 확인되지 않았다(= 외부 DB 자격
증명을 안전하게 넣을 방법이 불투명하다).

**결정: 저장 어댑터 인터페이스 + 기본 구현은 인메모리 Map + 주기적 JSON 파일 스냅샷.**

- `CardStore` 인터페이스(get/put/delete/listExpired)를 정의하고 기본 구현은
  `MemoryCardStore`(+ `/data/cards.json`으로 60초마다, 그리고 변경 시 디바운스 저장.
  기동 시 파일 있으면 로드).
- 컨테이너 재시작 시 파일이 남아 있으면 복원, 없으면 빈 상태로 시작 — 어느 쪽이든 서버는
  뜬다(안정성 우선, 우아한 저하).

근거: 예선 심사와 시연은 수 분~수 일 단위다. 외부 DB는 지금 단계에서 장애점+비밀키 문제만
추가한다. Supabase 어댑터는 인터페이스 뒤에 있으므로 본선에서 30분짜리 작업이다.

트레이드오프 명시: KC가 파드를 재배포하면 카드가 사라질 수 있다. 시연 영상/심사 기간에는
카드 생성→조회가 같은 세션대에 일어나므로 실질 위험 낮음. 카드 코드 조회 실패 시 응답은
"카드를 찾을 수 없어요. 만료되었거나 서버가 재시작되었을 수 있어요. 원문을 다시 보내주시면
바로 다시 만들어 드려요."로 처리(막다른 골목 금지).

---

## Q9. 무엇으로, 어떤 골격으로 만들 것인가? (스택/전송/배포)

**결정:**

| 항목 | 선택 | 근거 |
|---|---|---|
| 언어 | TypeScript (strict) | 기획서 14.2 타입이 이미 TS. 팀(Argus)의 기존 관행과 검증 습관 재사용 |
| MCP SDK | `@modelcontextprotocol/sdk` 최신 1.x | 공식 SDK. Streamable HTTP 서버 트랜스포트 내장 |
| HTTP | Express | SDK 예제와 가장 호환. 필요한 건 POST/GET/DELETE `/mcp` + GET `/health`뿐 |
| 검증 | zod | 도구 입력 스키마 정의와 런타임 검증을 한 곳에서 |
| 세션 | **Stateless 모드** (`sessionIdGenerator: undefined`) | **PlayMCP 가이드가 stateless 서버를 명시적으로 권장** + KC 프록시의 세션 고정(affinity) 의존 제거. 상태는 MCP 세션이 아니라 카드 코드에 있으므로 무손실 |
| 프로토콜 버전 | 2025-03-26 기준 구현 (SDK가 협상) | PlayMCP 지원 범위: 최소 2025-03-26 ~ 최대 2025-11-25. 이 범위 밖 신기능(structuredContent 등)에 의존하지 않는다 |
| 응답 모드 | `enableJsonResponse: true` (단일 JSON 응답, SSE 미사용) | 스펙상 request 포함 POST는 `application/json` 또는 SSE 중 택1 — 단일 JSON이 구현 단순 + p99 기준에 유리. GET `/mcp`는 405 (SSE 미지원 서버의 스펙 준수 응답) |
| 포트 | `process.env.PORT ?? 8080`, `0.0.0.0` 바인딩 | 플랫폼 포트 주입 관례 대응 |
| 컨테이너 | Node 22-alpine 멀티스테이지 Dockerfile | 저장소 루트에 필수 (KC 요건) |
| 테스트 | vitest + 골든 테스트 | 규칙/게이트/렌더러는 결정적이므로 골든 테스트가 완벽히 맞음 |
| 저장소 | **GitHub public, 새 저장소 `say-mcp`** | 비밀키가 0이므로 public 가능(Q1 결정의 부수 효과). PAT 관리 불필요 |

이름은 세 곳에서 따로 쓰인다 — 혼동 금지:

| 위치 | 값 | 규칙 |
|---|---|---|
| KC 서버 이름 (k8s DNS) | `say-family-notice` | 소문자 영문·숫자·하이픈·점 |
| PlayMCP **MCP 식별자** | `SAY` | 영문/숫자만, 최대 16자. **모든 툴 이름 앞에 자동 prefix로 붙는다** |
| PlayMCP 노출 이름 | 사이 — 가족 안내 도우미 | 표시용 한국어 |

**`kakao` 금지**: 서버명/툴명 어디에도 `kakao` 문자열(대소문자 무관)을 넣지 않는다 —
PlayMCP 개발가이드의 명시적 반려 사유다. 제품명 로마자 표기는 SAY로 통일(기획서의 "Sai"
표기는 이후 개정 시 정리 — 최종 확정은 제출 폼 작성 시점에 한 번 더 확인).

---

## Q10. 이것이 왜 뽑히는가 — 심사 기준과 작년 수상 문법에 대한 정면 응답

작년 수상 문법(브리핑/기획서 4.2): 특정 사용자 + 반복되는 실제 고통 + 신뢰 가능한 데이터
또는 기억 + 바로 실행 가능한 결과 + 카카오톡에서 자연스러운 사용 장면.

사이의 매핑:

| 수상 문법 | 사이의 답 |
|---|---|
| 특정 사용자 | 부모님 안내문을 대신 읽어주는 자녀, 가족 단톡방의 "이거 누가 확인해?" 담당자 |
| 반복되는 고통 | 캡처 해석→재설명→누가 하기로 했는지 흐려짐→아무도 안 함→실손해 |
| 신뢰 가능한 데이터 | 4개 생활문서 타입별 체크 스키마(코드로 존재) + 근거 게이트(원문 대조) + 스미싱 규칙 데이터 |
| 바로 실행 가능한 결과 | 행동 카드 + 카드 코드 + 상태 변경. "읽음"이 아니라 "닫힘" |
| 카톡 자연스러운 장면 | 캡처 전달 → 카드 → 코드 공유 → 각자 상태 변경 |

심사 기준 3개에 대한 한 줄 답:
- **창의성**: "요약"이 아니라 "닫힘". 안내문에 상태 기계를 붙인 첫 제품. AI의 주장을 원문과
  기계 대조하는 근거 게이트.
- **편의성**: 캡처 한 장 → 행동 카드. 가족 공유는 코드 여섯 글자.
- **안정성**: 외부 의존 0(LLM API 없음, DB 없음), 결정적 로직, 근거 없는 단정 구조적 차단,
  의료/법률/금융 판단 안 함.

**하지 않기로 한 것(스코프 컷) — 실행 모델은 이것을 만들지 말 것:**
- 서버 측 LLM 호출 전부 (Q1)
- 이미지 바이너리 수신/OCR 라이브러리 (Q2)
- 푸시 알림, 스케줄러, 크론, 큐 (Q6)
- 외부 DB, 로그인, OAuth (Q5, Q8)
- 위젯 렌더러 (Q7 — 본선 과제)
- 아파트/기타 문서 타입의 깊은 처리 (분류만 하고 "공통 카드 + 기타" 경로로 처리)
- 자유 생성 문장 — 가족 메시지는 전부 템플릿 조립 (Part B §8)

---

## Q11. 공식 문서 검수 (2026-07-05) — 무엇이 확인되고 무엇이 바뀌었나

PlayMCP 서버 개발가이드 원문 요약본과 MCP 공식 스펙 정리본 5종이 확보되었다:
`SAY-playmcp-registration-and-rules.md`, `SAY-mcp-streamable-http-2025-03-26.md`,
`SAY-mcp-inspector-test-manual.md`, `SAY-mcp-authorization-2025-03-26.md`,
`SAY-mcp-handoff-index.md`. 이 설계도를 대조 검수한 결과:

**설계가 그대로 검증된 것:**
- Streamable HTTP만 지원, 원격 서버만 가능, `/mcp` 단일 endpoint (Q9와 일치)
- Stateless 권장 (Q9의 `sessionIdGenerator: undefined` 결정과 일치)
- 서버 내 LLM/외부 API 미호출 설계(Q1)가 운영 기준(평균 100ms, p99 3,000ms 필수)에 정확히
  부합 — 이 기준은 외부 호출이 하나라도 있으면 위험해진다
- 툴 6개는 권장 범위(3~10) 안, 이름 규칙 충족 (Q4)
- 광고/상품 추천 금지 → 사이의 안전 원칙(의료/법률/금융 판단 금지)과 원래 일치

**검수로 바뀐 것 (Part B에 반영됨):**
1. **모든 툴에 `annotations` 5종 필수** (title/readOnlyHint/destructiveHint/openWorldHint/
   idempotentHint) — 기존 설계에 누락돼 있었음. §9 표 추가. 반려급 누락이었다.
2. **description 영문 중심 + "SAY(사이)" 서비스명 포함 + 1,024자 이내** — 한국어 초안을
   영문으로 교체 (§9).
3. **structuredContent 제거** — 최소 지원 버전(2025-03-26) 밖 기능 + result 최소화 규칙 (Q7).
4. **성능 기준 명문화** — 평균 100ms / p99 3,000ms (§10).
5. **오류는 `isError: true` + 정제된 텍스트** — 500/스택트레이스 금지 (§10).
6. **프라이버시 강화** — 원문 미저장, quote 120자 제한, 만료 7일 (Q5).
7. **카드 코드를 콘텐츠 해시 기반으로** — `analyze_notice`가 같은 입력에 같은 카드를
   돌려주는 멱등 도구가 됨(annotations 정직성 + 부수 효과로 가족이 같은 문자를 각자
   분석해도 자동으로 같은 카드에 합류) (§3).
8. **MCP 식별자 개념 반영** — 툴 이름에 자체 prefix 불필요 (Q9).

**문서 간 충돌 시 우선순위:** 이전 세션 문서들의 3-툴 초안(analyze_notice /
create_followup_message / update_check_state)과 "닫힘 추적은 본선으로" 권고는 **이 설계도가
대체한다**(근거: Q4, Q5). 단 `SAY-mcp-inspector-test-manual.md` §7의 테스트 입력 텍스트와
검증 절차 자체는 유효하므로 그대로 쓰되, 툴 이름만 이 문서 §9 기준으로 바꿔 읽는다.
반려 방지 최종 점검은 `SAY-playmcp-registration-and-rules.md` §10 체크리스트를 사용한다.

---

# Part B. 실행 스펙

여기서부터는 계약이다. 이름, 스키마, 템플릿 문자열을 그대로 사용하라.

## §1. 저장소 구조

새 GitHub public 저장소 `say-mcp` (로컬 경로: `C:\Users\admin\Documents\GitHub\say-mcp`).

```
say-mcp/
├── Dockerfile                  # 저장소 루트 필수 (KC 요건)
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md                   # 한국어. 제품 소개 + 도구 목록 + 로컬 실행법
├── src/
│   ├── index.ts                # 진입점: express + MCP streamable http (stateless)
│   ├── server.ts               # McpServer 구성, 도구 등록
│   ├── tools/
│   │   ├── analyzeNotice.ts
│   │   ├── checkScamSignals.ts
│   │   ├── getCard.ts
│   │   ├── updateItemStatus.ts
│   │   ├── makeFamilyMessage.ts
│   │   └── listOpenItems.ts
│   ├── core/
│   │   ├── types.ts            # §3 데이터 모델
│   │   ├── classify.ts         # 문서 유형 분류 (키워드 점수)
│   │   ├── evidenceGate.ts     # §4 근거 게이트
│   │   ├── patternExtract.ts   # 서버 보조 추출 (날짜/시각/금액/전화/URL)
│   │   ├── riskRules.ts        # §6 스미싱/위험 규칙
│   │   ├── cardBuilder.ts      # 추출 결과 + 체크리스트 → NoticeCard (§3 파생 규칙)
│   │   ├── cardCode.ts         # SAY-XXXXXX 콘텐츠 해시 발급/검증
│   │   ├── time.ts             # KST(+9 고정) 헬퍼 + 시계 주입 (§3 — 유일한 날짜 창구)
│   │   └── store.ts            # CardStore 인터페이스 + MemoryCardStore(JSON 스냅샷)
│   ├── data/
│   │   ├── checklists.ts       # §5 문서 유형별 체크 스키마 (핵심 자산)
│   │   ├── riskData.ts         # §6 도메인 목록/키워드 (핵심 자산)
│   │   └── messageTemplates.ts # §8 가족 메시지 템플릿
│   └── render/
│       ├── cardView.ts         # CardView 중간 표현 (위젯 대응 구조)
│       └── renderText.ts       # §7 텍스트 렌더러
└── test/
    ├── evidenceGate.test.ts
    ├── classify.test.ts
    ├── riskRules.test.ts
    ├── banwords.test.ts        # §7 말투 가드 (금지어가 템플릿/골든 출력에 없는지)
    ├── golden/                 # §9 시연 시나리오 3종 골든 테스트
    │   ├── hospital.golden.test.ts
    │   ├── government.golden.test.ts
    │   └── smishing.golden.test.ts
    └── fixtures/notices.ts     # §9 샘플 원문
```

## §2. 서버 골격 (index.ts — 이 형태를 유지할 것)

SDK API를 환각하지 않도록 골격을 고정한다:

```ts
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildServer } from "./server.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, name: "say-family-notice" }));

// Stateless 모드: 요청마다 서버/트랜스포트 생성, 세션 없음 (Q9 결정)
app.post("/mcp", async (req, res) => {
  const server: McpServer = buildServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless (PlayMCP 권장)
    enableJsonResponse: true,      // SSE 대신 단일 JSON 응답 (Q9)
  });
  res.on("close", () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
// stateless에서는 GET/DELETE /mcp에 405를 반환
app.get("/mcp", (_req, res) => res.status(405).set("Allow", "POST").send());
app.delete("/mcp", (_req, res) => res.status(405).set("Allow", "POST").send());

const port = Number(process.env.PORT ?? 8080);
app.listen(port, "0.0.0.0", () => console.log(`say-mcp listening on :${port}`));
```

주의:
- `CardStore`는 모듈 스코프 싱글턴(요청마다 만들지 말 것 — 카드가 요청 간 공유되어야 한다).
- 바인딩: 컨테이너(배포)에서는 `0.0.0.0`이 필요하다. 스펙의 "로컬은 127.0.0.1 bind" 권고는
  로컬 개발 시 `HOST=127.0.0.1` 환경변수로 대응(`process.env.HOST ?? "0.0.0.0"`).
  Origin 검증(DNS rebinding 방지)은 브라우저가 직접 붙는 로컬 서버용 권고로, PlayMCP
  백엔드가 서버 대 서버로 호출하는 공개 원격 서버에는 적용하지 않는다(엄격 Origin 검증을
  켜면 오히려 "정보 불러오기"가 막힐 수 있다).

Dockerfile (루트):

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
RUN mkdir -p /data
EXPOSE 8080
CMD ["node", "dist/index.js"]
```

### §2.1 프로젝트 설정 파일 (버전 함정 — 정확히 이 조합을 쓸 것)

package.json (핵심부):

```json
{
  "name": "say-mcp",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "express": "^4.21.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^22",
    "tsx": "^4",
    "typescript": "^5.6",
    "vitest": "^3"
  }
}
```

- **zod는 반드시 v3 계열.** v4를 설치하면 SDK의 스키마 변환이 깨질 수 있다.
- **`"type": "module"` 필수** — §2 골격의 `./server.js` import 확장자는 ESM 규칙이다.
- **package-lock.json을 반드시 커밋** — Dockerfile의 `npm ci`는 lock 파일이 없으면 실패한다.
- `.dockerignore`: `node_modules`, `dist`, `.git`, `test`.

tsconfig.json:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

(`include`는 `src`만 — test/가 dist에 들어가면 안 된다.)

### §2.2 도구 등록 템플릿 (server.ts — SDK API를 환각하지 말고 이 형태를 복제할 것)

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runAnalyzeNotice } from "./tools/analyzeNotice.js";

export function buildServer(): McpServer {
  // serverInfo.name도 kakao 금지 규칙의 적용 대상이다
  const server = new McpServer({ name: "SAY", version: "0.1.0" });

  server.registerTool(
    "analyze_notice",
    {
      description: ANALYZE_NOTICE_DESCRIPTION, // §9.1 영문 원문 상수
      // 주의: inputSchema는 zod "raw shape"(필드 맵)이다. z.object()로 감싸지 말 것.
      inputSchema: {
        raw_text: z.string().min(10).max(8000)
          .describe("Full original text of the notice. Transcribe screenshots verbatim."),
        notice_type_guess: z.enum(["hospital","government","insurance_card_payment",
          "delivery_or_smishing","apartment","other"]).optional(),
        extracted: z.array(z.object({
          field_key: z.string().max(50),
          value: z.string().max(500),
          quote: z.string().max(300).optional()
            .describe("Exact phrase from the original text that supports this value."),
        })).max(30).optional(),
        sender_hint: z.string().max(100).optional(),
      },
      annotations: {
        title: "Analyze family notice",
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
    },
    async (args) => {
      try {
        return { content: [{ type: "text" as const, text: runAnalyzeNotice(args) }] };
      } catch (e) {
        // throw를 밖으로 흘리지 않는다 — 항상 isError 텍스트로 변환 (§10)
        return { content: [{ type: "text" as const, text: toUserMessage(e) }], isError: true };
      }
    },
  );

  // 나머지 5개 도구도 정확히 같은 패턴 (§9의 description/annotations 값 사용)
  return server;
}
```

## §3. 데이터 모델 (core/types.ts)

기획서 14.2를 기반으로 하되, Part A 결정을 반영해 다음과 같이 확정한다:

```ts
export type NoticeType =
  | "hospital"                 // 병원/검진
  | "government"               // 관공서/복지/서류
  | "insurance_card_payment"   // 보험/카드/납부
  | "delivery_or_smishing"     // 택배/스미싱 의심
  | "apartment"                // 아파트/관리사무소 (분류만, 공통 카드 처리)
  | "other";

// 항목 상태 — 기획서 6절의 7상태를 그대로 코드화
export type ItemStatus =
  | "unchecked"      // 미확인
  | "i_will_check"   // 내가 확인할게요
  | "asked_family"   // 가족에게 물어봤어요
  | "in_progress"    // 확인 중
  | "done"           // 완료
  | "on_hold"        // 보류
  | "not_applicable";// 해당 없음

// 근거 게이트 판정 (Q3)
export type Confidence = "confirmed" | "inferred"; // 확정 | 추정(원문 대조 실패)

export interface Fact {
  fieldKey: string;        // 체크리스트 필드 키 (§5) 또는 "extra.<n>"
  label: string;           // 사람이 읽는 이름 (체크리스트에서)
  value: string;
  confidence: Confidence;
  quote?: string;          // confirmed일 때 원문 구절
}

export interface MissingField {
  fieldKey: string;
  label: string;
  whyItMatters: string;     // 체크리스트 데이터에서
  suggestedQuestion: string;// "병원에 이렇게 물어보세요: ..."
}

export interface ActionItem {
  id: string;               // "a1", "a2", ...
  label: string;
  dueAt?: string;           // ISO 8601 또는 원문 표현 그대로 ("7월 10일 18:00")
  status: ItemStatus;
  actorName?: string;       // 상태 변경자 표시명 ("민수")
  history: { at: string; status: ItemStatus; actorName?: string }[];
}

export interface RiskSignal {
  ruleId: string;           // §6 규칙 ID
  label: string;
  severity: "low" | "medium" | "high";
  evidence: string;         // 원문에서 매칭된 구절
  saferNextStep: string;
}

export interface NoticeCard {
  code: string;             // "SAY-3F7KQ2"
  noticeType: NoticeType;
  title: string;            // "건강검진 안내" 등 분류기 산출
  // rawText는 저장하지 않는다 (Q5 프라이버시 규칙). 분석 호출 스코프에서만 존재.
  facts: Fact[];            // quote는 120자로 잘라 저장
  actionItems: ActionItem[];
  missingFields: MissingField[];
  riskSignals: RiskSignal[];
  reminderSuggestions: { atLabel: string; text: string }[]; // Q6: 문안 제공용
  nextCheckAt?: string;     // Q6: 풀 기반 되살리기
  createdAt: string;
  lastAccessAt: string;     // 7일 만료 기준 (CARD_TTL_DAYS = 7)
}
```

카드 코드 (검수 후 변경 — 콘텐츠 해시 기반): `sha256(normalize(rawText))`를 알파벳
`ABCDEFGHJKMNPQRSTUVWXYZ23456789`(I,L,O,0,1 제외)로 인코딩한 앞 6자. 같은 원문 → 같은
코드 → `analyze_notice`가 멱등이 된다(annotations 정직성, §9). 이미 존재하는 코드로
재분석이 들어오면 **기존 카드를 그대로 반환한다**(상태 변경 이력 보존 — 재분석이 가족의
진행 상황을 지우면 안 된다). 해시 인코딩은 단순하게: `hashBytes[i] % 31`로 알파벳 인덱스
6개(i=0..5)를 뽑는다. 해시 충돌(다른 원문, 같은 코드)은 저장된 카드의 title/type과 신규
분류가 다를 때만 의심하고, `normalize(rawText) + "#2"`를 재해시해 회피.

**파생 규칙 — actionItems / reminderSuggestions / nextCheckAt은 이렇게 만든다 (결정적):**

체크리스트 필드(§5)에 선택 속성 `actionLabel`, `reminderText`를 둔다. 그러면:

1. **actionItems** =
   (a) `actionLabel`이 있는 필드가 **확정**되면 → 항목 `"{actionLabel} ({value})"` 생성
   (예: fasting_start 확정 → "금식 시작 지키기 (밤 10시부터)"), dueAt은 파싱된 시각(§5.5,
   실패 시 생략).
   (b) `required`인데 **missing**인 필드마다 → 항목 `"'{label}' 확인하기"` 생성
   (missing 필드도 이렇게 항목이 되므로 "혈압약 내가 확인할게요" 같은 상태 변경이 가능해진다).
   id는 생성 순서대로 `a1`, `a2`, … 초기 status는 전부 `unchecked`.
2. **reminderSuggestions** = `reminderText`가 있는 필드가 확정되고 §5.5 시각 파싱이 성공한
   경우: `{ atLabel: 시각-10분, text: reminderText }`. 파싱 실패 시 `{ atLabel: "{원문 표현}
   직전", text: reminderText }`. 최대 3건, 시각순.
3. **nextCheckAt** = 열린 항목들의 파싱된 dueAt과 알림 시각 중 **가장 이른 것**. 파싱 가능한
   시각이 하나도 없으면 생략. 카드가 변경될 때마다 재계산.

**시계와 시간대 (실행 함정 1순위):**
- **모든 날짜 해석·표시·비교는 Asia/Seoul(UTC+9 고정, DST 없음) 기준.** KC 컨테이너의 시스템
  TZ는 UTC다 — `new Date()`의 로컬 해석을 직접 쓰지 말고 `core/time.ts`의 +9h 헬퍼만 통한다.
- **시계는 주입한다**: cardBuilder와 renderer는 `now: Date` 인자를 받는다. 프로덕션은
  `new Date()`, 골든 테스트는 §12의 고정 시각. 이걸 안 하면 "오늘/내일" 렌더 때문에 골든
  테스트가 실행하는 날짜에 따라 깨진다.

## §4. 근거 게이트 알고리즘 (core/evidenceGate.ts)

```
normalize(s): 연속 공백/개행 → 단일 공백, trim, NFC 정규화
gate(rawText, {value, quote}):
  if quote 존재 and normalize(rawText).includes(normalize(quote)) → confirmed
  else if value 존재 → inferred
  (value 없음은 게이트 대상 아님 — missing 처리로)
```

완화 규칙(호스트가 긴 인용의 중간을 생략할 수 있음): quote가 20자를 초과하고 통째 매칭이
실패하면, quote의 **앞 10자와 뒤 10자**를 각각 부분 매칭한다 — 둘 다 성공하면 confirmed.
`normalize`는 §3 해시와 **같은 함수 하나를 공유**한다(두 벌 구현 금지): NFC 정규화 →
연속 공백/개행 → 단일 공백 → trim. 이 완화 규칙까지 테스트로 고정할 것.

## §5. 체크리스트 데이터 (data/checklists.ts) — 이 제품의 1번 자산

기획서 10.4를 코드화한다. 각 필드: `fieldKey`, `label`, `whyItMatters`,
`suggestedQuestion`, `patterns`(서버 보조 추출용 키워드 정규식), `required`(빈칸이면
missingFields에 올릴지).

**hospital (병원/검진):**

| fieldKey | label | required | patterns 예시 | whyItMatters |
|---|---|---|---|---|
| appointment_date | 예약일 | ✓ | /예약|검진일|진료일/ + 날짜패턴 | 날짜를 놓치면 재예약까지 수 주 걸릴 수 있어요 |
| arrival_time | 도착 시간 | ✓ | /도착|내원|오시/ + 시각패턴 | 접수 마감에 늦으면 검사가 취소될 수 있어요 |
| fasting_start | 금식 시작 시간 | ✓ | /금식|공복/ | 금식을 지키지 않으면 검사를 못 받을 수 있어요 |
| medication_allowed | 평소 약 복용 가능 여부 | ✓ | /복용|약/ | 혈압약 등은 병원마다 지침이 달라요 — **원문에 없으면 반드시 병원 확인** |
| items_to_bring | 신분증/준비물 | ✓ | /신분증|지참|준비물/ | 신분증이 없으면 접수가 안 될 수 있어요 |
| guardian_needed | 보호자 동행 여부 |  | /보호자|동행/ | 수면내시경 등은 보호자 없이는 검사 불가일 수 있어요 |
| precautions | 검사 전후 주의사항 |  | /주의|삼가|피하/ | 놓치면 재검 사유가 돼요 |

**government (관공서/복지/서류):**

| fieldKey | label | required |
|---|---|---|
| who_eligible | 신청 대상 | ✓ |
| deadline | 마감일 | ✓ |
| required_docs | 필요 서류 | ✓ |
| how_to_submit | 제출 방법(방문/온라인) | ✓ |
| where | 방문 장소/온라인 링크 |  |
| miss_consequence | 놓치면 생기는 일 |  |
| contact | 문의처 |  |

**insurance_card_payment (보험/카드/납부):**

| fieldKey | label | required |
|---|---|---|
| amount | 금액 | ✓ |
| due_date | 납부일 | ✓ |
| auto_debit | 자동이체 여부 | ✓ |
| overdue_status | 미납/연체 여부 |  |
| needs_call | 고객센터 확인 필요 여부 |  |
| asks_personal_info | 개인정보/인증 요구 여부 | ✓ (위험 연동) |

**delivery_or_smishing (택배/배송):**

| fieldKey | label | required |
|---|---|---|
| tracking_no | 운송장 번호 |  |
| delivery_status | 배송 상태 |  |
| has_link | 링크 포함 여부 | ✓ (위험 연동) |
| asks_info_or_pay | 개인정보/결제 요구 | ✓ (위험 연동) |

각 필드의 `whyItMatters`/`suggestedQuestion` 문구는 위 hospital 예시의 톤(사무적으로 정확,
겁주지 않음)으로 실행 모델이 채워 넣되, 의료/법률/금융 **판단 문장 금지** — "~하세요"가
아니라 "~를 확인해야 해요 / 물어보면 좋아요" 형으로.

**파생 속성 (§3 파생 규칙이 소비 — 최소 다음 필드에는 반드시 지정):**

| 필드 | actionLabel | reminderText |
|---|---|---|
| hospital.appointment_date | 병원 가기 | 병원 갈 준비 |
| hospital.fasting_start | 금식 시작 지키기 | 금식 시작 10분 전 |
| hospital.items_to_bring | 준비물 챙기기 | 신분증·준비물 챙길 시간 |
| government.deadline | 기한 안에 신청하기 | 신청 마감 전 |
| insurance_card_payment.due_date | 납부 확인하기 | 납부일 알림 |

분류기(classify.ts): 타입별 키워드 가중 점수(예: hospital = 검진|내시경|금식|채혈|진료…,
government = 주민센터|신청|서류|복지|지원금…, payment = 납부|보험료|카드|이체|연체…,
delivery = 택배|배송|운송장|통관|반송…). 최고점 타입 채택, 최고점이 임계 미만이면 `other`.
delivery 점수와 위험 규칙 히트가 동시에 있으면 `delivery_or_smishing`. 동점은 위험 우선.

### §5.5 patternExtract 스펙 (core/patternExtract.ts) — 지원 범위를 이 목록으로 한정

전부를 파싱하려 들지 말 것. 아래 형식만 지원하고, **파싱 실패는 오류가 아니다** — 원문
표현을 그대로 문자열로 쓰고 ISO 변환만 생략한다.

- 날짜: `M월 D일`, `M/D`, `YYYY년 M월 D일`, `YYYY-MM-DD`. 괄호 요일 `(일)`은 무시.
  연도가 없으면 now(KST) 기준 올해, 그 날짜가 이미 지났으면 내년.
- 시각: `오전/오후 H시 (M분)`, `HH:MM`, `H시`, `밤 H시`(밤·저녁=오후로 해석, 밤 12시=00:00).
- 금액: `[\d,]+원`
- 전화번호: `0\d{1,2}-\d{3,4}-\d{4}`, `1\d{3}-\d{4}`
- URL: `https?:\/\/[^\s]+` (위험 규칙 §6이 소비)

출력 형태: `{ fieldKey?, raw: string, iso?: string }` — 체크리스트 `patterns` 키워드와 같은
문장/줄에서 발견된 날짜·시각은 해당 필드로 귀속시키고, 귀속 실패분은 버린다(과추출 금지).

## §6. 위험 규칙 (data/riskData.ts + core/riskRules.ts) — 2번 자산

규칙은 전부 결정적. 각 규칙: `ruleId`, `label`, `severity`, `detect(rawText, urls)`,
`saferNextStep`.

- **R1 단축/비공식 URL** (medium, 아래 조합 시 high): URL 추출 후 도메인이
  단축 서비스 목록(bit.ly, t.ly, url.kr, han.gl, vo.la, me2.do 등 — me2.do는 카카오
  공식 단축이므로 "발신자에 따라 판단" 주석과 함께 medium 고정) 또는 공식 도메인
  화이트리스트 밖의 무료 TLD(.xyz, .top, .shop, .club 등)
- **R2 공식 사칭 의심** (high): 원문에 기관명(CJ대한통운/한진/우체국/국세청/건강보험공단
  등)이 있는데 URL 도메인이 해당 기관 공식 도메인 목록(cjlogistics.com, hanjinexpress.co.kr(확인 필요 — 실행 시 실제 공식 도메인 검증할 것), epost.go.kr, hometax.go.kr, nhis.or.kr, gov.kr …)과 불일치
- **R3 긴급 압박 어휘** (medium): /긴급|즉시|오늘까지|마감임박|법적조치|벌금|과태료|검찰|압류/
- **R4 개인정보/인증 요구** (high): /주민등록번호|계좌번호|비밀번호|인증번호.*(입력|알려|전달)|카드번호/
- **R5 결제/통관 요구** (high): /통관.*(비용|수수료)|관세.*결제|재배송.*결제/
- **R6 앱 설치 유도** (high): /앱.*(설치|다운로드)|\.apk/
- **R7 국제발신/발신번호 이상** (low): /국제발신|해외발신/

집계: high ≥ 1 → 카드 상단에 위험 배너. **중복 억제**: 같은 URL에 R1(비공식 도메인)과
R2(기관 사칭 의심)가 동시에 걸리면 더 구체적인 R2만 보고하고 R1은 억제한다(같은 증거로
신호 수를 부풀리지 않는다 — 신뢰의 문제다). `check_scam_signals` 응답 형식은 기획서 12.4의
표현 원칙을 따른다 — **"스미싱입니다" 단정 금지**, "위험 신호가 N개 있습니다" + 신호 나열 +
"공식 앱이나 고객센터로 직접 확인하세요" + 가족 공유용 한 줄 경고.

공식 도메인 화이트리스트는 실행 모델이 구현 시점에 각 기관 공식 사이트로 **웹 검색으로
검증하고 출처 주석**을 달 것(작성 시점 추정 도메인을 그대로 신뢰하지 말 것).

## §7. 텍스트 렌더러 (render/renderText.ts) — 카드 형식 계약

기획서 8.1 출력 예를 정규형으로 삼는다. `analyze_notice` 응답 텍스트 (hospital 예):

```
[카드 SAY-3F7KQ2] 건강검진 안내로 보여요.

확인된 내용
- 내일 오전 8:40 병원 도착
- 오늘 밤 10시부터 금식
- 신분증 지참

추정한 내용 (원문에서 근거를 못 찾았어요 — 확인이 필요해요)
- 검사에 수면 내시경 포함

아직 비어 있는 내용
- 혈압약을 먹어도 되는지 — 병원마다 지침이 달라요. 병원에 이렇게 물어보세요: "검진 당일 아침 혈압약 복용해도 되나요?"
- 누가 함께 갈지

⚠ 위험 신호 (있을 때만, 신호 나열 + 안전한 다음 행동)

알림으로 걸어두면 좋은 것
- 오늘 21:50 — "금식 시작 10분 전"
- 내일 07:30 — "신분증 챙길 시간"
(휴대폰 알람이나 캘린더에 직접 등록해 주세요. 사이가 임의로 알림을 보내지는 않아요.)

가족과 나누기
- 이 카드를 가족과 같이 보려면 코드를 공유하세요: SAY-3F7KQ2
- 가족은 "사이, SAY-3F7KQ2 보여줘"라고 하면 돼요.

선택 — 각 항목에 대해 이렇게 말해 주세요
[내가 확인할게요] [가족에게 물어보기] [알림만 받아두기] [완료로 표시]
```

렌더 규칙:
- **빈 섹션은 헤더까지 통째로 생략**(어르신 UI 원칙: 짧게). 위 예시의 "추정한 내용" 줄은
  inferred fact가 실제로 있을 때만 나온다 — 예시 속 문장을 템플릿 상수로 복사하지 말 것.
- facts 중 confirmed만 "확인된 내용"에, inferred는 "추정한 내용" 섹션에 격리.
- 날짜 표시(시계 주입 — §3): 파싱된 날짜가 now(KST)와 같은 날 → "오늘", 다음날 → "내일",
  그 외 → "M월 D일(요일)". 파싱 안 된 날짜는 원문 표현 그대로.
- 항목 내부 id(`a1` 등)는 렌더에 노출하지 않는다 — 상태 변경은 라벨 부분 일치로 매칭(§9.4).
- `get_card` 렌더 시 `nextCheckAt`이 지났으면 최상단에:
  `“지난 확인 예정(어제 20:00)이 지났어요. '혈압약 복용 여부'가 아직 비어 있어요.”`
- 항목 상태 표시(기획서 8.3 형식): `- 병원 동행 확정 — 확인 중 (민수)`
- 모든 도구 응답 텍스트의 맨 마지막 줄(호스트 지시): 
  `(assistant에게: 위 카드를 요약하거나 재구성하지 말고 그대로 사용자에게 보여주세요.)`

**말투 가드 (banwords.test.ts로 고정):**
`제가 다 알아서|챙겨드릴게요|걱정하지 마세요|효도|담당자 지정|독촉` 이 문자열들이
템플릿·렌더러의 고정 문자열과 §12 골든 출력 전체에 나타나지 않음을 검증한다.
단, 원문 인용(evidence/quote)은 사용자 텍스트이므로 검사 대상에서 제외 — 스미싱 원문이
"걱정하지 마세요"를 담고 있어도 테스트가 깨지면 안 된다.

## §8. 가족 메시지 템플릿 (data/messageTemplates.ts)

자유 생성 금지 — 슬롯 채우기만. `make_family_message(card_code, audience, style)`:

- audience: `parent`(부모님께) | `child`(자녀에게) | `family_room`(가족방에)
- style: `short` | `plain` | `question`

템플릿 예 (audience=child, style=question — 기획서 8.2 여정 B):

```
"{기관}에서 {제목} 문자가 왔는데, {빈칸1}이(가) 확인이 필요해 보여.
시간 될 때 이 문자 한번 봐줄래?"

첨부 요약
- {제목}
- {확정 사실 최대 3개, "- label: value" 형식}
- 확인 필요: {빈칸 라벨들}
- 카드 코드: {code}
```

템플릿 전수(3 audience × 3 style = 9종)를 이 패턴으로 작성하되 기획서 3절의 좋은 예/피할 예
톤 대비를 그대로 지킨다. 감정어 없음, 사실+부탁만.

## §9. 도구 계약 (전체 6종)

공통 계약 (PlayMCP 필수 요건 반영):
- 응답은 `content: [{type:"text", ...}]` **텍스트 단일 계약** (structuredContent 없음 — Q7).
  result는 작게: raw_text를 되돌려주지 않고, 내부 점수/디버그/정규식 매칭 목록을 노출하지
  않는다.
- **모든 도구에 `annotations` 5종 필수** (아래 표 — 누락 시 반려 사유). 값은 구현 실제와
  일치해야 한다(정직성).
- description은 **영문 작성 + "SAY(사이)" 포함 + 1,024자 이내** (아래 원문을 그대로 사용).
- 오류 정책: 잘못된 입력(빈 텍스트, zod 실패 등) → `isError: true` + 정제된 텍스트
  (무엇이 왜 필요한지). 카드 없음 같은 안내성 상황 → 정상 응답 + 안내 텍스트(막다른 골목
  금지, Q8 문구). 어떤 경우에도 HTTP 500/스택트레이스 노출 금지.

**annotations 확정값:**

| tool | title | readOnly | destructive | openWorld | idempotent |
|---|---|---|---|---|---|
| `analyze_notice` | Analyze family notice | false¹ | false | false | true² |
| `check_scam_signals` | Check scam signals | true | false | false | true |
| `get_card` | Get action card | true | false | false | true |
| `update_item_status` | Update item status | false | false | false | true³ |
| `make_family_message` | Make family message | true | false | false | true |
| `list_open_items` | List open items | true | false | false | true |

¹ 카드를 저장하므로 읽기 전용이 아님(정직하게 false).
² 콘텐츠 해시 코드(§3) 덕에 같은 입력 → 같은 카드.
³ 같은 항목을 같은 상태로 두 번 바꿔도 결과 동일.

### 9.1 `analyze_notice`

description (영문, 그대로 사용 — 이것이 호스트 프롬프트 표면이다):

```
Turns a family notice (hospital/checkup, government/welfare, insurance/card/payment,
delivery SMS) into an action card with SAY(사이): confirmed facts, missing checks that
need follow-up, action items, risk signals, and a family-shareable card code.

If the user sent a screenshot or photo of the notice, transcribe ALL text in the image
verbatim into raw_text — do not summarize. For each value you put in `extracted`, copy
the exact source phrase into `quote`; never add information that is not in the original
text. Mask sensitive data such as resident registration numbers before sending.
```

inputSchema (zod → JSON Schema):

```ts
{
  raw_text: z.string().min(10).max(8000).describe("안내문 원문 전체 (캡처면 전사한 전체 텍스트)"),
  notice_type_guess: z.enum(["hospital","government","insurance_card_payment","delivery_or_smishing","apartment","other"]).optional(),
  extracted: z.array(z.object({
    field_key: z.string().describe("체크리스트 필드 키 또는 자유 키"),
    value: z.string(),
    quote: z.string().optional().describe("이 값의 근거가 되는 원문 구절 그대로"),
  })).optional(),
  sender_hint: z.string().optional().describe("발신자 표시 (예: 국제발신, 1588-1234)"),
}
```

처리 순서: classify(guess는 참고만, 서버 분류가 우선하되 근소 차이면 guess 채택) →
patternExtract → evidenceGate(extracted) → 병합 → checklist 대조로 missing 산출 →
riskRules → cardBuilder → 코드 해시 계산 → **기존 카드 있으면 그대로 반환**(§3) →
없으면 store.put → renderText. 응답은 §7 텍스트 카드 하나.

### 9.2 `check_scam_signals`

description (영문, 그대로 사용):

```
Checks a text message for smishing/scam risk signals with SAY(사이): suspicious or
unofficial links, requests for personal information or payment, urgency pressure.
Returns detected signals and safer next steps. This is signal-based guidance, not a
definitive verdict. If the user sent a screenshot, transcribe all text verbatim into
raw_text first.
```

입력: `raw_text`(min 5, max 8000), `sender_hint?`. 구현: riskRules 단독 실행 + 전용 렌더.
카드는 만들지 않는다. 렌더 템플릿 (§12 시나리오 3 기준 예시):

```
위험 신호 3개를 찾았어요.
- [높음] 기관명(CJ대한통운)과 다른 주소의 링크 — "cj-delivery.top"
- [중간] 긴급 압박 표현 — "금일내"
- [낮음] 국제발신 표시

안전한 다음 행동
- 링크를 누르지 마세요.
- 공식 앱이나 공식 고객센터에서 직접 확인하세요.

가족에게 공유할 한 줄
"택배 문자가 왔는데 위험 신호가 있어서 링크는 안 눌렀어. 공식 앱에서 확인해 볼게."

행동 카드로 관리하려면 이 문자를 그대로 다시 보내며 "카드로 만들어줘"라고 해 주세요.
```

신호가 0개면: "뚜렷한 위험 신호는 못 찾았어요. 다만 이 검사는 참고용이에요 — 조금이라도
이상하면 공식 채널로 확인하세요." (안전 단정 금지 — 양방향 모두 단정하지 않는다.)

### 9.3 `get_card`

description (영문, 그대로 사용):

```
Retrieves a SAY(사이) action card by its card code (e.g. SAY-3F7KQ2), so family members
can see the current facts, remaining unchecked items, and who is handling what.
```

입력: `card_code: z.string().regex(/^SAY-[A-Z2-9]{6}$/i)`. 코드 정규화(대문자화, 앞뒤 공백
제거, "say" 접두 누락 시 보정). 카드 lastAccessAt 갱신. nextCheckAt 경과 배너 포함 렌더.

### 9.4 `update_item_status`

입력:
```ts
{
  card_code: z.string(),
  item_label: z.string().max(100).optional(), // 라벨 부분 일치 — 기본 경로 (렌더에 id가 없다)
  item_id: z.string().max(10).optional(),     // 이전 도구 응답으로 알고 있을 때만
  new_status: z.enum(["unchecked","i_will_check","asked_family","in_progress",
                      "done","on_hold","not_applicable"]),
  actor_name: z.string().max(20).optional(),  // "민수" — 카드에 표시됨
}
// 검증: item_label과 item_id 중 하나는 필수 (zod .refine).
// 라벨 매칭이 0건 또는 2건 이상이면 isError가 아니라 정상 응답으로
// "다음 중 어느 항목인가요?" + 현재 항목 라벨 목록을 반환한다 (막다른 골목 금지).
```
description (영문, 그대로 사용 — 버튼 매핑 포함):

```
Updates the status of one action item on a SAY(사이) card. Match the item by a partial
label (item_label). Map the user's words to new_status: "내가 확인할게요" →
i_will_check, "가족에게 물어보기" → asked_family, "알림만 받아두기" → on_hold,
"완료로 표시" / "했어요" → done, "해당 없어요" → not_applicable. Pass actor_name (e.g.
민수) so the family can see who took the item. Returns the updated card with remaining
open items.
```

갱신 후 카드 전체 재렌더 반환(남은 빈칸이 계속 보이게 — 기획서 8.3).

### 9.5 `make_family_message`

description (영문, 그대로 사용):

```
Builds a short, factual follow-up message with SAY(사이) from an existing card, to send
to a parent, a child, or the family chat room. Messages stay factual: they state what
the notice says, what is still unconfirmed, and one clear ask. No emotional
impersonation.
```

§8 참조. 입력: `card_code, audience, style`.

### 9.6 `list_open_items`

description (영문, 그대로 사용):

```
Lists still-open action items and missing checks across one or more SAY(사이) cards by
card code, so the family can see at a glance what has not been closed yet.
```

입력: `card_codes: z.array(z.string()).min(1).max(10)`. done/not_applicable이 아닌 항목과
missingFields를 카드별로 묶어 렌더. "아직 남은 것" 뷰(기획서 8.3 마지막 섹션의 확장).
일부 코드의 카드가 없으면 **부분 결과로 렌더**한다 — 찾은 카드는 정상 표시하고, 못 찾은
코드는 마지막에 "찾지 못한 카드: SAY-XXXXXX (만료되었거나 코드 오타일 수 있어요)" 한 줄로.
전체 실패(0건)일 때만 Q8 안내 문구.

## §10. 오류/엣지 처리 및 운영 기준

- 존재하지 않는 카드 코드 → 정상 응답 + Q8의 안내 문구 (재생성 유도).
- raw_text가 안내문이 아니어 보임(분류 임계 미달 + 필드 0) → 정상 응답 + "안내문으로
  보이지 않아요. 문자 전체나 캡처 전사를 보내주시면 카드로 만들어 드려요."
- 빈/무효 입력, zod 실패 → **`isError: true`** + 어떤 필드가 왜 필요한지 설명하는 정제된
  텍스트. HTTP 500·스택트레이스 노출 절대 금지 (PlayMCP 반려 사유).
- **성능 기준 (PlayMCP 운영 필수 기준): 평균 100ms 이내, p99 3,000ms.** 외부 호출이 없으므로
  자연 충족되나, 스냅샷 파일 쓰기는 반드시 비동기(fire-and-forget)로 — 요청 경로에서 동기
  I/O 금지. vitest에 도구 호출 100ms 상한 테스트 포함.
- 로그에 raw_text/quote/개인정보를 남기지 않는다 (Q5).
- 저장 파일 손상 → 무시하고 빈 상태 기동 (기동 실패 금지). `/data` 쓰기 실패(권한/읽기전용
  파일시스템) → 스냅샷만 조용히 비활성화하고 로그 1줄, 서비스는 인메모리로 계속.
- 만료 카드 정리는 크론 없이 **게으른 정리(lazy purge)**: store 접근 시와 스냅샷 저장 시
  `listExpired` 삭제. (Q10 스코프 컷의 "스케줄러 금지"와 일관.)
- 시간대: 모든 날짜 로직은 `core/time.ts`를 통해서만 (§3 — 컨테이너 TZ는 UTC다).
- 광고/특정 상품·기관 추천 문구 금지 (PlayMCP 규칙 + 기획서 안전 원칙 — §7 금지어 테스트에
  이미 포함된 원칙의 확장).

---

# Part C. 일정 · 검증 · 제출

## §11. 마일스톤 (오늘 2026-07-05 기준, 예선 마감 07-14)

| 단계 | 목표일 | 내용 | 완료 기준 (acceptance) |
|---|---|---|---|
| M0 골격 | 7/06 | 저장소 생성, §2 골격, Dockerfile, health, 도구 6종 빈 등록 | 로컬에서 MCP Inspector(공식 `@modelcontextprotocol/inspector`)로 접속 → initialize/tools-list 성공, **Tools 탭에서 6개 툴 전부 annotations 5종 확인**, `docker build` 성공 |
| M1 병원 E2E | 7/07 | classify + evidenceGate + hospital 체크리스트 + cardBuilder + store + renderText + analyze/get/update 3종 | hospital 골든 테스트 통과. Inspector에서 §12 시나리오1 원문 → 기대 카드 |
| M2 4유형+위험 | 7/08 | 나머지 체크리스트 3종, riskRules 전체, check_scam_signals | 골든 3종 전부 통과, 금지어 테스트 통과 |
| M3 가족 기능 | 7/09 | make_family_message, list_open_items, nextCheckAt 배너, 만료 | 전체 vitest 녹색, 시나리오 A/B/C(기획서 8절) 수동 리허설 |
| M4 배포+등록 | 7/10 | GitHub push → KC Git 소스 빌드 → Endpoint 획득 → PlayMCP "정보 불러오기" → **임시 등록** → PlayMCP AI 채팅 실전 테스트 | AI 채팅에서 시나리오 3종이 카드 형태로 정상 동작 + `SAY-playmcp-registration-and-rules.md` §10 반려 방지 체크리스트 전항목 통과 |
| M5 심사 요청 | 7/11 | 테스트에서 발견된 호스트 궁합 문제 수정(도구 description 조정 중심) 후 심사 요청 | 심사 요청 완료 |
| 버퍼 | 7/12~14 | 반려 대응(반려 시 사유 수정 → 재요청), 승인 시 "전체 공개" 전환 → 상세 URL 복사 → 비즈폼 예선 접수 | **접수 완료 = 프로젝트 예선 성공** |

심사가 통상 1~2영업일, 최대 7일이므로 7/11 요청은 여유가 빠듯하다. **M4를 하루라도 앞당길
수 있으면 앞당겨라.** 반대로 기능을 더 얹는 것으로 M4를 늦추는 것은 금지.

## §12. 골든 테스트용 샘플 원문 (test/fixtures/notices.ts)

시연/테스트 겸용. 실행 모델은 이 텍스트를 fixture로 그대로 사용하라.

**골든 테스트 고정 시각: `2026-07-11T09:00:00+09:00`** (§3 시계 주입으로 전달).
이 시점 기준으로 시나리오 1의 검진일(7/12)은 "내일", 금식 시작(전날 밤 10시)은 "오늘"로
렌더되어야 한다. 고정 시각 없이 실제 시각으로 골든 테스트를 돌리면 날짜가 지날 때마다
기대 출력이 달라진다 — 반드시 주입할 것.

**시나리오 1 — 건강검진 (hospital):**
```
[한마음병원] 김OO님 국가건강검진 예약 안내입니다.
검진일: 7월 12일(일) 오전 8시 40분까지 내원
검사 전날 밤 10시부터 금식하시기 바랍니다. (물, 커피 포함)
신분증을 반드시 지참해 주세요.
위내시경 검사가 포함되어 있습니다.
문의: 031-123-4567
```
기대: 확정 = 예약일/도착시간/금식시작/신분증. 빈칸 = 평소 약 복용 가능 여부(원문에 없음 —
"위내시경" 키워드로 보호자 동행도 빈칸 후보). 알림 문안 2건 생성.

**시나리오 2 — 관공서 (government):**
```
[안양시 동안구청] 2026년 에너지 취약계층 냉방비 지원 신청 안내
지원대상: 기초연금 수급 가구
신청기간: 7월 1일 ~ 7월 18일 18:00까지
필요서류: 신분증, 기초연금 수급 증명서
신청방법: 주소지 행정복지센터 방문 신청
미신청 시 지원금을 받으실 수 없습니다.
```
기대: 확정 = 대상/마감/서류/방법. 빈칸 = 문의처. 마감 알림 문안 생성.

**시나리오 3 — 스미싱 의심 (delivery_or_smishing):**
```
[국제발신] CJ대한통운 택배 주소지 불일치로 물품이 보관중입니다.
금일내 주소 확인 필요 -> http://cj-delivery.top/kr
```
기대: 위험 신호 3개 = R2(기관명 CJ + 비공식 도메인 .top — 같은 URL의 R1은 §6 중복 억제
규칙으로 미보고), R3(금일내), R7(국제발신). high 배너, "공식 앱/고객센터 확인" 안내, 링크
클릭 보류, 가족 공유 한 줄. **스미싱 단정 문구 없음** 검증. §9.2의 렌더 템플릿 예시가
정확히 이 시나리오의 기대 출력이다.

## §13. PlayMCP 등록 정보 (제출 폼에 그대로 사용)

- KC 서버 이름: `say-family-notice`
- PlayMCP **MCP 식별자**: `SAY` (영문/숫자만, 최대 16자 — 툴 이름 앞에 자동 prefix됨)
- PlayMCP 이름: `사이 — 가족 안내 도우미` (`kakao` 문자열 절대 포함 금지 — 서버명/툴명 공통)
- 프로토콜 버전: 2025-03-26 기준 (PlayMCP 지원 범위 2025-03-26 ~ 2025-11-25 내)
- 짧은 소개 (기획서 16.1 기반): "사이는 가족이 받은 어려운 안내문(병원·관공서·보험·택배)을,
  서로 바로 이해하고 함께 완료할 수 있는 행동 카드로 바꿔주는 AI 도구입니다. 확인된 사실과
  확인이 필요한 빈칸을 분리하고, 카드 코드 하나로 가족이 함께 확인하고 완료까지 닫습니다."
- 긴 소개: 기획서 16.2를 사용하되 마지막에 "사이는 원문에 없는 내용을 단정하지 않으며,
  의료·법률·금융 판단을 하지 않습니다." 문장 유지 (심사 안정성 어필).

## §14. 남은 빈칸 (사용자 확인 필요 — 실행은 이것 없이도 진행 가능)

1. ~~PlayMCP 이용가이드/심사정책 Notion 본문~~ → **확보 완료 (2026-07-05).** 원문
   `PlayMCP 서버 개발가이드.txt` + 정리본 5종이 레포에 있고, 이 설계도에 반영됨(Q11).
   남은 미확인: Kakao Tools **위젯 JSON 스키마**(본선용), 이미지 직접 전달 형식 — 예선
   설계는 이 둘에 의존하지 않는다(Q2, Q7).
2. GitHub 계정에 `say-mcp` public 저장소 생성 권한/의향 — M4 전까지만 확정되면 됨.
3. 제품명 최종 표기(사이/SAY) — 제출 폼 작성(M4) 시점에 최종 확인.
4. 본선 진출 시: 위젯 스펙 문서, Supabase 전환 여부, 카카오 인증 연동 — 지금은 결정하지
   않는다(Q7/Q8 fallback 참조).

---

## §15. 함정 목록 — 실행 모델이 부딪히는 순서대로

구현 중 뭔가 안 되면 디버깅 전에 이 목록부터 대조하라. 전부 실제로 자주 틀리는 지점이다.

1. **ESM 삼위일체**: `"type": "module"`(package.json) + `module: "NodeNext"`(tsconfig) +
   import 경로의 `.js` 확장자. 셋 중 하나만 빠져도 빌드나 기동이 실패한다 (§2.1).
2. **zod는 v3** — v4 설치 금지 (§2.1).
3. **package-lock.json 커밋** — 없으면 Docker 빌드의 `npm ci`가 실패한다 (§2.1).
4. **inputSchema는 zod raw shape** — `z.object()`로 감싸면 SDK 스키마 변환이 어긋난다 (§2.2).
5. **annotations 5종을 registerTool config 안에** — 하나라도 빠지면 PlayMCP 반려 사유.
   M0에서 Inspector Tools 탭으로 실물 확인 (§9, §11).
6. **KST +9 고정** — 컨테이너는 UTC다. `new Date()` 로컬 해석 직접 사용 금지, `core/time.ts`
   경유만 (§3).
7. **시계 주입** — 골든 테스트에 고정 시각(`2026-07-11T09:00:00+09:00`)을 넣지 않으면
   "오늘/내일" 렌더 때문에 테스트가 실행 날짜에 따라 깨진다 (§3, §12).
8. **CardStore는 모듈 스코프 싱글턴** — §2 골격이 요청마다 `buildServer()`를 새로 만들기
   때문에, store를 buildServer 안에서 만들면 카드가 요청마다 증발한다 (§2).
9. **스냅샷 쓰기는 비동기 + 실패 무시** — 요청 경로에서 동기 I/O 금지, `/data` 쓰기 실패에도
   서비스 지속 (§10).
10. **오류는 throw가 아니라 `isError: true` 텍스트** — 핸들러 밖으로 예외를 흘리면 호스트에
    스택트레이스가 노출될 수 있다 = 반려 사유 (§2.2, §10).
11. **raw_text/quote를 로그·응답에 되돌리지 않는다** — result 최소화 + 프라이버시 (Q5, §9).
12. **같은 원문 재분석은 기존 카드를 반환** — cardBuilder 결과로 덮어쓰면 가족의 상태 변경
    이력이 날아간다 (§3).
13. **빈 섹션은 헤더까지 생략** — §7 예시의 "추정한 내용" 같은 섹션을 항상 출력하는 템플릿
    상수로 복사하지 말 것 (§7).
14. **금지어 테스트에서 원문 인용은 제외** — 스미싱 원문이 금지어를 담고 있어도 테스트가
    깨지면 안 된다 (§7).

---

## 마지막 당부 (실행 모델에게)

이 제품의 승부처는 코드 양이 아니라 **§5 체크리스트와 §6 위험 규칙의 밀도, §7 카드의
말맛**이다. 골격(M0)은 하루면 끝난다. 남는 시간을 전부 데이터 자산과 렌더 문구의 품질,
그리고 PlayMCP AI 채팅에서의 실전 궁합(도구 description 다듬기)에 써라. 기능을 추가하고
싶어지면 Part A Q10의 "하지 않기로 한 것"을 다시 읽어라.
