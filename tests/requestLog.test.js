// Request log: one line per request, never the query string or secrets. Run: npm test
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { requestLog } from "../middlewares/requestLog.js";

const appWithLog = () => {
  const lines = [];
  const app = express();
  app.set("trust proxy", 1);
  app.use(requestLog({ write: (line) => lines.push(line) }));
  app.get("/healthz", (req, res) => res.json({ ok: true }));
  app.get("/auth/google/callback", (req, res) => res.redirect("/"));
  app.post("/auth/login", (req, res) => res.status(401).json({ message: "Wrong credentials" }));
  const posts = express.Router();                     // mounted like the real routers in app.js
  posts.get("/", (req, res) => res.json([]));
  posts.get("/:slug", (req, res) => res.json({ slug: req.params.slug }));
  app.use("/posts", posts);
  return { app, lines };
};

// "finish" fires right after the response is sent; give it a moment before reading the lines
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe("requestLog", () => {
  it("logs method, path, status, time, visitor IP, origin and user agent", async () => {
    const { app, lines } = appWithLog();
    await request(app)
      .post("/auth/login")
      .set("CF-Connecting-IP", "203.0.113.7")
      .set("Origin", "https://cyber-blog-flame.vercel.app")
      .set("User-Agent", 'curl/8.5 "test"')
      .send({ username: "someone", password: "secret-password" });
    await settle();
    assert.equal(lines.length, 1);
    assert.match(
      lines[0],
      /^\d{4}-\d\d-\d\dT\S+Z POST \/auth\/login 401 \d+ms ip=203\.0\.113\.7 origin=https:\/\/cyber-blog-flame\.vercel\.app ua="curl\/8\.5 'test'"$/
    );
    assert.ok(!lines[0].includes("secret-password"), "the request body must not be logged");
  });

  it("never logs the query string (OAuth codes) or the Authorization header", async () => {
    const { app, lines } = appWithLog();
    await request(app)
      .get("/auth/google/callback?code=one-time-oauth-code&state=xyz")
      .set("Authorization", "Bearer secret.jwt.token");
    await settle();
    assert.equal(lines.length, 1);
    assert.match(lines[0], / GET \/auth\/google\/callback 302 /);
    for (const secret of ["one-time-oauth-code", "state=", "?", "secret.jwt.token", "Bearer"]) {
      assert.ok(!lines[0].includes(secret), `the log line must not contain ${secret}`);
    }
  });

  it("logs the full path of requests handled by a mounted router", async () => {
    const { app, lines } = appWithLog();
    await request(app).get("/posts?page=1");
    await request(app).get("/posts/my-first-post");
    await settle();
    assert.equal(lines.length, 2);
    assert.match(lines[0], / GET \/posts 200 /);
    assert.match(lines[1], / GET \/posts\/my-first-post 200 /);
  });

  it("logs unknown paths (scanners) and skips /healthz", async () => {
    const { app, lines } = appWithLog();
    await request(app).get("/healthz");
    await request(app).get("/.env");
    await settle();
    assert.equal(lines.length, 1);
    assert.match(lines[0], / GET \/\.env 404 .* origin=- ua="-"$/);
  });
});
