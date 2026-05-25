# Ollama API Test

Ollama API로 로컬 LLM을 다루는 샘플 프로젝트.

모델을 바꿔도 코드는 그대로 — Ollama의 REST API를 활용하면 모델 이름 한 줄만 바꿔서 Llama, Gemma, Qwen 등 다양한 LLM을 테스트할 수 있습니다.

> 관련 블로그 글: [모델을 바꿔도 코드는 그대로 — Ollama API로 로컬 LLM 다루기](https://json8.tistory.com/214)

## 구조

```
브라우저 (http://localhost:8080)
    ↓ HTTP (같은 출처, CORS 문제 없음)
Python 프록시 서버 (server.py)
    ↓ HTTP
Ollama API 서버 (http://localhost:11434)
    ↓
Qwen / Llama / Gemma 등 로컬 모델
```

## Ollama 설치

```powershell
# Ollama Windows 설치
irm https://ollama.com/install.ps1 | iex

# 모델 다운로드 및 실행 (설치+실행)
ollama run qwen2.5:3b
```

설치된 모델 확인:
```powershell
curl http://localhost:11434/api/tags
```

## 실행

```powershell
python server.py
```

브라우저에서 http://localhost:8080 열기.

## API Endpoints

| 엔드포인트 | 설명 | 요청 구조 |
|---|---|---|
| `/api/chat` | 대화 구조 기반 API | `messages[]` + `role` (user/assistant/system) |
| `/api/generate` | 단일 프롬프트 기반 생성 API | `prompt` 단일 필드 |
| `/api/tags` | 설치된 모델 목록 조회 | GET 요청 |

## /api/chat vs /api/generate 비교

두 API의 가장 큰 차이는 **대화 문맥과 role을 구조적으로 관리하느냐**입니다.

| 항목 | /api/chat | /api/generate |
|---|---|---|
| 대화 문맥 관리 | `messages[]`로 자동 관리 | 직접 처리해야 함 |
| role 구분 | user / assistant / system 지원 | 없음 (단일 prompt) |
| system prompt | `role: system` 으로 구조적 지원 | prompt 앞에 직접 포함시켜야 함 |
| 멀티턴 대화 | messages에 이전 대화를 쌓으면 됨 | 직접 context를 구성해야 함 |
| 단순 생성 | 가능 | 더 단순함 |
| ChatGPT 스타일 | 적합 | 부적합 |

### 1. 대화 문맥 관리

```python
import requests

OLLAMA = "http://localhost:11434"

# --- /api/chat: messages 배열로 자동 관리 ---
def chat_with_context(model, messages):
    res = requests.post(f"{OLLAMA}/api/chat", json={
        "model": model,
        "messages": messages,  # 전체 대화 내역을 그대로 전달
        "stream": False,
    })
    return res.json()["message"]["content"]

# --- /api/generate: 직접 context 를 구성해야 함 ---
def generate_with_context(model, prompt, history=""):
    # 이전 대화를 prompt 앞에 직접 붙여야 함
    full_prompt = f"{history}\n사용자: {prompt}\nAI:"
    res = requests.post(f"{OLLAMA}/api/generate", json={
        "model": model,
        "prompt": full_prompt,
        "stream": False,
    })
    return res.json()["response"]


messages = [
    {"role": "user", "content": "내 이름은 철수야"},
    {"role": "assistant", "content": "안녕 철수! 만나서 반가워."},
    {"role": "user", "content": "내 이름이 뭐라고 했지?"},  # chat은 문맥을 기억함
]
print(chat_with_context("qwen2.5:3b", messages))
# generate는 직접 history를 구성해야 같은 효과를 냄
```

### 2. system prompt

```python
# --- /api/chat: role=system 으로 구조적 지원 ---
res = requests.post(f"{OLLAMA}/api/chat", json={
    "model": "qwen2.5:3b",
    "messages": [
        {"role": "system", "content": "넌 전문적인 역사 교사야. 초등학생 눈높이에 맞춰 설명해줘."},
        {"role": "user", "content": "한국 전쟁에 대해 설명해줘"},
    ],
    "stream": False,
})
print(res.json()["message"]["content"])

# --- /api/generate: prompt에 직접 포함 ---
res = requests.post(f"{OLLAMA}/api/generate", json={
    "model": "qwen2.5:3b",
    "prompt": "[시스템] 넌 전문적인 역사 교사야. 초등학생 눈높이에 맞춰 설명해줘.\n[질문] 한국 전쟁에 대해 설명해줘",
    "stream": False,
})
print(res.json()["response"])
```

### 3. 멀티턴 대화

```python
# --- /api/chat: 이전 대화를 messages 에 계속 쌓음 ---
conversation = []

while True:
    user_input = input("you: ")
    if user_input == "exit":
        break
    conversation.append({"role": "user", "content": user_input})

    res = requests.post(f"{OLLAMA}/api/chat", json={
        "model": "qwen2.5:3b",
        "messages": conversation,  # 대화가 길어질수록 messages가 누적됨
        "stream": False,
    })
    reply = res.json()["message"]["content"]
    conversation.append({"role": "assistant", "content": reply})
    print(f"AI: {reply}")
```

### 4. 단순 생성 (1회성 질문)

```python
# --- 둘 다 단순 생성은 가능, generate가 더 간단 ---

# /api/chat
res = requests.post(f"{OLLAMA}/api/chat", json={
    "model": "qwen2.5:3b",
    "messages": [{"role": "user", "content": "파이썬 리스트 컴프리헨션 예제를 보여줘"}],
    "stream": False,
})
print(res.json()["message"]["content"])

# /api/generate - 더 단순
res = requests.post(f"{OLLAMA}/api/generate", json={
    "model": "qwen2.5:3b",
    "prompt": "파이썬 리스트 컴프리헨션 예제를 보여줘",
    "stream": False,
})
print(res.json()["response"])
```

## curl 예제

```powershell
curl http://localhost:11434/api/chat -d "{\"model\": \"qwen2.5:3b\", \"messages\": [{\"role\": \"user\", \"content\": \"지구에서 가장 깊은 바다는 어디야?\"}], \"stream\": false}"
```

## Python 예제

```python
import requests

def ask(model, question):
    response = requests.post(
        "http://localhost:11434/api/chat",
        json={
            "model": model,
            "messages": [{"role": "user", "content": question}],
            "stream": False,
        },
    )
    return response.json()["message"]["content"]

# 모델 이름만 바꾸면 다른 LLM으로 교체
print(ask("qwen2.5:3b", "양자 얽힘을 설명해줘"))
print(ask("llama3.2", "양자 얽힘을 설명해줘"))
```

## 핵심 개념

- **모든 LLM을 동일한 REST API로 사용**: 모델별 차이는 Ollama가 내부에서 추상화
- **모델 교체 비용이 낮음**: `model` 필드만 변경하면 됨
- **HTTP + JSON 구조만 맞으면 언어 무관**: curl, Python, JavaScript 등 모두 동일한 요청 형식

## 파일 구성

- `index.html` — Ollama API를 웹에서 바로 테스트할 수 있는 샘플 페이지 (chat/generate 전환 지원)
- `server.py` — CORS 문제를 우회하기 위한 Python 프록시 서버 (HTML 서빙 + API 프록시)
