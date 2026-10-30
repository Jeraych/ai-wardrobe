const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { getUserByAuth0UserId } = require("../db/userService");
const Outfit = require("../models/Outfit");
const { generateImage, downloadReference } = require("../lib/openaiImage");
const { uploadToCloudinary } = require("../lib/cloudinary");

const generationSlots = require("../lib/generationSlots");

const router = express.Router();

// Generate and persist a virtual try-on preview for an owned outfit.
router.post("/", requireAuth, async (req, res) => {
  let lease;
  let providerStarted = false;
  let providerSettled = false;
  async function releaseSettledLease() {
    if (!lease || (providerStarted && !providerSettled)) return;
    const owner = lease;
    lease = undefined;
    try { await generationSlots.release(owner); }
    catch { console.error("Generation lease release failed; retained until expiry"); }
  }
  try {
    // Fail early with a configuration error before doing any database or provider work.
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "YOUR_OPENAI_API_KEY") {
      return res.status(503).json({ error: "OPENAI_API_KEY is not configured" });
    }

    const auth0UserId = req.auth.payload.sub;
    const user = await getUserByAuth0UserId(auth0UserId);
    if (!user) return res.status(404).json({ error: "User not found" });

    // The model image and target outfit are both required to build the generation input.
    const { humanImageUrl, outfitId } = req.body;

    if (!humanImageUrl) return res.status(400).json({ error: "humanImageUrl is required" });
    if (!outfitId) return res.status(400).json({ error: "outfitId is required" });

    // Load outfit items so their image URLs and labels can be passed to the image model.
    const outfit = await Outfit.findById(outfitId);
    if (!outfit) return res.status(404).json({ error: "Outfit not found" });
    if (outfit.userId.toString() !== user._id.toString()) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Bound the reference set before population, downloads, or capacity allocation.
    if (!Array.isArray(outfit.items) || outfit.items.length > 6) {
      return res.status(400).json({ error: "Outfits may contain at most 6 garments" });
    }
    const itemCount = outfit.items.length;
    await outfit.populate("items");
    if (outfit.items.length !== itemCount || outfit.items.some(item => !item || item.userId?.toString() !== user._id.toString())) {
      return res.status(403).json({ error: "Outfit contains unavailable or unowned items" });
    }
    if (new Set(outfit.items.map(item => item.category)).size !== outfit.items.length) {
      return res.status(400).json({ error: "Outfit items must be from different categories" });
    }

    // The provider receives the user model first, followed by each available front-facing garment image.
    const garmentImageUrls = outfit.items.map(item => item.imageUrls?.front).filter(Boolean);
    if (garmentImageUrls.length === 0) {
      return res.status(400).json({ error: "No garment images found in this outfit" });
    }

    // Include item names and categories in the prompt so the generated preview reflects the full outfit.
    const clothingDescription = outfit.items
      .map((item) => `${item.name} (${item.category})`)
      .join(", ");

    lease = await generationSlots.acquire();
    if (!lease) {
      res.set("Retry-After", "30");
      return res.status(429).json({ success: false, error: "Generation is busy. Please try again later." });
    }

    // Preserve the existing OpenAI prompt and image settings.
    const images = await Promise.all([humanImageUrl, ...garmentImageUrls].map(downloadReference));
    providerStarted = true;
    const generationStartedAt = Date.now();
    const result = await generateImage(images, `Virtual try-on: dress the person in Image 1 in the clothing in the remaining references (${clothingDescription}). Preserve identity, face, body shape, garment colors and patterns. Show the complete outfit naturally.`);
    providerSettled = true;
    // Record performance evidence without identity, image URLs, prompts or credentials.
    const usage = Object.fromEntries(['input_tokens', 'output_tokens', 'total_tokens']
      .filter(key => Number.isFinite(result.usage?.[key]) && result.usage[key] >= 0)
      .map(key => [key, result.usage[key]]));
    const safeLabel = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,100}$/.test(value) ? value : undefined;
    console.info(JSON.stringify({ event: 'tryon_generated', elapsedMs: Date.now() - generationStartedAt,
      usage, requestId: safeLabel(result.requestId), model: safeLabel(process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2'),
      quality: safeLabel(process.env.OPENAI_IMAGE_QUALITY || 'low') }));
    await releaseSettledLease();
    const storedImageUrl = await uploadToCloudinary(result.buffer, "tryon-previews");

    // Save the latest preview URL on the outfit so it can be shown without regenerating.
    outfit.lastTryOnPreviewUrl = storedImageUrl;
    await outfit.save();

    res.json({ success: true, imageUrl: storedImageUrl });
  } catch (error) {
    if (error.generationSettled === true) providerSettled = true;
    await releaseSettledLease();
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

module.exports = router;
