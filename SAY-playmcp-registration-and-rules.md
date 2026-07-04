# PlayMCP 서버 등록 및 심사 대응 규칙

작성일: 2026-07-05  
근거: `PlayMCP 서버 개발가이드.txt` (Update Date: 2026-06-12), 첨부 이미지 `image.png`

---

## 이 문서의 목적

이 문서는 SAY MCP 서버를 PlayMCP에 등록할 때 반려를 피하기 위한 필수 규칙을 정리한다. 구현자는 MCP 공식 스펙뿐 아니라 PlayMCP의 추가 규칙을 반드시 만족해야 한다.

---

## 1. 서버 생성 조건

### 1.1 지원 MCP 버전

PlayMCP 가이드 기준:

```text
최소 지원버전: 2025-03-26
최대 지원버전: 2025-11-25
```

SAY MVP는 `2025-03-26`을 기준으로 구현한다. 이유는 공식 링크와 현재 조사 문서가 모두 2025-03-26 스펙을 기준으로 하고, PlayMCP 최소 지원 기준과 맞기 때문이다.

### 1.2 Transport

PlayMCP는 **Streamable HTTP 방식만 지원**한다. stdio 서버나 deprecated HTTP+SSE-only 서버로 제출하지 않는다.

실제 endpoint는 공개 URL이어야 한다.

```text
https://{server-name}.playmcp-endpoint.kakaocloud.io/mcp
```

로컬 개발 중에도 최종 서버는 remote MCP server로 공개 URL에서 접근 가능해야 한다.

### 1.3 Remote MCP만 가능

PlayMCP는 remote MCP 서버만 지원한다. 사용자의 로컬 프로세스를 실행하는 stdio 방식은 제출 대상이 아니다.

### 1.4 Stateless 권장

PlayMCP 가이드는 stateless MCP 서버를 권장한다.

SAY에 적용:

- 예선 MVP는 no-session 서버로 간다.
- 입력이 같으면 같은 카드가 나오는 결정적 분석 도구를 만든다.
- 상태 저장이 필요한 "닫힘 추적"은 tool result로 다음 상태를 제안하거나, 본선 확장으로 둔다.

### 1.5 인증

사용자 인증이 필요한 경우:

- OAuth 인증
- 또는 커스텀 헤더 방식

둘 중 하나를 지원해야 한다.

SAY MVP 권장:

- 개인정보/계정 연동/장기 상태 저장 없이 분석형 도구로 시작한다.
- OAuth는 본선에서 가족별 알림/처리 상태를 실제 저장해야 할 때 도입한다.

---

## 2. MCP Inspector 사전 점검

PlayMCP 가이드는 MCP Inspector로 MCP 표준 스펙 준수 여부를 사전 점검하라고 한다.

필수 점검:

- Inspector UI로 서버 연결
- `tools/list` 성공
- 각 tool schema 확인
- 모든 tool에 `name`, `description`, `inputSchema`, `annotations` 존재 확인
- `tools/call` 정상 결과 확인
- 잘못된 input에 정제된 오류 결과가 나오는지 확인
- 원격 endpoint에서도 Streamable HTTP로 연결되는지 확인

세부 절차는 `SAY-mcp-inspector-test-manual.md`를 따른다.

---

## 3. SDK 사용

PlayMCP 가이드는 활발하게 운영되는 SDK를 사용하거나 참조하라고 한다.

SAY 구현 권장:

- TypeScript SDK 기반으로 구현한다.
- 공식 SDK가 제공하는 Streamable HTTP transport를 우선 사용한다.
- 직접 JSON-RPC endpoint를 손으로 구현해야 한다면 `SAY-mcp-streamable-http-2025-03-26.md`를 체크리스트로 삼는다.

---

## 4. 이름 규칙

### 4.1 `kakao` 금지

MCP Server Name 또는 Tool Name에는 `kakao`를 넣으면 안 된다.

금지:

