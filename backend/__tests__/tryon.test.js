const express = require("express");
const request = require("supertest");
const mongoose = require("mongoose");

jest.mock("../middleware/auth", () => ({
  requireAuth: (req, res, next) => {
    if (!req.headers.authorization) return res.status(401).json({ error: "Unauthorized" });
    req.auth = { payload: { sub: "auth0|test-user" } };
    next();
  },
}));
jest.mock("../db/userService", () => ({ getUserByAuth0UserId: jest.fn() }));
jest.mock("../lib/cloudinary", () => ({ uploadToCloudinary: jest.fn() }));
jest.mock("../models/Outfit", () => ({ findById: jest.fn() }));
jest.mock("../lib/openaiImage", () => ({ generateImage: jest.fn(), downloadReference: jest.fn() }));

const Outfit = require("../models/Outfit");
const { getUserByAuth0UserId } = require("../db/userService");
const { uploadToCloudinary } = require("../lib/cloudinary");
const { generateImage, downloadReference } = require("../lib/openaiImage");
const slots = require("../lib/generationSlots");
const app = express();
app.use(express.json());
app.use("/api/tryon", require("../routes/tryon"));
const payload = { outfitId: "outfit-1", humanImageUrl: "https://res.cloudinary.com/demo/person.png" };
const garment = { userId: "user-1", name: "Shirt", category: "upper_body", imageUrls: { front: "https://res.cloudinary.com/demo/shirt.png" } };
const reference = { buffer: Buffer.from("reference"), type: "image/png" };
let outfit;
const post = (body = payload) => request(app).post("/api/tryon").set("Authorization", "Bearer test").send(body);
const leaseCount = async () => (await mongoose.connection.collection("generation_slots").findOne({ _id: slots.DOCUMENT_ID }))?.leases.length || 0;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "info").mockImplementation(() => {});
  process.env.OPENAI_API_KEY = "test-key";
  getUserByAuth0UserId.mockResolvedValue({ _id: "user-1" });
  outfit = { userId: { toString: () => "user-1" }, save: jest.fn(), items: [garment] };
  outfit.populate = jest.fn().mockResolvedValue(outfit);
  Outfit.findById.mockImplementation(async () => outfit);
  downloadReference.mockResolvedValue(reference);
  generateImage.mockResolvedValue({ buffer: Buffer.from("result") });
  uploadToCloudinary.mockResolvedValue("https://res.cloudinary.com/demo/result.webp");
});
afterEach(() => { jest.restoreAllMocks(); delete process.env.OPENAI_API_KEY; });

describe("POST /api/tryon authentication, ownership and generation", () => {
  test("rejects unauthenticated requests without consuming capacity", async () => {
    expect((await request(app).post("/api/tryon").send(payload)).status).toBe(401);
    expect(getUserByAuth0UserId).not.toHaveBeenCalled();
    expect(generateImage).not.toHaveBeenCalled();
    expect(await leaseCount()).toBe(0);
  });
  test("missing OpenAI key fails before database/provider work", async () => {
    delete process.env.OPENAI_API_KEY;
    expect((await post()).status).toBe(503);
    expect(getUserByAuth0UserId).not.toHaveBeenCalled();
    expect(generateImage).not.toHaveBeenCalled();
  });
  test("missing user returns 404", async () => {
    getUserByAuth0UserId.mockResolvedValue(null);
    expect((await post()).status).toBe(404);
    expect(Outfit.findById).not.toHaveBeenCalled();
  });
  test.each([[{ outfitId: "outfit-1" }, "humanImageUrl is required"],
    [{ humanImageUrl: payload.humanImageUrl }, "outfitId is required"]])("validates required inputs", async (body, message) => {
    const response = await post(body);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe(message);
    expect(Outfit.findById).not.toHaveBeenCalled();
  });
  test("missing outfit returns 404", async () => {
    outfit = null;
    expect((await post()).status).toBe(404);
    expect(Outfit.findById).toHaveBeenCalledWith("outfit-1");
    expect(generateImage).not.toHaveBeenCalled();
  });
  test("another user's outfit returns 403 without consuming capacity", async () => {
    outfit.userId = { toString: () => "other-user" };
    expect((await post()).status).toBe(403);
    expect(await leaseCount()).toBe(0);
    expect(generateImage).not.toHaveBeenCalled();
  });
  test("an outfit without front garment images returns 400", async () => {
    outfit.items = [{ userId: "user-1", name: "Hat", category: "accessories" }, { userId: "user-1", category: "upper_body", imageUrls: { back: "https://example.com/back.png" } }];
    const response = await post();
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("No garment images found in this outfit");
    expect(generateImage).not.toHaveBeenCalled();
  });
  test("preserves full-outfit prompt/reference order and stores the generated image", async () => {
    outfit.items.push({ userId: "user-1", name: "Jeans", category: "lower_body", imageUrls: { front: "https://res.cloudinary.com/demo/jeans.png" } });
    const response = await post();
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, imageUrl: "https://res.cloudinary.com/demo/result.webp" });
    expect(downloadReference.mock.calls.map(call => call[0])).toEqual([payload.humanImageUrl, garment.imageUrls.front, outfit.items[1].imageUrls.front]);
    expect(generateImage).toHaveBeenCalledWith([reference, reference, reference],
      "Virtual try-on: dress the person in Image 1 in the clothing in the remaining references (Shirt (upper_body), Jeans (lower_body)). Preserve identity, face, body shape, garment colors and patterns. Show the complete outfit naturally.");
    expect(uploadToCloudinary).toHaveBeenCalledWith(Buffer.from("result"), "tryon-previews");
    expect(outfit.save).toHaveBeenCalled();
    expect(outfit.lastTryOnPreviewUrl).toBe(response.body.imageUrl);
  });
});

