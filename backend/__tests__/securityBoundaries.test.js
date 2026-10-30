const request = require("supertest");
const mongoose = require("mongoose");
jest.mock("../middleware/auth", () => ({ requireAuth: (req, res, next) => {
 if (!req.headers.authorization) return res.sendStatus(401);
 req.auth = { payload: { sub: req.headers["x-test-sub"] || "auth0|attacker",
   email: req.headers["x-test-email"] || "attacker@example.com", email_verified: true } };
 next();
} }));
const app = require("../app");
const User = require("../models/User");
const ClothingItem = require("../models/ClothingItems");
const Outfit = require("../models/Outfit");
const authorized = (method, url) => request(app)[method](url).set("Authorization", "Bearer test-token");
const createUser = (suffix = "attacker") => User.create({ auth0UserId: `auth0|${suffix}`, name: "Test User", email: `${suffix}@example.com` });
const createItem = (userId, category = "upper_body") => ClothingItem.create({ userId, name: "Test Shirt", category, size: "M", fit: "regular",
 imageUrls: { front: "https://res.cloudinary.com/test/private.png" } });

test.each(["userId", "$set", "$rename"])("clothing update rejects identity/operator injection: %s", async field => {
 const attacker = await createUser();
 const victim = await createUser("victim");
 const item = await createItem(attacker._id);
 const body = field === "userId" ? { userId: String(victim._id) } : { [field]: { userId: String(victim._id) } };
 const response = await authorized("put", `/api/clothingItems/me/${item._id}`).send(body);
 expect(response.status).toBe(400);
 expect(String((await ClothingItem.findById(item._id)).userId)).toBe(String(attacker._id));
});
test.each([{ auth0UserId: "auth0|victim" }, { email: "victim@example.com" },
 { $set: { auth0UserId: "auth0|victim" } }, { "bodyProfile.$set": { auth0UserId: "auth0|victim" } }])("profile updates cannot change identity: %j", async body => {
 const attacker = await createUser();
 expect((await authorized("put", "/api/users/me").send(body)).status).toBe(400);
 const saved = await User.findById(attacker._id);
 expect(saved.auth0UserId).toBe("auth0|attacker");
 expect(saved.email).toBe("attacker@example.com");
});
test("profile whitelist still allows onboarding completion", async () => {
 await createUser();
 const response = await authorized("put", "/api/users/me").send({ name: "Changed Name", isCompleteOnboarding: true, stylePreferences: [] });
 expect(response.status).toBe(200);
 expect(response.body.isCompleteOnboarding).toBe(true);
 expect(response.body.name).toBe("Changed Name");
});
test("sync ignores forged email so attacker cannot reserve victim's unique email", async () => {
 const attacker = await authorized("post", "/api/users/me/sync").send({ name: "Test User", email: "victim@example.com" });
 expect(attacker.status).toBe(201);
 expect(attacker.body.email).toBe("attacker@example.com");
 const victim = await authorized("post", "/api/users/me/sync")
   .set("x-test-sub", "auth0|victim").set("x-test-email", "victim@example.com")
   .send({ name: "Other User", email: "attacker@example.com" });
 expect(victim.status).toBe(201);
 expect(victim.body.email).toBe("victim@example.com");
});
test("legacy foreign references are absent from outfit reads and metadata-update responses", async () => {
 const attacker = await createUser();
 const victim = await createUser("victim");
 const stolen = await createItem(victim._id);
 const owned = await createItem(attacker._id, "lower_body");
 // Simulate pre-existing dirty data without going through the now-protected routes.
 const inserted = await Outfit.collection.insertOne({ userId: attacker._id, name: "Dirty Fit", items: [stolen._id, owned._id] });
 const listed = await authorized("get", "/api/outfits/me");
 expect(listed.status).toBe(200);
 expect(listed.body[0].items.map(item => item._id)).toEqual([String(owned._id)]);
 const updated = await authorized("put", `/api/outfits/me/${inserted.insertedId}`).send({ favourite: true });
 expect(updated.status).toBe(200);
 expect(updated.body.items.map(item => item._id)).toEqual([String(owned._id)]);
});
test("outfit PUT rejects duplicate categories and keeps original composition", async () => {
 const attacker = await createUser();
 const first = await createItem(attacker._id);
 const second = await createItem(attacker._id);
 const outfit = await Outfit.create({ userId: attacker._id, name: "Safe Fit", items: [first._id] });
 const response = await authorized("put", `/api/outfits/me/${outfit._id}`).send({ items: [String(first._id), String(second._id)] });
 expect(response.status).toBe(400);
 expect((await Outfit.findById(outfit._id)).items.map(String)).toEqual([String(first._id)]);
});
test.each(["post", "put"])("outfit %s rejects more than 6 references", async method => {
 const attacker = await createUser();
 const outfit = await Outfit.create({ userId: attacker._id, name: "Safe Fit", items: [] });
 const url = method === "post" ? "/api/outfits/me" : `/api/outfits/me/${outfit._id}`;
 const response = await authorized(method, url).send({ name: "Too Large", items: Array.from({ length: 100 }, () => String(new mongoose.Types.ObjectId())) });
 expect(response.status).toBe(400);
 expect((await Outfit.findById(outfit._id)).items).toHaveLength(0);
});
