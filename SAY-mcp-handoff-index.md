# SAY MCP 구현 핸드오프 인덱스

작성일: 2026-07-05  
목적: 다른 세션의 AI가 `사이(SAY)` MCP 서버를 구현하거나 검증할 때 읽을 문서 순서와 핵심 결정을 안내한다.

---

## 먼저 읽을 것

1. `SAY-product-brief-kakao-agentic-player-10.md`  
   제품이 무엇인지, 왜 만드는지, 대회 맥락과 사용자 여정을 설명한다.

2. `SAY-implementation-research-briefing.md`  
   기존 조사 브리핑이다. 일정, PlayMCP in KC, 배포 절차, 기술 제약을 넓게 모았다.

3. `SAY-mcp-design-blueprint.md`  
   실행 설계도다. 현재 가장 중요한 결정은 **서버가 LLM을 직접 호출하지 않고, 호스트 LLM이 읽은 내용을 서버가 결정적 로직으로 검증/정리한다**는 것이다.

4. 이 문서와 아래 세부 문서들  
   이번 세션에서 PlayMCP 서버 개발가이드, MCP Inspector, Streamable HTTP, OAuth Authorization 스펙을 다시 읽고 구현자가 놓치지 말아야 할 규칙을 분리했다.

---

## 이번 세션에서 추가한 문서

- `SAY-playmcp-registration-and-rules.md`  
  PlayMCP 서버 개발가이드와 첨부 이미지의 등록 규칙, 툴 구성 규칙, OAuth 정책, 운영 기준을 정리했다.

- `SAY-mcp-inspector-test-manual.md`  
  MCP Inspector 설치/실행/CLI 검증/보안 주의사항과 SAY 서버 검증 절차를 정리했다.

- `SAY-mcp-streamable-http-2025-03-26.md`  
  MCP 2025-03-26 Streamable HTTP 전송 스펙을 PlayMCP 대응 관점으로 정리했다.

- `SAY-mcp-authorization-2025-03-26.md`  
  OAuth 인증 흐름, metadata discovery, dynamic client registration, bearer token 사용 규칙, PlayMCP callback URI를 정리했다.

---

## 출처

- 로컬 파일: `C:\Users\admin\Documents\GitHub\SAY\PlayMCP 서버 개발가이드.txt`
- 로컬 이미지: `C:\Users\admin\Documents\GitHub\SAY\image.png`
- MCP Inspector 문서: https://modelcontextprotocol.io/docs/tools/inspector
- MCP Inspector GitHub: https://github.com/modelcontextprotocol/inspector
- MCP Streamable HTTP 스펙: https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http
- MCP Authorization 스펙: https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization#authorization-flow
- MCP Tools 스펙: https://modelcontextprotocol.io/specification/2025-03-26/server/tools

---

## 구현자가 반드시 유지해야 할 상위 결정

### 1. PlayMCP는 Streamable HTTP만 대상으로 본다

PlayMCP 서버 개발가이드에 따르면 PlayMCP는 Streamable HTTP 방식만 지원한다. 따라서 stdio/SSE-only 서버를 만들면 안 된다.

SAY 서버의 MCP endpoint는 공개 URL의 단일 HTTP endpoint여야 하며, 배포 후 예시는 대략 다음 형태가 된다.

```text
https://{server-name}.playmcp-endpoint.kakaocloud.io/mcp
```

### 2. Stateless 서버를 우선한다

PlayMCP는 stateless(no session) 서버를 권장한다. MCP 스펙상 `Mcp-Session-Id` 세션도 가능하지만, SAY MVP는 심사 안정성을 위해 세션 없는 결정적 도구 서버를 우선한다.

상태가 필요한 "닫힘 추적"은 본선/확장 기능으로 두고, 예선 MVP에서는 입력과 함께 필요한 상태를 넘기거나, tool result에 다음 상태 후보를 반환하는 방식을 우선한다.

### 3. 툴 수는 3개~10개 안에 둔다

