"use client";

import {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
  useTransition,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { type ClothingItem } from "@/components/ui/ItemCard";
import { cn } from "@/components/ui/cn";
import { getOutfitPreviewItems, getSavedTryOnState } from "@/components/outfits/preview";

const STYLES = [
  "Smart",
  "Casual",
  "Street",
  "Minimal",
  "Fun",
  "Dresses",
] as const;
type Style = (typeof STYLES)[number];

interface ApiClothingItem {
  _id: string;
  name: string;
  category: string;
  imageUrls?: { front?: string };
}

interface ApiProfile {
  modelImage?: string | null;
}

async function getAuthHeaders(
  includeJson = false,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (includeJson) headers["Content-Type"] = "application/json";
  const res = await fetch("/api/auth/token");
  if (res.ok) {
    const { token } = await res.json();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

// Convert backend enum categories into the labels shared by cards and closet components.
function toDisplayCategory(category: string) {
  switch (category) {
    case "lower_body":
      return "Bottoms";
    case "outerwear":
      return "Outerwear";
    case "shoes":
      return "Shoes";
    case "dresses":
      return "Dresses";
    default:
      return "Tops";
  }
}

function toClothingItem(item: ApiClothingItem): ClothingItem {
  return {
    id: item._id,
    name: item.name,
    category: toDisplayCategory(item.category),
    emoji: "👕",
    imageUrl: item.imageUrls?.front,
  };
}

async function parseApiError(response: Response, fallback: string) {
  const text = await response.text().catch(() => "");

  if (!text) {
    return fallback;
  }

  try {
    const body = JSON.parse(text) as { error?: string; errors?: string[] };
    return body.error ?? body.errors?.join(", ") ?? fallback;
  } catch {
    return text;
  }
}

// Compact closet picker grouped by outfit role, including dresses as top-level outfit bases.
function ClosetPanel({
  closetItems,
  selectedIds,
  onToggle,
  onGenerateTryOn,
  isGenerating,
  generateError,
}: {
  closetItems: ClothingItem[];
  selectedIds: Set<string>;
  onToggle: (item: ClothingItem) => void;
  onGenerateTryOn: () => void;
  isGenerating: boolean;
  generateError: string | null;
}) {
  const categoryGroups = [
    { title: "Tops", categories: ["Tops", "Dresses"] },
    { title: "Outerwear", categories: ["Outerwear"] },
    { title: "Bottoms", categories: ["Bottoms"] },
    { title: "Shoes", categories: ["Shoes"] },
  ];

  const sections = categoryGroups.map((group) => ({
    ...group,
    items: closetItems.filter((item) => group.categories.includes(item.category)),
  }));

  return (
    <div className="flex w-[260px] shrink-0 flex-col border-r border-border bg-white">
      <div className="border-b border-border px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Your Closet
        </p>
      </div>

      <div className="grid flex-1 grid-cols-2 grid-rows-2 gap-2 overflow-y-auto p-2">
        {sections.map((section) => (
          <div
            key={section.title}
            className="flex min-h-[120px] flex-col rounded-3xl border border-border bg-neutral-50 p-2"
          >
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section.title}
            </div>

            <div className="grid flex-1 grid-cols-2 gap-1">
              {section.items.length > 0 ? (
                section.items.map((item) => {
                  const selected = selectedIds.has(item.id);
                  return (
                    <button
                      key={item.id}
                      onClick={() => onToggle(item)}
                      className={cn(
                        "relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-border bg-white text-3xl transition-colors hover:bg-neutral-100",
                        selected && "bg-white ring-2 ring-inset ring-brand",
                      )}
                    >
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span aria-hidden>{item.emoji ?? "👕"}</span>
                      )}

                      <span
                        className={cn(
                          "absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] font-bold transition-colors",
                          selected
                            ? "border-brand bg-brand text-white"
                            : "border-neutral-300 bg-white text-transparent",
                        )}
                      >
                        ✕
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="col-span-2 flex h-full items-center justify-center rounded-2xl border border-dashed border-border bg-white/40 px-2 text-center text-[10px] text-muted-foreground">
                  No items
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col border-t border-border">
        <div className="p-4">
          <button
            onClick={onGenerateTryOn}
            disabled={isGenerating}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-colors",
              isGenerating
                ? "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400"
                : "border-accent bg-accent-soft text-accent hover:bg-accent/20",
            )}
          >
            {isGenerating ? (
              <>
                <span className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </span>
                Generating...
              </>
            ) : (
              <>
                <span aria-hidden>↺</span> Generate Try On
              </>
            )}
          </button>
        </div>

        {isGenerating && (
          <p className="px-4 pb-3 text-center text-xs text-muted-foreground">
            Generating your outfit...
          </p>
        )}

        {generateError && (
          <p className="px-4 pb-3 text-xs font-medium text-red-500">
            {generateError}
          </p>
        )}
      </div>
    </div>
  );
}

function TryOnPreview({
  isTryOnActive,
  isGenerating,
  tryOnResultUrl,
}: {
  isTryOnActive: boolean;
  isGenerating: boolean;
  tryOnResultUrl: string | null;
}) {
  const [dotStep, setDotStep] = useState(0);

  // Animate placeholder dots without re-rendering the whole builder state.
  useEffect(() => {
    if (!isGenerating) {
      setDotStep(0);
      return;
    }

    const interval = window.setInterval(() => {
      setDotStep((current) => (current + 1) % 3);
    }, 400);

    return () => window.clearInterval(interval);
  }, [isGenerating]);

  const dotText = [".", "..", "..."][dotStep];

  // Download through a blob URL so cross-origin image URLs still save with a friendly filename.
  async function handleDownload() {
    if (!tryOnResultUrl) return;

    try {
      const response = await fetch(tryOnResultUrl);
      const blob = await response.blob();

      const blobUrl = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = "try-on.png";

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Download failed", error);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-border px-6 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Try-On Preview
        </p>
      </div>

      <div className="relative flex flex-1 items-center justify-center bg-[#D4C5B0] p-6">
        <span className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm">
          <span className="text-accent">✦</span> AI styled
        </span>

        <span className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              isTryOnActive ? "bg-brand" : "bg-neutral-300",
            )}
          />
          Your photo
        </span>

        {tryOnResultUrl ? (
          <div className="w-full max-w-[440px] overflow-hidden rounded-[32px] border border-white/40 bg-white shadow-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={tryOnResultUrl}
              alt="Generated try-on preview"
              className="aspect-square w-full object-cover"
            />
            <div className="p-5">
              <Button
                variant="primary"
                size="lg"
                className="w-full rounded-xl"
                onClick={handleDownload}
              >
                Download image
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex w-full max-w-[440px] flex-col items-center rounded-[32px] border border-dashed border-white/60 bg-white/70 px-8 py-14 text-center shadow-xl backdrop-blur">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#C4A882] text-3xl shadow">
              {isGenerating ? dotText : "✦"}
            </div>
            <p className="mt-5 text-lg font-semibold text-foreground">
              {isGenerating ? `Generating your try-on${dotText}` : "Your try-on will appear here"}
            </p>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              {isGenerating
                ? "We are creating a styled preview using your saved profile photo and the selected outfit."
                : "Pick outfit pieces, then generate a try-on to replace this placeholder with the real image."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Right-side form owns outfit metadata while selection state stays in the parent builder.
function OutfitDetailsPanel({
  selectedItems,
  name,
  onNameChange,
  style,
  onStyleChange,
  onSave,
  onDiscard,
  canSave,
  errorMessage,
  saveStatus,
}: {
  selectedItems: ClothingItem[];
  name: string;
  onNameChange: (value: string) => void;
  style: Style | "";
  onStyleChange: (value: Style) => void;
  onSave: () => void;
  onDiscard: () => void;
  canSave: boolean;
  errorMessage?: string | null;
  saveStatus: string;
}) {
  const inputClass =
    "w-full rounded-xl border-2 border-border bg-neutral-50 px-4 py-3 text-sm font-medium text-foreground outline-none transition focus:border-accent focus:bg-white placeholder:text-muted-foreground";

  // Reuse the same four-slot preview logic as outfit cards for visual consistency.
  const previewItems = getOutfitPreviewItems(selectedItems);

  return (
    <div className="flex w-[280px] shrink-0 flex-col border-l border-border bg-white">
      <div className="border-b border-border px-6 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Outfit Details
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
        <div className="rounded-xl border border-border bg-neutral-50 px-3 py-2 text-sm text-muted-foreground">
          {saveStatus}
        </div>

        <div className="overflow-hidden rounded-2xl border border-border">
          <div className="border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Outfit Preview
          </div>
          <div className="grid grid-cols-2 bg-white">
            {previewItems.map((item, index) => (
              <div
                key={item?.id ?? `builder-preview-${index}`}
                className={cn(
                  "flex aspect-square items-center justify-center bg-neutral-100 text-4xl",
                  index % 2 === 0 ? "border-r border-border" : "",
                  index < 2 ? "border-b border-border" : "",
                )}
              >
                {item ? (
                  item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span aria-hidden>{item.emoji ?? "👕"}</span>
                  )
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g. My New Outfit"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Style
          </label>
          <div className="flex flex-wrap gap-2">
            {STYLES.map((entry) => (
              <button
                key={entry}
                onClick={() => onStyleChange(entry)}
                className={cn(
                  "rounded-full border-2 px-3 py-1.5 text-xs font-semibold transition-colors",
                  style === entry
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-border bg-white text-foreground hover:bg-neutral-50",
                )}
              >
                {entry}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-border px-6 py-5">
        {errorMessage && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </div>
        )}
        <Button
          variant="primary"
          size="lg"
          className="w-full rounded-xl"
          disabled={!canSave}
          onClick={onSave}
        >
          Save & Close
        </Button>
        <button
          onClick={onDiscard}
          className="text-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Discard Changes
        </button>
      </div>
    </div>
  );
}

export default function OutfitBuilderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialOutfitId = searchParams.get("id");
  const isEditing = Boolean(initialOutfitId);
  const starterItems = searchParams.get("items");
  const starterName = searchParams.get("name");
  const starterStyle = searchParams.get("style");
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5001")
    .replace(/\/+$/, "");

  const [closetItems, setClosetItems] = useState<ClothingItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isTryOnActive, setIsTryOnActive] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [currentOutfitId, setCurrentOutfitId] = useState<string | null>(
    initialOutfitId,
  );
  const [saveState, setSaveState] = useState<
    "idle" | "dirty" | "saving" | "saved" | "error"
  >(initialOutfitId ? "saved" : "idle");
  const [hasLoadedInitialOutfit, setHasLoadedInitialOutfit] = useState(!initialOutfitId);
  const [humanImageUrl, setHumanImageUrl] = useState<string | null>(null);
  const [isLoadingProfileImage, setIsLoadingProfileImage] = useState(true);
  const [isNavigatingAfterSave, startNavigatingAfterSave] = useTransition();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [tryOnResultUrl, setTryOnResultUrl] = useState<string | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSaveRequestRef = useRef(0);

  const [name, setName] = useState("");
  const [style, setStyle] = useState<Style | "">("");

  // Load closet items once so URL-prefilled item ids can resolve to full item records.
  const loadCloset = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/api/clothingItems/me`, {
        headers: await getAuthHeaders(),
      });
      if (!response.ok) throw new Error("Failed to load closet");
      const apiItems = (await response.json()) as ApiClothingItem[];
      setClosetItems(apiItems.map(toClothingItem));
    } catch (error) {
      console.error(error);
    }
  }, [apiUrl]);

  useEffect(() => {
    loadCloset();
  }, [loadCloset]);

  // The try-on endpoint requires a saved profile/model image before it can generate.
  useEffect(() => {
    async function loadProfileImage() {
      setIsLoadingProfileImage(true);

      try {
        const response = await fetch(`${apiUrl}/api/users/me`, {
          headers: await getAuthHeaders(),
        });
        if (!response.ok) throw new Error("Failed to load profile image");

        const profile = (await response.json()) as ApiProfile;
        setHumanImageUrl(profile.modelImage ?? null);
      } catch (error) {
        console.error(error);
        setHumanImageUrl(null);
      } finally {
        setIsLoadingProfileImage(false);
      }
    }

    loadProfileImage();
  }, [apiUrl]);

  // Home can open the builder with unsaved generated outfit details encoded in the URL.
  useEffect(() => {
    if (isEditing) return;

    let hasStarterState = false;

    if (starterItems) {
      const itemIds = starterItems
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      setSelectedIds(new Set(itemIds));
      hasStarterState = itemIds.length > 0;
    }

    if (starterName) {
      setName(starterName);
      hasStarterState = true;
    }

    if (starterStyle && STYLES.includes(starterStyle as Style)) {
      setStyle(starterStyle as Style);
      hasStarterState = true;
    }

    if (hasStarterState) {
      setSaveState("dirty");
    }
  }, [isEditing, starterItems, starterName, starterStyle]);

  // Editing an existing outfit loads the full record because the URL only carries the id.
  useEffect(() => {
    if (!initialOutfitId) return;

    async function loadExistingOutfit() {
      try {
        const response = await fetch(`${apiUrl}/api/outfits/me`, {
          headers: await getAuthHeaders(),
        });
        if (!response.ok) throw new Error("Failed to load outfits");

        const outfits = await response.json();
        const outfit = outfits.find((entry: { _id: string }) => entry._id === initialOutfitId);
        if (!outfit) return;

        const preview = getSavedTryOnState(outfit);
        setTryOnResultUrl(preview.tryOnResultUrl);
        setIsTryOnActive(preview.isTryOnActive);
        setName(outfit.name);
        setStyle(outfit.style ?? "");
        setSelectedIds(new Set(outfit.items.map((item: { _id: string }) => item._id)));
        setSaveState("saved");
      } catch (error) {
        console.error(error);
      } finally {
        setHasLoadedInitialOutfit(true);
      }
    }

    loadExistingOutfit();
  }, [initialOutfitId, apiUrl]);

  const selectedItems = useMemo(
    () => closetItems.filter((item) => selectedIds.has(item.id)),
    [closetItems, selectedIds],
  );

  // Match backend validation by preventing duplicate outfit item categories in the UI.
  const selectionError = useMemo(() => {
    const categories = selectedItems.map((item) => item.category);
    const duplicateCategory = categories.find(
      (category, index) => categories.indexOf(category) !== index,
    );

    if (!duplicateCategory) {
      return null;
    }

    return `Choose items from different categories. You selected multiple ${duplicateCategory}.`;
  }, [selectedItems]);

  const canPersistOutfit = selectedIds.size > 0 && !selectionError;

  const saveStatusMessage = useMemo(() => {
    if (selectionError) {
      return selectionError;
    }

    if (saveError) {
      return saveError;
    }

    if (isNavigatingAfterSave) {
      return "Saving changes and leaving builder...";
    }

    switch (saveState) {
      case "dirty":
        return "Unsaved changes. Saving automatically...";
      case "saving":
        return "Saving changes...";
      case "saved":
        return "All changes saved.";
      case "error":
        return "Autosave failed. We will try again on your next edit or when you generate a try-on.";
      default:
        return humanImageUrl
          ? "Using your saved profile try-on photo."
          : "Add a try-on photo in your profile to enable try-on generation.";
    }
  }, [humanImageUrl, isNavigatingAfterSave, saveError, saveState, selectionError]);

  // Shared save path for autosave, manual save, and try-on generation.
  const persistOutfit = useCallback(async () => {
    if (!hasLoadedInitialOutfit || !canPersistOutfit) {
      return currentOutfitId;
    }

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    const requestId = latestSaveRequestRef.current + 1;
    latestSaveRequestRef.current = requestId;
    setIsSaving(true);
    setSaveError(null);
    setSaveState("saving");

    try {
      const targetOutfitId = currentOutfitId;
      const url = targetOutfitId
        ? `${apiUrl}/api/outfits/me/${targetOutfitId}`
        : `${apiUrl}/api/outfits/me`;
      const method = targetOutfitId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: await getAuthHeaders(true),
        body: JSON.stringify({
          name: name.trim() || "My New Outfit",
          items: [...selectedIds],
          style: style || "",
        }),
      });

      if (!response.ok) {
        const message = await parseApiError(response, "Failed to save outfit");
        if (latestSaveRequestRef.current === requestId) {
          setSaveError(message);
          setSaveState("error");
        }
        return null;
      }

      const savedOutfit = (await response.json()) as { _id?: string };
      const savedOutfitId = savedOutfit._id ?? targetOutfitId ?? null;

      // Ignore slower responses from older save requests so state reflects the newest edit.
      if (latestSaveRequestRef.current === requestId) {
        setCurrentOutfitId(savedOutfitId);
        setSaveState("saved");
        setSaveError(null);
        if (!targetOutfitId && savedOutfitId) {
          router.replace(`/outfits/builder?id=${savedOutfitId}`);
        }
      }

      return savedOutfitId;
    } catch (error) {
      if (latestSaveRequestRef.current === requestId) {
        setSaveError("Failed to save outfit. Please try again.");
        setSaveState("error");
      }
      console.error(error);
      return null;
    } finally {
      if (latestSaveRequestRef.current === requestId) {
        setIsSaving(false);
      }
    }
  }, [
    apiUrl,
    canPersistOutfit,
    currentOutfitId,
    hasLoadedInitialOutfit,
    name,
    router,
    selectedIds,
    style,
  ]);

  function toggleItem(item: ClothingItem) {
    setSaveError(null);
    setSaveState("dirty");
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.add(item.id);
      }
      return next;
    });
  }

  // Save the latest outfit state before asking the backend to generate a try-on.
  async function handleGenerateTryOn() {
    if (isLoadingProfileImage) {
      setGenerateError("Loading your saved profile photo.");
      return;
    }

    if (!humanImageUrl) {
      setGenerateError("Add a try-on photo in your profile first.");
      return;
    }

    if (!canPersistOutfit) {
      setGenerateError(
        selectionError ?? "Add at least one outfit item before generating a try-on.",
      );
      return;
    }

    const savedOutfitId = await persistOutfit();
    if (!savedOutfitId) {
      setGenerateError("We couldn't save the latest outfit changes for try-on.");
      return;
    }

    setGenerateError(null);
    setTryOnResultUrl(null);
    setIsGenerating(true);
    setIsTryOnActive(true);

    try {
      const response = await fetch(`${apiUrl}/api/tryon`, {
        method: "POST",
        headers: await getAuthHeaders(true),
        body: JSON.stringify({
          humanImageUrl,
          outfitId: savedOutfitId,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? `Request failed (${response.status})`,
        );
      }

      const data = (await response.json()) as { success: boolean; imageUrl: string };
      setTryOnResultUrl(data.imageUrl);
    } catch (error) {
      setGenerateError(
        error instanceof Error ? error.message : "Something went wrong.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  // Manual save shares the autosave code path, then returns the user to the outfit library.
  async function handleSave() {
    if (isSaving || !canPersistOutfit) return;

    const savedOutfitId = await persistOutfit();
    if (!savedOutfitId) return;

    startNavigatingAfterSave(() => {
      router.push("/outfits");
    });
  }

  function handleDiscard() {
    router.push("/outfits");
  }

  const canSave = canPersistOutfit && !isSaving && !isNavigatingAfterSave;

  // Debounced autosave keeps the builder resilient without firing a request on every click.
  useEffect(() => {
    if (!hasLoadedInitialOutfit) return;
    if (!canPersistOutfit) return;
    if (saveState !== "dirty") return;

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(() => {
      void persistOutfit();
    }, 2500);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [canPersistOutfit, hasLoadedInitialOutfit, persistOutfit, saveState]);

  // Clear any pending autosave timer when the builder unmounts.
  useEffect(() => () => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
  }, []);

  return (
    <>
      <PageHeader
        title={isEditing ? "Edit outfit" : "Build an outfit"}
        right={(
          <button
            onClick={handleDiscard}
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            ✕ Discard Changes
          </button>
        )}
      />

      <div className="flex flex-1 overflow-hidden">
        <ClosetPanel
          closetItems={closetItems}
          selectedIds={selectedIds}
          onToggle={toggleItem}
          onGenerateTryOn={handleGenerateTryOn}
          isGenerating={isGenerating}
          generateError={generateError}
        />

        <TryOnPreview
          isTryOnActive={isTryOnActive}
          isGenerating={isGenerating}
          tryOnResultUrl={tryOnResultUrl}
        />

        <OutfitDetailsPanel
          selectedItems={selectedItems}
          name={name}
          onNameChange={(value) => {
            setSaveError(null);
            setSaveState("dirty");
            setName(value);
          }}
          style={style}
          onStyleChange={(value) => {
            setSaveError(null);
            setSaveState("dirty");
            setStyle(value);
          }}
          onSave={handleSave}
          onDiscard={handleDiscard}
          canSave={canSave}
          errorMessage={saveError}
          saveStatus={saveStatusMessage}
        />
      </div>
    </>
  );
}
