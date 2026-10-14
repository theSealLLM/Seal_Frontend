# Seal_Frontend 작업 계획

Seal_LLM(고객 문의 분류 + 답변 초안) API를 부르는 채팅형 화면. React + Vite + TypeScript + Tailwind CSS.
---

## 1. 연결할 API (Seal_LLM 로컬 FastAPI)

```
Set-Location C:\Work\Seal_LLM; uv run uvicorn --app-dir src theseal.api.main:app --reload --port 8000
```

| 메서드 | 경로 | 쓰임 |
|---|---|---|
| GET | `/health` | 서버 상태 (사이드바 아래) |
| POST | `/api/answer/stream` | **기본 경로**. 답변 스트리밍 (SSE) |
| POST | `/api/answer` | 스트리밍 없는 같은 처리 (JSON). 예비용 |
| POST | `/api/classify` | 분류만. 화면에서는 안 써도 됨 |

요청 본문 (`/api/answer`, `/api/answer/stream` 같음)

```json
{ "text": "문의 원문 (1~2000자)", "provider": "local | openai (생략 시 서버 기본값)", "label": "생략. 넣으면 분류를 건너뜀 (테스트용)" }
```

### 1-1. 스트리밍 이벤트 (`text/event-stream`)

```
event: status          data: {"stage": "classifying", "message": "문의를 분류하는 중..."}
event: classification  data: RoutingResult   (분류를 거쳤을 때만)
event: status          data: {"stage": "answering", "message": "답변을 작성하는 중..."}
                          또는 {"stage": "adventure", "message": "챗봇이 알 수 없는 것을 찾아 모험을 떠나는 중..."}
event: delta           data: {"text": "글자 조각"}   (여러 번. adventure일 때는 오지 않음)
event: done            data: AnswerResponse   (마지막 한 번. 오류도 여기로)
```

- `adventure` = 범위 밖(unknown) 문의. 날짜 · 날씨 · 검색 툴을 쓴 뒤 답이 정해지므로 **delta 없이 기다렸다가 done**에 전체 답변이 온다 (로컬 모델 6~28초).
- `done.answer`는 delta를 이은 전체 답변(앞뒤 공백 제거). done이 오면 이 값으로 확정한다.
- 오류: 입력 오류(빈 문장 · 2000자 초과 · 잘못된 provider)만 스트림을 열기 전에 **HTTP 400 JSON**(AnswerResponse 형식). 그 뒤 오류는 **HTTP 200 + done(status="error", error.code)**.
  - `error.code`: `invalid_input` · `config_error`(분류 모델 · 키 없음) · `llm_error`(Ollama 꺼짐 등) · `llm_timeout`
- `POST`라서 `EventSource`를 못 쓴다 → `fetch` + `ReadableStream`으로 읽는다. 조각이 이벤트 중간에서 끊겨 올 수 있으니 `\n\n` 단위로 버퍼링해 파싱한다.
- 클라이언트가 함께 처리할 경우
  - 스트림을 읽기 전에 `res.ok`부터 확인한다. 400이면 JSON(AnswerResponse)으로 읽어 오류로 표시.
  - 줄 끝이 `\r\n`이어도 파싱되게 한다. `data:` 여러 줄은 `\n`으로 잇는다.
  - 스트림이 끝나면 `TextDecoder`를 flush(`decode()`)하고, 끝에 `\n\n` 없이 남은 이벤트도 처리한다.
  - **`done` 없이 스트림이 끝나면**(서버 종료 · 연결 끊김) 오류로 처리한다.
  - 중지로 생긴 `AbortError`는 네트워크 오류와 구분해 "중지됨"으로 처리한다.
  - 서버는 연결이 끊기면 스트림 생성을 멈추지만, 분류 단계(`pipeline.classify`)는 끝까지 돈다. 화면에서는 신경 쓰지 않아도 된다.

### 1-2. 응답 형식 (요약, 원본은 Seal_LLM `src/theseal/api/schemas.py` · `llm/schemas.py` · `routing/router.py`)

```ts
type Health = {
  status: "ok"; classifier: string | null; classifier_device: string | null; classifier_error: string | null;
  route_rule_enabled: boolean; verify_mode: "off" | "uncertain" | "all"; default_provider: "local" | "openai";
};

type RoutingResult = {
  label: "shipping" | "refund" | "account" | "unknown"; text: string; classifier_label: string;
  scores: Record<string, number>;                // 분류기 확률 (보정 전)
  route: { route: "confident" | "low_confidence" | "ambiguous" | "unknown"; p1: number; margin: number; reason: string } | null;
  verification: { match: boolean; reason: string; final_label: string; latency_ms: number; error: string | null } | null;
};

type AnswerResponse = {
  request_id: string; status: "ok" | "error"; label: string; answer: string | null;
  provider: "local" | "openai"; model: string; prompt_version: string;
  tools_used: { name: string; args: object; ok: boolean; error?: string | null; latency_ms: number }[];
  latency_ms: number;                             // 답변 생성 시간 (분류 · 검증 제외)
  usage: { input_tokens: number | null; output_tokens: number | null };
  error: { code: string; message: string } | null;
  created_at: string; classification: RoutingResult | null;
};
```

라벨 표시 이름: shipping 배송 · refund 환불/반품 · account 계정 · unknown 범위 밖
(분류기 라벨이 나중에 enum 숫자로 바뀔 수 있다. 이름 변환은 한 곳(`labels.ts`)에 모아 둔다.)

### 1-3. API 제약 (화면 설계에 영향)

| 제약 | 대응 |
|---|---|
| 한 번에 문의 하나만 처리 (이전 대화 맥락 없음) | **문의 하나 = 대화 하나**. 같은 대화에서 다시 보내면 독립 문의로 처리됨을 입력창 아래 안내 |
| 문의 내역 저장 API 없음 | localStorage (try/catch로 감싸고, 실패해도 화면은 동작) |
| CORS 설정 없음 | 개발 중에는 Vite 프록시로 우회 |
| Windows에서 `localhost`는 IPv6를 먼저 시도해 요청마다 약 2초 늦음 | 프록시 대상은 **`http://127.0.0.1:8000`** |

