import express from "express";
import connectDB from "./lib/connectDB.js";
import userRouter from "./routes/user.route.js";
import postRouter from "./routes/post.route.js";
import commentRouter from "./routes/comment.route.js";
import authRouter from "./routes/auth.route.js";
import cors from "cors";
import passport from "./passport.js";
import dotenv from "dotenv";

dotenv.config();

// Loudly catch uncaught exceptions and unhandled rejections
process.on("uncaughtException", (err) => {
  console.error("========== UNCAUGHT EXCEPTION ==========");
  console.error(err.name, err.message);
  console.error(err.stack);
  console.error("========================================");
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  console.error("========== UNHANDLED REJECTION ==========");
  console.error(err.name, err.message);
  console.error(err.stack);
  console.error("=========================================");
  process.exit(1);
});

const PORT = process.env.PORT || 5432;

const app = express();

// Middleware
app.use(express.json());

// CORS configuration
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    credentials: true,
  })
);

// Initialize Passport
app.use(passport.initialize());

// Allow cross-origin requests
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", process.env.CLIENT_URL || "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  next();
});

// Routers
app.use("/auth", authRouter); // Authentication routes
app.use("/users", userRouter);
app.use("/posts", postRouter);
app.use("/comments", commentRouter);

// Global Error handling middleware (at the end of the stack)
app.use((err, req, res, next) => {
  // Loud console logging
  console.error("========== SERVER ERROR ==========");
  console.error(`Method: ${req.method} | Path: ${req.originalUrl}`);
  console.error(`Message: ${err.message || "Internal Server Error"}`);
  console.error("Stack Trace:");
  console.error(err.stack);
  console.error("==================================");

  const status = err.status || 500;
  res.status(status).json({
    message: err.message || "Something went wrong!",
    status: status,
    // Include stack only in development
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
  });
});

// Start the server
app.listen(PORT, () => {
  connectDB();
  console.log(`Server started on Port: ${PORT}`);
});
