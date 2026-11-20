// One log line per request, written when the response has been sent, so `docker logs blog-api` shows who calls
// the API: the client app, real visitors, bots and scanners. Example:
//   2026-11-20T10:41:07.512Z GET /posts/my-first-post 200 38ms ip=203.0.113.7 origin=https://cyber-blog-flame.vercel.app ua="Mozilla/5.0 ..."
//
// What is NOT logged, on purpose:
//   - the query string: the OAuth callbacks carry one-time sign-in codes there (/auth/google/callback?code=...);
//   - headers other than Origin and User-Agent (never Authorization, which holds the JWT) and request bodies;
//   - GET /healthz: Docker and the monitoring call it every few seconds/minutes.
// The visitor address is Cloudflare's CF-Connecting-IP (Cloudflare overwrites any value a client sends), else req.ip.
const SKIP = new Set(["/healthz"]);
const clip = (value, max) => (value ? String(value).replace(/\s+/g, " ").slice(0, max) : "-");

export function requestLog({ write = (line) => console.log(line) } = {}) {
  return (req, res, next) => {
    // Read the path now: inside a mounted router (app.use("/posts", ...)) Express shortens req.path to the part
    // after the mount point, and the response is usually sent from there, so at "finish" it would read "/".
    const path = req.path;
    if (SKIP.has(path)) return next();
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const ms = Math.round(Number(process.hrtime.bigint() - start) / 1e6);
      const ip = req.headers["cf-connecting-ip"] || req.ip || "-";
      write(
        `${new Date().toISOString()} ${req.method} ${clip(path, 200)} ${res.statusCode} ${ms}ms ` +
          `ip=${clip(ip, 45)} origin=${clip(req.headers.origin, 80)} ua="${clip(req.headers["user-agent"], 100).replace(/"/g, "'")}"`
      );
    });
    next();
  };
}
