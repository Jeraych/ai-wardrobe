const mongoose = require("mongoose");

function createDatabaseConnection(database = mongoose, getUri = () => process.env.MONGO_URI) {
  let pending;
  async function connect() {
    if (database.connection.readyState === 1) return;
    if (!pending) {
      pending = Promise.resolve().then(() => {
        const uri = getUri();
        if (!uri) throw new Error("Database is not configured");
        return database.connect(uri, {
          serverSelectionTimeoutMS: 5000,
          connectTimeoutMS: 5000,
          bufferCommands: false,
        });
      }).finally(() => { pending = undefined; });
    }
    await pending;
    if (database.connection.readyState !== 1) throw new Error("Database is not ready");
  }
  async function requireDatabase(req, res, next) {
    try {
      await connect();
      next();
    } catch {
      res.status(503).json({ error: "Database unavailable. Please try again later." });
    }
  }
  return { connect, requireDatabase };
}

module.exports = { ...createDatabaseConnection(), createDatabaseConnection };
