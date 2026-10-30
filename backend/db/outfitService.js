const Outfit = require("../models/Outfit");

const addOutfit = (data) => Outfit.create(data);

// Populate outfit items for API responses so the frontend can render item names and images directly.
async function getOutfits({ userId, outfitId }) {
  const filter = {};

  if (userId) filter.userId = userId;
  if (outfitId) filter._id = outfitId;

  return Outfit.find(filter).populate({ path: "items", match: { userId } });
}

// Mutations include userId in the query so ownership is enforced at the database boundary.
const updateOutfitForUser = (id, userId, data) =>
  Outfit.findOneAndUpdate({ _id: id, userId }, data, {
    returnDocument: "after",
    runValidators: true,
  }).populate({ path: "items", match: { userId } });

const deleteOutfitForUser = (id, userId) =>
  Outfit.findOneAndDelete({ _id: id, userId });

const addItemToOutfit = (outfitId, userId, itemId) =>
  Outfit.findOneAndUpdate(
    { _id: outfitId, userId },
    { $push: { items: itemId } },
    { returnDocument: "after" }
  ).populate({ path: "items", match: { userId } });

const removeItemFromOutfit = (outfitId, userId, itemId) =>
  Outfit.findOneAndUpdate(
    { _id: outfitId, userId },
    { $pull: { items: itemId } },
    { returnDocument: "after" }
  ).populate({ path: "items", match: { userId } });

module.exports = {
  addOutfit,
  getOutfits,
  updateOutfitForUser,
  deleteOutfitForUser,
  addItemToOutfit,
  removeItemFromOutfit,
};