```text
kakaoSAY
sayKakao
family_kakao_notice
KakaoNoticeAnalyzer
```

허용 후보:

```text
say
say-family
family-say
notice-say
```

### 4.2 첨부 이미지의 MCP 식별자 규칙

첨부 이미지에서 확인된 등록 UI:

- 화면: `새로운 MCP 서버 등록`
- 필드: `MCP 식별자` 필수
- 설명: LLM이 중복된 도구를 구분할 수 있도록 툴 이름 앞에 붙는 prefix로 사용됨
- 입력 제한: 영문, 숫자만 사용 가능
- 길이: `0/16` 표기, 즉 최대 16자로 보임
- 예시: `kakaoCalendar`

SAY에 적용:

```text
MCP 식별자 후보: SAY
대안: FamilySAY, NoticeSAY
```

주의:

- 이미지의 `kakaoCalendar`는 플랫폼 예시일 뿐이다.
- PlayMCP 서버 개발가이드가 `kakao` 사용 금지를 별도로 명시하므로, 실제 식별자/서버명/툴명에 `kakao`를 넣지 않는다.

---

## 5. Tool 구성 규칙

### 5.1 Tool name

PlayMCP 가이드 기준:

- 최소 1자, 최대 128자
- 영어 대소문자, 숫자, `_`, `-`만 허용
- 중복 금지
- 대소문자 구분

권장:

```text
analyze_notice
create_followup_message
update_check_state
```

피할 것:

```text
공지분석
analyze.notice
analyze notice
kakao_analyze_notice
```

### 5.2 Tool 개수

PlayMCP 가이드 기준:

- 20개 초과 금지
- 3개~10개 권장

SAY 예선 MVP 권장 개수: 3개

```text
analyze_notice
create_followup_message
update_check_state
```

이유:

- 툴이 많으면 LLM의 적절한 tool call 확률이 떨어진다.
- SAY는 "공지 -> 행동 카드 -> 확인/완료" 흐름이 핵심이므로, 큰 흐름 단위 툴이 낫다.

### 5.3 필수 property

PlayMCP 가이드 기준으로 각 tool은 다음을 반드시 가져야 한다.

```text
name
description
inputSchema
annotations
```

`annotations`에는 다음 값을 모두 지정한다.

```text
title
readOnlyHint
destructiveHint
openWorldHint
idempotentHint
```

### 5.4 annotations 기준

분석 도구:

```json
{
  "title": "Analyze family notice",
  "readOnlyHint": true,
  "destructiveHint": false,
  "openWorldHint": false,
  "idempotentHint": true
}
```

후속 메시지 초안 생성:

```json
{
  "title": "Create follow-up message",
  "readOnlyHint": true,
  "destructiveHint": false,
  "openWorldHint": false,
  "idempotentHint": true
}
```

상태 변경 도구:

```json
{
  "title": "Update check state",
  "readOnlyHint": false,
  "destructiveHint": false,
  "openWorldHint": false,
  "idempotentHint": false
}
```

단, 실제 서버가 상태를 저장하지 않고 "업데이트된 상태 JSON 후보"만 반환한다면 `readOnlyHint: true`, `idempotentHint: true`로 둘 수 있다. 구현 방식에 맞춰 정직하게 설정해야 한다.

---

## 6. description 작성 규칙

PlayMCP 가이드 기준:

- 가능한 영문 작성 권장
- description에 MCP 명/서비스 이름 포함
- 서비스 이름은 영문, 국문 병기
- 1,024자 이내
- 너무 긴 description은 tool call에 불리하고 다른 tool 호출에도 악영향

SAY tool description 예:

```text
Analyzes a family notice or message with SAY(사이). Extracts confirmed facts, missing checks, action items, risk signals, and suggested next steps from the provided raw text.
```

```text
Creates a concise follow-up message with SAY(사이) for a family member. The message must stay factual, avoid emotional impersonation, and ask only for the missing confirmation or next action.
```

---

## 7. Tool result 규칙

PlayMCP 가이드 기준:

- result 크기는 최소화
- error이거나 widget JSON이 아닌 경우에는 정제된 텍스트를 권장
- API 응답 원본을 그대로 노출하지 말 것

SAY 적용:

- 원문 전체를 매번 result에 되돌려주지 않는다.
- 불필요한 내부 점수/디버그 정보/regex 매칭 목록을 노출하지 않는다.
- 실패 시에도 사용자에게 의미 있는 Markdown 또는 짧은 JSON 오류를 반환한다.

좋은 오류:

```json
{
  "content": [
    {
      "type": "text",
      "text": "안내문 텍스트가 비어 있어 분석할 수 없습니다. 캡처 속 문자를 raw_text에 그대로 옮겨 다시 호출하세요."
    }
  ],
  "isError": true
}
```

피할 오류:

```text
TypeError: Cannot read properties of undefined...
```

---

## 8. OAuth 등록 규칙

개인정보가 담긴 OAuth 인증을 제공하는 경우, PlayMCP 가이드는 다음 redirect URI 설정을 요구한다.

```text
https://playmcp.kakao.com/api/v1/applied-mcps/{mcpId}/authorize/oauth:callback
```

`mcpId`는 PlayMCP에 등록된 MCP의 id다.

예:

```text
https://playmcp.kakao.com/mcp/3
-> mcpId = 3
-> https://playmcp.kakao.com/api/v1/applied-mcps/3/authorize/oauth:callback
```

개인정보를 카카오로 전달하는 경우, 사용자에게 개인정보 제3자 제공 동의 화면을 구성하는 것을 권장한다.

동의문에 포함할 항목:

- 제공받는 자: (주) 카카오
- 제공 목적
- 제공 항목
- 보유 및 이용 기간

SAY MVP에서는 OAuth를 피하는 것이 좋다. 본선에서 가족 계정/알림/장기 상태 저장이 필요해질 때 도입한다.

---

## 9. 서버 운영 기준

PlayMCP 가이드 기준:

```text
평균 응답속도: 100ms 이내
p99: 3,000ms 필수
```

SAY 설계와 연결:

- 서버에서 LLM을 직접 호출하지 않는 설계가 이 기준에 유리하다.
- 정규식/스키마/문자열 기반 결정적 처리로 100ms 평균을 목표로 한다.
- 외부 API, DB, OCR 호출을 서버 내부에서 수행하면 p99 3초를 깨기 쉽다.

광고 유도 금지:

- tool result가 광고를 노출하도록 유도하면 안 된다.
- SAY는 병원/보험/카드 관련 안내를 다루더라도 특정 상품/기관 추천을 하지 않는다.

---

## 10. 제출 전 반려 방지 체크리스트

서버:

- [ ] Remote URL에서 접근 가능
- [ ] Streamable HTTP endpoint 제공
- [ ] MCP 2025-03-26 호환
- [ ] stateless 또는 session 처리 명확
- [ ] 공개 URL이 HTTPS
- [ ] `kakao` 문자열이 server/tool name에 없음

툴:

- [ ] 3개~10개
- [ ] 이름 규칙 준수
- [ ] 중복 없음
- [ ] `name`, `description`, `inputSchema`, `annotations` 존재
- [ ] annotation 5종 모두 지정
- [ ] description 영문 중심, SAY(사이) 포함, 1,024자 이하

응답:

- [ ] result 작음
- [ ] 원본 API 응답 그대로 노출하지 않음
- [ ] 오류가 정제된 text/Markdown으로 나옴
- [ ] 광고/상품 추천 없음

검증:

- [ ] MCP Inspector UI 연결 성공
- [ ] Inspector CLI `tools/list` 성공
- [ ] 각 tool `tools/call` 성공
- [ ] 잘못된 입력 오류 처리 확인
- [ ] PlayMCP 개발자 콘솔의 "정보 불러오기" 성공
- [ ] 임시 등록 후 AI 채팅에서 충분히 테스트

