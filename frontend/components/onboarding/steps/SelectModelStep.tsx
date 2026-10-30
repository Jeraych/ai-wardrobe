"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import Image from "next/image";
import { useFormContext } from "react-hook-form";
import { BackButton } from "@/components/ui/BackButton";
import { Button } from "@/components/ui/Button";
import { UploadGuidelinesModal } from "@/components/ui/UploadGuidelinesModal";
import { ModelScroller } from "../ModelScroller";
import { MODEL_OPTIONS } from "../onboarding-data";
import { type OnboardingFormValues } from "../onboarding-schema";

interface SelectModelStepProps {
  onBack: () => void;
}

export function SelectModelStep({ onBack }: SelectModelStepProps) {
  const [showGuidelines, setShowGuidelines] = useState(false);
  const {
    register,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useFormContext<OnboardingFormValues>();
  const selectedFiles = watch("modelPhoto");
  const modelMode = watch("modelMode");
  const selectedModelId = watch("selectedModelId");
  const fileRegistration = register("modelPhoto");
  const hasPhoto = Boolean(selectedFiles?.[0]);
  const hasModelSelection = Boolean(selectedModelId);
  const uploadedPhotoPreviewUrl = useMemo(
    () => (selectedFiles?.[0] ? URL.createObjectURL(selectedFiles[0]) : null),
    [selectedFiles],
  );

  // Show the guidance first because photo quality strongly affects try-on results.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowGuidelines(true);
  }, []);

  // Selecting default models needs a concrete id for validation and final persistence.
  useEffect(() => {
    if (modelMode === "select" && !selectedModelId && MODEL_OPTIONS[0]) {
      setValue("selectedModelId", MODEL_OPTIONS[0].id, { shouldDirty: true });
    }
  }, [modelMode, selectedModelId, setValue]);

  // Revoke object URLs to avoid leaking browser memory when replacing uploads.
  useEffect(() => {
    return () => {
      if (uploadedPhotoPreviewUrl) {
        URL.revokeObjectURL(uploadedPhotoPreviewUrl);
      }
    };
  }, [uploadedPhotoPreviewUrl]);

  // Dropping a file switches the step back into upload mode.
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();

    const files = event.dataTransfer.files;
    if (!files?.length) {
      return;
    }

    setValue("modelMode", "upload", { shouldDirty: true });
    setValue("modelPhoto", files, { shouldDirty: true, shouldValidate: true });
  };

  // Let react-hook-form capture the FileList, then mark upload as the selected mode.
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    fileRegistration.onChange(event);
    setValue("modelMode", "upload", { shouldDirty: true });
  };

  return (
    <>
      <BackButton onClick={onBack} className="mb-6">
        ← Back
      </BackButton>

      {modelMode !== "select" ? (
        <>
          <h1 className="text-3xl font-bold text-neutral-900">
            Upload an image of yourself
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            Upload a <b> full-body </b> and <b> portrait </b> photo of yourself
            or select our existing models. You can select a model or upload your
            photo later in your profile. Maximum upload size: 4 MB.
          </p>

          <div className="mx-auto w-full max-w-md">
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setShowGuidelines(true)}
                className="inline-flex items-center gap-2 text-sm font-bold text-[#58CC02] transition-colors hover:text-[#46A302]"
              >
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
                Photo Guidelines
              </button>
            </div>

            <div
              onClick={() =>
                document.getElementById("onboarding-photo")?.click()
              }
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
              className="relative my-8 flex aspect-[3/4] w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-neutral-200 bg-transparent p-6 transition-colors hover:bg-neutral-50"
            >
              <input
                {...fileRegistration}
                id="onboarding-photo"
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handleFileChange}
              />
              {uploadedPhotoPreviewUrl ? (
                <>
                  <Image
                    src={uploadedPhotoPreviewUrl}
                    alt="Uploaded photo preview"
                    fill
                    unoptimized
                    className="object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-4 pb-4 pt-10">
                    <p className="truncate text-sm font-semibold text-white">
                      {selectedFiles?.[0]?.name}
                    </p>
                    <p className="mt-1 text-xs font-medium text-white/80">
                      Click or drop to replace
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <Image
                    src="/upload.svg"
                    alt="Upload icon"
                    width={64}
                    height={64}
                    className="mb-4 h-auto w-auto"
                  />

                  <p className="text-sm font-medium text-neutral-900">
                    Drag and Drop file here or{" "}
                    <span className="font-bold underline">Choose file</span>
                  </p>
                </>
              )}
              {errors.modelPhoto ? (
                <p className="absolute inset-x-4 bottom-4 rounded-md bg-white/95 px-3 py-2 text-xs text-red-600 shadow-sm">
                  {errors.modelPhoto.message}
                </p>
              ) : null}
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full rounded-xl bg-[#58CC02] py-6 text-sm font-bold uppercase tracking-wide text-white hover:bg-[#46A302]"
              disabled={isSubmitting || !hasPhoto}
            >
              Upload Photo
            </Button>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() =>
                  setValue("modelMode", "select", { shouldDirty: true })
                }
                className="text-sm font-bold text-[#58CC02] hover:text-[#46A302]"
              >
                or select a default model
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <h1 className="mb-2 text-3xl font-bold text-neutral-900">
            Choose a model
          </h1>
          <p className="mb-4 text-sm text-neutral-500">
            The center card is the active model. Tap either side preview to
            switch.
          </p>

          <div className="mx-auto w-full max-w-4xl">
            <div className="mb-8">
              <ModelScroller
                items={MODEL_OPTIONS}
                selectedId={selectedModelId}
                onSelect={(id) => {
                  setValue("selectedModelId", id, { shouldDirty: true });
                  setValue("modelMode", "select", { shouldDirty: true });
                }}
              />
            </div>
            {errors.selectedModelId ? (
              <p className="mb-3 text-xs text-red-600">
                {errors.selectedModelId.message}
              </p>
            ) : null}

            <Button
              type="submit"
              size="lg"
              className="w-full rounded-xl bg-[#58CC02] py-6 text-sm font-bold uppercase tracking-wide text-white hover:bg-[#46A302]"
              disabled={isSubmitting || (modelMode === "select" ? !hasModelSelection : !hasPhoto)}
            >
              Select Model
            </Button>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() =>
                  setValue("modelMode", "upload", { shouldDirty: true })
                }
                className="text-sm font-bold text-[#58CC02] hover:text-[#46A302]"
              >
                or upload your model
              </button>
            </div>
          </div>
        </>
      )}

      {showGuidelines ? (
        <UploadGuidelinesModal
          type="profile"
          onClose={() => setShowGuidelines(false)}
        />
      ) : null}
    </>
  );
}
