# 사이(SAY) — 가족 안내 도우미 MCP

사이는 가족이 받은 병원·관공서·보험·택배 안내를 **함께 끝내는 행동 카드**로 바꿉니다. 원문에 있는 사실, 추가 확인이 필요한 빈칸, 남은 할 일과 위험 신호를 분리하고 `SAY-XXXXXX` 카드 코드로 가족이 진행 상태를 이어 볼 수 있습니다.

## 특징

- 원문 인용이 확인된 사실과 추정 내용을 분리하는 근거 게이트
- 병원·관공서·보험/납부·택배 안내별 체크리스트
- 기관 사칭 링크, 긴급 압박, 개인정보·결제 요구 등 7종 위험 규칙
- 가족 공유 메시지와 카드별 할 일 상태 관리
- 외부 AI API와 API 키가 필요 없는 결정적 처리
- 원문을 저장하지 않고 카드만 7일 보관

사이는 의료·법률·금융 판단을 하지 않으며, 위험 여부를 단정하지 않습니다. 확인이 필요한 내용은 공식 기관의 앱·홈페이지·고객센터에서 직접 확인하도록 안내합니다.

## MCP 도구

| 도구 | 역할 |
|---|---|
| `analyze_notice` | 안내문을 사실·빈칸·할 일·위험 신호가 있는 행동 카드로 변환 |
| `check_scam_signals` | 문자에서 스미싱·사기 위험 신호와 안전한 다음 행동 확인 |
| `get_card` | 카드 코드로 최신 행동 카드 조회 |
| `update_item_status` | 할 일을 확인 중·완료·보류 등으로 변경 |
| `make_family_message` | 부모님·자녀·가족방용 사실 중심 메시지 생성 |
| `list_open_items` | 여러 카드에 아직 남은 할 일을 한눈에 조회 |

모든 도구에는 PlayMCP 요구사항에 맞춘 `annotations` 5종이 포함되어 있습니다.

## 로컬 실행

요구사항: Node.js 22 이상

```bash
npm ci
npm run build
npm test
npm start
```

- MCP Endpoint: `http://localhost:8080/mcp`
- Health Check: `http://localhost:8080/health`
- 환경변수: `PORT`(기본 `8080`), `HOST`(기본 `0.0.0.0`), `CARD_STORE_PATH`(기본 `/data/cards.json`)

MCP Inspector:

```bash
npx @modelcontextprotocol/inspector http://localhost:8080/mcp
```

## 컨테이너

```bash
docker build -t say-mcp .
docker run --rm -p 8080:8080 say-mcp
```

멀티스테이지 `Dockerfile`은 PlayMCP in KC Git 소스 빌드에 사용할 수 있습니다. 서버는 MCP `2025-03-26`~`2025-11-25` 호환 Streamable HTTP를 세션 없이 제공하며, `/mcp`의 POST 요청에 단일 JSON 응답을 반환합니다.

## 데이터와 안전

- 사용자가 보낸 원문과 인용문은 로그·카드 파일에 저장하지 않습니다.
- 카드 상태는 마지막 접근부터 7일 뒤 자동 만료됩니다.
- 주민등록번호 등 민감정보는 도구 호출 전에 마스킹하도록 도구 설명에 명시했습니다.
- 카드 저장 경로가 읽기 전용이어도 인메모리 방식으로 계속 동작합니다.

## 검증

`npm test`는 근거 검증, 분류, 카드 멱등성, 병원·관공서·스미싱 시나리오, 위험 신호 중복 억제, 금지 말투를 검사합니다. SDK 클라이언트로 초기화, `tools/list`, `tools/call`, 호출 간 카드 상태 유지도 검증했습니다.

## 라이선스

MIT
