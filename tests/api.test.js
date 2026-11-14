// API tests against an in-memory MongoDB. Run: npm test
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import jwt from "jsonwebtoken";
import { freshIp, startTestApp, TEST_ENV } from "./helpers.js";

let app, stop, User, Post, Comment, findOrCreateOAuthUser;

before(async () => {
  ({ app, stop } = await startTestApp());
  ({ default: User } = await import("../models/user.model.js"));
  ({ default: Post } = await import("../models/post.model.js"));
  ({ default: Comment } = await import("../models/comment.model.js"));
  ({ findOrCreateOAuthUser } = await import("../lib/oauthUser.js"));
});
after(() => stop());

// ---- helpers
const call = (method, url, { token, body, ip, headers = {} } = {}) => {
  let req = request(app)[method](url).set("CF-Connecting-IP", ip ?? freshIp());
  if (token) req = req.set("Authorization", `Bearer ${token}`);
  for (const [name, value] of Object.entries(headers)) req = req.set(name, value);
  return body === undefined ? req : req.send(body);
};

const tokenFor = (user, claims = {}, options = { expiresIn: "1h" }) =>
  jwt.sign({ id: String(user._id), role: user.role, ...claims }, TEST_ENV.JWT_SECRET, options);

let userCounter = 0;
const makeUser = async (fields = {}) => {
  userCounter += 1;
  const user = await User.create({
    authProvider: "github",
    providerId: `test-${userCounter}`,
    username: `user${userCounter}`,
    email: `user${userCounter}@example.test`,
    ...fields,
  });
  return { user, token: tokenFor(user) };
};

let postCounter = 0;
const makePost = (user, fields = {}) => {
  postCounter += 1;
  return Post.create({
    user: user._id,
    title: `Post ${postCounter}`,
    slug: `test-post-${postCounter}`,
    content: "<p>Hello</p>",
    ...fields,
  });
};

const newPostBody = (fields = {}) => ({
  title: "A new post",
  desc: "Short description",
  category: "general",
  content: "<p>Body</p>",
  img: "",
  ...fields,
});

// ---------------------------------------------------------------------------------------------------
describe("basics", () => {
  it("answers /healthz while the database is connected", async () => {
    const res = await call("get", "/healthz");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
  });

  it("sends security headers and hides Express", async () => {
    const res = await call("get", "/posts");
    assert.equal(res.headers["x-powered-by"], undefined);
    assert.equal(res.headers["x-content-type-options"], "nosniff");
  });

  it("allows CORS for the client origin only, with one header", async () => {
    const res = await request(app)
      .options("/posts/upload-auth")
      .set("Origin", "http://client.test")
      .set("Access-Control-Request-Method", "GET")
      .set("Access-Control-Request-Headers", "authorization");
    assert.equal(res.status, 204);
    // CLIENT_URL has a trailing slash in the test env: it's normalized away
    assert.equal(res.headers["access-control-allow-origin"], "http://client.test");
    assert.match(res.headers["access-control-allow-headers"], /authorization/i);
  });

  it("answers unknown routes with 404 in each route family's shape", async () => {
    const plain = await call("get", "/nope");
    assert.equal(plain.status, 404);
    assert.equal(plain.body, "Not found");
    const auth = await call("get", "/auth/nope");
    assert.equal(auth.status, 404);
    assert.deepEqual(auth.body, { message: "Not found" });
  });

  it("rejects invalid JSON with 400 and no details", async () => {
    const res = await call("post", "/auth/login", { headers: { "Content-Type": "application/json" }, body: "{bad" });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { message: "Bad request" });
  });

  it("rejects bodies over the size limit with 413", async () => {
    const { token } = await makeUser();
    const res = await call("post", "/posts", { token, body: newPostBody({ content: "a".repeat(400_000) }) });
    assert.equal(res.status, 413);
    assert.equal(res.body, "Request too large");
  });
});

