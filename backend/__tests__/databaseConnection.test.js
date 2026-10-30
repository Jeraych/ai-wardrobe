const express = require("express");
const request = require("supertest");
const { createDatabaseConnection } = require("../db/connection");
function deferred() {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fakeDatabase() { return { connection: { readyState: 0 }, connect: jest.fn() }; }

test("concurrent cold-start requests await one shared connection, then reuse it", async () => {
 const database = fakeDatabase();
 const attempt = deferred();
 database.connect.mockImplementation(async () => { await attempt.promise; database.connection.readyState = 1; });
 const connection = createDatabaseConnection(database, () => "mongodb://synthetic-test");
 const next = jest.fn();
 const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
 const waiting = Array.from({ length: 25 }, () => connection.requireDatabase({}, res, next));
 await Promise.resolve();
 expect(database.connect).toHaveBeenCalledTimes(1);
 expect(next).not.toHaveBeenCalled();
 expect(database.connect).toHaveBeenCalledWith("mongodb://synthetic-test", {
  serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, bufferCommands: false,
 });
 attempt.resolve();
 await Promise.all(waiting);
 expect(next).toHaveBeenCalledTimes(25);
 await connection.connect();
 expect(database.connect).toHaveBeenCalledTimes(1);
});
test("failure returns generic 503 before routes execute and a later request retries", async () => {
 const database = fakeDatabase();
 database.connect.mockRejectedValueOnce(new Error("private database connection details"))
  .mockImplementationOnce(async () => { database.connection.readyState = 1; });
 const connection = createDatabaseConnection(database, () => "mongodb://synthetic-test");
 const app = express();
 const handler = jest.fn((_req, res) => res.json({ ready: true }));
 app.get("/health/ready", connection.requireDatabase, handler);
 const failed = await request(app).get("/health/ready");
 expect(failed.status).toBe(503);
 expect(failed.body).toEqual({ error: "Database unavailable. Please try again later." });
 expect(handler).not.toHaveBeenCalled();
 const retried = await request(app).get("/health/ready");
 expect(retried.status).toBe(200);
 expect(retried.body).toEqual({ ready: true });
 expect(database.connect).toHaveBeenCalledTimes(2);
});
test("a disconnected warm instance reconnects instead of trusting a resolved promise", async () => {
 const database = fakeDatabase();
 database.connect.mockImplementation(async () => { database.connection.readyState = 1; });
 const connection = createDatabaseConnection(database, () => "mongodb://synthetic-test");
 await connection.connect();
 database.connection.readyState = 0;
 await connection.connect();
 expect(database.connect).toHaveBeenCalledTimes(2);
});
test("an unconfigured database fails closed without calling the driver", async () => {
 const database = fakeDatabase();
 const connection = createDatabaseConnection(database, () => undefined);
 await expect(connection.connect()).rejects.toThrow("Database is not configured");
 expect(database.connect).not.toHaveBeenCalled();
});
