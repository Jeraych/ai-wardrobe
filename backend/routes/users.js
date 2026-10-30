const express = require("express");
const {
  addUser,
  getUserByAuth0UserId,
  updateUser,
  deleteUser,
} = require("../db/userService");
const { uploadToCloudinary } = require("../lib/cloudinary");
const { requireAuth } = require("../middleware/auth");
const upload = require("../middleware/upload");
const { authenticatedEmail } = require("../lib/authenticatedIdentity");
const router = express.Router();

// Only these profile fields can be patched from the frontend profile/onboarding flows.
const PROFILE_FIELDS = [
  "name",
  "bodyProfile",
  "stylePreferences",
  "profilePhoto",
  "modelImage",
];

// Normalize Mongoose validation errors into a consistent array response.
function getValidationMessages(error) {
  if (!error.errors) {
    return [error.message];
  }

  return Object.values(error.errors).map((fieldError) => fieldError.message);
}

// Optional measurements may be omitted or cleared, but supplied values must stay non-negative.
function toOptionalNumber(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === "") {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    const error = new Error(`${fieldName} must be a non-negative number`);
    error.status = 400;
    throw error;
  }

  return number;
}

// Required onboarding fields can be omitted during partial updates, but cannot be cleared.
function toRequiredNumberWhenPresent(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === "") {
    const error = new Error(`${fieldName} is required`);
    error.status = 400;
    throw error;
  }

  return toOptionalNumber(value, fieldName);
}

// Accept both current bodyType and older bodyShape payloads from frontend forms.
function buildBodyProfileUpdate(bodyProfile = {}) {
  const update = {};

  const age = toRequiredNumberWhenPresent(bodyProfile.age, "age");
  const height = toOptionalNumber(bodyProfile.height, "height");
  const weight = toOptionalNumber(bodyProfile.weight, "weight");

  if (age !== undefined) update.age = age;
  if (height !== undefined) update.height = height;
  if (weight !== undefined) update.weight = weight;

  if (bodyProfile.bodyType !== undefined) {
    update.bodyType = bodyProfile.bodyType;
  } else if (bodyProfile.bodyShape !== undefined) {
    update.bodyType = bodyProfile.bodyShape;
  }

  if (bodyProfile.gender !== undefined) {
    if (bodyProfile.gender === null || bodyProfile.gender === "") {
      const error = new Error("gender is required");
      error.status = 400;
      throw error;
    }

    update.gender = bodyProfile.gender;
  }

  return update;
}

// Build a whitelist-based update object so unsupported fields cannot be saved accidentally.
function buildProfileUpdate(body) {
  const update = {};

  if (body.name !== undefined) update.name = body.name;
  if (body.profilePhoto !== undefined) update.profilePhoto = body.profilePhoto;
  if (body.modelImage !== undefined) update.modelImage = body.modelImage;

  if (body.bodyProfile !== undefined) {
    update.bodyProfile = buildBodyProfileUpdate(body.bodyProfile);
  }

  if (body.stylePreferences !== undefined) {
    if (!Array.isArray(body.stylePreferences)) {
      const error = new Error("stylePreferences must be an array");
      error.status = 400;
      throw error;
    }

    update.stylePreferences = body.stylePreferences;
  }

  return update;
}

// Resolve the MongoDB user document for the authenticated Auth0 subject.
async function getAuthenticatedUser(req, res) {
  const auth0UserId = req.auth.payload.sub;
  const user = await getUserByAuth0UserId(auth0UserId);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return null;
  }

  return user;
}