// ---------------------------------------------------------------------------------------------------
describe("register, login and /auth/me", () => {
  it("registers a user and stores the e-mail in lower case", async () => {
    const res = await call("post", "/auth/register", {
      body: { username: "New Writer", email: "  New.Writer@Example.TEST ", password: "s3cret-pass" },
    });
    assert.equal(res.status, 201);
    const stored = await User.findOne({ username: "New Writer" }).select("+password");
    assert.equal(stored.email, "new.writer@example.test");
    assert.equal(stored.authProvider, "local");
    assert.notEqual(stored.password, "s3cret-pass");
  });

  it("rejects a taken e-mail or username, ignoring case", async () => {
    for (const body of [
      { username: "someone else", email: "NEW.WRITER@example.test", password: "s3cret-pass" },
      { username: "new writer", email: "other@example.test", password: "s3cret-pass" },
    ]) {
      const res = await call("post", "/auth/register", { body });
      assert.equal(res.status, 409);
      assert.deepEqual(res.body, { message: "Username or email already in use" });
    }
  });

  it("validates registration input", async () => {
    const valid = { username: "Valid Name", email: "valid@example.test", password: "s3cret-pass" };
    const cases = [
      [{ email: "not-an-email" }, "Enter a valid email address"],
      [{ password: "short" }, "Password must be at least 8 characters"],
      [{ username: "a/b?c" }, "Username can use letters, digits, spaces, '.', '_' and '-'"],
      [{ username: "@admin" }, "Username can use letters, digits, spaces, '.', '_' and '-'"],
      [{ username: "ab" }, "Username must be 3–30 characters"],
      [{ email: { $ne: null } }, "Email is required"],
      [{ password: undefined }, "Password is required"],
    ];
    for (const [change, message] of cases) {
      const res = await call("post", "/auth/register", { body: { ...valid, ...change } });
      assert.equal(res.status, 400, JSON.stringify(change));
      assert.deepEqual(res.body, { message });
    }
    assert.equal(await User.exists({ email: "valid@example.test" }), null);
  });

  it("logs in (e-mail in any case) and /auth/me returns the user without the password", async () => {
    const login = await call("post", "/auth/login", {
      body: { email: "New.Writer@EXAMPLE.test", password: "s3cret-pass" },
    });
    assert.equal(login.status, 200);
    assert.equal(login.body.message, "Login successful");

    const me = await call("get", "/auth/me", { token: login.body.token });
    assert.equal(me.status, 200);
    assert.equal(me.body.username, "New Writer");
    assert.equal(me.body.email, "new.writer@example.test");
    assert.equal(me.body.password, undefined);
    assert.equal(me.body.id, undefined);
  });

  it("refuses wrong passwords, unknown e-mails, OAuth accounts and injection objects", async () => {
    const { user } = await makeUser({ email: "oauth-only@example.test" });
    const cases = [
      [{ email: "new.writer@example.test", password: "wrong-pass" }, 400, "Invalid email or password"],
      [{ email: "nobody@example.test", password: "s3cret-pass" }, 400, "Invalid email or password"],
      [{ email: user.email, password: "anything1" }, 400, "Invalid email or password"],
      [{ email: { $ne: null }, password: "s3cret-pass" }, 400, "Email is required"],
      [{ email: "new.writer@example.test", password: { $gt: "" } }, 400, "Password is required"],
    ];
    for (const [body, status, message] of cases) {
      const res = await call("post", "/auth/login", { body });
      assert.equal(res.status, status, JSON.stringify(body));
      assert.deepEqual(res.body, { message });
    }
  });

  it("rejects missing, broken, expired, foreign and orphaned tokens with 401", async () => {
    const { user } = await makeUser();
    const gone = await makeUser();
    await User.deleteOne({ _id: gone.user._id });
    const tokens = [
      undefined,
      "garbage",
      tokenFor(user, {}, { expiresIn: -10 }),
      jwt.sign({ id: String(user._id) }, "another-secret"),
      jwt.sign({ id: "not-an-id" }, TEST_ENV.JWT_SECRET),
      gone.token,
    ];
    for (const token of tokens) {
      const res = await call("get", "/auth/me", { token });
      assert.equal(res.status, 401);
      assert.ok(res.body.message);
    }
    const plain = await call("get", "/users/saved");
    assert.equal(plain.status, 401);
    assert.equal(plain.body, "Please log in first");
  });

  it("limits failed logins per visitor (10 per 15 minutes)", async () => {
    const ip = "203.0.113.10";
    for (let i = 0; i < 10; i++) {
      const res = await call("post", "/auth/login", { ip, body: { email: "nobody@example.test", password: "x" } });
      assert.equal(res.status, 400);
    }
    const blocked = await call("post", "/auth/login", { ip, body: { email: "nobody@example.test", password: "x" } });
    assert.equal(blocked.status, 429);
    assert.deepEqual(blocked.body, { message: "Too many requests. Please try again later." });
    // Other visitors are unaffected
    const other = await call("post", "/auth/login", { body: { email: "new.writer@example.test", password: "s3cret-pass" } });
    assert.equal(other.status, 200);
  });

  it("limits registrations per visitor (5 per hour)", async () => {
    const ip = "203.0.113.20";
    for (let i = 0; i < 5; i++) {
      const res = await call("post", "/auth/register", {
        ip,
        body: { username: `bulk user ${i}`, email: `bulk${i}@example.test`, password: "s3cret-pass" },
      });
      assert.equal(res.status, 201);
    }
    const blocked = await call("post", "/auth/register", {
      ip,
      body: { username: "bulk user 9", email: "bulk9@example.test", password: "s3cret-pass" },
    });
    assert.equal(blocked.status, 429);
  });
});

