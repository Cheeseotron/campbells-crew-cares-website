import test from "node:test";
import assert from "node:assert/strict";
import { passwordHash } from "./worker.js";

test("password hashing is deterministic for the same password and salt", async () => {
  const first = await passwordHash("a safe test password", "fixed-test-salt");
  const second = await passwordHash("a safe test password", "fixed-test-salt");
  assert.equal(first, second);
  assert.notEqual(first, await passwordHash("another password", "fixed-test-salt"));
});
