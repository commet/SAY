# MCP Inspector 검증 매뉴얼

작성일: 2026-07-05  
출처:
- https://modelcontextprotocol.io/docs/tools/inspector
- https://github.com/modelcontextprotocol/inspector

---

## 이 문서의 목적

PlayMCP 가이드는 MCP Inspector로 표준 스펙 준수 여부를 사전 점검하라고 한다. 이 문서는 SAY MCP 서버를 로컬/원격에서 검증하기 위한 구체 절차를 정리한다.

---

## 1. Inspector가 하는 일

MCP Inspector는 MCP 서버를 테스트하고 디버깅하는 개발 도구다.

GitHub README 기준 구조:

- MCP Inspector Client: React 기반 웹 UI
- MCP Proxy: Node.js 서버. 웹 UI와 MCP 서버 사이의 protocol bridge 역할

중요:

- proxy는 트래픽을 가로채는 네트워크 프록시가 아니다.
- MCP client로서 서버에 연결하고, 동시에 웹 UI를 서빙한다.
- stdio, SSE, Streamable HTTP transport를 다룰 수 있다.

SAY는 PlayMCP 제출용이므로 Streamable HTTP 검증을 중심으로 한다.

---

## 2. 설치와 실행

공식 문서는 별도 설치 없이 `npx` 실행을 안내한다.

UI 모드:

```bash
npx @modelcontextprotocol/inspector
```

기본 포트:

```text
Client UI: http://localhost:6274
Proxy server: http://localhost:6277
```

포트 변경:

```bash
CLIENT_PORT=8080 SERVER_PORT=9000 npx @modelcontextprotocol/inspector
```

Windows PowerShell 예:

```powershell
$env:CLIENT_PORT="8080"
$env:SERVER_PORT="9000"
npx @modelcontextprotocol/inspector
```

---

## 3. Streamable HTTP 서버 연결

SAY 서버가 로컬에서 `http://localhost:3000/mcp`로 떠 있다면 Inspector UI에서:

```text
Transport: Streamable HTTP
URL: http://localhost:3000/mcp
```

직접 query param으로 열 수도 있다.

```text
http://localhost:6274/?transport=streamable-http&serverUrl=http://localhost:3000/mcp
```

원격 PlayMCP endpoint 예:

```text
https://{server-name}.playmcp-endpoint.kakaocloud.io/mcp
```

---

## 4. 설정 파일 예시

Inspector는 `mcp.json` 스타일 설정 파일을 사용할 수 있다.

SAY 원격 서버 예:

```json
{
  "mcpServers": {
    "say-remote": {
      "type": "streamable-http",
      "url": "https://example.playmcp-endpoint.kakaocloud.io/mcp"
    }
  }
}
```

실행:

```bash
npx @modelcontextprotocol/inspector --config mcp.json --server say-remote
```

서버가 하나뿐이면 `--server` 없이도 자동 선택될 수 있다.

---

## 5. CLI 모드

Inspector GitHub README는 CLI 모드를 지원한다고 설명한다. 자동화와 CI, AI coding assistant 루프에 적합하다.

기본:

```bash
npx @modelcontextprotocol/inspector --cli node build/index.js
```

config 사용:

```bash
npx @modelcontextprotocol/inspector --cli --config mcp.json --server say-remote
```

원격 Streamable HTTP 서버에서 tool 목록 확인:

```bash
npx @modelcontextprotocol/inspector --cli https://example.playmcp-endpoint.kakaocloud.io/mcp --transport http --method tools/list
```

커스텀 헤더가 필요한 경우:

```bash
npx @modelcontextprotocol/inspector --cli https://example.playmcp-endpoint.kakaocloud.io/mcp --transport http --method tools/list --header "X-API-Key: your-api-key"
```

tool call 예:

```bash
npx @modelcontextprotocol/inspector --cli https://example.playmcp-endpoint.kakaocloud.io/mcp --transport http --method tools/call --tool-name analyze_notice --tool-arg raw_text="건강검진 안내입니다. 내일 오전 8시 40분까지 도착하세요."
```

JSON 인자를 넘겨야 할 때:

```bash
npx @modelcontextprotocol/inspector --cli https://example.playmcp-endpoint.kakaocloud.io/mcp --transport http --method tools/call --tool-name analyze_notice --tool-arg 'context={"audience":"family","locale":"ko-KR"}'
```

PowerShell에서는 따옴표 이스케이프가 다를 수 있으므로, 복잡한 JSON은 config 파일 또는 입력 파일 기반 테스트 스크립트를 따로 만드는 편이 안전하다.

---

## 6. UI에서 반드시 확인할 탭

### 6.1 Server connection pane

확인:

- transport가 Streamable HTTP인지
- URL이 `/mcp` endpoint인지
- 필요한 header가 있는지
- 연결 후 initialize가 성공하는지

### 6.2 Tools tab