// ---------------------------------------------------------------------------------------------------
describe("Google/GitHub sign-in", () => {
  it("starts GitHub with the e-mail scope and an https callback behind the proxy", async () => {
    const res = await call("get", "/auth/github", { headers: { "X-Forwarded-Proto": "https" } });
    assert.equal(res.status, 302);
    const location = new URL(res.headers.location);
    assert.equal(location.origin, "https://github.com");
    assert.equal(location.searchParams.get("scope"), "user:email");
    assert.match(location.searchParams.get("redirect_uri"), /^https:\/\/.+\/auth\/github\/callback$/);
  });

  it("starts Google with the callback under BACKEND_URL (slash added when missing)", async () => {
    const res = await call("get", "/auth/google");
    assert.equal(res.status, 302);
    const location = new URL(res.headers.location);
    assert.equal(location.searchParams.get("redirect_uri"), "http://api.test/auth/google/callback");
  });

  it("sends a cancelled or failed sign-in back to the client's login page", async () => {
    for (const url of [
      "/auth/github/callback?error=access_denied",
      "/auth/google/callback?error=access_denied",
      "/auth/google/callback?error=server_error",
    ]) {
      const res = await call("get", url);
      assert.equal(res.status, 302, url);
      assert.equal(res.headers.location, "http://client.test/login?error=oauth");
    }
  });

  it("returns the same account to a returning user", async () => {
    const profile = { provider: "google", providerId: "g-1", email: "ret@example.test", emailVerified: true, username: "Returning User" };
    const first = await findOrCreateOAuthUser(profile);
    const again = await findOrCreateOAuthUser({ ...profile, username: "Renamed At Google" });
    assert.equal(String(again._id), String(first._id));
    assert.equal(again.username, "Returning User");
  });

  it("gives a clashing display name a suffix and cleans characters a profile link can't carry", async () => {
    const a = await findOrCreateOAuthUser({ provider: "google", providerId: "g-2", email: "js1@example.test", emailVerified: true, username: "John / Smith?" });
    const b = await findOrCreateOAuthUser({ provider: "github", providerId: "gh-2", email: "js2@example.test", emailVerified: true, username: "john smith" });
    assert.equal(a.username, "John Smith");
    assert.equal(b.username, "john smith-2");
  });

  it("links a verified e-mail to the existing account with that e-mail (any case)", async () => {
    const reg = await call("post", "/auth/register", {
      body: { username: "Local Person", email: "local.person@example.test", password: "s3cret-pass" },
    });
    assert.equal(reg.status, 201);
    const local = await User.findOne({ username: "Local Person" });
    const viaGoogle = await findOrCreateOAuthUser({ provider: "google", providerId: "g-3", email: "Local.Person@Example.test", emailVerified: true, username: "Local Person" });
    assert.equal(String(viaGoogle._id), String(local._id));
    assert.equal(await User.countDocuments({ email: "local.person@example.test" }), 1);
  });

  it("never links an unverified e-mail: new account with a placeholder e-mail", async () => {
    const user = await findOrCreateOAuthUser({ provider: "github", providerId: "gh-4", email: "local.person@example.test", emailVerified: false, username: "Local Person" });
    assert.equal(user.email, "gh-4@github-placeholder.com");
    assert.equal(user.username, "Local Person-2");
    const noEmail = await findOrCreateOAuthUser({ provider: "github", providerId: "gh-5", email: null, emailVerified: false, username: "x" });
    assert.equal(noEmail.email, "gh-5@github-placeholder.com");
    assert.match(noEmail.username, /^user-\d{6}$/);
  });
});

