const mongoose = require("mongoose");
const { createGenerationSlots, DOCUMENT_ID, LIMIT, LEASE_MS } = require("../lib/generationSlots");

let otherConnection;
let first;
let second;
beforeAll(async () => {
  // Separate connection objects simulate independent warm serverless instances.
  otherConnection = await mongoose.createConnection(mongoose.connection.getClient().s.url,
    { dbName: mongoose.connection.name }).asPromise();
  first = createGenerationSlots(mongoose.connection);
  second = createGenerationSlots(otherConnection);
});
afterAll(async () => { await otherConnection?.close(); });

test("50 concurrent claims across connections and module instances admit exactly 20", async () => {
  let isolatedModule;
  jest.isolateModules(() => { isolatedModule = require("../lib/generationSlots"); });
  expect(isolatedModule.createGenerationSlots).not.toBe(createGenerationSlots);
  const third = isolatedModule.createGenerationSlots(otherConnection);
  const clients = [first, second, third];
  const results = await Promise.all(Array.from({ length: 50 }, (_, i) => clients[i % 3].acquire()));
  const accepted = results.filter(Boolean);
  expect(accepted).toHaveLength(LIMIT);
  expect(new Set(accepted).size).toBe(LIMIT);
  expect(await first.acquire()).toBeNull();
  const document = await mongoose.connection.collection("generation_slots").findOne({ _id: DOCUMENT_ID });
  expect(document.leases).toHaveLength(20);
  expect(document.leases[0].expiresAt.getTime() - Date.now()).toBeGreaterThan(LEASE_MS - 60000);
  await second.release(accepted[0]);
  expect(await first.acquire()).toEqual(expect.any(String));
  expect(await second.acquire()).toBeNull();
});

test("expired crashed leases are reclaimed; old owners cannot release new leases", async () => {
  const owners = await Promise.all(Array.from({ length: LIMIT }, () => first.acquire()));
  const collection = mongoose.connection.collection("generation_slots");
  await collection.updateOne({ _id: DOCUMENT_ID, "leases.owner": owners[0] },
    { $set: { "leases.$.expiresAt": new Date(0) } });
  const replacement = await second.acquire();
  expect(replacement).toEqual(expect.any(String));
  expect(replacement).not.toBe(owners[0]);
  await first.release(owners[0]);
  await first.release(owners[0]);
  expect(await second.acquire()).toBeNull();
  const document = await collection.findOne({ _id: DOCUMENT_ID });
  expect(document.leases.some(lease => lease.owner === replacement)).toBe(true);
  await second.release(replacement);
  expect(await first.acquire()).toEqual(expect.any(String));
});

test("database unavailability fails closed", async () => {
  await expect(createGenerationSlots({ readyState: 0 }).acquire()).rejects.toMatchObject({ status: 503 });
  const broken = createGenerationSlots({ readyState: 1, collection: () => ({
    updateOne: async () => { throw new Error("database write failure"); },
  }) });
  await expect(broken.acquire()).rejects.toMatchObject({ status: 503 });
});
