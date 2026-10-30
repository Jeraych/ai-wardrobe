const request = require("supertest");
const User = require("../models/User");

jest.mock("../middleware/auth.js", () => ({
  requireAuth: (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    req.auth = {
      payload: {
        sub: "auth0|test-user",
        email: "jane@example.com",
        email_verified: true,
      },
    };

    next();
  },
}));

const app = require("../app");
const authHeader = { Authorization: "Bearer test-token" };

const createTestUser = () =>
  User.create({
    auth0UserId: "auth0|test-user",
    name: "Jane Doe",
    email: "jane@example.com",
  });

beforeEach(async () => {
  await User.deleteMany({
    $or: [{ auth0UserId: "auth0|test-user" }, { email: "jane@example.com" }],
  });
});

// Create user
describe("POST /api/users/me/sync", () => {
  it("should return 401 without a token", async () => {
    const res = await request(app).post("/api/users/me/sync");

    expect(res.status).toBe(401);
  });

  it("should sync a new authenticated user", async () => {
    const res = await request(app)
      .post("/api/users/me/sync")
      .set(authHeader)
      .send({
        name: "Jane Doe",
        email: "jane@example.com",
        bodyProfile: {
          height: 165,
          weight: 60,
          bodyType: "ectomorph",
        },
        stylePreferences: ["casual", "minimal"],
      });

    expect(res.status).toBe(201);
    expect(res.body.auth0UserId).toBe("auth0|test-user");
  });

  it("should sync a user with required profile fields", async () => {
    const res = await request(app)
      .post("/api/users/me/sync")
      .set(authHeader)
      .send({ name: "Jane Doe", email: "jane@example.com" });

    expect(res.status).toBe(201);
  });
});

// Get
describe("GET /api/users/me", () => {
  it("should return the authenticated user's profile", async () => {
    await createTestUser();
    const res = await request(app).get("/api/users/me").set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body.auth0UserId).toBe("auth0|test-user");
  });

  it("should return 404 when authenticated profile does not exist", async () => {
    const res = await request(app).get("/api/users/me").set(authHeader);

    expect(res.status).toBe(404);
  });
});

// Update user
describe("PUT /api/users/me", () => {
  it("should update a user and return updated data", async () => {
    await createTestUser();
    const res = await request(app)
      .put("/api/users/me")
      .set(authHeader)
      .send({ name: "Jane Updated", stylePreferences: ["streetwear"] });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Jane Updated");
    expect(res.body.stylePreferences).toContain("streetwear");
  });

  it("should return 404 for a non-existent user", async () => {
    const res = await request(app)
      .put("/api/users/me")
      .set(authHeader)
      .send({ name: "Ghost" });

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/users/me/profile", () => {
  it("should update profile details in one request", async () => {
    await createTestUser();

    const res = await request(app)
      .patch("/api/users/me/profile")
      .set(authHeader)
      .send({
        name: "Jane Updated",
        bodyProfile: {
          age: "29",
          height: "170",
          weight: "62",
          bodyShape: "Athletic",
          gender: "Women",
        },
        stylePreferences: ["minimal", "smart casual"],
      });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Jane Updated");
    expect(res.body.bodyProfile.age).toBe(29);
    expect(res.body.bodyProfile.height).toBe(170);
    expect(res.body.bodyProfile.weight).toBe(62);
    expect(res.body.bodyProfile.bodyType).toBe("Athletic");
    expect(res.body.bodyProfile.gender).toBe("Women");
    expect(res.body.stylePreferences).toEqual(["minimal", "smart casual"]);
  });

  it("should reject unsupported profile fields", async () => {
    await createTestUser();

    const res = await request(app)
      .patch("/api/users/me/profile")
      .set(authHeader)
      .send({ email: "changed@example.com" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Unsupported profile fields");
  });
});

describe("PATCH /api/users/me/body-profile", () => {
  it("should update body profile details", async () => {
    await createTestUser();

    const res = await request(app)
      .patch("/api/users/me/body-profile")
      .set(authHeader)
      .send({
        age: 31,
        height: 180,
        weight: 75,
        bodyType: "Regular",
        gender: "Non-binary",
      });

    expect(res.status).toBe(200);
    expect(res.body.bodyProfile).toMatchObject({
      age: 31,
      height: 180,
      weight: 75,
      bodyType: "Regular",
      gender: "Non-binary",
    });
  });

  it("should reject invalid body profile numbers", async () => {
    await createTestUser();

    const res = await request(app)
      .patch("/api/users/me/body-profile")
      .set(authHeader)
      .send({ age: -1 });

    expect(res.status).toBe(400);
    expect(res.body.errors).toContain("age must be a non-negative number");
  });

  it("should reject clearing required body profile fields", async () => {
    await createTestUser();

    const ageRes = await request(app)
      .patch("/api/users/me/body-profile")
      .set(authHeader)
      .send({ age: null });

    expect(ageRes.status).toBe(400);
    expect(ageRes.body.errors).toContain("age is required");

    const genderRes = await request(app)
      .patch("/api/users/me/body-profile")
      .set(authHeader)
      .send({ gender: null });

    expect(genderRes.status).toBe(400);
    expect(genderRes.body.errors).toContain("gender is required");
  });
});

describe("PATCH /api/users/me/style-preferences", () => {
  it("should update style preferences", async () => {
    await createTestUser();

    const res = await request(app)
      .patch("/api/users/me/style-preferences")
      .set(authHeader)
      .send({ stylePreferences: ["streetwear", "formal"] });

    expect(res.status).toBe(200);
    expect(res.body.stylePreferences).toEqual(["streetwear", "formal"]);
  });

  it("should reject non-array style preferences", async () => {
    await createTestUser();

    const res = await request(app)
      .patch("/api/users/me/style-preferences")
      .set(authHeader)
      .send({ stylePreferences: "streetwear" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("stylePreferences must be an array");
  });
});

// Upload profile photo
describe("PUT /api/users/me/photo", () => {
  it("should upload a profile photo and return success", async () => {
    await createTestUser();
    const res = await request(app)
      .put("/api/users/me/photo")
      .set(authHeader)
      .send({ profilePhoto: "https://example.com/photo.jpg" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Profile photo updated successfully");
    expect(res.body.profilePhoto).toBe("https://example.com/photo.jpg");
  });

  it("should return 400 when profilePhoto is missing", async () => {
    await createTestUser();
    const res = await request(app)
      .put("/api/users/me/photo")
      .set(authHeader)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("profilePhoto is required");
  });

  it("should return 404 for a non-existent user", async () => {
    const res = await request(app)
      .put("/api/users/me/photo")
      .set(authHeader)
      .send({ profilePhoto: "https://example.com/photo.jpg" });

    expect(res.status).toBe(404);
  });
});

// Delete user
describe("DELETE /api/users/me", () => {
  it("should delete a user and return success message", async () => {
    await createTestUser();
    const res = await request(app).delete("/api/users/me").set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("User deleted successfully");
  });

  it("should return 404 for already deleted user", async () => {
    const res = await request(app).delete("/api/users/me").set(authHeader);

    expect(res.status).toBe(404);
  });
});
