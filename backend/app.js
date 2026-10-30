// Load backend-specific environment variables even when the app is started from the monorepo root.
require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const express = require("express");
const { requireDatabase } = require("./db/connection");
const cors = require("cors");

const app = express();
const ClothingItemsRoutes = require("./routes/clothingItems");
const UsersRoutes = require("./routes/users");
const TryOnRoutes = require("./routes/tryon");
const OutfitsRoutes = require("./routes/outfits");

// Shared middleware and route mounts for the REST API.
app.use(cors());
app.use(express.json({ limit: "1mb" }));
// Keep the request alive until the shared cold-start connection is ready.
app.use("/api", requireDatabase);
app.use("/api/clothingItems", ClothingItemsRoutes);
app.use("/api/users", UsersRoutes);
app.use("/api/tryon", TryOnRoutes);
app.use("/api/outfits", OutfitsRoutes);

// Keep multipart errors readable for clients, including the deployment upload limit.
app.use((error, req, res, next) => {
  if (error.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Images must be 4 MB or smaller." });
  next(error);
});

// Readiness checks only connectivity; it does not query user data or providers.
app.get("/health/ready", requireDatabase, (req, res) => {
  res.json({ ready: true });
});

app.get("/", (req, res) => {
  res.send("API running");
});

module.exports = app;
