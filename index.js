import express from "express";
import connectDB from "./lib/connectDB.js";
import userRouter from "./routes/user.route.js";
import postRouter from "./routes/post.route.js";
import commentRouter from "./routes/comment.route.js";
import webHookRouter from "./routes/webhook.route.js";
import { clerkMiddleware, requireAuth } from "@clerk/express";
import cors from "cors";

const PORT = process.env.PORT || 3001;

const app = express();

// cors - for fetching data on another port | Client url
app.use(cors(process.env.CLIENT_URL));
app.use(clerkMiddleware());
app.use("/webhooks", webHookRouter);
app.use(express.json());

// allow cross-origin requests
app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});
// auth state to verify user
/*
app.get("/auth-state", (req, res) => {
  const authState = req.auth;
  res.json(authState);
});
*/

// protected route
/*
app.get("/protect", (req, res) => {
  const { userId } = req.auth;
  if (!userId) {
    return res.status(401).json("not authenticated");
  }
  res.status(200).json("Protected");
});
*/

// Protected routes using requireAuth from clerk/express
/*
app.get("/protect2", requireAuth(), (req, res) => {
  res.status(200).json("Protected");
});
*/

app.use("/users", userRouter);
app.use("/posts", postRouter);
app.use("/comments", commentRouter);

app.use((error, req, res, next) => {
  res.status(error.status || 500);

  res.json({
    message: error.message || "Something went wrong!",
    status: error.status,
    // In the production phase
    stack: error.stack,
  });
});

app.listen(PORT, () => {
  connectDB();
  console.log(`Server started on Port: ${PORT} `);
});