---

## 2. 화면 구성

```
┌───────────────┬──────────────────────────────────────┐
│ + 새 문의       │  [로컬 ▾]                             │
│               │                                      │
│ 문의 내역       │   🧑 오늘 날씨가 안 좋아서 배송이…       │
│  · 배송 지연…   │   🤖 배송 지연 여부는 공식 주문 내역…█   │
│  · 환불 언제…   │      [배송 · 확신 부족 · 1.6초] [복사]  │
│               │                                      │
│ ● 서버 정상     │  ┌──────────────────────────┐ [전송] │
│   분류기 bert   │  │ 문의를 입력하세요            │ [중지] │
└───────────────┴──────────────────────────────────────┘
```

- 오른쪽 대화: 위 모델 선택(local · openai), 가운데 말풍선, 아래 입력창
  - 모델 선택은 "로컬 / OpenAI"로만 표시한다. `/health`에 모델 이름이 없고 `done.model`에만 온다(실제 모델 이름은 답변 배지에 표시).
  - 기본 선택값은 `/health`의 `default_provider`.
- 왼쪽 사이드바: 새 문의, 문의 내역(첫 문장 제목, 최신순, 삭제), 서버 상태(`/health` 30초마다 · 분류기 이름 · 검증 모드)
  - 상태는 세 가지로 표시한다. `/health`는 분류기를 불러오지 못해도 항상 `"status": "ok"`를 주므로 `classifier_error`를 봐야 한다.
    - **정상**: 응답 성공 + `classifier_error` 없음
    - **분류기 오류**: 응답 성공 + `classifier_error` 있음 (오류 내용을 툴팁으로)
    - **연결 안 됨**: 네트워크 실패, 또는 백엔드가 꺼져 Vite 프록시가 5xx를 준 경우
- 좁은 화면: 사이드바 접기 (햄버거 버튼)

---

## 3. 필수 구현 사항 (사용자 요청)

### 3-1. 스트리밍 텍스트 UX
- **답변 시작 전**: `status` 단계 문구 + 스켈레톤(`animate-pulse`).
  - `classifying` "문의를 분류하는 중..." → `answering` "답변을 작성하는 중..."
  - `adventure` "챗봇이 알 수 없는 것을 찾아 모험을 떠나는 중..." — 기다림이 길다(최대 수십 초). 별도 애니메이션 + 경과 시간 표시
- **타이핑 효과**: delta는 몰려서 도착하므로(모델 속도 · 네트워크) 받은 글자를 버퍼에 쌓고 `requestAnimationFrame`으로 일정 속도로 흘린다(커스텀 Hook `useTypewriter`). 버퍼가 많이 밀리면 속도를 올려 따라잡는다.
  - adventure는 done에 전체 답변이 한 번에 오므로, 같은 Hook으로 흘려 보여 주면 두 경로의 느낌이 같아진다.
  - `prefers-reduced-motion`이면 효과 없이 바로 표시.
  - **수신 완료와 표시 완료를 나눈다.** done은 버퍼가 아직 흘러가는 중에 도착한다. done이 오면 `received`(전체 답변 = `done.answer`)만 확정하고, 타이핑이 그 끝까지 표시한 뒤에 메시지를 `done`으로 바꾼다. 그래야 커서가 먼저 사라지거나 남은 글이 한꺼번에 튀어나오지 않는다.
  - **중지 시**: 버퍼에 남은 글자까지 즉시 표시한 뒤 "중지됨"을 붙인다(받은 내용은 버리지 않는다).
- **커서 블링크**: 생성 중에만 텍스트 끝에 `█`(또는 `|`) 깜빡임. 표시가 끝나면(위 "표시 완료") 제거.

### 3-2. 스크롤 관리
- **자동 하단 스크롤**: `scrollIntoView`는 바깥 페이지까지 스크롤할 수 있으므로, 메시지 목록 컨테이너의 `scrollTop`을 직접 바닥(`scrollHeight`)으로 맞춘다. 타이핑 중에는 즉시 이동하고, 새 메시지를 추가할 때만 `scrollTo({ behavior: 'smooth' })`를 쓴다(smooth가 겹치면 버벅인다).
- **사용자 개입 감지**: 바닥 감시 요소의 보임 여부(`IntersectionObserver`)만으로 판단하면 안 된다. 글이 늘어나 감시 요소가 잠깐 밀려날 때도 "사용자가 위로 올렸다"고 오판한다.
  - 사용자 입력(`wheel` · `touchmove` · PageUp/↑ 키)이 있었고 위로 스크롤되어 바닥에서 일정 거리(예: 80px) 이상 떨어졌을 때만 자동 스크롤을 끈다.
  - 바닥으로 돌아오거나 "↓ 맨 아래로" 버튼을 누르면 다시 켠다.

### 3-3. 메시지 레이아웃 · 컴포넌트
- **마크다운**: `react-markdown` + `remark-gfm`. 제목 · 굵게 · 목록 · 표를 Tailwind로 스타일(`@tailwindcss/typography`의 `prose`도 가능). **원시 HTML은 렌더링하지 않는다**(`rehype-raw` 쓰지 않음 → XSS 방지).
  - 참고: unknown 답변은 평문으로 지시되어 있고, 조원 프롬프트 답변(배송 · 환불 · 계정)에는 `**굵게**`가 섞여 나온다.
  - 스트리밍 도중 `**`가 아직 안 닫혀 잠깐 깨져 보일 수 있다 → 허용하거나, 생성 중에는 마지막 미완성 줄만 평문으로 그리는 정도로 처리.
  - **렌더링 비용**: 타이핑 효과는 `requestAnimationFrame`마다 내용을 바꾸므로 그대로면 프레임마다 `react-markdown`이 다시 파싱한다. 생성 중에는 마크다운 렌더링을 일정 간격(예: 100ms)으로 줄이거나, 완성된 줄만 마크다운으로 그리고 진행 중인 줄은 평문으로 그린다.
