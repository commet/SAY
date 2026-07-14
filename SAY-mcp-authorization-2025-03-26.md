# MCP Authorization 2025-03-26 구현 메모

작성일: 2026-07-05  
출처:
- https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization#authorization-flow
- `PlayMCP 서버 개발가이드.txt`

---

## 이 문서의 목적

SAY MVP는 가능하면 OAuth 없이 분석형 MCP 서버로 제출하는 것을 권장한다. 다만 본선에서 가족별 상태 저장, 알림, 계정 연동, 민감 정보 접근이 필요해지면 OAuth가 필요할 수 있다. 이 문서는 그때 참고할 인증 구현 기준을 정리한다.

---

## 1. 언제 OAuth가 필요한가

OAuth가 필요한 경우:

- 사용자별 장기 상태 저장
- 가족 구성원/가족방 단위 데이터 저장
- 실제 카카오톡 알림/일정/외부 서비스 등록
- 개인정보가 담긴 리소스 접근
- 사용자의 계정으로 외부 API 호출

OAuth 없이 가도 되는 경우:

- 사용자가 제공한 `raw_text`만 분석
- tool result로 행동 카드만 반환
- 서버에 사용자 데이터를 저장하지 않음
- 알림은 "알림 후보"만 생성하고 실제 등록하지 않음

SAY 예선 MVP:

```text
OAuth 없이 간다.
```

이유:

- 안정성
- 구현 시간
- 개인정보 동의 부담 제거
- p99 3초 기준 유지

---

## 2. MCP Authorization 기본 방향

MCP 인증 스펙은 OAuth 2.1 기반 흐름을 전제로 한다.

핵심:

- authorization base URL
- metadata discovery
- dynamic client registration
- bearer token 사용
- token validation
- third-party authorization 처리 가능

---

## 3. Authorization Base URL

MCP 스펙에 따르면 authorization base URL은 MCP server URL에서 path를 제거해 결정한다.

예:

```text
MCP server URL:
https://api.example.com/v1/mcp

Authorization base URL:
https://api.example.com

Metadata endpoint:
https://api.example.com/.well-known/oauth-authorization-server
```

SAY가 PlayMCP endpoint에 배포된다면 base URL은 배포 도메인의 root가 된다. 단, PlayMCP/Kakao Cloud 환경에서 OAuth endpoint를 같은 도메인 root에 둘 수 있는지는 별도 확인이 필요하다.

---

## 4. Metadata Discovery

클라이언트는 먼저 metadata document를 찾아야 한다.

표준 endpoint:

```text
/.well-known/oauth-authorization-server
```

metadata discovery를 구현하면 클라이언트가 authorization/token/registration endpoint를 수동 설정하지 않아도 된다.

공식 스펙의 best practice도 metadata discovery 구현을 강하게 권장한다.

---

## 5. Metadata가 없을 때 fallback endpoint

서버가 OAuth Authorization Server Metadata를 구현하지 않는 경우, 클라이언트는 authorization base URL 기준으로 다음 기본 경로를 사용한다.

```text
/authorize
/token
/register
```

예:

```text
MCP server URL:
https://api.example.com/v1/mcp

Fallback:
https://api.example.com/authorize
https://api.example.com/token
https://api.example.com/register
```

하지만 클라이언트는 fallback 전에 metadata discovery를 먼저 시도해야 한다.

SAY 본선 구현 권장:

- OAuth가 필요해지면 metadata endpoint를 구현한다.
- fallback에 의존하지 않는다.

---

## 6. Dynamic Client Registration

MCP 스펙은 OAuth 2.0 Dynamic Client Registration 지원을 권장한다.

이유:

- MCP client는 가능한 모든 server를 사전에 알 수 없다.
- 사용자에게 client id를 수동 입력시키면 마찰이 크다.
- 새 server 연결을 부드럽게 만든다.

서버가 dynamic registration을 지원하지 않으면 대안이 필요하다.

- 특정 MCP 서버용 client id/client secret을 하드코딩
- 또는 사용자가 직접 등록한 client 정보를 UI에 입력

SAY 본선 판단:

- PlayMCP/Kakao Tools 쪽이 어떤 방식으로 OAuth client를 등록하는지 확인해야 한다.
- PlayMCP 가이드는 등록 후 OAuth Client에 redirect URI를 설정하라고 하므로, MCP 서버 외부의 OAuth provider 또는 자체 OAuth server 구성이 필요할 수 있다.

---

## 7. Access Token 사용 규칙

MCP client는 resource request마다 Authorization header를 사용해야 한다.

형식:

```http
Authorization: Bearer <access-token>
```

중요:

- 같은 logical session 안의 요청이라도 매 HTTP 요청마다 Authorization header를 포함해야 한다.
- access token을 URI query string에 넣으면 안 된다.
- token이 invalid/expired이면 서버는 HTTP 401로 응답해야 한다.