확인:

- tool 목록이 3개~10개 범위인지
- tool name에 `kakao`가 없는지
- description이 너무 길지 않은지
- input schema가 form으로 잘 렌더링되는지
- annotations가 노출/확인 가능한지
- 각 tool call이 예상 결과를 주는지

### 6.3 Notifications pane

확인:

- 서버 로그/notification에 오류가 없는지
- JSON-RPC error가 발생하지 않는지
- 잘못된 입력에서 서버가 죽지 않는지

---

## 7. SAY 서버용 테스트 케이스

### 7.1 `tools/list`

기대:

- `analyze_notice`
- `create_followup_message`
- `update_check_state`

각 tool이 다음을 포함해야 한다.

```text
name
description
inputSchema
annotations.title
annotations.readOnlyHint
annotations.destructiveHint
annotations.openWorldHint
annotations.idempotentHint
```

### 7.2 병원 안내 분석

입력:

```text
건강검진 안내입니다. 내일 오전 8시 40분까지 2층 접수로 오세요. 오늘 밤 10시부터 금식입니다. 신분증을 지참하세요.
```

기대:

- notice_type: hospital
- confirmed_facts에 도착시간, 금식, 신분증 포함
- action_items 생성
- missing_checks에 복용약 여부 같은 원문에 없는 정보가 있으면 "확인 필요"로만 표현
- 의료 판단 없음

### 7.3 관공서 안내 분석

입력:

```text
복지급여 신청서류 제출 안내. 7월 10일까지 주민센터 방문 제출. 신분증, 통장사본, 가족관계증명서 지참.
```

기대:

- notice_type: government
- 마감, 장소, 준비서류 추출
- 신청 자격 판단은 하지 않음

### 7.4 택배/스미싱 의심

입력:

```text
[대한배송] 주소 오류로 배송 보류. 즉시 아래 링크에서 개인정보를 입력하세요. http://short.example/abc
```

기대:

- notice_type: delivery_or_smishing
- risk_signals에 링크 클릭, 개인정보 입력, 긴급 압박 포함
- "스미싱 확정"이라고 단정하지 않고 위험 신호로 표현
- 공식 앱/고객센터 확인 안내

### 7.5 잘못된 입력

입력:

```text
""
```

기대:

- 서버 500이 아니라 tool execution error
- `isError: true`
- 정제된 한국어/영어 오류 메시지

---

## 8. Inspector 보안 주의사항

Inspector proxy는 로컬 MCP 프로세스를 실행할 수 있으므로 신뢰할 수 없는 네트워크에 노출하면 안 된다.

GitHub README 기준:

- 기본적으로 client/proxy는 localhost에만 bind한다.
- `HOST=0.0.0.0`은 신뢰 가능한 네트워크에서만 사용한다.
- proxy 인증을 끄는 `DANGEROUSLY_OMIT_AUTH=true`는 사용하지 않는다.
- proxy는 기본적으로 session token 인증을 사용한다.
- DNS rebinding 방지를 위해 Origin header 검증이 있다.

SAY 개발 규칙:

- Inspector는 로컬 개발자 PC에서만 띄운다.
- `DANGEROUSLY_OMIT_AUTH`를 쓰지 않는다.
- 화면 공유/로그 공유 시 session token이 보이지 않게 한다.

---

## 9. 타임아웃 설정

Inspector는 request timeout을 설정할 수 있다. README 기준 기본 설정에는 `MCP_SERVER_REQUEST_TIMEOUT`, `MCP_REQUEST_MAX_TOTAL_TIMEOUT` 등이 있다.

SAY는 PlayMCP 운영 기준상 평균 100ms, p99 3,000ms를 목표로 해야 한다. 따라서 Inspector에서 긴 타임아웃으로 겨우 통과하는 서버는 제출하면 안 된다.

테스트 기준:

- 정상 tool call은 1초 이내 목표
- p99 3초 초과 가능성이 있으면 설계 수정
- 서버 내부 LLM/OCR/외부 API 호출을 넣지 않는 설계를 유지

---

## 10. PlayMCP 제출 전 Inspector 체크리스트

UI:

- [ ] Streamable HTTP로 연결 성공
- [ ] initialize 성공
- [ ] Tools tab에서 모든 tool 확인
- [ ] tool schema가 예상대로 렌더링
- [ ] 병원/관공서/스미싱 샘플 call 성공
- [ ] 잘못된 입력 오류 처리 확인

CLI:

- [ ] `tools/list` 성공
- [ ] `analyze_notice` 성공
- [ ] `create_followup_message` 성공
- [ ] `update_check_state` 성공
- [ ] 원격 endpoint에서도 동일하게 성공

보안:

- [ ] Inspector proxy를 외부에 노출하지 않음
- [ ] 인증 우회 환경변수 사용하지 않음
- [ ] 테스트 로그에 개인정보/토큰 없음

