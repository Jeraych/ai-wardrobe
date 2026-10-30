import { type ClothingItem } from "@/components/ui/ItemCard";

// Keep previews visually stable by assigning common outfit categories to fixed grid slots.
const PREVIEW_CATEGORY_ORDER = ["Tops", "Outerwear", "Shoes", "Bottoms"] as const;

export function getOutfitPreviewItems(items: ClothingItem[]): (ClothingItem | null)[] {
  const usedIds = new Set<string>();
  const preview = PREVIEW_CATEGORY_ORDER.map((category) => {
    const match = items.find((item) => item.category === category && !usedIds.has(item.id));

    if (match) {
      usedIds.add(match.id);
      return match;
    }

    return null;
  });

  // Fill any empty preview slots with remaining items so accessories or dresses still appear.
  for (const item of items) {
    if (usedIds.has(item.id)) continue;

    const emptyIndex = preview.findIndex((slot) => slot === null);
    if (emptyIndex === -1) break;

    preview[emptyIndex] = item;
    usedIds.add(item.id);
  }

  return preview;
}

// Rehydrate an existing preview when opening a saved outfit; generation remains explicit.
export function getSavedTryOnState(outfit: { lastTryOnPreviewUrl?: string | null }) {
  const tryOnResultUrl = outfit.lastTryOnPreviewUrl || null;
  return { tryOnResultUrl, isTryOnActive: Boolean(tryOnResultUrl) };
}
