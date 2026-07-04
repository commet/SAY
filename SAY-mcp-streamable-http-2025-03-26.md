# MCP Streamable HTTP 2025-03-26 구현 메모

작성일: 2026-07-05  
출처: https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http

---

## 이 문서의 목적

PlayMCP는 Streamable HTTP transport만 지원한다. 이 문서는 MCP 2025-03-26 Streamable HTTP 스펙에서 SAY 서버 구현자가 실제로 지켜야 할 내용을 정리한다.

---

## 1. 기본 구조

MCP는 JSON-RPC 메시지를 사용하며, 메시지는 UTF-8로 인코딩되어야 한다.

2025-03-26 스펙의 표준 transport:

- stdio
- Streamable HTTP

PlayMCP 제출에서는 stdio가 아니라 Streamable HTTP를 구현한다.

Streamable HTTP 특징:

- 서버는 독립 프로세스로 실행된다.
- 여러 client connection을 처리할 수 있다.
- HTTP POST와 GET을 사용한다.
- SSE를 선택적으로 사용해 여러 server message를 stream할 수 있다.
- 서버는 단일 MCP endpoint path를 제공해야 한다.

예:

```text
https://example.com/mcp
```

SAY 예상:

```text
https://{server-name}.playmcp-endpoint.kakaocloud.io/mcp
```

---

## 2. 보안 경고

Streamable HTTP 구현 시 공식 스펙은 다음을 요구/권장한다.

- 모든 incoming connection에서 `Origin` header 검증
- 로컬 실행 시 `127.0.0.1`에 bind 권장
- 모든 connection에 적절한 인증 구현 권장

이유:

- DNS rebinding 공격으로 원격 웹사이트가 로컬 MCP 서버와 상호작용하는 것을 막기 위함

SAY 적용:

- 로컬 개발 서버는 localhost bind
- 배포 서버는 PlayMCP/Kakao Tools에서 오는 요청을 고려해 Origin 검증 정책을 보수적으로 설계
- 인증 없는 공개 endpoint라면 tool이 개인정보/상태 변경을 하지 않도록 제한
- OAuth/커스텀 헤더가 필요한 단계로 가면 `SAY-mcp-authorization-2025-03-26.md`를 따른다.

---

## 3. Client -> Server 메시지: POST

모든 JSON-RPC message는 MCP endpoint에 대한 새 HTTP POST request로 전송된다.

클라이언트 요구:

- HTTP POST 사용
- `Accept` header에 `application/json`과 `text/event-stream` 둘 다 포함
- body는 단일 JSON-RPC request/notification/response 또는 batch array

서버 응답 규칙:

### 3.1 입력이 notification/response뿐인 경우

서버가 수락하면:

```text
HTTP 202 Accepted
body 없음
```

수락할 수 없으면:

```text
HTTP 400 등 HTTP error
```

필요하면 `id` 없는 JSON-RPC error response를 body에 넣을 수 있다.

### 3.2 입력에 request가 포함된 경우

서버는 둘 중 하나를 반환해야 한다.

```text
Content-Type: application/json
```

또는

```text
Content-Type: text/event-stream
```

SAY MVP 권장:

- streaming이 꼭 필요하지 않으므로 `application/json` 단일 응답을 우선한다.
- 구현 단순성과 p99 3초 기준에 유리하다.

---

## 4. Server -> Client 메시지: GET/SSE

클라이언트는 MCP endpoint에 HTTP GET을 보내 SSE stream을 열 수 있다.

GET 요청 조건:

- `Accept` header에 `text/event-stream` 포함

서버는 둘 중 하나를 해야 한다.

- SSE를 지원하면 `Content-Type: text/event-stream`
- 지원하지 않으면 `405 Method Not Allowed`

SAY MVP 권장:

- server-to-client notification이 필요 없다면 GET은 `405 Method Not Allowed`로 처리해도 된다.
- 단, SDK가 기본 구현을 제공하면 SDK 방식을 따른다.

---

## 5. SSE를 사용하는 경우

SSE stream을 열었다면:

