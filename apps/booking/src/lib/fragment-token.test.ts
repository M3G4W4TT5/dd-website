import assert from "node:assert/strict";
import test from "node:test";
import { fragmentToken } from "./fragment-token";
test("Strict Mode effect replay retains confirm/unsubscribe token after fragment scrubbing", () => {
  for (const purpose of ["confirm", "unsubscribe"]) {
    const token = "A".repeat(43);
    let saved = fragmentToken("", `#token=${token}&purpose=${purpose}`);
    saved = fragmentToken(saved, "");
    assert.equal(saved, token);
    assert.match(saved, /^[A-Za-z0-9_-]{43}$/);
  }
  assert.equal(fragmentToken("", "#unrelated=value"), "");
});