- **코드 블록**: 복사 버튼은 기본으로 넣는다. 이 서비스 답변에 코드가 나올 일은 드무니 **하이라이팅은 7단계 이후로 미룬다**(우선순위 낮음). 넣을 때는 `react-syntax-highlighter`가 무거우므로 `PrismLight`에 필요한 언어만 등록하고, 코드 블록 컴포넌트를 `React.lazy`로 늦게 불러온다.
- **유저 vs AI 구분**: 정렬(유저 오른쪽 말풍선, AI 왼쪽 전체 폭)과 배경색으로 구분. 다크 모드 지원.
- 메시지는 종류별 컴포넌트로 나눈다: `UserMessage` · `AssistantMessage`(마크다운 본문 + 메타) · `StatusMessage`(단계 · 스켈레톤) · `ErrorMessage`(다시 시도 버튼).

### 3-4. 입력창 UX
- **자동 높이**: `textarea`의 `scrollHeight`로 높이 조절, 최대 높이(예: 200px)를 넘으면 스크롤.
- **단축키**: Enter 전송, Shift+Enter 줄바꿈. **한글 IME 합성 중 Enter 무시**: `e.nativeEvent.isComposing || e.keyCode === 229`이면 return.
  - Safari에서는 `compositionend`가 keydown보다 먼저 와서 `isComposing`이 `false`로 들어온다(마지막 글자가 두 번 전송되는 버그). `compositionend` 직후 같은 틱의 Enter도 무시한다(플래그를 두고 `setTimeout(0)`으로 해제).
- **전송 중**: 전송 버튼을 **중지** 버튼으로 바꾼다. 중지는 `AbortController.abort()`로 fetch를 끊는다(서버도 연결이 끊기면 생성을 멈춘다). 받은 데까지는 "중지됨" 표시와 함께 남긴다.
- 빈 문장 · 공백만 · 2000자 초과는 보내기 전에 막고 글자 수 표시.

### 3-5. 상태 관리 · 성능
- **채팅 히스토리**: 대화 = `{ id, title, createdAt, messages: Message[] }`. 메시지는 아래와 같다.

  ```ts
  type Message = {
    id: string; role: "user" | "assistant";
    content: string;                                // 화면에 보이는 글 (타이핑 효과가 흘린 만큼)
    status: "pending" | "streaming" | "done" | "error" | "stopped";
    stage?: "classifying" | "answering" | "adventure"; // pending일 때 단계 문구 · 스켈레톤
    classification?: RoutingResult;                 // classification 이벤트 (done 전에 배지 미리 표시 가능)
    provider?: "local" | "openai";                  // 보낸 모델 (다시 생성 · 비교용)
    meta?: AnswerResponse;                          // done
    error?: { code: string; message: string };      // 오류 안내 (네트워크 실패는 code "network_error")
  };
  ```

  - `pending`: 보냈고 delta가 아직 없음(단계 문구 표시). `streaming`: 타이핑 중. 수신된 전체 글(버퍼)은 `useTypewriter` 안에 둔다(3-1).
  - 스트리밍 중 갱신은 해당 메시지만 바꾼다(불변 업데이트, 메시지 컴포넌트 `memo`).
- delta마다 localStorage에 쓰지 않는다 → done · 오류 · 중지 시점에만 저장.
- **불러올 때 보정**: 저장본에 `pending` · `streaming` 메시지가 남아 있으면(저장 도중 탭 종료 등) `stopped`로 바꿔서 불러온다.
- **가상 스크롤**: 이 API는 문의 하나 = 대화 하나라서 한 대화가 수백 개가 되기는 어렵다. 우선 넣지 않고, 메시지 목록을 한 컴포넌트로 감싸 두어 나중에 `@tanstack/react-virtual`로 바꾸기 쉽게만 한다. 사이드바 문의 내역이 수백 개가 되면 그쪽에 먼저 적용.

---

## 4. 추가 제안 (이 서비스에 맞춘 것)

1. **답변 복사 버튼** — 이 서비스는 상담원이 쓰는 "답변 초안"이므로 답변 전체 복사가 코드 블록 복사보다 중요하다.
2. **처리 과정 펼쳐 보기** — 답변 아래 작은 배지(라벨 · 경로 · 지연 · 사용한 툴). 누르면 분류기 확률, 경로 규칙(p1 · margin), LLM 검증 근거, 툴 호출 내역, 토큰 수를 표시. 데모 · 디버깅에 유용.
3. **다시 생성 / 모델 바꿔 다시** — 같은 문의를 local ↔ openai로 다시 보내 비교.
4. **오류별 안내** — `config_error` "서버 설정을 확인하세요", `llm_error` "모델 서버(Ollama)가 꺼져 있을 수 있습니다", `llm_timeout` "응답 시간이 초과되었습니다", 네트워크 실패 "API 서버에 연결할 수 없습니다" + 다시 시도.
5. **접근성** — 스트리밍 중에는 스크린 리더가 글자마다 읽지 않게 하고, done 때 `aria-live="polite"`로 한 번 알린다. 버튼에 `aria-label`, 키보드만으로 조작 가능.
6. **SSE 파서 테스트** — Vitest로 아래 경우를 테스트한다.
   - 이벤트 경계가 잘려 오는 경우, 한글이 바이트 중간에서 잘리는 경우(`TextDecoder`의 `stream: true`)
   - `\r\n` 줄 끝, 끝에 `\n\n` 없이 끝나는 마지막 이벤트
   - done 오류 이벤트, `done` 없이 끝나는 스트림, HTTP 400 JSON, 중지(`AbortError`)
   - IME Enter 처리(Safari의 `compositionend` 직후 Enter 포함)
