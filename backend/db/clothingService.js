const ClothingItem = require("../models/ClothingItems");

const addItem = (data) => ClothingItem.create(data)

// Build filters dynamically so the same query supports closet listings and search facets.
async function getItems({ userId, category, size, fit }) {
  const filter = {};

  if (userId) filter.userId = userId;
  if (category) filter.category = category;
  if (size) filter.size = size;
  if (fit) filter.fit = fit;

  return ClothingItem.find(filter);
}

// Scope mutations by userId to prevent users from updating or deleting another user's closet item.
const updateItemForUser = (id, userId, data) =>
  ClothingItem.findOneAndUpdate({ _id: id, userId }, data, {
    returnDocument: "after",
    runValidators: true,
  });

const deleteItemForUser = (id, userId) =>
  ClothingItem.findOneAndDelete({ _id: id, userId });

module.exports = { addItem, getItems, updateItemForUser, deleteItemForUser };
