const OLLAMA_HOST = 'http://localhost:11434';

const $ = (id) => document.getElementById(id);
const chatArea = $('chatArea');
const inputBox = $('inputBox');
const sendBtn = $('sendBtn');
const modelSelect = $('modelSelect');
const statusDot = $('statusDot');
const statusText = $('statusText');
const endpointDisplay = $('endpointDisplay');

let isLoading = false;
let currentMode = 'chat';

async function checkConnection() {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error('Not OK');
    statusDot.className = 'dot online';
    statusText.textContent = 'Ollama 연결됨';
    return true;
  } catch {
    statusDot.className = 'dot offline';
    statusText.textContent = 'Ollama 연결 안 됨';
    return false;
  }
}

async function loadModels() {
  modelSelect.innerHTML = '<option value="">불러오는 중...</option>';
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`);
    const data = await res.json();
    const models = data.models || [];
    if (models.length === 0) throw new Error('No models');
    modelSelect.innerHTML = '';
    models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.name;
      opt.textContent = m.name;
      modelSelect.appendChild(opt);
    });
    if (models.length > 0) {
      inputBox.disabled = false;
      sendBtn.disabled = false;
    }
    addSystemMsg(`📦 ${models.length}개 모델 불러옴 · ${models.map(m => m.name).join(', ')}`);
  } catch {
    modelSelect.innerHTML = '<option value="">모델을 불러올 수 없음</option>';
    addSystemMsg('⚠️ Ollama 서버에서 모델 목록을 가져올 수 없습니다. Ollama가 실행 중인지 확인하세요.');
  }
}

async function sendMessage() {
  const text = inputBox.value.trim();
  if (!text || isLoading) return;

  const model = modelSelect.value;
  if (!model) {
    addSystemMsg('⚠️ 먼저 모델을 선택하세요.');
    return;
  }

  const useStream = $('streamCheck').checked;

  inputBox.value = '';
  inputBox.style.height = 'auto';

  const roleLabel = currentMode === 'chat' ? '🙋 you' : '📝 prompt';
  addMsg(roleLabel, text, 'user');

  const msgDiv = document.createElement('div');
  msgDiv.className = 'msg assistant';
  const labelDiv = document.createElement('div');
  labelDiv.className = 'label';
  labelDiv.textContent = `🤖 ${model}`;
  msgDiv.appendChild(labelDiv);
  const timeSpan = document.createElement('span');
  timeSpan.style.cssText = 'font-size:11px;color:#999;margin-left:8px;font-weight:400;';
  labelDiv.appendChild(timeSpan);
  const contentSpan = document.createElement('span');
  msgDiv.appendChild(contentSpan);
  chatArea.appendChild(msgDiv);
  chatArea.scrollTop = chatArea.scrollHeight;

  isLoading = true;
  sendBtn.disabled = true;
  inputBox.disabled = true;

  const startTime = performance.now();
  const timerInterval = setInterval(() => {
    timeSpan.textContent = `⏱ ${((performance.now() - startTime) / 1000).toFixed(1)}s`;
  }, 100);

  try {
    const endpoint = currentMode === 'chat' ? '/api/chat' : '/api/generate';
    const body = currentMode === 'chat'
      ? { model, messages: [{ role: 'user', content: text }], stream: useStream }
      : { model, prompt: text, stream: useStream };

    const res = await fetch(`${OLLAMA_HOST}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }

    if (useStream) {
      msgDiv.classList.add('streaming');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let reply = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            const token = currentMode === 'chat'
              ? chunk.message?.content || ''
              : chunk.response || '';
            reply += token;
            contentSpan.textContent = reply;
            chatArea.scrollTop = chatArea.scrollHeight;
          } catch { /* skip malformed lines */ }
        }
      }
      msgDiv.classList.remove('streaming');
    } else {
      const data = await res.json();
      const reply = currentMode === 'chat'
        ? data.message?.content
        : data.response;
      contentSpan.textContent = reply || '(응답 없음)';
    }

    const totalTime = ((performance.now() - startTime) / 1000).toFixed(1);
    clearInterval(timerInterval);
    timeSpan.textContent = `⏱ ${totalTime}s ✅`;
  } catch (err) {
    clearInterval(timerInterval);
    timeSpan.textContent = `⏱ ${((performance.now() - startTime) / 1000).toFixed(1)}s ❌`;
    contentSpan.textContent = `⚠️ 요청 실패: ${err.message}`;
  }

  isLoading = false;
  sendBtn.disabled = false;
  inputBox.disabled = false;
  inputBox.focus();
  chatArea.scrollTop = chatArea.scrollHeight;
}

function addMsg(label, content, cls) {
  const div = document.createElement('div');
  div.className = `msg ${cls}`;
  div.innerHTML = `<div class="label">${escapeHtml(label)}</div>${escapeHtml(content)}`;
  chatArea.appendChild(div);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function addSystemMsg(text) {
  const div = document.createElement('div');
  div.className = 'msg system';
  div.textContent = text;
  chatArea.appendChild(div);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function switchMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.mode-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
  const endpoint = mode === 'chat' ? '/api/chat' : '/api/generate';
  endpointDisplay.textContent = `${OLLAMA_HOST}${endpoint}  ·  model: ${modelSelect.value || '(선택 안 함)'}`;
  $('modeLabel').textContent = mode === 'chat' ? 'messages[] + role' : 'prompt';
  inputBox.placeholder = mode === 'chat' ? '메시지를 입력하세요...' : '프롬프트를 입력하세요...';
  document.querySelectorAll('.compare-panel .badge').forEach(b => {
    b.style.opacity = b.classList.contains(mode === 'chat' ? 'chat' : 'gen') ? '1' : '.4';
  });
  chatArea.innerHTML = '';
  addSystemMsg(`🔄 ${endpoint} 모드로 전환됨 (stream 옵션으로 실시간 타이핑 효과 테스트 가능)`);
}

function toggleCompare() {
  $('comparePanel').classList.toggle('open');
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// --- Event listeners ---

document.querySelectorAll('.mode-tab').forEach(tab => {
  tab.addEventListener('click', () => switchMode(tab.dataset.mode));
});

$('compareToggle').addEventListener('click', toggleCompare);

modelSelect.addEventListener('change', () => {
  const endpoint = currentMode === 'chat' ? '/api/chat' : '/api/generate';
  endpointDisplay.textContent = `${OLLAMA_HOST}${endpoint}  ·  model: ${modelSelect.value || '(선택 안 함)'}`;
});

inputBox.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

inputBox.addEventListener('input', () => {
  inputBox.style.height = 'auto';
  inputBox.style.height = Math.min(inputBox.scrollHeight, 120) + 'px';
});

sendBtn.addEventListener('click', sendMessage);

// --- Init ---

(async function init() {
  const ok = await checkConnection();
  if (ok) {
    await loadModels();
    if (modelSelect.value) {
      const endpoint = currentMode === 'chat' ? '/api/chat' : '/api/generate';
      endpointDisplay.textContent = `${OLLAMA_HOST}${endpoint}  ·  model: ${modelSelect.value}`;
    }
  } else {
    modelSelect.innerHTML = '<option value="">Ollama 서버에 연결할 수 없음</option>';
    addSystemMsg('❌ http://localhost:11434 에 연결할 수 없습니다. Ollama가 실행 중인지 확인하세요.\n터미널에서 ollama serve 명령어로 실행할 수 있습니다.');
  }
})();
