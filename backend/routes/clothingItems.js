const express = require("express");
const {
  addItem,
  getItems,
  updateItemForUser,
  deleteItemForUser,
} = require("../db/clothingService");
const router = express.Router();
const EDITABLE_FIELDS = ["name", "category", "size", "fit", "favourite", "imageUrls"];
function editableItemFields(body) {
  if (Object.keys(body).some(field => !EDITABLE_FIELDS.includes(field))) {
    throw Object.assign(new Error("Unsupported clothing fields"), { status: 400 });
  }
  const update = {};
  for (const field of EDITABLE_FIELDS) if (Object.hasOwn(body, field)) update[field] = body[field];
  if (update.imageUrls && (typeof update.imageUrls !== "object" || Array.isArray(update.imageUrls) ||
      Object.keys(update.imageUrls).some(field => !["front", "back", "side"].includes(field)))) {
    throw Object.assign(new Error("Unsupported image fields"), { status: 400 });
  }
  return update;
}
const { requireAuth } = require("../middleware/auth");
const { getUserByAuth0UserId } = require("../db/userService");
const { uploadToCloudinary } = require("../lib/cloudinary");
const upload = require("../middleware/upload");

// Shoe records do not require clothing sizes, so remove stale size values before validation.
function withoutShoeSize(data) {
  const itemData = { ...data };

  if (itemData.category === "shoes") {
    delete itemData.size;
  }

  return itemData;
}

// Create a closet item owned by the authenticated user's MongoDB profile.
router.post("/me", requireAuth, async (req, res) => {
  try {
    const auth0UserId = req.auth.payload.sub;
    const user = await getUserByAuth0UserId(auth0UserId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Attach ownership server-side instead of trusting userId from the request body.
    const item = await addItem({
      ...withoutShoeSize(editableItemFields(req.body)),
      userId: user._id,
    });
    res.status(201).json(item);
  } catch (error) {
    const messages = error.errors ? Object.values(error.errors).map((e) => e.message) : [error.message];
    return res.status(400).json({ errors: messages });
  }
});

// List the authenticated user's closet, optionally filtered by category, size, and fit.
router.get("/me", requireAuth, async (req, res) => {
  try {
    const auth0UserId = req.auth.payload.sub;
    const user = await getUserByAuth0UserId(auth0UserId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const { category, size, fit } = req.query;

    const items = await getItems({ userId: user._id, category, size, fit });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// Update a single owned closet item while preserving the owner boundary in the database query.
router.put("/me/:id", requireAuth, async (req, res) => {
  try {
    const auth0UserId = req.auth.payload.sub;
    const user = await getUserByAuth0UserId(auth0UserId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const update = withoutShoeSize(editableItemFields(req.body));
    // Switching an existing item to shoes must unset any previously saved size in MongoDB.
    const updateData =
      req.body.category === "shoes"
        ? { $set: update, $unset: { size: "" } }
        : { $set: update };

    const item = await updateItemForUser(req.params.id, user._id, updateData);

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.json(item);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete a single owned closet item.
router.delete("/me/:id", requireAuth, async (req, res) => {
  try {
    const auth0UserId = req.auth.payload.sub;
    const user = await getUserByAuth0UserId(auth0UserId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const item = await deleteItemForUser(req.params.id, user._id);

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.json({ message: "Item deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// Upload one image angle for an owned closet item and save the Cloudinary URL into imageUrls.
router.post("/me/:id/image", requireAuth, upload.single("image"), async (req, res) => {
  try {
    const auth0UserId = req.auth.payload.sub;
    const user = await getUserByAuth0UserId(auth0UserId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Keep image slots explicit so clients cannot write arbitrary nested fields.
    const slot = req.body.slot || "front";
    const allowedSlots = ["front", "back", "side"];

    if (!allowedSlots.includes(slot)) {
      return res.status(400).json({ error: "Invalid image slot" });
    }

    // Save only the requested angle so existing front/back/side URLs are preserved.
    const url = await uploadToCloudinary(req.file.buffer, "clothing");
    const item = await updateItemForUser(req.params.id, user._id, {
      [`imageUrls.${slot}`]: url,
    });

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.json({ url, item });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
