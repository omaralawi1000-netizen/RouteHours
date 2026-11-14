import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTask, payslipFrom } from "./tasks.ts";

test("needs a key, and only takes known tasks with sensible input", () => {
  assert.deepEqual(checkTask({ task: "test" }), { error: "Paste your Gemini key in Lab first." });
  assert.deepEqual(checkTask({ task: "test", key: " abc " }), { task: "test", key: "abc" });
  assert.ok("error" in checkTask({ task: "test", key: "a b" }));
  assert.ok("error" in checkTask({ task: "nope", key: "k" }));
  assert.ok("error" in checkTask({ task: "ask", key: "k", question: "" }));
  assert.equal((checkTask({ task: "ask", key: "k", question: " How much in October? ", context: "x" }) as { question: string }).question, "How much in October?");
});

test("accepts phone recordings and photos, refuses anything else", () => {
  const listen = checkTask({ task: "listen", key: "k", audio: { type: "audio/webm;codecs=opus", data: "AAAA" } });
  assert.deepEqual(listen, { task: "listen", key: "k", audio: { type: "audio/webm", data: "AAAA" } });
  assert.ok("error" in checkTask({ task: "listen", key: "k", audio: { type: "text/html", data: "AAAA" } }));
  assert.ok("error" in checkTask({ task: "listen", key: "k", audio: { type: "audio/webm", data: "not base64!" } }));
  assert.ok("error" in checkTask({ task: "payslip", key: "k", image: { type: "image/jpeg", data: "A".repeat(3_600_001) } }));
  assert.ok(!("error" in checkTask({ task: "payslip", key: "k", image: { type: "image/jpeg", data: "/9j/AA==" } })));
});

test("reads Gemini's payslip answer and drops anything that isn't one", () => {
  assert.deepEqual(payslipFrom('{"isPayslip":true,"periodStart":"2026-10-01","periodEnd":"2026-10-31","hours":62.5,"hourlyRate":180,"grossPay":11250}'),
    { periodStart: "2026-10-01", periodEnd: "2026-10-31", hours: 62.5, hourlyRate: 180, grossPay: 11250 });
  assert.equal(payslipFrom('{"isPayslip":false}'), null);
  assert.equal(payslipFrom('{"isPayslip":true,"hours":null,"grossPay":null}'), null);
  assert.equal(payslipFrom("not json"), null);
  assert.equal(payslipFrom('{"isPayslip":true,"periodStart":"Oct","hours":-3,"grossPay":9000}')?.periodStart, null);
});