7. **설정값은 한 곳에** — API 주소(`VITE_API_BASE`, 기본은 프록시 상대 경로), 타이핑 속도, 자동 스크롤 거리 등.
8. **배포 시 고려** (지금은 개발 서버만) — 빌드 결과를 다른 주소에서 띄우면 FastAPI에 CORS 설정이 필요하다. 또는 FastAPI가 빌드 결과를 정적 파일로 같이 서빙.

---

## 5. 기술 구성 (예정)

- Vite + React + TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`)
  - 다크 모드: v4 기본값은 `prefers-color-scheme`를 따른다. 화면에 직접 전환 토글을 넣으려면 CSS에 `@custom-variant dark (&:where(.dark, .dark *));`를 두고 `<html>`에 `dark` 클래스를 붙인다.
  - typography 플러그인은 v4에서 CSS의 `@plugin "@tailwindcss/typography";`로 등록한다.
- `react-markdown`, `remark-gfm`, (나중에) `react-syntax-highlighter`(PrismLight), (선택) `@tailwindcss/typography`
- 테스트: Vitest + Testing Library
- 상태: React state + 커스텀 Hook (규모상 Zustand 등은 필요해지면)
- 패키지 버전은 설치 시점에 정확한 버전으로 고정

`vite.config.ts` 프록시

```ts
server: {
  proxy: {
    "/api": "http://127.0.0.1:8000",
    "/health": "http://127.0.0.1:8000",
  },
},
```

## 6. 폴더 구조 (예정)

```
Seal_Frontend/
├── vite.config.ts
├── src/
│   ├── api/client.ts          # health, answerStream(fetch + SSE 파서 + AbortController)
│   ├── api/sse.ts             # 이벤트 파서 (테스트 대상)
│   ├── api/types.ts           # 1-2 타입
│   ├── lib/labels.ts          # 라벨 · 경로 · 단계 표시 이름
│   ├── hooks/useChat.ts       # 대화 · 메시지 상태, 전송 · 중지
│   ├── hooks/useHistory.ts    # localStorage 내역
│   ├── hooks/useHealth.ts     # 서버 상태 주기 확인
│   ├── hooks/useTypewriter.ts # 타이핑 효과
│   ├── hooks/useAutoScroll.ts # 자동 스크롤 + 사용자 개입 감지
│   ├── components/
│   │   ├── Sidebar.tsx
│   │   ├── ChatView.tsx       # 메시지 목록 (나중에 가상 스크롤로 교체 가능)
│   │   ├── messages/UserMessage.tsx · AssistantMessage.tsx · StatusMessage.tsx · ErrorMessage.tsx
│   │   ├── Markdown.tsx · CodeBlock.tsx
│   │   ├── MessageMeta.tsx    # 배지 + 처리 과정 펼침
│   │   └── Composer.tsx       # 자동 높이 textarea · 모델 선택 · 전송/중지
│   └── App.tsx
```

## 7. 진행 순서

1. Vite 프로젝트 생성, Tailwind · 프록시 설정 → `/health` 표시로 연결 확인
2. SSE 파서 + `answerStream` + 테스트
3. 입력창(자동 높이 · IME · 전송/중지) + 말풍선 + 단계 표시 · 스켈레톤
4. 타이핑 효과 · 커서 · 자동 스크롤/개입 감지
5. 마크다운 · 코드 블록(복사만) · 답변 복사
6. 문의 내역(localStorage) · 사이드바 · 새 문의
7. 처리 과정 펼침 · 오류 안내 · 다시 생성 · 다크 모드 · 좁은 화면
8. ~~(선택) 코드 블록 하이라이팅~~ → 건너뜀 (2026-10-13). 답변에 코드가 거의 나오지 않는다(실측에서 코드 블록 0회, 인라인 코드만). 필요해지면 `PrismLight` + `React.lazy`, 표시가 끝난 뒤에만 하이라이팅.

## 7-1. 결정 필요

- **같은 대화에서 다시 보내기를 허용할지** — "문의 하나 = 대화 하나"인데, 1-3은 같은 대화에서 다시 보내는 것을 허용하고 "독립 문의로 처리됨"만 안내한다. 다시 생성 · 모델 바꿔 다시(4-3)의 결과도 같은 대화에 쌓인다.
  - (가) 지금처럼 허용: 입력창은 계속 열어 두고 안내만 한다. 다시 생성 결과 비교가 자연스럽다.
  - (나) 첫 답변 뒤 입력창을 잠그고 "새 문의"로 유도: 맥락이 이어진다는 오해가 없다. 다시 생성은 버튼으로만 한다.
  - **결정 (2026-10-13): (가) 허용.**

## 8. 확인용 문의 예시

| 문의 | 기대 |
|---|---|
| 주문한 지 일주일이 넘었는데 계속 배송 준비 중이에요. | shipping, delta 스트리밍 |
| 오늘 날씨가 안좋아서 배송이 안되려나? | shipping (LLM 검증 통과), 스트리밍 |
| 오늘 무슨 요일이에요? | unknown → adventure 문구 → 날짜 툴 → 한 번에 답변 |
| 서울 날씨 어때요? | unknown → 날씨 툴 (기상청 키 필요) |
| (빈 문장) | 보내기 전에 막힘 (서버로 가도 400) |
| Ollama를 끄고 전송 | done 오류 `llm_error` 안내 |

---

## 9. 구현 메모 (계획서에 없던 것 · 정한 값 · 실측)

### 1단계 (2026-10-13)
- **TypeScript는 7이 아니라 6.0.3** — npm 최신은 7.0.2지만, `create-vite@9.2.1`의 react-ts 템플릿이 `~6.0.2`를 쓴다. 템플릿 설정(`tsconfig.*`)과 맞추려고 6으로 고정했다.
- **린트는 oxlint** — 템플릿 기본값(ESLint 대신 `oxlint` + `.oxlintrc.json`)을 그대로 따랐다.
- **프로젝트는 손으로 구성** — 폴더에 계획서가 있어 `create-vite`가 빈 폴더가 아니라고 묻는다. 임시 폴더에 템플릿을 만들어 설정 파일만 복사했다(데모 화면 · 이미지 제외).
- **백엔드가 꺼져 있으면 Vite 프록시가 HTTP 502(빈 본문)** 를 준다(실측). `getHealth`는 `res.ok`가 아니면 예외 → "연결 안 됨".
- **프록시를 거친 `/health` 응답 6ms** (127.0.0.1 대상, 실측) — localhost IPv6 지연 없음.
- `/health` 응답 대기 한도 5초(`HEALTH_TIMEOUT_MS`), 탭이 다시 보이면 30초를 기다리지 않고 바로 다시 확인한다.
- 다크 모드는 우선 OS 설정을 따른다(토글은 7단계).
- 개발 서버 실행 설정: `.claude/launch.json` (`npm run dev`, 5173).

### 2단계 (2026-10-13)
- **`answerStream`의 반환 · 오류 규칙** — 서버가 보낸 오류(HTTP 400 입력 오류, `done(status="error")`)는 예외가 아니라 `AnswerResponse`로 돌려준다. done을 받지 못한 경우만 `AnswerStreamError`를 던진다. 코드: `aborted`(중지) · `network`(연결 실패 · 끊김 · 프록시 5xx) · `incomplete`(done 없이 끝남) · `bad_response`(JSON 아님 · done 형식 오류). 화면은 둘을 같은 오류 안내로 합친다(4-4).
- 모르는 이벤트 이름은 무시한다(서버가 이벤트를 추가해도 깨지지 않게).
- 줄 끝은 `\r\n`뿐 아니라 `\r`만 있는 경우도 받는다. 끝의 `\r`은 다음 조각의 `\n`과 짝일 수 있어 스트림이 끝날 때까지 보류한다.
- 테스트는 jsdom 없이 Node 환경(`environment: 'node'`)에서 돈다. 모든 바이트 위치에서 잘라 넣는 테스트로 이벤트 경계 · 한글 바이트 중간을 한꺼번에 검사한다. 일부러 넣은 결함(`stream: true` 제거, `\r` 보류 제거)을 테스트가 잡는지 확인했다.
- **실측 (프록시 경유, 로컬 Gemma)**
  - 배송 문의: classifying → 330ms에 classification(shipping, confident) → answering → delta 142개가 8.1~9.6초에 나눠 도착(프록시가 모으지 않음). delta를 이은 값 = `done.answer`(trim). 첫 delta까지 8초는 모델이 처음 메모리에 올라올 때로 보인다.
  - "오늘 무슨 요일이에요?": unknown → adventure → `get_today` 툴 → 3.4초에 done 한 번.
  - 빈 문장 · 2001자: HTTP 400 → `invalid_input` 응답(`request_id` 있음).
  - 중지: 세 번째 delta에서 `abort()` → `aborted`. 서버 로그에는 연결 끊김이 남지 않아 서버 쪽 생성이 실제로 멈췄는지는 확인하지 못했다.

### 3단계 (2026-10-13)
- **글자 수는 앞뒤 공백을 지운 뒤 코드 포인트로 센다** — 서버(`TextRequest`)가 `strip()` 뒤 Python `len`으로 검증한다. JS `length`는 이모지를 2로 세므로 `Array.from(text).length`를 쓴다. 보낼 때도 앞뒤 공백을 지운 글을 보낸다.
- **다시 시도 · 다시 받기는 같은 자리에서** — 오류 · 중지된 답변 메시지를 `pending`으로 되돌려 같은 문의 · 같은 모델로 다시 받는다(새 메시지를 추가하지 않음). 비교용 "다시 생성 / 모델 바꿔 다시"(4-3)는 7단계에서 새 메시지로 추가한다.
- **`retry`는 최신 대화를 ref로 읽는다** — 메시지가 바뀔 때마다 `retry`가 새로 만들어지면 `memo`된 메시지 컴포넌트가 모두 다시 그려진다.
- 답변 중에는 모델 선택을 잠근다. 모델 선택은 사용자가 고르기 전까지 `/health`의 `default_provider`를 따른다.
- 빈 대화에는 예시 문의 3개(배송 · 환불 · 요일)를 두고, 누르면 입력창에 채운다(바로 보내지 않음).
- 글자 수 표시는 스크린 리더가 매번 읽지 않게 `aria-live`를 두지 않고, 2000자를 넘을 때만 `role="alert"`로 알린다.
- **화면 테스트는 jsdom 환경 준비에 약 20초**가 걸린다(전체 38개, 실행 자체는 1초 미만). 파일 첫 줄 `// @vitest-environment jsdom`으로 화면 테스트에만 적용한다. jest-dom은 넣지 않았다(`disabled` 등은 DOM 속성으로 직접 확인).
- IME 처리의 세 조건(`isComposing` · `keyCode 229` · `compositionend` 직후)을 각각 빼 보면 테스트가 실패하는 것을 확인했다.
- **실측 (브라우저, 로컬 Gemma)**
  - 배송 문의: 1.6초에 완료, 메타 "배송 · 1.6초 · 로컬 · gemma-4-E4B-it-GGUF:Q4_K_M". delta마다 본문이 9 → 10 → 12 → 13자처럼 늘어난다.
  - 요일 문의: 🧭 + 모험 문구 + 경과 초 표시 → 3.5초에 답변 한 번에.
  - "환불 절차를 … 자세히 알려주세요"는 **unknown으로 분류**되어 adventure로 갔다(14.9초). 환불 절차 일반 질문이 범위 밖으로 가는 것은 분류기 쪽 확인 거리.
  - 중지: pending 중 중지 → "중지됨 · 다시 받기"만, 스트리밍 중 중지(42자) → 42자 남고 더 늘지 않음.
  - 답변에 `**굵게**`가 그대로 보인다 → 5단계 마크다운에서 처리.
  - **실제 한글 IME 입력은 확인하지 못했다** — 브라우저 자동화 도구는 IME 합성 없이 글자를 넣는다. 사람이 직접 한글을 치고 Enter로 확인해야 한다(Chrome · Edge, 가능하면 Safari).

