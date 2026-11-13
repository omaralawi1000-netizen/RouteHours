import assert from 'node:assert/strict';
import test from 'node:test';
import { grantedServices, refreshGoogle, rememberGoogleSecret, googleSecret, secretFromPaste, staysSignedIn } from './google-offline.ts';

function setup(fetcher?: typeof fetch) {
  const local = new Map<string, string>();
  const store = { getItem: (k: string) => local.get(k) ?? null, setItem: (k: string, v: string) => local.set(k, v), removeItem: (k: string) => local.delete(k) };
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window'), oldFetch = globalThis.fetch;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: store } });
  if (fetcher) globalThis.fetch = fetcher;
  return { local, restore() { if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else Reflect.deleteProperty(globalThis, 'window'); globalThis.fetch = oldFetch; } };
}
const id = 'offline-test.apps.googleusercontent.com';

test('takes the secret from a pasted Web client JSON or on its own', () => {
  assert.equal(secretFromPaste(JSON.stringify({ web: { client_id: id, client_secret: 'GOCSPX-abc123' } })), 'GOCSPX-abc123');
  assert.equal(secretFromPaste(' GOCSPX-abc123 '), 'GOCSPX-abc123');
  assert.equal(secretFromPaste('not a secret!'), '');
  const env = setup();
  try { rememberGoogleSecret(id, 'GOCSPX-abc123'); assert.equal(googleSecret(id), 'GOCSPX-abc123'); rememberGoogleSecret(id, ''); assert.equal(googleSecret(id), ''); } finally { env.restore(); }
});

test('one grant covers exactly the services whose permissions it has', () => {
  assert.deepEqual(grantedServices('https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email'), ['google', 'gmail']);
  assert.deepEqual(grantedServices('email https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/gmail.send'), ['google', 'drive', 'gmail']);
  assert.deepEqual(grantedServices('https://www.googleapis.com/auth/drive.file'), []);
});

test('refresh asks the server only when this phone stayed signed in, and forgets a sign-in Google ended', async () => {
  let calls = 0, status = 200;
  const env = setup((async () => { calls++; return new Response(JSON.stringify(status === 200 ? { token: 'ya29.x', expires: Date.now() + 3000_000, email: 'driver@example.com', scope: 'email https://www.googleapis.com/auth/gmail.send' } : { error: 'ended' }), { status }); }) as typeof fetch);
  try {
    assert.equal(await refreshGoogle(id, 'gmail'), null);
    assert.equal(calls, 0, 'no server call without a stay-signed-in sign-in');
    env.local.set('routehours:google-stay:' + id, 'driver@example.com');
    assert.equal((await refreshGoogle(id, 'gmail'))?.token, 'ya29.x');
    assert.equal(await refreshGoogle(id, 'drive'), null, 'Gmail permission never becomes Drive permission');
    status = 401;
    assert.equal(await refreshGoogle(id, 'gmail'), null);
    assert.equal(staysSignedIn(id), false);
  } finally { env.restore(); }
});

test('a cancelled screen never opens the Google window', async () => {
  let opened = 0;
  const env = setup();
  (window as unknown as { google: unknown }).google = { accounts: { oauth2: { initCodeClient: () => ({ requestCode: () => { opened++; } }) } } };
  try {
    const { connectGoogle } = await import('./google-offline.ts');
    const controller = new AbortController(); controller.abort();
    await assert.rejects(connectGoogle(id, 'GOCSPX-x', { signal: controller.signal }), /cancelled/);
    const { authorizeGoogleAccount } = await import('./google-auth.ts');
    env.local.set('routehours:google-stay:' + id, 'driver@example.com');
    env.local.set('routehours:google-secret:' + id, 'GOCSPX-x');
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => { await new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))); return new Response('{}'); }) as typeof fetch;
    const pending = new AbortController();
    const result = authorizeGoogleAccount(id, 'gmail', ['https://www.googleapis.com/auth/gmail.send'], { signal: pending.signal });
    pending.abort();
    await assert.rejects(result, /cancelled/);
    assert.equal(opened, 0);
  } finally { env.restore(); }
});

test('a refresh that was in flight during a sign-out or account change is thrown away', async () => {
  const answers: ((value: Response) => void)[] = [];
  const env = setup((() => new Promise<Response>(resolve => { answers.push(resolve); })) as typeof fetch);
  try {
    env.local.set('routehours:google-stay:' + id, 'old@example.com');
    const { disconnectGoogle } = await import('./google-offline.ts');
    const pending = refreshGoogle(id, 'gmail');
    const signOut = disconnectGoogle(id); // the user changes account while the old refresh is on its way
    answers[0](new Response(JSON.stringify({ token: 'old', expires: Date.now() + 3000_000, email: 'old@example.com', scope: 'email https://www.googleapis.com/auth/gmail.send' })));
    assert.equal(await pending, null);
    answers[1](new Response('{}')); await signOut;
  } finally { env.restore(); }
});
