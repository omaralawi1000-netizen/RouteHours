import assert from "node:assert/strict";
import test from "node:test";
import { interpretVoice } from "./voice.ts";

test("voice timer commands require the matching intent", () => {
  assert.deepEqual(interpretVoice("please start my shift"), { kind: "start" });
  assert.deepEqual(interpretVoice("stop shift"), { kind: "stop" });
});

test("a spoken duration becomes a draft, not a saved shift", () => {
  assert.deepEqual(interpretVoice("I worked 2.5 hours today"), { kind: "logHours", hours: 2.5 });
});

test("notes do not accidentally become duration commands", () => {
  assert.deepEqual(interpretVoice("add note: worked with the group for 2 hours"), { kind: "note", text: "worked with the group for 2 hours" });
});