### 4단계 (2026-10-13)
- **속도 값**: 기본 초당 50자(`TYPEWRITER_BASE_CPS`), 밀린 글자를 0.6초 안에 따라잡는 속도(`TYPEWRITER_CATCHUP_SEC`). 화면 글은 도착보다 최대 약 0.6초 뒤처진다. 2단계 실측(로컬 Gemma 약 400자/초)에 맞췄다.
- **수신과 표시를 나눈 위치**: `useChat`은 받은 글 전체를 `content`에 저장하고(저장 · 복사 기준), `AssistantMessage`가 `useTypewriter`로 흘린다. 커서와 메타 줄은 "표시 완료"(`caughtUp`) 기준.
- **애니메이션 루프는 delta마다 새로 시작하지 않는다** — 처음 구현에서 delta(약 10ms 간격)마다 effect가 루프를 다시 시작해 첫 프레임 경과 시간 0이 반복되어 글이 거의 흐르지 않는 결함을 찾았다. 루프가 돌고 있으면 그대로 두고, 루프는 다음 프레임에 늘어난 `total`을 읽는다. 회귀 테스트: "조각이 10ms마다 계속 붙어도 멈추지 않고 흘러간다".
- **done의 `answer`는 앞뒤 공백을 지운 값**이라 delta를 이은 글보다 짧을 수 있다. 내용이 짧아지면 처음부터 다시 흘리지 않고 끝 위치만 맞춘다(비워졌을 때만 0 = 다시 시도).
- **처음부터 완료 상태로 화면에 올라온 메시지는 흘리지 않는다** — `AssistantMessage`가 pending · streaming을 본 적이 있는지(`live` state)로 판단한다(6단계에서 내역을 불러올 때 대비).
- 커서는 `▍` 대신 CSS 블록(`.typing-cursor`, `currentColor`)으로 그린다. 움직임 줄이기 설정이면 깜빡이지 않고, 타이핑 효과도 끈다(`useReducedMotion`).
- **자동 스크롤**: `ResizeObserver`로 내용 높이 변화를 보고 바닥에 붙어 있을 때만 `scrollTop`을 맞춘다. 스크롤 컨테이너는 빈 대화일 때도 그대로 둔다(새 문의 뒤에도 같은 요소를 감시하도록). "↓ 맨 아래로" 버튼은 답변 중이면 "답변 작성 중 · 맨 아래로".
- 테스트에 "글이 늘어나 바닥에서 멀어져도 사용자 개입이 없으면 멈추지 않는다"를 추가했다. "바닥에서 멀어지기만 하면 멈춤"으로 바꿔 보면 처음 8개 테스트는 통과해 버려서, 계획서가 경고한 오판을 잡지 못했기 때문.
- **화면이 숨겨지면(다른 탭 · 최소화) 브라우저가 `requestAnimationFrame` · `ResizeObserver` · smooth 스크롤을 멈춘다** — 답변은 계속 받지만(fetch는 계속) 화면 표시는 멈췄다가, 다시 보이면 약 0.6초 안에 따라잡고 바닥으로 맞춘다. Claude 브라우저 패널이 숨겨진 상태에서 실측하다 확인함.
- **실측 (rAF를 16ms 타이머로 바꿔 측정, 로컬 Gemma)**: 배송 문의 692자 — 첫 글자 0.6초, 서버 전송 끝 4.5초(약 170자/초), 화면 표시 끝 5.8초(서버보다 1.3초 늦음 — 끝부분은 밀린 글자가 적어 기본 속도 50자/초로 흐름). 커서는 표시 끝까지 붙어 있다가 메타 줄과 함께 바뀐다. 끝부분이 느리게 느껴지면 기본 속도를 올린다.