describe("shared generation capacity at the paid-provider boundary", () => {
  test("cannot start a paid call when all 20 slots are held", async () => {
    await Promise.all(Array.from({ length: 20 }, () => slots.acquire()));
    const response = await post();
    expect(response.status).toBe(429);
    expect(response.headers["retry-after"]).toBe("30");
    expect(generateImage).not.toHaveBeenCalled();
    expect(downloadReference).not.toHaveBeenCalled();
  });
  test("database allocation errors prevent provider work", async () => {
    jest.spyOn(slots, "acquire").mockRejectedValue(Object.assign(new Error("Capacity unavailable"), { status: 503 }));
    expect((await post()).status).toBe(503);
    expect(generateImage).not.toHaveBeenCalled();
  });
  test("success releases the slot before storage and response", async () => {
    uploadToCloudinary.mockImplementation(async () => {
      expect(await leaseCount()).toBe(0);
      return "https://res.cloudinary.com/demo/result.webp";
    });
    expect((await post()).status).toBe(200);
    expect(await leaseCount()).toBe(0);
  });
  test("reference-download failure releases because generation never started", async () => {
    downloadReference.mockRejectedValue(new Error("reference failed"));
    expect((await post()).status).toBe(500);
    expect(generateImage).not.toHaveBeenCalled();
    expect(await leaseCount()).toBe(0);
  });
  test.each([400, 429])("confirmed provider rejection %i releases its slot", async (status) => {
    generateImage.mockRejectedValue(Object.assign(new Error("rejected"), { status, generationSettled: true }));
    expect((await post()).status).toBe(status);
    expect(await leaseCount()).toBe(0);
  });
  test.each([new Error("connection reset"), Object.assign(new Error("timeout"), { name: "TimeoutError" }),
    Object.assign(new Error("upstream failure"), { status: 502 })])("unknown provider outcome retains capacity: %s", async (error) => {
    generateImage.mockRejectedValue(error);
    expect((await post()).status).toBe(error.status || 500);
    expect(await leaseCount()).toBe(1);
  });
  test("failed storage does not retain a completed generation slot", async () => {
    uploadToCloudinary.mockRejectedValue(new Error("storage failure"));
    expect((await post()).status).toBe(500);
    expect(await leaseCount()).toBe(0);
  });
  test("failed release leaves the conservative lease instead of retrying generation", async () => {
    jest.spyOn(slots, "release").mockRejectedValue(new Error("database down"));
    jest.spyOn(console, "error").mockImplementation(() => {});
    expect((await post()).status).toBe(200);
    expect(await leaseCount()).toBe(1);
    expect(generateImage).toHaveBeenCalledTimes(1);
  });
});


test("legacy oversized outfits are rejected before population, allocation or downloads", async () => {
 outfit.items = Array.from({ length: 100 }, () => garment);
 const acquire = jest.spyOn(slots, "acquire");
 expect((await post()).status).toBe(400);
 expect(outfit.populate).not.toHaveBeenCalled();
 expect(acquire).not.toHaveBeenCalled();
 expect(downloadReference).not.toHaveBeenCalled();
 expect(generateImage).not.toHaveBeenCalled();
});
test("legacy references to another user's item never reach capacity or provider", async () => {
 outfit.items = [{ ...garment, userId: "victim-user" }];
 const acquire = jest.spyOn(slots, "acquire");
 expect((await post()).status).toBe(403);
 expect(acquire).not.toHaveBeenCalled();
 expect(downloadReference).not.toHaveBeenCalled();
 expect(generateImage).not.toHaveBeenCalled();
});
test("legacy duplicate categories never reach generation", async () => {
 outfit.items = [garment, { ...garment, name: "Another Shirt" }];
 expect((await post()).status).toBe(400);
 expect(downloadReference).not.toHaveBeenCalled();
 expect(generateImage).not.toHaveBeenCalled();
});


test("generation evidence logs only safe timings/token counts and provider labels", async () => {
 generateImage.mockResolvedValue({ buffer: Buffer.from("result"), requestId: "req-test",
  usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120, private_field: "never log this" } });
 expect((await post()).status).toBe(200);
 expect(console.info).toHaveBeenCalledTimes(1);
 const line = console.info.mock.calls[0][0];
 const event = JSON.parse(line);
 expect(event).toMatchObject({ event: "tryon_generated", requestId: "req-test", usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 } });
 expect(event.elapsedMs).toBeGreaterThanOrEqual(0);
 expect(line).not.toContain("private_field");
 expect(line).not.toContain("res.cloudinary.com");
 expect(line).not.toContain("auth0|");
 expect(line).not.toContain("Virtual try-on");
});