// ---------------------------------------------------------------------------------------------------
describe("public profiles and settings", () => {
  it("shows only the public fields of a profile", async () => {
    const { user } = await makeUser({ username: "Public Person", bio: "Hi", role: "admin", savedPosts: ["x"] });
    const res = await call("get", `/users/${encodeURIComponent(user.username)}`);
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body).sort(), ["_id", "bio", "createdAt", "img", "username"]);
    assert.equal(res.body.bio, "Hi");
  });

  it("answers 404 for an unknown profile", async () => {
    const res = await call("get", "/users/nobody-here");
    assert.equal(res.status, 404);
    assert.equal(res.body, "User not found");
  });

  it("updates bio, avatar and username", async () => {
    const { user, token } = await makeUser();
    const res = await call("patch", "/users/settings", {
      token,
      body: { username: "Renamed User", bio: "New bio", img: "/avatars/me.png", role: "admin", email: "x@y.z" },
    });
    assert.equal(res.status, 200);
    const stored = await User.findById(user._id);
    assert.equal(stored.username, "Renamed User");
    assert.equal(stored.bio, "New bio");
    assert.equal(stored.img, "/avatars/me.png");
    assert.equal(stored.role, "user");
    assert.equal(stored.email, user.email);
  });

  it("rejects a taken username (any case), an invalid one and script URLs", async () => {
    const { token } = await makeUser();
    const cases = [
      [{ username: "renamed user" }, 409, "That username is already taken"],
      [{ username: "bad/name" }, 400, "Username can use letters, digits, spaces, '.', '_' and '-'"],
      [{ username: "" }, 400, "Username must be 3–30 characters"],
      [{ img: "javascript:alert(1)" }, 400, "Invalid image"],
      [{ bio: "x".repeat(501) }, 400, "Bio can be at most 500 characters"],
    ];
    for (const [body, status, message] of cases) {
      const res = await call("patch", "/users/settings", { token, body });
      assert.equal(res.status, status, JSON.stringify(body));
      assert.equal(res.body, message);
    }
  });

  it("lets an older account with a now-invalid username keep it while saving its bio", async () => {
    const { user, token } = await makeUser({ username: "Old?Name" });
    const res = await call("patch", "/users/settings", { token, body: { username: "Old?Name", bio: "still me" } });
    assert.equal(res.status, 200);
    assert.equal((await User.findById(user._id)).bio, "still me");
  });

  it("locks the demo account's profile", async () => {
    const { user, token } = await makeUser({ isDemo: true, username: "Demo Visitor" });
    const res = await call("patch", "/users/settings", { token, body: { username: "Hijacked", bio: "x" } });
    assert.equal(res.status, 403);
    assert.equal(res.body, "The demo account's profile can't be changed.");
    assert.equal((await User.findById(user._id)).username, "Demo Visitor");
  });
});