### 5단계 (2026-10-13)
- **결정: 복사는 (다)** — 서식 있는 글(HTML)과 평문을 함께 클립보드에 넣는다(`ClipboardItem`). 안 되면 평문만 `writeText`, 그것도 안 되면 `execCommand('copy')`. 복사 내용은 저장된 `content`가 아니라 **렌더링된 DOM**에서 만든다 — 평문은 굵게 · 제목 기호를 지우고 목록 "- " · "1. ", 표는 탭으로(`toPlainText`), HTML은 class와 복사 버튼을 뺀다(`toCopyHtml`).
- 복사 버튼은 표시 완료(done) · 중지된 답변(받은 데까지)에만, 받는 중에는 숨긴다.
- **줄바꿈 한 번도 줄바꿈으로 보인다** — 마크다운은 문단 안 `\n`을 공백으로 합치지만 LLM 답변은 줄바꿈 한 번으로 줄을 나눈다. 패키지(`remark-breaks`)를 늘리지 않고 `p` · `li`에 `white-space: pre-line`.
- 외부 이미지는 불러오지 않고 링크로만 보여 준다(외부 요청 차단).
- **타이핑 중 서식 자동 닫기(`closeOpenMarkdown`)에서 실제 답변으로 찾은 경우들** — 테스트 "어느 글자에서 끊겨도 기호가 보이지 않는다"(모든 글자 위치를 실제 react-markdown으로 렌더링)로 막는다. 문자열 비교 테스트만으로는 CommonMark 규칙을 못 잡았다.
  - `**공식 주문 ` 처럼 공백에서 끊긴 뒤 `**`를 붙이면 닫는 기호로 인정되지 않는다 → 끝 공백을 지우고 닫는다. (배송 답변 977프레임 중 27프레임에서 `**`가 보였음)
  - 막 연 `` ` ``, 코드 블록을 두 글자까지 친 ` `` `는 빈 코드가 되어 글자로 보인다 → 지운다.
  - 굵게 안의 인라인 코드 ``**`/account/reset`**``(계정 답변 실제 원문) → 코드를 닫은 뒤 굵게도 닫는다.
  - 수정 뒤 배송 · 계정 답변 3개 1,141프레임에서 `**` · `` ` ``가 보인 프레임 0.
