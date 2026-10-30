const mongoose = require('mongoose')

// Clothing items are owner-scoped closet records with optional multi-angle image URLs.
const ClothingItemSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User', immutable: true },

  name: { type: String, required: true, minlength: 1, maxlength: 30 },
  category: { type: String, required: true, enum: ['upper_body', 'lower_body', 'dresses', 'outerwear', 'shoes', 'accessories'] },
  // Shoe items intentionally skip size validation because footwear sizing is handled separately by the UI.
  size: {
    type: String,
    enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    required: function () {
      return (this.getUpdate?.().$set?.category ?? this.category) !== 'shoes'
    },
  },
  fit: { type: String, required: true, enum: ['tight', 'regular', 'loose'] },
  favourite: { type: Boolean, default: false },
  // Image slots let the closet keep front, back, and side photos independently.
  imageUrls: {
    front: String,
    back: String,
    side: String
  }
})

module.exports = mongoose.model('ClothingItem', ClothingItemSchema)
