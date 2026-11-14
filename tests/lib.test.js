// Unit tests for the helpers that need no database. Run: npm test
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyTestEnv, TEST_ENV } from "./helpers.js";

let checkEnv, slugify, cleanUsername, escapeRegex, errorHandler, httpError;

before(async () => {
  applyTestEnv();
  ({ checkEnv } = await import("../config/env.js"));
  ({ slugify } = await import("../lib/slug.js"));
  ({ cleanUsername } = await import("../lib/oauthUser.js"));
  ({ escapeRegex } = await import("../lib/text.js"));
  ({ errorHandler } = await import("../middlewares/errorHandler.js"));
  ({ httpError } = await import("../lib/httpError.js"));
});

describe("checkEnv", () => {
  it("names missing keys without printing any value", () => {
    assert.throws(
      () => checkEnv({ ...TEST_ENV, JWT_SECRET: "  ", GOOGLE_CLIENT_SECRET: undefined }),
      (err) =>
        err.message === "Missing environment variables: JWT_SECRET, GOOGLE_CLIENT_SECRET" &&
        !err.message.includes(TEST_ENV.MONGO)
    );
  });

  it("normalizes CLIENT_URL (no trailing slash) and BACKEND_URL (trailing slash)", () => {
    const env = checkEnv({ ...TEST_ENV, CLIENT_URL: "https://blog.test//", BACKEND_URL: "https://api.test" });
    assert.equal(env.clientUrl, "https://blog.test");
    assert.equal(env.backendUrl, "https://api.test/");
    assert.equal(checkEnv({ ...TEST_ENV, BACKEND_URL: "https://api.test/" }).backendUrl, "https://api.test/");
  });

  it("treats a missing delete password as 'demo account can't delete'", () => {
    assert.equal(checkEnv({ ...TEST_ENV, DELETE_POST_PASSWORD: "" }).deletePostPassword, null);
  });
});

describe("slugify", () => {
  const cases = [
    ["My First Post", "my-first-post"],
    ["Hello, World? #1 / 100%", "hello-world-1-100"],
    ["  --Trim me--  ", "trim-me"],
    ["@someone", "someone"],
    ["Café Ünïcode", "café-ünïcode"],
    ["!!!", "post"],
    ["a".repeat(100), "a".repeat(80)],
  ];
  for (const [title, slug] of cases) {
    it(`"${title.slice(0, 30)}" → "${slug.slice(0, 30)}"`, () => assert.equal(slugify(title), slug));
  }
});

describe("cleanUsername", () => {
  it("keeps profile-link-safe characters and trims", () => {
    assert.equal(cleanUsername("  John   Smith "), "John Smith");
    assert.equal(cleanUsername("John / Smith?"), "John Smith");
    assert.equal(cleanUsername("-_.leading"), "leading");
    assert.equal(cleanUsername("x".repeat(40)).length, 30);
  });

  it("falls back to user-NNNNNN when too little is left", () => {
    assert.match(cleanUsername("?!"), /^user-\d{6}$/);
    assert.match(cleanUsername(undefined), /^user-\d{6}$/);
  });
});

describe("escapeRegex", () => {
  it("makes regex characters literal", () => {
    const pattern = new RegExp(escapeRegex("a.c (x)*"));
    assert.ok(pattern.test("a.c (x)*"));
    assert.ok(!pattern.test("abc (x)"));
  });
});

describe("errorHandler", () => {
  const run = (err, url = "/posts/x?code=one-time-code") => {
    const res = {
      statusCode: 0,
      body: undefined,
      headersSent: false,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
    const logged = [];
    const original = console.error;
    console.error = (...args) => logged.push(args.map(String).join(" "));
    try {
      errorHandler(err, { method: "GET", originalUrl: url }, res, () => {});
    } finally {
      console.error = original;
    }
    return { res, logged };
  };

  it("hides unexpected errors from the client and logs them without the query string", () => {
    const { res, logged } = run(new Error("secret internal detail"));
    assert.equal(res.statusCode, 500);
    assert.equal(res.body, "Something went wrong. Please try again.");
    assert.equal(logged.length, 1);
    assert.ok(logged[0].includes("GET /posts/x failed"));
    assert.ok(!logged[0].includes("one-time-code"));
  });

  it("passes HttpErrors through, as { message } on /auth routes", () => {
    assert.deepEqual(run(httpError(409, "Taken"), "/auth/register").res.body, { message: "Taken" });
    assert.equal(run(httpError(404, "Post not found"), "/posts/x").res.body, "Post not found");
  });

  it("maps duplicate keys to 409 without the duplicate value", () => {
    const err = Object.assign(new Error("E11000 duplicate key { email: 'a@b.c' }"), { code: 11000 });
    const { res, logged } = run(err, "/users/settings");
    assert.equal(res.statusCode, 409);
    assert.equal(res.body, "Already exists");
    assert.equal(logged.length, 0);
  });
});