- 커서는 마크다운 본문의 마지막 문단 · 마지막 목록 항목 끝에 CSS `::after`로 붙인다(코드 블록 · 표 끝에는 붙이지 않음).
- **렌더링 비용 실측** — 2000자 마크다운을 한 글자씩 늘리며 다시 그리기 200회: 중앙값 2.9ms, 상위 10% 5.6ms, 최대 10.6ms(프레임 예산 16ms 안). 실제 답변(약 700자)은 더 가볍다 → 렌더링 빈도는 낮추지 않았다. 답변이 길어지거나 느린 기기에서 버벅이면 완성된 문단 `memo` · 100ms 간격 렌더링을 넣는다.
- **번들 크기**: 마크다운(react-markdown · remark-gfm) 추가로 JS 235KB → 400KB(gzip 74KB → 124KB).
- **npm audit 보통(moderate) 2건** — `@tailwindcss/typography`가 쓰는 `postcss-selector-parser`의 처리 속도 문제(GHSA-rj75-hqrm-r3gf). 빌드 때 우리 CSS에만 쓰여 실제 위험은 낮고, 고치려면 typography를 0.5.4로 내려야 해서 그대로 둔다.
- 측정 메모: 브라우저 콘솔에서 앱 모듈을 불러올 때는 Vite가 붙인 `?v=` 주소를 그대로 써야 앱과 같은 React 인스턴스가 된다(다르면 아무것도 그려지지 않음).
- **확인하지 못한 것**: 패널이 숨겨져 있어 다크 · 라이트 모드의 `prose` 색과 커서 위치를 눈으로 보지 못했다. 복사한 글을 실제 붙여 넣기 대상(메모장 · 서식 있는 입력창)에 붙여 보지 못했다.

### 6단계 결정 (2026-10-13)
- 답변을 받는 도중 다른 대화로 옮기거나 새 문의를 눌러도 **답변은 원래 대화에서 계속 받는다**(나). 요청은 한 번에 하나 — 받는 동안 다른 대화의 입력창은 전송을 막고 안내한다. 중지 버튼은 받는 중인 대화에서만.
- 여러 탭 동기화(`storage` 이벤트)는 넣지 않는다.

### 6단계 (2026-10-13)
- **파일 구성이 계획과 다르다** — 계획의 `hooks/useHistory.ts` 대신 저장 · 불러오기 · 보정은 순수 함수 `lib/history.ts`로, 대화 목록 상태는 `useChat`이 가진다. 답변 이벤트가 "대화 id + 메시지 id"로 목록 안의 메시지를 바꿔야 해서(결정 (나)) 상태를 한 곳에 두는 편이 단순했다.
- **저장 형식**: 키 `seal-frontend:conversations:v1`(`{ version: 1, conversations }`), 마지막으로 보던 대화 `seal-frontend:current:v1`. `Conversation`에 `updatedAt`(문의를 보낸 · 답변이 끝난 시각) 추가 — 사이드바 정렬 기준. 예전 저장본에 없으면 `createdAt`으로 채운다.
- **저장 시점**: 보낸 직후(답변 도중 탭이 닫혀도 문의는 남게) · done · 오류 · 중지 · 삭제 · 실행 취소. `saveRef` 표시를 켠 갱신만 커밋 뒤 effect에서 저장한다. delta · status는 저장하지 않는다(테스트로 `setItem` 횟수 확인).
- **용량 초과**: 오래된 20%씩 버리고 다시 시도, 보관 한도 최신 200개. 저장할 수 없으면 사이드바에 "내역을 저장하지 못했습니다".
- **삭제는 확인 창 없이 바로 + 5초 실행 취소**(같은 자리로 복원). 보던 대화를 지우면 새 문의 화면. 받는 중인 대화는 삭제 버튼이 없다.
- 사이드바 묶음은 `updatedAt` 기준 오늘 · 어제 · 지난 7일 · 이전, 시각은 오늘이면 시:분, 올해면 월.일. 기준 시각은 1분마다 갱신(`useNow`) — 렌더링 중 `Date.now()`는 린트(react purity)가 막는다.
- 대화를 옮기면 `ChatView`를 대화 id로 새로 만든다(스크롤 · 자동 스크롤 상태 초기화).
- **받는 중인 대화로 돌아오면 그때까지 받은 글을 처음부터 다시 흘린다** — 메시지 컴포넌트가 새로 만들어져 타이핑 위치가 0부터 시작. 따라잡는 속도 덕에 약 0.6초 안에 현재 위치까지 온다. 거슬리면 메시지별 표시 위치를 `useChat` 밖에 기억해 두는 방식으로 바꾼다.
- 결함 주입 확인: "갱신마다 저장", "불러올 때 stopped 보정 안 함"으로 바꾸면 각각 테스트 2개가 실패한다.
- **실측 (브라우저, 로컬 Gemma)**: 문의 3개 · 대화 2개 저장 확인. 받는 도중 새 문의 화면으로 옮기면 입력창이 "다른 문의의 답변을 받는 중입니다…"로 막히고 사이드바에 ● 표시, 끝나면 원래 대화에 done으로 저장되고 전송이 풀린다. 답변 도중(0.4초) 새로고침 → 마지막으로 보던 대화가 열리고 그 답변은 "중지됨 · 다시 받기". 삭제 → 새 문의 화면 + "삭제됨 · 실행 취소" → 실행 취소로 같은 자리 복원, 5초 뒤 안내가 사라지고 삭제 확정.
- 측정 메모: 스크립트로 `click()`한 직후에는 React가 아직 화면을 바꾸지 않았다(마이크로태스크 뒤 반영). "답변 끝남"을 DOM으로 기다릴 때는 시작 표시가 나타난 것부터 확인해야 한다.

