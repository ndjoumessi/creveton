'use strict';

// Test unitaire (pas d'infra) : callAnthropic honore bien le `timeoutMs` par
// appel. On mocke fetch pour qu'il réponde après un délai et qu'il rejette sur
// abort (comme le vrai fetch), puis on vérifie qu'un timeout court déclenche
// AI_TIMEOUT alors qu'un timeout plus long laisse la réponse arriver.

const aiCorrector = require('../src/services/aiCorrectorService');

const KEY = process.env.ANTHROPIC_API_KEY;

// fetch mocké : résout après `respondAfterMs`, ou rejette (AbortError) si le
// signal est abandonné avant.
function mockFetch(respondAfterMs) {
  return jest.spyOn(global, 'fetch').mockImplementation((_url, opts) => new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => resolve({ ok: true, json: async () => ({ content: [{ text: 'réponse' }] }) }),
      respondAfterMs,
    );
    if (opts && opts.signal) {
      opts.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    }
  }));
}

beforeAll(() => { process.env.ANTHROPIC_API_KEY = 'test-fake-key'; });
afterAll(() => { if (KEY === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = KEY; });
afterEach(() => { jest.restoreAllMocks(); });

test('timeoutMs court + réponse lente → AI_TIMEOUT', async () => {
  mockFetch(400); // la « réponse » arrive à 400 ms
  await expect(aiCorrector.callAnthropic('x', { timeoutMs: 50 }))
    .rejects.toMatchObject({ code: 'AI_TIMEOUT' });
});

test('timeoutMs long → la réponse arrive avant l’abandon', async () => {
  mockFetch(50); // réponse rapide (50 ms)
  const out = await aiCorrector.callAnthropic('x', { timeoutMs: 1000 });
  expect(out).toBe('réponse');
});

test('défaut (15 s) inchangé : réponse rapide OK sans timeoutMs', async () => {
  mockFetch(20);
  const out = await aiCorrector.callAnthropic('x');
  expect(out).toBe('réponse');
});
