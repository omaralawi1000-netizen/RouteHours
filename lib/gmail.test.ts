import test from "node:test";
import assert from "node:assert/strict";
import { gmailMessage, sendGmailMessage, validRecipient } from "./gmail.ts";

test("Gmail MIME preserves the recipient, Unicode message and exact attachment", async () => {
  const bytes = new Uint8Array([80, 75, 3, 4, 0, 255, 128, 1]);
  const file = new File([bytes], "RouteHours-2026-09-28.xlsx");
  const raw = await gmailMessage("worker@example.com", "Ugeseddel – Løn", "Hej\nVenlig hilsen أمَر", file);
  assert.match(raw, /^[\w-]+$/);
  const mime = Buffer.from(raw, "base64url").toString("utf8");
  assert.match(mime, /To: worker@example.com\r\n/);
  assert.match(mime, /Content-Disposition: attachment; filename="RouteHours-2026-09-28.xlsx"/);
  const parts = mime.split("Content-Transfer-Encoding: base64\r\n\r\n");
  assert.equal(Buffer.from(parts[1].split("\r\n\r\n")[0], "base64").toString("utf8"), "Hej\nVenlig hilsen أمَر");
  assert.deepEqual(new Uint8Array(Buffer.from(parts[2].split("\r\n\r\n")[0], "base64")), bytes);
});
test("Gmail rejects header injection and multiple recipients", async () => {
  assert.equal(validRecipient("a@example.com,b@example.com"), false);
  assert.equal(validRecipient("a@example.com\r\nBcc:b@example.com"), false);
  await assert.rejects(gmailMessage("a@example.com", "hello\r\nBcc:b@example.com", "", new File([], "a.xlsx")));
});
test("Gmail accepts only confirmed sends and never automatically retries ambiguous delivery", async () => {
  const original = globalThis.fetch; let requests = 0;
  try {
    globalThis.fetch = async () => { requests++; return new Response(JSON.stringify({ id: "sent-123" })); };
    assert.equal(await sendGmailMessage("fake-token", "fake-payload"), "sent-123");
    globalThis.fetch = async () => { requests++; throw new TypeError("connection lost"); };
    await assert.rejects(sendGmailMessage("fake-token", "fake-payload"), /Check Gmail’s Sent folder/);
    assert.equal(requests, 2);
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: "Gmail API has not been used or is disabled" } }), { status: 403 });
    await assert.rejects(sendGmailMessage("fake-token", "fake-payload"), /Enable the Gmail API/);
  } finally { globalThis.fetch = original; }
});