// ---------------------------------------------------------------------------------------------------
describe("posts", () => {
  it("creates a post from the allowed fields only", async () => {
    const { user, token } = await makeUser();
    const other = await makeUser();
    const res = await call("post", "/posts", {
      token,
      body: newPostBody({ title: "Whitelist test", isFeatured: true, visit: 999, user: String(other.user._id), slug: "chosen", createdAt: "2000-01-01" }),
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.slug, "whitelist-test");
    assert.equal(res.body.isFeatured, false);
    assert.equal(res.body.visit, 0);
    assert.equal(res.body.user, String(user._id));
    assert.ok(new Date(res.body.createdAt).getFullYear() >= 2026);
  });

  it("makes URL-safe, unique slugs", async () => {
    const { token } = await makeUser();
    const slugOf = async (title) => (await call("post", "/posts", { token, body: newPostBody({ title }) })).body.slug;
    assert.equal(await slugOf("Hello, World? #1 / 100%"), "hello-world-1-100");
    assert.equal(await slugOf("Same Title"), "same-title");
    assert.equal(await slugOf("Same Title"), "same-title-2");
    assert.equal(await slugOf("Same Title"), "same-title-3");
    assert.equal(await slugOf("@admin"), "admin");
    assert.equal(await slugOf("About"), "about-2");
    assert.equal(await slugOf("שלום עולם"), "שלום-עולם");
    assert.equal(await slugOf("???"), "post");
  });

  it("validates new posts", async () => {
    const { token } = await makeUser();
    const cases = [
      [{ title: "" }, "Title is required"],
      [{ title: undefined }, "Title is required"],
      [{ content: "" }, "Content is required"],
      [{ content: "a".repeat(250_001) }, "The post is too long"],
      [{ category: "Bad Category!" }, "Invalid category"],
      [{ img: "javascript:alert(1)" }, "Invalid image"],
      [{ title: { $gt: "" } }, "Title is required"],
    ];
    for (const [change, message] of cases) {
      const res = await call("post", "/posts", { token, body: newPostBody(change) });
      assert.equal(res.status, 400, JSON.stringify(change).slice(0, 80));
      assert.equal(res.body, message);
    }
    const anonymous = await call("post", "/posts", { body: newPostBody() });
    assert.equal(anonymous.status, 401);
  });

  it("caps list size at 50 and leaves content out of lists", async () => {
    const { user } = await makeUser();
    await Post.insertMany(
      Array.from({ length: 55 }, (_, i) => ({ user: user._id, title: `Bulk ${i}`, slug: `bulk-${i}`, content: "<p>long</p>", category: "bulk" }))
    );
    const res = await call("get", "/posts?cat=bulk&limit=100000");
    assert.equal(res.status, 200);
    assert.equal(res.body.posts.length, 50);
    assert.equal(res.body.hasMore, true);
    assert.equal(res.body.posts[0].content, undefined);
    assert.deepEqual(Object.keys(res.body.posts[0].user).sort(), ["_id", "username"]);

    const junk = await call("get", "/posts?cat=bulk&limit=abc&page=-5");
    assert.equal(junk.status, 200);
    assert.equal(junk.body.posts.length, 2);
  });

  it("matches search text literally", async () => {
    const { user } = await makeUser();
    await makePost(user, { title: "Regex a.c (literal)" });
    await makePost(user, { title: "Regex abc" });
    const paren = await call("get", "/posts?search=(&limit=50");
    assert.equal(paren.status, 200);
    assert.deepEqual(paren.body.posts.map((p) => p.title), ["Regex a.c (literal)"]);
    const dot = await call("get", "/posts?search=a.c&limit=50");
    assert.deepEqual(dot.body.posts.map((p) => p.title), ["Regex a.c (literal)"]);
  });

  it("pages through popular posts without repeats when visit counts tie", async () => {
    const { user } = await makeUser();
    await Post.insertMany(
      Array.from({ length: 6 }, (_, i) => ({ user: user._id, title: `Tie ${i}`, slug: `tie-${i}`, content: "x", category: "tie", visit: 5 }))
    );
    const seen = [];
    for (let page = 1; page <= 3; page++) {
      const res = await call("get", `/posts?cat=tie&sort=popular&limit=2&page=${page}`);
      seen.push(...res.body.posts.map((p) => p.slug));
    }
    assert.equal(new Set(seen).size, 6);
  });

  it("returns one post with its content and the author's public fields", async () => {
    const { user } = await makeUser();
    const post = await makePost(user, { content: "<p>Full text</p>" });
    const res = await call("get", `/posts/${post.slug}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.content, "<p>Full text</p>");
    assert.deepEqual(Object.keys(res.body.user).sort(), ["_id", "img", "username"]);
  });

  it("still answers 200 null for a missing post (today's client shows 'Post Not Found')", async () => {
    const res = await call("get", "/posts/does-not-exist");
    assert.equal(res.status, 200);
    assert.equal(res.body, null);
  });

  it("counts views through GET (for now) and POST /posts/:slug/view", async () => {
    const { user } = await makeUser();
    const post = await makePost(user);
    await call("get", `/posts/${post.slug}`);
    const view = await call("post", `/posts/${post.slug}/view`);
    assert.equal(view.status, 204);
    assert.equal((await Post.findById(post._id)).visit, 2);
    const missing = await call("post", "/posts/does-not-exist/view");
    assert.equal(missing.status, 404);
  });

  it("lets the author edit allowed fields only, never the slug", async () => {
    const { user, token } = await makeUser();
    const post = await makePost(user);
    const res = await call("patch", `/posts/edit/${post.slug}`, {
      token,
      body: { title: "Edited title", isFeatured: true, visit: 50, slug: "moved" },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.title, "Edited title");
    assert.equal(res.body.slug, post.slug);
    assert.equal(res.body.isFeatured, false);
    assert.equal(res.body.visit, 0);
  });

  it("refuses edits by others (403), of missing posts (404) and invalid edits (400)", async () => {
    const { user } = await makeUser();
    const { token: otherToken } = await makeUser();
    const post = await makePost(user);
    assert.equal((await call("patch", `/posts/edit/${post.slug}`, { token: otherToken, body: { title: "x" } })).status, 403);
    assert.equal((await call("patch", "/posts/edit/nope", { token: otherToken, body: { title: "x" } })).status, 404);
    const bad = await call("patch", `/posts/edit/${post.slug}`, { token: otherToken, body: { title: "" } });
    assert.equal(bad.status, 400);
  });

  it("lets admins edit any post", async () => {
    const { user } = await makeUser();
    const { token: adminToken } = await makeUser({ role: "admin" });
    const post = await makePost(user);
    const res = await call("patch", `/posts/edit/${post.slug}`, { token: adminToken, body: { desc: "by admin" } });
    assert.equal(res.status, 200);
    assert.equal(res.body.desc, "by admin");
  });

  it("deletes a post without a password for its author, with its comments and bookmarks", async () => {
    const { user, token } = await makeUser();
    const reader = await makeUser();
    const post = await makePost(user);
    await Comment.create({ user: reader.user._id, post: post._id, desc: "nice" });
    await User.updateOne({ _id: reader.user._id }, { $push: { savedPosts: post.id } });

    const res = await call("delete", `/posts/${post.id}`, { token });
    assert.equal(res.status, 200);
    assert.equal(res.body, "Post has been deleted");
    assert.equal(await Post.exists({ _id: post._id }), null);
    assert.equal(await Comment.countDocuments({ post: post._id }), 0);
    assert.deepEqual((await User.findById(reader.user._id)).savedPosts, []);
  });

  it("refuses to delete others' posts, and answers 400/404 for bad or missing ids", async () => {
    const { user } = await makeUser();
    const { token: otherToken } = await makeUser();
    const post = await makePost(user);
    const forbidden = await call("delete", `/posts/${post.id}`, { token: otherToken });
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.body, "Not your post to delete");
    const bad = await call("delete", "/posts/not-an-id", { token: otherToken });
    assert.equal(bad.status, 400);
    assert.equal(bad.body, "Invalid id");
    const missing = await call("delete", "/posts/0123456789abcdef01234567", { token: otherToken });
    assert.equal(missing.status, 404);
  });

  it("asks the demo account (only) for the delete password", async () => {
    const { user, token } = await makeUser({ isDemo: true });
    const post = await makePost(user);
    for (const body of [undefined, {}, { password: "wrong" }, { password: { $ne: null } }]) {
      const res = await call("delete", `/posts/${post.id}`, { token, body });
      assert.equal(res.status, 403, JSON.stringify(body));
      assert.equal(res.body, "Invalid deletion password. Deletion prevented in demo environment.");
    }
    const ok = await call("delete", `/posts/${post.id}`, { token, body: { password: TEST_ENV.DELETE_POST_PASSWORD } });
    assert.equal(ok.status, 200);
  });

  it("lets admins delete any post", async () => {
    const { user } = await makeUser();
    const { token: adminToken } = await makeUser({ role: "admin" });
    const post = await makePost(user);
    assert.equal((await call("delete", `/posts/${post.id}`, { token: adminToken })).status, 200);
  });

  it("lets only admins feature posts, judged by the database role (not the token)", async () => {
    const { user, token } = await makeUser();
    const post = await makePost(user);
    const forged = tokenFor(user, { role: "admin" });
    for (const t of [token, forged]) {
      const res = await call("patch", "/posts/feature", { token: t, body: { postId: post.id } });
      assert.equal(res.status, 403);
      assert.equal(res.body, "Only admins can do that");
    }

    const { token: adminToken } = await makeUser({ role: "admin" });
    const on = await call("patch", "/posts/feature", { token: adminToken, body: { postId: post.id } });
    assert.equal(on.body.isFeatured, true);
    const off = await call("patch", "/posts/feature", { token: adminToken, body: { postId: post.id } });
    assert.equal(off.body.isFeatured, false);
    assert.equal((await call("patch", "/posts/feature", { token: adminToken, body: { postId: "x" } })).status, 400);
    assert.equal((await call("patch", "/posts/feature", { token: adminToken, body: { postId: "0123456789abcdef01234567" } })).status, 404);
  });

  it("signs uploads for logged-in users only", async () => {
    const anonymous = await call("get", "/posts/upload-auth");
    assert.equal(anonymous.status, 401);
    const { token } = await makeUser();
    const res = await call("get", "/posts/upload-auth", { token });
    assert.equal(res.status, 200);
    assert.ok(res.body.token && res.body.signature && res.body.expire);
  });
});

// ---------------------------------------------------------------------------------------------------
describe("comments", () => {
  it("adds a comment from `desc` only, right away", async () => {
    const { user, token } = await makeUser();
    const other = await makeUser();
    const post = await makePost(user);
    const started = Date.now();
    const res = await call("post", `/comments/${post.id}`, {
      token,
      body: { desc: "  Great post  ", user: String(other.user._id), createdAt: "2000-01-01", post: "x" },
    });
    assert.equal(res.status, 201);
    assert.ok(Date.now() - started < 1500, "no artificial delay");
    assert.equal(res.body.desc, "Great post");
    assert.equal(res.body.user, String(user._id));
    assert.equal(res.body.post, post.id);
    assert.ok(new Date(res.body.createdAt).getFullYear() >= 2026);

    const list = await call("get", `/comments/${post.id}`);
    assert.equal(list.status, 200);
    assert.equal(list.body.length, 1);
    assert.deepEqual(Object.keys(list.body[0].user).sort(), ["_id", "img", "username"]);
  });

  it("validates comments and the post they belong to", async () => {
    const { user, token } = await makeUser();
    const post = await makePost(user);
    const cases = [
      [`/comments/not-an-id`, { desc: "hi" }, 400, "Invalid id"],
      [`/comments/0123456789abcdef01234567`, { desc: "hi" }, 404, "Post not found"],
      [`/comments/${post.id}`, { desc: "   " }, 400, "Comment can't be empty"],
      [`/comments/${post.id}`, { desc: "x".repeat(2001) }, 400, "A comment can be at most 2,000 characters"],
      [`/comments/${post.id}`, {}, 400, "Comment is required"],
    ];
    for (const [url, body, status, message] of cases) {
      const res = await call("post", url, { token, body });
      assert.equal(res.status, status, `${url} ${JSON.stringify(body).slice(0, 40)}`);
      assert.equal(res.body, message);
    }
    assert.equal((await call("post", `/comments/${post.id}`, { body: { desc: "hi" } })).status, 401);
    assert.equal((await call("get", "/comments/not-an-id")).status, 400);
  });

  it("lets the author or an admin delete a comment", async () => {
    const { user, token } = await makeUser();
    const { token: otherToken } = await makeUser();
    const { token: adminToken } = await makeUser({ role: "admin" });
    const post = await makePost(user);
    const mine = await Comment.create({ user: user._id, post: post._id, desc: "a" });
    const another = await Comment.create({ user: user._id, post: post._id, desc: "b" });

    const forbidden = await call("delete", `/comments/${mine.id}`, { token: otherToken });
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.body, "You can delete only your comment!");
    assert.equal((await call("delete", `/comments/${mine.id}`, { token })).status, 200);
    assert.equal((await call("delete", `/comments/${another.id}`, { token: adminToken })).status, 200);
    assert.equal((await call("delete", `/comments/${mine.id}`, { token })).status, 404);
    assert.equal((await call("delete", "/comments/zzz", { token })).status, 400);
  });

  it("limits comments per visitor (10 per 10 minutes)", async () => {
    const { user, token } = await makeUser();
    const post = await makePost(user);
    const ip = "203.0.113.30";
    for (let i = 0; i < 10; i++) {
      assert.equal((await call("post", `/comments/${post.id}`, { token, ip, body: { desc: `c${i}` } })).status, 201);
    }
    const blocked = await call("post", `/comments/${post.id}`, { token, ip, body: { desc: "one more" } });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body, "Too many requests. Please try again later.");
  });
});

// ---------------------------------------------------------------------------------------------------
describe("saved posts", () => {
  it("saves and unsaves a post right away", async () => {
    const { user, token } = await makeUser();
    const post = await makePost(user);
    const started = Date.now();
    const save = await call("patch", "/users/save", { token, body: { postId: post.id } });
    assert.equal(save.status, 200);
    assert.equal(save.body, "Post saved");
    assert.ok(Date.now() - started < 1500, "no artificial delay");
    assert.deepEqual((await call("get", "/users/saved", { token })).body, [post.id]);

    const unsave = await call("patch", "/users/save", { token, body: { postId: post.id } });
    assert.equal(unsave.body, "Post unsaved");
    assert.deepEqual((await call("get", "/users/saved", { token })).body, []);
  });

  it("rejects invalid and missing posts", async () => {
    const { token } = await makeUser();
    assert.equal((await call("patch", "/users/save", { token, body: { postId: "x" } })).status, 400);
    assert.equal((await call("patch", "/users/save", { token, body: { postId: { $ne: null } } })).status, 400);
    const missing = await call("patch", "/users/save", { token, body: { postId: "0123456789abcdef01234567" } });
    assert.equal(missing.status, 404);
  });
});
