import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import { parseSse } from "../src/server.js";

test("parses fragmented CRLF Codex SSE frames and ignores DONE", async () => {
  const input = Readable.from(["data: {\"type\":\"response.cre", "ated\"}\r\n\r\ndata: [DONE]\r\n\r\n"]);
  const output = [];
  for await (const event of parseSse(input)) output.push(event);
  assert.deepEqual(output, [{ type: "response.created" }]);
});
