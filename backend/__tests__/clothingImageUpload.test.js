const request = require("supertest");
const mongoose = require("mongoose");
const User = require("../models/User");
const ClothingItem = require("../models/ClothingItems");

const mockUploadToCloudinary = jest.fn();

jest.mock("../lib/cloudinary", () => ({
  uploadToCloudinary: jest.fn((...args) => mockUploadToCloudinary(...args)),
}));

jest.mock("../middleware/auth.js", () => ({
  requireAuth: (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    req.auth = {
      payload: {
        sub: "auth0|test-user",
      },
    };

    next();
  },
}));

const app = require("../app");
const { uploadToCloudinary } = require("../lib/cloudinary");
const authHeader = { Authorization: "Bearer test-token" };

const createTestUser = (overrides = {}) =>
  User.create({
    auth0UserId: "auth0|test-user",
    name: "Jane Doe",
    email: "jane@example.com",
    ...overrides,
  });

const createTestItem = (userId, overrides = {}) =>
  ClothingItem.create({
    userId,
    name: "Tshirt",
    category: "upper_body",
    size: "M",
    fit: "regular",
    imageUrls: {
      front: "",
      back: "",
      side: "",
    },
    ...overrides,
  });

describe("POST /api/clothingItems/me/:id/image", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUploadToCloudinary.mockResolvedValue(
      "https://res.cloudinary.com/demo/image/upload/clothing.jpg"
    );
  });

  it("returns 400 when the request has no file", async () => {
    const user = await createTestUser();
    const item = await createTestItem(user._id);

    const res = await request(app)
      .post(`/api/clothingItems/me/${item._id}/image`)
      .set(authHeader)
      .field("slot", "front");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("No file uploaded");
    expect(uploadToCloudinary).not.toHaveBeenCalled();
  });

  it("returns 404 when the item is not found", async () => {
    await createTestUser();

    const res = await request(app)
      .post(`/api/clothingItems/me/${new mongoose.Types.ObjectId()}/image`)
      .set(authHeader)
      .field("slot", "front")
      .attach("image", Buffer.from("fake image"), {
        filename: "item.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Item not found");
  });

  it("returns 404 when the item belongs to a different user with the current route behavior", async () => {
    await createTestUser();
    const otherUserId = new mongoose.Types.ObjectId();
    const otherItem = await createTestItem(otherUserId);

    const res = await request(app)
      .post(`/api/clothingItems/me/${otherItem._id}/image`)
      .set(authHeader)
      .field("slot", "front")
      .attach("image", Buffer.from("fake image"), {
        filename: "item.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Item not found");
  });

  it("returns 400 for an invalid image slot", async () => {
    const user = await createTestUser();
    const item = await createTestItem(user._id);

    const res = await request(app)
      .post(`/api/clothingItems/me/${item._id}/image`)
      .set(authHeader)
      .field("slot", "slot4")
      .attach("image", Buffer.from("fake image"), {
        filename: "item.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid image slot");
    expect(uploadToCloudinary).not.toHaveBeenCalled();
  });

  it("uploads a valid image, saves the URL to the correct slot, and returns 200", async () => {
    const user = await createTestUser();
    const item = await createTestItem(user._id);

    const res = await request(app)
      .post(`/api/clothingItems/me/${item._id}/image`)
      .set(authHeader)
      .field("slot", "back")
      .attach("image", Buffer.from("fake image"), {
        filename: "item.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(200);
    expect(uploadToCloudinary).toHaveBeenCalledWith(
      expect.any(Buffer),
      "clothing"
    );
    expect(res.body.url).toBe(
      "https://res.cloudinary.com/demo/image/upload/clothing.jpg"
    );
    expect(res.body.item.imageUrls.back).toBe(
      "https://res.cloudinary.com/demo/image/upload/clothing.jpg"
    );

    const updatedItem = await ClothingItem.findById(item._id);
    expect(updatedItem.imageUrls.back).toBe(
      "https://res.cloudinary.com/demo/image/upload/clothing.jpg"
    );
  });

  it("returns 500 when Cloudinary upload fails", async () => {
    const user = await createTestUser();
    const item = await createTestItem(user._id);
    mockUploadToCloudinary.mockRejectedValue(new Error("Cloudinary failed"));

    const res = await request(app)
      .post(`/api/clothingItems/me/${item._id}/image`)
      .set(authHeader)
      .field("slot", "front")
      .attach("image", Buffer.from("fake image"), {
        filename: "item.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Cloudinary failed");
  });
  it.each([[4 * 1024 * 1024, 200], [4 * 1024 * 1024 + 1, 413]])(
    "enforces the 4 MB upload boundary (%i bytes => %i)", async (bytes, status) => {
    const user = await createTestUser();
    const item = await createTestItem(user._id);
    const res = await request(app).post(`/api/clothingItems/me/${item._id}/image`).set(authHeader)
      .attach("image", Buffer.alloc(bytes), { filename: "photo.png", contentType: "image/png" });
    expect(res.status).toBe(status);
    if (status === 413) {
      expect(res.body.error).toBe("Images must be 4 MB or smaller.");
      expect(uploadToCloudinary).not.toHaveBeenCalled();
    }
  });
});
