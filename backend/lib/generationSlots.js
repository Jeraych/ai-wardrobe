const mongoose = require("mongoose");
const { randomUUID } = require("node:crypto");

const LIMIT = 20;
// Unknown provider outcomes outlive the HTTP function. Do not free them on abort.
const LEASE_MS = 24 * 60 * 60 * 1000;
const DOCUMENT_ID = "global-image-generation";
const WRITE_OPTIONS = { writeConcern: { w: "majority", wtimeoutMS: 10000 }, maxTimeMS: 10000 };

// Each process/connection uses the same Mongo document, never a local counter.
function createGenerationSlots(connection = mongoose.connection) {
  function collection() {
    if (connection.readyState !== 1) throw new Error("Generation capacity database unavailable");
    return connection.collection("generation_slots");
  }

  async function acquire() {
    try {
      const slots = collection();
      try {
        await slots.updateOne({ _id: DOCUMENT_ID }, { $setOnInsert: { leases: [] } },
          { ...WRITE_OPTIONS, upsert: true });
      } catch (error) {
        // Two cold starts may race to create the singleton; its _id remains unique.
        if (error.code !== 11000) throw error;
      }
      const owner = randomUUID();
      const liveLeases = { $filter: { input: "$leases", as: "lease",
        cond: { $gt: ["$$lease.expiresAt", "$$NOW"] } } };
      const result = await slots.findOneAndUpdate(
        { _id: DOCUMENT_ID, $expr: { $lt: [{ $size: liveLeases }, LIMIT] } },
        [{ $set: { leases: { $concatArrays: [liveLeases, [{ owner,
          expiresAt: { $add: ["$$NOW", LEASE_MS] } }]] } } }],
        { ...WRITE_OPTIONS, returnDocument: "after", includeResultMetadata: false },
      );
      return result ? owner : null;
    } catch {
      const error = new Error("Generation capacity unavailable. Please try again later.");
      error.status = 503;
      throw error;
    }
  }

  async function release(owner) {
    // Compare the unique owner, so an old worker cannot release a replacement lease.
    await collection().updateOne({ _id: DOCUMENT_ID }, { $pull: { leases: { owner } } }, WRITE_OPTIONS);
  }
  return { acquire, release };
}

module.exports = { ...createGenerationSlots(), createGenerationSlots, LIMIT, LEASE_MS, DOCUMENT_ID };
