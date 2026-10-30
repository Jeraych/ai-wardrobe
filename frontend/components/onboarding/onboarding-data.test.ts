import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultModelImageUrl } from "./onboarding-data";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
describe("configurable default-model assets", () => {
  it("derives fixed filenames from a configured base without changing local cards", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_MODEL_BASE_URL", "https://res.cloudinary.com/example/image/upload/default-models/");
    vi.resetModules();
    const { MODEL_OPTIONS, selectedDefaultModelImage } = await import("./onboarding-data");
    const filenames = ["Female-Model-1.jpg", "Female-Model-2.jpg", "Male-Model-1.jpg", "Male-Model-2.jpg"];
    MODEL_OPTIONS.forEach((model, index) => {
      expect(model.imageSrc).toBe(`/models/${filenames[index]}`);
      expect(selectedDefaultModelImage(model.id)).toBe(`https://res.cloudinary.com/example/image/upload/default-models/${filenames[index]}`);
    });
  });
  it("missing configuration produces no fake URLs and explains the upload alternative", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_MODEL_BASE_URL", "");
    vi.resetModules();
    const { MODEL_OPTIONS, selectedDefaultModelImage } = await import("./onboarding-data");
    expect(MODEL_OPTIONS.every(model => model.savedImageSrc === null)).toBe(true);
    expect(() => selectedDefaultModelImage("model-1")).toThrow("Please upload your own photo");
  });
  it.each(["", "not-a-url", "https://evil.example/image/upload/models", "http://res.cloudinary.com/example/image/upload/models"])(
    "invalid/unconfigured bases cannot create generation URLs: %s", base => {
      expect(defaultModelImageUrl("Female-Model-1.jpg", base)).toBeNull();
    },
  );
});