SAY 구현 시 금지:

```text
https://example.com/mcp?[access-token-query-placeholder]
```

허용:

```http
POST /mcp
Authorization: Bearer <access-token>
```

---

## 8. Third-party authorization

MCP 서버가 제3자 authorization server를 사용하는 경우 흐름은 다음과 같다.

1. MCP client가 MCP server와 OAuth flow 시작
2. MCP server가 사용자를 third-party authorization server로 redirect
3. 사용자가 third-party server에서 승인
4. third-party server가 authorization code를 MCP server로 redirect
5. MCP server가 code를 third-party access token으로 교환
6. MCP server가 third-party session에 묶인 자체 access token 생성
7. MCP server가 원래 MCP client와의 OAuth flow 완료

서버 요구:

- third-party token과 MCP token 사이의 안전한 mapping 유지
- MCP token을 인정하기 전에 third-party token 상태 검증
- token lifecycle 관리
- third-party token 만료/갱신 처리

보안 요구:

- redirect URI 검증
- third-party credential 안전 저장
- session timeout 처리
- token chaining 보안 검토
- third-party auth 실패 오류 처리

SAY 본선에서 카카오/외부 알림/가족 계정 연동을 붙이면 이 섹션을 다시 설계해야 한다.

---

## 9. PlayMCP OAuth redirect URI

PlayMCP 가이드 기준, MCP 등록 후 OAuth Client에 다음 redirect URI를 설정해야 한다.

```text
https://playmcp.kakao.com/api/v1/applied-mcps/{mcpId}/authorize/oauth:callback
```

`mcpId`는 PlayMCP 상세 URL의 ID다.

예:

```text
https://playmcp.kakao.com/mcp/3
-> mcpId = 3
-> https://playmcp.kakao.com/api/v1/applied-mcps/3/authorize/oauth:callback
```

---

## 10. 개인정보 제3자 제공 동의

PlayMCP 가이드는 개인정보를 카카오로 전달하는 것에 대해 사용자에게 개인정보 제3자 제공 동의 화면을 구성하는 것을 권장한다.

동의문에 들어갈 항목:

- 제공받는 자: (주) 카카오
- 제공 목적: PlayMCP 연동 및 관리, 서비스 호출/응답 처리, 품질 향상, 고객 문의 대응 등
- 제공 항목: PlayMCP 연동 인증 정보, 서비스 제공자가 추가로 기재하는 항목
- 보유 및 이용 기간: 연동 해제 시 지체 없이 파기

SAY가 가족 안내문, 병원 문자, 보험/납부 문자 같은 민감한 정보를 저장하거나 카카오로 전달하는 구조가 되면 이 동의와 개인정보 처리방침이 필수에 가깝다.

---

## 11. OAuth를 도입하지 않는 MVP 설계

SAY 예선 MVP에서 OAuth를 피하려면:

- 서버는 사용자 식별자를 요구하지 않는다.
- 서버는 입력 원문을 저장하지 않는다.
- tool result에 장기 저장 상태를 만들지 않는다.
- 알림은 실제 등록이 아니라 "알림 후보"로만 반환한다.
- 가족 구성원 정보도 자유 텍스트 label 수준으로만 처리한다.

예:

```json
{
  "reminder_suggestions": [
    {
      "label": "오늘 밤 9시 50분 금식 시작 알림",
      "relative_time": "오늘 21:50",
      "related_action": "금식 시작"
    }
  ]
}
```

실제 알림 등록은 Kakao Tools UI/호스트가 담당하거나, 본선에서 OAuth 기반으로 확장한다.

---

## 12. OAuth 도입 시 체크리스트

설계:

- [ ] OAuth가 정말 필요한 기능인지 확인
- [ ] 저장할 개인정보 항목 최소화
- [ ] metadata discovery endpoint 설계
- [ ] dynamic client registration 지원 여부 결정
- [ ] PlayMCP callback URI 등록

구현:

- [ ] Authorization header bearer token 처리
- [ ] query string token 금지
- [ ] invalid/expired token에 HTTP 401 반환
- [ ] redirect URI 검증
- [ ] token 저장 암호화/보호
- [ ] refresh/expiration 처리

법/정책:

- [ ] 개인정보 제3자 제공 동의 화면
- [ ] 개인정보 처리방침
- [ ] 연동 해제 시 파기 흐름
- [ ] 로그에 token/개인정보 남기지 않기

검증:

- [ ] Inspector에서 bearer/custom header로 인증 연결 테스트
- [ ] 인증 없는 요청 실패 확인
- [ ] 만료 token 실패 확인
- [ ] PlayMCP OAuth callback 실제 통과 확인
