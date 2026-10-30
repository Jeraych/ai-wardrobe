const express = require("express");
const {
  addOutfit,
  getOutfits,
  updateOutfitForUser,
  deleteOutfitForUser,
} = require("../db/outfitService");
const ClothingItem = require("../models/ClothingItems");
const { requireAuth } = require("../middleware/auth");
const { getUserByAuth0UserId } = require("../db/userService");

const router = express.Router();

// Resolve the current user once per route and return a 404 when onboarding sync has not created them.
async function getAuthenticatedUser(req, res) {
  const auth0UserId = req.auth.payload.sub;
  const user = await getUserByAuth0UserId(auth0UserId);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return null;
  }

  return user;
}

// Ensure every outfit item exists and belongs to the authenticated user before saving references.
async function validateOwnedItems(userId, itemIds = []) {
  if (!Array.isArray(itemIds) || itemIds.length > 6 || itemIds.some(id => typeof id !== "string")) {
    throw Object.assign(new Error("Outfits may contain at most 6 item IDs"), { statusCode: 400 });
  }
  const uniqueItemIds = [...new Set(itemIds)];
  if (uniqueItemIds.length !== itemIds.length) {
    throw Object.assign(new Error("Outfit items must be unique"), { statusCode: 400 });
  }
  const items = await ClothingItem.find({
    _id: { $in: uniqueItemIds },
    userId,
  });

  if (items.length !== uniqueItemIds.length) {
    const error = new Error("One or more items were not found");
    error.statusCode = 404;
    throw error;
  }

  if (new Set(items.map(item => item.category)).size !== items.length) {
    throw Object.assign(new Error("Outfit items must be from different categories"), { statusCode: 400 });
  }
  return uniqueItemIds;
}

// Create an outfit from owned closet items and return it with populated item details.
router.post("/me", requireAuth, async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req, res);
    if (!user) return;

    // Validate ownership before creating references to clothing items.
    const items = await validateOwnedItems(user._id, req.body.items || []);
    const outfit = await addOutfit({
      name: req.body.name,
      items,
      userId: user._id,
      style: req.body.style ?? "",
      favourite: req.body.favourite ?? false,
    });

    // Re-query through the service so the response shape matches list/update endpoints.
    const [populatedOutfit] = await getOutfits({
      userId: user._id,
      outfitId: outfit._id,
    });

    res.status(201).json(populatedOutfit);
  } catch (error) {
    if (error.errors) {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ errors: messages });
    }

    res.status(error.statusCode || 400).json({ error: error.message });
  }
});

// List outfits for the authenticated user with clothing items populated for frontend rendering.
router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req, res);
    if (!user) return;

    const outfits = await getOutfits({ userId: user._id });
    res.json(outfits);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// Partially update outfit metadata or replace its item list after ownership validation.
router.put("/me/:id", requireAuth, async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req, res);
    if (!user) return;

    // Only include fields that were explicitly supplied so partial updates preserve existing data.
    const update = {};

    if (Object.hasOwn(req.body, "name")) update.name = req.body.name;
    if (Object.hasOwn(req.body, "style")) update.style = req.body.style;
    if (Object.hasOwn(req.body, "favourite")) update.favourite = req.body.favourite;
    if (Object.hasOwn(req.body, "items")) {
      // Revalidate item ownership whenever the outfit composition changes.
      update.items = await validateOwnedItems(user._id, req.body.items);
    }

    const outfit = await updateOutfitForUser(req.params.id, user._id, update);
    if (!outfit) {
      return res.status(404).json({ error: "Outfit not found" });
    }

    res.json(outfit);
  } catch (error) {
    if (error.errors) {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ errors: messages });
    }

    res.status(error.statusCode || 400).json({ error: error.message });
  }
});

// Delete one outfit owned by the authenticated user.
router.delete("/me/:id", requireAuth, async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req, res);
    if (!user) return;

    const outfit = await deleteOutfitForUser(req.params.id, user._id);
    if (!outfit) {
      return res.status(404).json({ error: "Outfit not found" });
    }

    res.json({ message: "Outfit deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
