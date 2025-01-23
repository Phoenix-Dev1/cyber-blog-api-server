import jwt from "jsonwebtoken";

export const authenticateJWT = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json("Authentication token is missing!");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Set the decoded user data to req.user
    next();
  } catch (err) {
    res.status(403).json("Invalid or expired token!");
  }
};