PlayMCP 가이드는 서버당 20개 초과 금지, 3개~10개 권장을 명시한다. SAY는 너무 많은 세부 툴을 만들지 말고, LLM이 호출하기 쉬운 소수의 고품질 툴로 구성해야 한다.

권장 초안:

```text
analyze_notice
create_followup_message
update_check_state
```

필요하면 본선에서 확장:

```text
detect_risk_signals
list_open_items
create_reminder_plan
```

### 4. 툴 description은 영어 중심, 서비스명 병기

PlayMCP 가이드는 description 영문 작성을 권장하고, MCP 명/서비스명을 포함하라고 한다. 서비스명은 고유명사로 영문/국문 병기한다.

예:

```text
Analyzes a family notice or message with SAY(사이), extracting confirmed facts, missing checks, action items, and follow-up prompts.
```

### 5. `kakao`는 이름에 넣지 않는다

PlayMCP 가이드는 MCP Server Name 또는 Tool Name에 `kakao`를 prefix/suffix/중간 포함 모두 금지한다고 한다. 대소문자 구분 없이 금지다.

첨부 이미지의 예시는 `kakaoCalendar`로 보이지만, SAY 구현에서는 절대 사용하지 말 것. 이미지의 `kakaoCalendar`는 플랫폼 설명용 예시로만 보고, 실제 제출명에는 쓰지 않는다.

### 6. 툴 annotations를 빠뜨리지 않는다

PlayMCP 가이드는 `name`, `description`, `inputSchema`, `annotations`를 필수로 요구하고, `annotations` 안의 다음 값을 모두 지정하라고 한다.

```text
title
readOnlyHint
destructiveHint
openWorldHint
idempotentHint
```

SAY의 기본 분석 도구는 읽기 전용이어야 한다.

```json
{
  "title": "Analyze family notice",
  "readOnlyHint": true,
  "destructiveHint": false,
  "openWorldHint": false,
  "idempotentHint": true
}
```

알림 생성/상태 변경 도구는 실제 외부 시스템을 바꾸는지 여부에 따라 `readOnlyHint`, `destructiveHint`, `idempotentHint`를 보수적으로 설정해야 한다.

### 7. 툴 result는 작고 정제된 형태로 준다

PlayMCP 가이드는 result 크기를 최소화하라고 한다. 오류나 widget JSON이 아닌 경우에는 API 원본을 그대로 노출하지 말고 정제된 텍스트, 예를 들면 Markdown을 권장한다.

SAY 서버도 원본 OCR 전체를 매번 반환하지 말고, 필요한 `confirmed_facts`, `missing_checks`, `action_items`, `risk_signals`, `suggested_messages`만 반환한다.

### 8. OAuth는 필요할 때만 붙인다

SAY MVP가 사용자별 장기 상태, 가족방 공유, 실제 알림 등록을 하지 않는다면 OAuth를 붙이지 않는 쪽이 안정적이다. 개인정보가 담긴 OAuth를 붙이면 개인정보 제3자 제공 동의 화면과 표준 OAuth 흐름이 필요해진다.

본선에서 가족 계정/알림/상태 기억까지 가려면 OAuth 문서를 다시 읽고 구현해야 한다.

---

## 다음 세션의 작업 순서 권장

1. `SAY-playmcp-registration-and-rules.md`를 읽고 제출 반려 조건을 체크한다.
2. `SAY-mcp-streamable-http-2025-03-26.md`를 읽고 서버 transport 구현을 고정한다.
3. `SAY-mcp-inspector-test-manual.md`를 읽고 로컬/원격 검증 명령을 만든다.
4. OAuth가 필요하면 `SAY-mcp-authorization-2025-03-26.md`를 읽는다. MVP에서는 가능하면 피한다.
5. `SAY-mcp-design-blueprint.md`의 툴 설계를 PlayMCP 규칙에 맞춰 조정한다.
6. 실제 서버 구현 후 Inspector에서 `tools/list`, `tools/call`을 통과시킨다.

