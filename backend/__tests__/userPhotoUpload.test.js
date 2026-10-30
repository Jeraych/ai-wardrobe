const request = require("supertest");
const User = require("../models/User");

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

const createTestUser = () =>
  User.create({
    auth0UserId: "auth0|test-user",
    name: "Jane Doe",
    email: "jane@example.com",
  });

describe("POST /api/users/me/photo/upload", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUploadToCloudinary.mockResolvedValue(
      "https://res.cloudinary.com/demo/image/upload/profile.jpg"
    );
  });

  it("returns 400 when the request has no file", async () => {
    await createTestUser();

    const res = await request(app)
      .post("/api/users/me/photo/upload")
      .set(authHeader);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("No file uploaded");
    expect(uploadToCloudinary).not.toHaveBeenCalled();
  });

  it("uploads a valid image, saves the URL to the user, and returns 200", async () => {
    const user = await createTestUser();

    const res = await request(app)
      .post("/api/users/me/photo/upload")
      .set(authHeader)
      .attach("image", Buffer.from("fake image"), {
        filename: "profile.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(200);
    expect(uploadToCloudinary).toHaveBeenCalledWith(
      expect.any(Buffer),
      "profiles"
    );
    expect(res.body).toEqual({
      message: "Model image uploaded successfully",
      modelImage: "https://res.cloudinary.com/demo/image/upload/profile.jpg",
    });

    const updatedUser = await User.findById(user._id);
    expect(updatedUser.modelImage).toBe(
      "https://res.cloudinary.com/demo/image/upload/profile.jpg"
    );
  });

  it("returns 500 when Cloudinary upload fails", async () => {
    await createTestUser();
    mockUploadToCloudinary.mockRejectedValue(new Error("Cloudinary failed"));

    const res = await request(app)
      .post("/api/users/me/photo/upload")
      .set(authHeader)
      .attach("image", Buffer.from("fake image"), {
        filename: "profile.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Cloudinary failed");
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await request(app)
      .post("/api/users/me/photo/upload")
      .attach("image", Buffer.from("fake image"), {
        filename: "profile.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(401);
    expect(uploadToCloudinary).not.toHaveBeenCalled();
  });
  it.each([[4 * 1024 * 1024, 200], [4 * 1024 * 1024 + 1, 413]])(
    "enforces the 4 MB upload boundary (%i bytes => %i)", async (bytes, status) => {
    await createTestUser();
    const res = await request(app).post("/api/users/me/photo/upload").set(authHeader)
      .attach("image", Buffer.alloc(bytes), { filename: "photo.png", contentType: "image/png" });
    expect(res.status).toBe(status);
    if (status === 413) {
      expect(res.body.error).toBe("Images must be 4 MB or smaller.");
      expect(uploadToCloudinary).not.toHaveBeenCalled();
    }
  });
});
