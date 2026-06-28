/**
 * api.js — 后端接口封装
 *
 * 提供两个核心函数：
 *   callPrepareAPI(question)  → Promise<data>   调用 /api/prepare
 *   callReadingAPI(question, cards, callbacks)  → 流式调用 /api/reading
 */

// ── /api/prepare ──────────────────────────────────────────────────────────

async function callPrepareAPI(question) {
  const resp = await fetch('/api/prepare', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ question }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`prepare API error ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// ── /api/reading（流式）────────────────────────────────────────────────────

/**
 * @param {string}   question
 * @param {object[]} cards      — STATE.selectedCards 数组
 * @param {{onChunk, onDone, onError}} callbacks
 */
function callReadingAPI(question, cards, { onChunk, onDone, onError }) {
  let partial = '';

  fetch('/api/reading', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ question, cards }),
  })
    .then(resp => {
      if (!resp.ok) throw new Error(`reading API error ${resp.status}`);

      const reader  = resp.body.getReader();
      const decoder = new TextDecoder('utf-8');

      function pump() {
        reader.read().then(({ done, value }) => {
          if (done) {
            if (onDone) onDone(partial);
            return;
          }
          const chunk = decoder.decode(value, { stream: true });
          partial += chunk;
          if (onChunk) onChunk(chunk);
          pump();
        }).catch(err => {
          if (onError) onError(err, partial);
        });
      }
      pump();
    })
    .catch(err => {
      if (onError) onError(err, partial);
    });
}
