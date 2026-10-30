const mongoose = require("mongoose");

// Stores Auth0 identity plus wardrobe-specific profile and onboarding data.
const UserSchema = new mongoose.Schema({
  auth0UserId: { type: String, required: true, unique: true, immutable: true },
  name: { type: String, required: true, minlength: 2, maxlength: 20 },
  email: { type: String, required: true, unique: true, immutable: true },
  // Body profile fields are optional until onboarding/profile setup supplies them.
  bodyProfile: {
    age: { type: Number, min: 0 },
    height: { type: Number, min: 0 },
    weight: { type: Number, min: 0 },
    bodyType: String,
    gender: String,
  },
  // Style preferences can be an empty array when the user skips style selection.
  stylePreferences: [String],
  profilePhoto: { type: String },
  modelImage: { type: String },
  isCompleteOnboarding: { type: Boolean, default: false },
});

module.exports = mongoose.model("User", UserSchema);
