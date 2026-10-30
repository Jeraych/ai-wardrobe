"use client";

import { useState, useRef, type DragEvent, type ChangeEvent } from "react";
import { Button } from "@/components/ui/Button";
import { type ClothingItem } from "@/components/ui/ItemCard";
import { UploadGuidelinesModal } from "@/components/ui/UploadGuidelinesModal";
import { imageSizeError } from "@/lib/uploads";
import { cn } from "@/components/ui/cn";

interface EditItemPanelProps {
  item: ClothingItem;
  onCancel: () => void;
  onSave: (updated: ClothingItem, imageFile?: File) => void;
  onRemove: (item: ClothingItem) => void;
}

const SIZES = ["XS", "S", "M", "L", "XL"] as const;
const FITS = ["Relaxed", "Regular", "Slim"] as const;
const CATEGORIES = [
  { label: "Top", value: "Tops" },
  { label: "Bottom", value: "Bottoms" },
  { label: "Shoes", value: "Shoes" },
  { label: "Outerwear", value: "Outerwear" },
] as const;

const CATEGORY_VALUES = new Set<string>(
  CATEGORIES.map((category) => category.value),
);

// Side panel edits local display fields; the closet page persists them to the backend.
export function EditItemPanel({ item, onCancel, onSave, onRemove }: EditItemPanelProps) {
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState(
    CATEGORY_VALUES.has(item.category) ? item.category : "",
  );
  const [size, setSize] = useState(item.category === "Shoes" ? "" : item.size ?? "");
  const [fit, setFit] = useState(item.fit ?? "");

  // Start from the existing image URL, then swap to a local preview when a file is chosen.
  const [imagePreview, setImagePreview] = useState<string | null>(item.imageUrl ?? null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showGuidelines, setShowGuidelines] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Store the file separately from the preview URL so the parent can upload the original file.
  function handleFile(file: File) {
    const error = imageSizeError(file);
    setImageError(error);
    if (error) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleFileInput(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  // Clearing size when switching to shoes mirrors the backend shoe-size exception.
  function handleCategoryChange(nextCategory: string) {
    setCategory(nextCategory);
    if (nextCategory === "Shoes") setSize("");
  }

  // Return a preview-ready item immediately while passing the file for persistence.
  function handleSave() {
    const newImageUrl = imageFile
      ? URL.createObjectURL(imageFile)
      : item.imageUrl;

    onSave(
      {
        ...item,
        name,
        category,
        size: category === "Shoes" ? undefined : size,
        fit,
        imageUrl: newImageUrl,
      },
      imageFile ?? undefined,
    );
  }

  // Use a two-click delete guard because this panel has no separate confirmation modal.
  function handleRemove() {
    if (!confirmRemove) { setConfirmRemove(true); return; }
    onRemove(item);
  }

  const inputClass =
    "w-full rounded-xl border-2 border-border bg-neutral-50 px-4 py-2.5 text-sm font-medium text-foreground outline-none transition focus:border-accent focus:bg-white placeholder:text-muted-foreground";
  const isShoes = category === "Shoes";
  const canSave = Boolean(!imageError && category && fit && (isShoes || size));

  return (
    <div className="flex h-full w-[340px] shrink-0 flex-col border-l border-border bg-white shadow-2xl">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          ✕ Cancel
        </button>
        <span className="text-sm font-bold text-foreground">Edit item</span>
        {/* Spacer to keep title centred */}
        <div className="w-14" />
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
        {/* Image upload zone */}
        <div>
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            className={cn(
              "flex flex-col items-center justify-center rounded-2xl border-2 border-dashed cursor-pointer transition-colors",
              imagePreview ? "min-h-40" : "min-h-36",
              isDragging
                ? "border-brand bg-brand/5"
                : "border-border bg-neutral-50 hover:bg-neutral-100"
            )}
          >
            {imagePreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imagePreview}
                alt={name}
                className="h-full w-full max-h-40 rounded-2xl object-contain"
              />
            ) : (
              <>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-200 text-neutral-500 text-lg">
                  ↑
                </div>
                <p className="text-sm font-medium text-foreground">Click to upload or drag &amp; drop</p>
                <p className="mt-0.5 text-xs text-muted-foreground">JPG, PNG or HEIC (max 4 MB)</p>
              </>
            )}
          </div>
          {imageError ? <p role="alert" className="mt-2 text-xs text-red-600">{imageError}</p> : null}
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowGuidelines(true)}
              className="inline-flex w-fit items-center gap-1.5 text-xs font-bold text-[#58CC02] transition-colors hover:text-[#46A302]"
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
              Guidelines
            </button>
            <p className="text-xs leading-5 text-muted-foreground">
              Lay item flat on a plain background · No logos or offensive graphics
            </p>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/heic"
          className="hidden"
          onChange={handleFileInput}
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className={inputClass}
          >
            <option value="" disabled>
              Select a category
            </option>
            {CATEGORIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {!isShoes && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Size
            </label>
            <div className="flex gap-1.5">
              {SIZES.map((s) => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  className={cn(
                    "flex-1 rounded-xl border-2 py-2 text-xs font-semibold transition-colors",
                    size === s
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-border bg-white text-foreground hover:bg-neutral-50"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Fit toggle */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Fit
          </label>
          <div className="flex gap-1.5">
            {FITS.map((f) => (
              <button
                key={f}
                onClick={() => setFit(f)}
                className={cn(
                  "flex-1 rounded-xl border-2 py-2 text-xs font-semibold transition-colors",
                  fit === f
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-border bg-white text-foreground hover:bg-neutral-50"
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-col gap-3 border-t border-border px-6 py-5">
        <Button
          variant="primary"
          size="lg"
          className="w-full rounded-xl"
          onClick={handleSave}
          disabled={!canSave}
        >
          Save
        </Button>
        <button
          onClick={handleRemove}
          className={cn(
            "flex items-center justify-center gap-1.5 text-center text-sm font-medium transition-colors",
            confirmRemove
              ? "text-red-500 hover:text-red-600"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <span aria-hidden>🗑</span>
          {confirmRemove ? "Tap again to confirm removal" : "Remove"}
        </button>
      </div>

      {showGuidelines ? (
        <UploadGuidelinesModal
          type="garment"
          onClose={() => setShowGuidelines(false)}
        />
      ) : null}
    </div>
  );
}
