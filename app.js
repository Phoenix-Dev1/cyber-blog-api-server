// The Express app, without starting it (index.js connects the database and listens; the tests use it directly).
import { env } from "./config/env.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import mongoose from "mongoose";
import passport from "./passport.js";
import authRouter from "./routes/auth.route.js";
import userRouter from "./routes/user.route.js";
import postRouter from "./routes/post.route.js";
import commentRouter from "./routes/comment.route.js";
import { generalLimit } from "./middlewares/rateLimits.js";
import { errorHandler, notFound } from "./middlewares/errorHandler.js";

const app = express();

// Behind a proxy (Cloudflare Tunnel, Render) the app itself is reached over plain http. Trusting the
// first proxy's X-Forwarded-Proto makes req.protocol "https", so the relative GitHub callback URL in
// passport.js is built as https://… (GitHub rejects an http callback). It also makes req.ip the visitor's.
app.set("trust proxy", 1);
app.disable("x-powered-by");

// Security headers. Cross-origin resource policy is relaxed: the API is called from the client's origin.
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

// Health check for Docker and the monitoring: 200 while connected to MongoDB, else 503.
// Before CORS and the rate limit: Docker calls it every few seconds.
app.get("/healthz", (req, res) => {
  const ok = mongoose.connection.readyState === 1;
  res.status(ok ? 200 : 503).json({ ok });
});

// Only the client may call the API from a browser. No cookies are used (the token travels in a header).
app.use(
  cors({
    origin: env.clientUrl,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
  })
);
app.use(generalLimit);
app.use(express.json({ limit: "300kb" }));
app.use(passport.initialize());

app.use("/auth", authRouter);
app.use("/users", userRouter);
app.use("/posts", postRouter);
app.use("/comments", commentRouter);

app.use(notFound);
app.use(errorHandler);

export default app;