- 각 JSON-RPC request마다 결국 response가 나와야 한다.
- server는 response 전에 관련 request/notification을 보낼 수 있다.
- 모든 response를 보낸 뒤 stream을 닫는 것이 좋다.
- 네트워크 단절은 언제든 발생할 수 있고, 단절을 client cancellation으로 해석하면 안 된다.
- 취소는 MCP `CancelledNotification`으로 명시되어야 한다.

SAY MVP는 SSE가 필요하지 않다. 긴 분석이나 progress notification을 하지 않는 구조를 유지한다.

---

## 6. Multiple Connections

클라이언트는 여러 SSE stream에 동시에 연결될 수 있다.

서버 규칙:

- 같은 JSON-RPC message를 여러 stream에 broadcast하면 안 된다.

SAY MVP는 SSE stream을 열지 않는 설계가 단순하다.

---

## 7. Resumability and Redelivery

서버는 SSE event에 `id`를 붙일 수 있다. client는 `Last-Event-ID` header로 재개를 요청할 수 있다.

규칙:

- event ID는 session 또는 특정 client 범위에서 전역적으로 고유해야 한다.
- 서버는 끊어진 stream의 이후 메시지를 replay할 수 있다.
- 다른 stream에서 전달됐을 메시지를 replay하면 안 된다.

SAY MVP는 resumable SSE를 구현하지 않는다.

---

## 8. Session Management

Streamable HTTP 서버는 초기화 시 `InitializeResult`를 담은 HTTP response에 `Mcp-Session-Id` header를 포함해 session ID를 줄 수 있다.

세션을 쓰는 경우:

- session ID는 전역 고유하고 암호학적으로 안전해야 한다.
- visible ASCII 문자만 사용
- client는 이후 모든 HTTP request에 `Mcp-Session-Id` header를 포함해야 한다.
- session ID가 필요한 서버는 header가 없을 때 HTTP 400을 줄 수 있다.
- session 종료 후 해당 ID가 오면 HTTP 404를 반환한다.
- client는 HTTP DELETE로 session 종료를 요청할 수 있고, 서버는 허용하지 않으면 405를 줄 수 있다.

PlayMCP 가이드는 stateless 서버를 권장한다.

SAY MVP 결정:

- `Mcp-Session-Id`를 발급하지 않는다.
- session이 없더라도 같은 입력에 같은 분석 결과를 반환한다.
- 상태 추적은 본선 기능으로 넘기거나, 클라이언트가 상태를 tool input으로 다시 넘기는 방식으로 처리한다.

---

## 9. Deprecated HTTP+SSE와 구분

2025-03-26 Streamable HTTP는 2024-11-05의 HTTP+SSE transport를 대체한다.

PlayMCP는 Streamable HTTP만 지원한다고 가이드에 명시되어 있으므로, deprecated HTTP+SSE 전용 구현을 제출하지 않는다.

---

## 10. SAY 서버 구현 체크리스트

Endpoint:

- [ ] `/mcp` 단일 endpoint 제공
- [ ] POST 지원
- [ ] GET은 SSE 지원 또는 405 처리
- [ ] JSON-RPC UTF-8 처리
- [ ] `Accept: application/json, text/event-stream` 요청 처리

응답:

- [ ] request 포함 POST에 `application/json` 응답 가능
- [ ] notification-only 요청에 `202 Accepted` 처리 가능
- [ ] 오류 시 HTTP error 또는 JSON-RPC error 규칙 준수

보안:

- [ ] Origin 검증 정책 있음
- [ ] 로컬 개발은 localhost bind
- [ ] public endpoint에서 개인정보/상태 변경 도구 제한

세션:

- [ ] stateless로 갈지 session으로 갈지 결정
- [ ] MVP는 stateless
- [ ] session을 쓰지 않으면 `Mcp-Session-Id` 의존 없음

검증:

- [ ] Inspector UI에서 Streamable HTTP 연결 성공
- [ ] Inspector CLI `--transport http --method tools/list` 성공
- [ ] PlayMCP 개발자 콘솔 "정보 불러오기" 성공