### 7단계 결정 (2026-10-13)
- 다시 생성한 답변은 **대화 끝에 새 문의 + 답변 쌍으로 추가**(가). 문의 말풍선에 "다시 생성" 표시.
- **"모델 바꿔 다시 받기"(local ↔ openai)는 넣지 않는다** — 지금 서버 구성에서는 동작하지 않을 것 같다는 사용자 판단(2026-10-13). 같은 모델로 다시 생성만.
- 6단계에서 남긴 "받는 중인 대화로 돌아오면 처음부터 다시 타이핑"도 고친다(메시지별 표시 위치 기억).

### 7단계 (2026-10-13)
- **처리 과정 배지 · 펼침(`MessageMeta`)**: 배지 = 라벨 · 경로 · 검증 결과 · 답변 시간 · 툴 · 모델. 펼침은 `<details>`(키보드 · 스크린 리더 기본 지원) — 분류기 확률(보정 전) 막대, 경로 규칙(p1은 **보정 후** — 실측에서 분류기 92.8%인데 p1 71.7%라 표시를 나눴다), LLM 검증, 툴 호출(args JSON), 토큰, 프롬프트 버전, 요청 id, **화면에서 잰 전체 시간**(`finishedAt - createdAt`, 메시지에 `finishedAt` 추가).
  - 범위 밖 문의는 라벨과 경로 이름이 둘 다 "범위 밖"이라 경로 배지를 생략한다.
  - 실측: baseline(CPU) 분류기에서는 전체 시간과 답변 생성 시간 차이가 9~10ms(분류가 거의 0초). BERT 분류기 때는 약 330ms였다.
- **오류 안내**: 코드별 문장(`ERROR_GUIDES`) + 서버 원문을 작게. `invalid_input`은 다시 보내도 같아서 다시 시도 버튼 없음. 답변 요청이 `network` 오류면 `/health`를 바로 다시 확인한다(`useHealth().recheck`).
- **다시 생성**: 같은 모델로, 대화 끝에 새 쌍(문의 말풍선에 "↻ 다시 생성"). 모델 바꿔 다시 받기는 넣지 않음(결정 참고).
- **테마**: `@custom-variant dark`로 바꾸고 `<html class="dark">` + `color-scheme`. 선택은 `seal-frontend:theme`(시스템이면 키를 지운다). `index.html`의 작은 스크립트가 React보다 먼저 같은 규칙으로 붙여 처음 열 때 깜빡이지 않는다.
- **좁은 화면(768px 미만)**: 사이드바를 덮개(drawer)로. 닫혀 있을 때 `inert`(Tab이 들어가지 않게), 열면 `role="dialog"` · 첫 버튼에 포커스 · 배경 · Esc · 내역 선택 · 새 문의로 닫힘, 닫으면 햄버거로 포커스. 입력창 안내 문구는 짧게.
- **접근성**: 받는 중인 답변에 `aria-busy`, 화면에서 받은 답변이 다 흘러간 뒤 보이지 않는 `aria-live="polite"` 영역에 "답변 완료: (앞 80자)"를 한 번(중지도). 오류는 `role="alert"`가 알린다. 처음엔 메시지 목록에 `role="log"`를 붙였다가 뺐다 — `log`는 기본이 `aria-live="polite"`라 타이핑되는 글을 계속 읽게 된다.
- **받는 중인 대화로 돌아와도 이어서 흘린다**: `useTypewriter`가 메시지 id별 표시 위치를 모듈 수준 `Map`에 기억(끝난 메시지는 지움). 결함 주입(기억 끔)으로 테스트가 잡는 것 확인.
- **찾아서 고친 결함 — StrictMode 이중 실행이 요청을 중지**: 페이지를 막 연 직후 다시 생성을 누르면 60ms 만에 "중지됨". `fetch`의 abort 호출 경로를 찍어 보니 `useChat`의 "정리할 때 요청 중지" 코드가 개발 모드 StrictMode의 이펙트 이중 실행(`doubleInvokeEffectsOnFiber`) 중에 불렸다. 패널이 숨겨져 첫 이펙트 처리가 늦어진 사이에 요청이 시작된 경우. 앱은 페이지를 닫을 때만 사라지고 그때는 브라우저가 요청을 끊으므로 정리 때 중지를 뺐다. 배포 빌드에는 이중 실행이 없지만 같은 구조의 정리 코드는 피한다. (타이밍 재현이 어려워 자동 테스트는 없음)
- **실측 (브라우저, 로컬 Gemma)**: "오늘 날씨가 안좋아서 배송이 안되려나?" → 배송 · 확신(p1 71.7%, margin 56.6%) · 1.8초. "서울 날씨 어때요?" → 범위 밖 · `get_weather`(서울, 1.6초) · 12.8초 · 토큰 3715/872. 완료 알림 영역에 "답변 완료: …" 한 번. 다시 생성 → 끝에 새 쌍, adventure 후 14.5초에 답변. 375px: 가로 넘침 없음, 덮개 열기 · 내역 선택으로 닫힘 · Esc로 닫고 햄버거로 포커스 복귀.
- **확인하지 못한 것**: `llm_error` 실제 화면(Ollama를 꺼야 함 — 백엔드 쪽이라 직접 끄지 않음). 패널이 숨겨져 있어 다크 · 라이트 색과 덮개 애니메이션을 눈으로 보지 못했다(숨겨진 패널은 CSS 전환도 멈춘다 — `getAnimations().finish()`로 최종 위치만 확인).