// Create the app profile for an Auth0 user, or return it if it already exists.
router.post("/me/sync", requireAuth, async (req, res) => {
  try {
    const auth0UserId = req.auth.payload.sub;
    const existingUser = await getUserByAuth0UserId(auth0UserId);

    // Login sync is idempotent: repeat calls return the already-created profile.
    if (existingUser) {
      return res.json(existingUser);
    }

    const newUser = await addUser({
      auth0UserId,
      name: req.body.name,
      email: await authenticatedEmail(req),
    });
    res.status(201).json(newUser);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// Return the authenticated user's stored profile for dashboard, onboarding, and profile screens.
router.get("/me", requireAuth, async (req, res) => {
  try {
    const auth0UserId = req.auth.payload.sub;
    const user = await getUserByAuth0UserId(auth0UserId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// Update profile fields only; identity always belongs to the verified Auth0 subject.
router.put("/me", requireAuth, async (req, res) => {
  try {
    const existingUser = await getAuthenticatedUser(req, res);
    if (!existingUser) {
      return;
    }

    const allowedFields = [...PROFILE_FIELDS, "isCompleteOnboarding"];
    if (Object.keys(req.body).some(field => !allowedFields.includes(field))) {
      return res.status(400).json({ error: "Unsupported profile fields" });
    }
    const update = buildProfileUpdate(req.body);
    if (Object.hasOwn(req.body, "isCompleteOnboarding")) {
      if (typeof req.body.isCompleteOnboarding !== "boolean") {
        return res.status(400).json({ error: "isCompleteOnboarding must be a boolean" });
      }
      update.isCompleteOnboarding = req.body.isCompleteOnboarding;
    }
    const updatedUser = await updateUser(existingUser._id, { $set: update });
    res.json(updatedUser);
  } catch (error) {
    res
      .status(error.status || 400)
      .json({ errors: getValidationMessages(error) });
  }
});

// Update editable profile fields while rejecting unknown fields before they reach MongoDB.
router.patch("/me/profile", requireAuth, async (req, res) => {
  try {
    const existingUser = await getAuthenticatedUser(req, res);
    if (!existingUser) {
      return;
    }

    // Validate the payload shape before normalizing nested profile fields.
    const unsupportedFields = Object.keys(req.body).filter(
      (field) => !PROFILE_FIELDS.includes(field),
    );

    if (unsupportedFields.length > 0) {
      return res.status(400).json({
        error: `Unsupported profile fields: ${unsupportedFields.join(", ")}`,
      });
    }

    const update = buildProfileUpdate(req.body);
    const updatedUser = await updateUser(existingUser._id, update);

    res.json(updatedUser);
  } catch (error) {
    res
      .status(error.status || 400)
      .json({ errors: getValidationMessages(error) });
  }
});

// Patch body measurements without overwriting existing optional values that were not submitted.
router.patch("/me/body-profile", requireAuth, async (req, res) => {
  try {
    const existingUser = await getAuthenticatedUser(req, res);
    if (!existingUser) {
      return;
    }

    // Merge existing subdocument values with the normalized partial update.
    const bodyProfile = {
      ...existingUser.bodyProfile?.toObject?.(),
      ...buildBodyProfileUpdate(req.body),
    };
    const updatedUser = await updateUser(existingUser._id, { bodyProfile });

    res.json(updatedUser);
  } catch (error) {
    res
      .status(error.status || 400)
      .json({ errors: getValidationMessages(error) });
  }
});

// Replace the style preference list, including the valid empty list used when onboarding is skipped.
router.patch("/me/style-preferences", requireAuth, async (req, res) => {
  try {
    const existingUser = await getAuthenticatedUser(req, res);
    if (!existingUser) {
      return;
    }

    const { stylePreferences } = req.body;

    if (!Array.isArray(stylePreferences)) {
      return res.status(400).json({ error: "stylePreferences must be an array" });
    }

    const updatedUser = await updateUser(existingUser._id, { stylePreferences });

    res.json(updatedUser);
  } catch (error) {
    res
      .status(error.status || 400)
      .json({ errors: getValidationMessages(error) });
  }
});

// Store a profile photo URL that has already been uploaded or selected by the client.
router.put("/me/photo", requireAuth, async (req, res) => {
  try {
    const existingUser = await getAuthenticatedUser(req, res);
    if (!existingUser) {
      return;
    }

    const { profilePhoto } = req.body;
    if (!profilePhoto) {
      return res.status(400).json({ error: "profilePhoto is required" });
    }
    const user = await updateUser(existingUser._id, { profilePhoto });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({
      message: "Profile photo updated successfully",
      profilePhoto: user.profilePhoto,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Accept a multipart model/profile image upload and store the Cloudinary URL on the user.
router.post(
  "/me/photo/upload",
  requireAuth,
  upload.single("image"),
  async (req, res) => {
    try {
      const existingUser = await getAuthenticatedUser(req, res);
      if (!existingUser) {
        return;
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Uploaded model photos are stored as modelImage because the frontend uses them for try-on previews.
      const url = await uploadToCloudinary(req.file.buffer, "profiles");
      const user = await updateUser(existingUser._id, { modelImage: url });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        message: "Model image uploaded successfully",
        modelImage: user.modelImage,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
);

// Remove the authenticated user's app profile.
router.delete("/me", requireAuth, async (req, res) => {
  try {
    const existingUser = await getAuthenticatedUser(req, res);
    if (!existingUser) {
      return;
    }

    await deleteUser(existingUser._id);
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
