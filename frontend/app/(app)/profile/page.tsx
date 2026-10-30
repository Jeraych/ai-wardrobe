"use client";

import { imageSizeError } from "@/lib/uploads";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { UploadGuidelinesModal } from "@/components/ui/UploadGuidelinesModal";
import { getAuthHeaders } from "@/lib/api/auth";
import { getStyleAvatarEmoji } from "@/lib/profile/avatar";
import {
  BODY_SHAPES,
  GENDERS,
  STYLE_OPTIONS,
  type BodyShape,
  type Gender,
  type StyleOption,
} from "@/components/onboarding/onboarding-data";

const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5001")
  .replace(/\/+$/, "");

interface BodyProfileState {
  age: string;
  height: string;
  weight: string;
  bodyShape: BodyShape | null;
  gender: Gender | null;
}

interface BodyProfileErrors {
  age?: string;
  gender?: string;
}

type BodyProfileAutoSaveState =
  | "idle"
  | "pending"
  | "saving"
  | "saved"
  | "incomplete"
  | "error";

const initialBodyProfile: BodyProfileState = {
  age: "",
  height: "",
  weight: "",
  bodyShape: null,
  gender: null,
};

interface ApiUserProfile {
  name?: string;
  bodyProfile?: {
    age?: number | null;
    height?: number | null;
    weight?: number | null;
    bodyType?: string | null;
    gender?: string | null;
  };
  stylePreferences?: string[];
  profilePhoto?: string | null;
  modelImage?: string | null;
}

function isBodyShape(value: string | null | undefined): value is BodyShape {
  return BODY_SHAPES.includes(value as BodyShape);
}

function isGender(value: string | null | undefined): value is Gender {
  return GENDERS.includes(value as Gender);
}

function isStyleOption(value: string): value is StyleOption {
  return STYLE_OPTIONS.includes(value as StyleOption);
}

// Convert optional backend numbers into controlled text inputs.
function toInputValue(value: number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

// Empty optional measurement fields should clear the backend value instead of becoming zero.
function toNullableNumber(value: string) {
  return value.trim() === "" ? null : Number(value);
}

function serializeBodyProfile(bodyProfile: BodyProfileState) {
  return JSON.stringify(bodyProfile);
}

function serializePreferredStyles(preferredStyles: StyleOption[]) {
  return JSON.stringify(preferredStyles);
}

function validateBodyProfile(
  bodyProfile: BodyProfileState,
): BodyProfileErrors {
  const errors: BodyProfileErrors = {};
  const trimmedAge = bodyProfile.age.trim();

  if (!trimmedAge) {
    errors.age = "Age is required.";
  } else if (!Number.isFinite(Number(trimmedAge))) {
    errors.age = "Age must be a number.";
  } else if (Number(trimmedAge) < 0) {
    errors.age = "Age must be a non-negative number.";
  }

  if (!bodyProfile.gender) {
    errors.gender = "Gender is required.";
  }

  return errors;
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

async function parseError(response: Response, fallback: string) {
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

export default function ProfilePage() {
  const [accountName, setAccountName] = useState("Profile");
  const [wardrobeItems, setWardrobeItems] = useState(0);
  const [savedOutfits, setSavedOutfits] = useState(0);
  const [bodyProfile, setBodyProfile] =
    useState<BodyProfileState>(initialBodyProfile);
  const [preferredStyles, setPreferredStyles] =
    useState<StyleOption[]>([]);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [accountSaving, setAccountSaving] = useState(false);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [bodyProfileErrors, setBodyProfileErrors] =
    useState<BodyProfileErrors>({});
  const [bodyAutoSaveState, setBodyAutoSaveState] =
    useState<BodyProfileAutoSaveState>("idle");
  const [stylesAutoSaveState, setStylesAutoSaveState] =
    useState<BodyProfileAutoSaveState>("idle");
  const [showGuidelines, setShowGuidelines] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasInitialisedBodyProfile = useRef(false);
  const lastSavedBodyProfile = useRef(serializeBodyProfile(initialBodyProfile));
  const latestBodySaveRequest = useRef(0);
  const hasInitialisedPreferredStyles = useRef(false);
  const lastSavedPreferredStyles = useRef(serializePreferredStyles([]));
  const latestStylesSaveRequest = useRef(0);

  const styleSummary = useMemo(() => {
    if (preferredStyles.length === 0) {
      return "No styles selected";
    }

    return preferredStyles
      .map((style) => style.replace(/^[^\w]+ /, ""))
      .join(", ");
  }, [preferredStyles]);
  const avatarEmoji = useMemo(
    () => getStyleAvatarEmoji(preferredStyles),
    [preferredStyles],
  );

  // Load profile details and counts together so the summary cards reflect the same account state.
  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      setErrorMessage(null);

      try {
        const headers = await getAuthHeaders();
        const [profileResponse, clothingResponse, outfitsResponse] =
          await Promise.all([
            fetch(`${apiUrl}/api/users/me`, { headers }),
            fetch(`${apiUrl}/api/clothingItems/me`, { headers }),
            fetch(`${apiUrl}/api/outfits/me`, { headers }),
          ]);

        if (!profileResponse.ok) {
          throw new Error(
            await parseError(profileResponse, "Failed to load profile"),
          );
        }

        const profile = (await profileResponse.json()) as ApiUserProfile;

        // Counts are nice-to-have; profile data is the only request that blocks the page.
        const clothingItems = clothingResponse.ok
          ? ((await clothingResponse.json()) as unknown[])
          : [];
        const outfits = outfitsResponse.ok
          ? ((await outfitsResponse.json()) as unknown[])
          : [];

        if (cancelled) {
          return;
        }

        setAccountName(profile.name ?? "Profile");
        setWardrobeItems(clothingItems.length);
        setSavedOutfits(outfits.length);
        setPhotoPreview(profile.profilePhoto ?? profile.modelImage ?? null);
        setBodyProfile({
          age: toInputValue(profile.bodyProfile?.age),
          height: toInputValue(profile.bodyProfile?.height),
          weight: toInputValue(profile.bodyProfile?.weight),
          bodyShape: isBodyShape(profile.bodyProfile?.bodyType)
            ? profile.bodyProfile.bodyType
            : null,
          gender: isGender(profile.bodyProfile?.gender)
            ? profile.bodyProfile.gender
            : null,
        });
        setPreferredStyles(
          (profile.stylePreferences ?? []).filter(isStyleOption),
        );
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : "Failed to load profile",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, []);

  function updateBodyProfile<Field extends keyof BodyProfileState>(
    field: Field,
    value: BodyProfileState[Field]
  ) {
    setBodyProfile((current) => ({ ...current, [field]: value }));

    // Clear field-level errors as soon as the user edits the field that caused them.
    setBodyProfileErrors((current) => {
      if (field !== "age" && field !== "gender") {
        return current;
      }

      const next = { ...current };
      if (field === "age") {
        delete next.age;
      } else {
        delete next.gender;
      }
      return next;
    });
  }

  // Style chips are stored as a replace-all array, matching the backend PATCH endpoint.
  function toggleStyle(style: StyleOption) {
    setPreferredStyles((current) =>
      current.includes(style)
        ? current.filter((item) => item !== style)
        : [...current, style]
    );
  }

  // Saving the account name also notifies the sidebar so it can update without a full reload.
  async function handleSaveAccount() {
    setAccountSaving(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`${apiUrl}/api/users/me/profile`, {
        method: "PATCH",
        headers: await getAuthHeaders(true),
        body: JSON.stringify({ name: accountName }),
      });

      if (!response.ok) {
        throw new Error(
          await parseError(response, "Failed to save profile details"),
        );
      }

      setStatusMessage("Profile details saved.");
      window.dispatchEvent(
        new CustomEvent("user-profile-updated", {
          detail: { name: accountName },
        }),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to save profile details",
      );
    } finally {
      setAccountSaving(false);
    }
  }

  async function saveBodyProfile(nextBodyProfile: BodyProfileState, requestId: number) {
    setErrorMessage(null);
    setBodyAutoSaveState("saving");
    const validationErrors = validateBodyProfile(nextBodyProfile);

    if (Object.keys(validationErrors).length > 0) {
      setBodyProfileErrors(validationErrors);
      setBodyAutoSaveState("incomplete");
      return;
    }

    setBodyProfileErrors({});

    try {
      const response = await fetch(`${apiUrl}/api/users/me/body-profile`, {
        method: "PATCH",
        headers: await getAuthHeaders(true),
        body: JSON.stringify({
          age: Number(nextBodyProfile.age),
          height: toNullableNumber(nextBodyProfile.height),
          weight: toNullableNumber(nextBodyProfile.weight),
          bodyShape: nextBodyProfile.bodyShape,
          gender: nextBodyProfile.gender,
        }),
      });

      if (!response.ok) {
        throw new Error(
          await parseError(response, "Failed to save body profile"),
        );
      }

      if (requestId !== latestBodySaveRequest.current) {
        return;
      }

      lastSavedBodyProfile.current = serializeBodyProfile(nextBodyProfile);
      setBodyAutoSaveState("saved");
    } catch (error) {
      if (requestId !== latestBodySaveRequest.current) {
        return;
      }

      setBodyAutoSaveState("error");
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to save body profile",
      );
    }
  }

  useEffect(() => {
    if (loading) {
      return;
    }

    const snapshot = serializeBodyProfile(bodyProfile);

    if (!hasInitialisedBodyProfile.current) {
      hasInitialisedBodyProfile.current = true;
      lastSavedBodyProfile.current = snapshot;
      setBodyAutoSaveState(
        Object.keys(validateBodyProfile(bodyProfile)).length > 0
          ? "incomplete"
          : "saved",
      );
      return;
    }

    if (snapshot === lastSavedBodyProfile.current) {
      setBodyAutoSaveState(
        Object.keys(validateBodyProfile(bodyProfile)).length > 0
          ? "incomplete"
          : "saved",
      );
      return;
    }

    const validationErrors = validateBodyProfile(bodyProfile);
    if (Object.keys(validationErrors).length > 0) {
      setBodyProfileErrors(validationErrors);
      setBodyAutoSaveState("incomplete");
      return;
    }

    setBodyProfileErrors({});
    setBodyAutoSaveState("pending");
    const requestId = latestBodySaveRequest.current + 1;
    latestBodySaveRequest.current = requestId;

    const timeoutId = window.setTimeout(() => {
      void saveBodyProfile(bodyProfile, requestId);
    }, 700);

    return () => window.clearTimeout(timeoutId);
  }, [bodyProfile, loading]);

  async function savePreferredStyles(
    nextPreferredStyles: StyleOption[],
    requestId: number,
  ) {
    setErrorMessage(null);
    setStylesAutoSaveState("saving");

    try {
      const response = await fetch(`${apiUrl}/api/users/me/style-preferences`, {
        method: "PATCH",
        headers: await getAuthHeaders(true),
        body: JSON.stringify({ stylePreferences: nextPreferredStyles }),
      });

      if (!response.ok) {
        throw new Error(
          await parseError(response, "Failed to save style preferences"),
        );
      }

      if (requestId !== latestStylesSaveRequest.current) {
        return;
      }

      lastSavedPreferredStyles.current =
        serializePreferredStyles(nextPreferredStyles);
      setStylesAutoSaveState("saved");
      window.dispatchEvent(
        new CustomEvent("user-profile-updated", {
          detail: { stylePreferences: nextPreferredStyles },
        }),
      );
    } catch (error) {
      if (requestId !== latestStylesSaveRequest.current) {
        return;
      }

      setStylesAutoSaveState("error");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to save style preferences",
      );
    }
  }

  useEffect(() => {
    if (loading) {
      return;
    }

    const snapshot = serializePreferredStyles(preferredStyles);

    if (!hasInitialisedPreferredStyles.current) {
      hasInitialisedPreferredStyles.current = true;
      lastSavedPreferredStyles.current = snapshot;
      setStylesAutoSaveState("saved");
      return;
    }

    if (snapshot === lastSavedPreferredStyles.current) {
      setStylesAutoSaveState("saved");
      return;
    }

    setStylesAutoSaveState("pending");
    const requestId = latestStylesSaveRequest.current + 1;
    latestStylesSaveRequest.current = requestId;

    const timeoutId = window.setTimeout(() => {
      void savePreferredStyles(preferredStyles, requestId);
    }, 700);

    return () => window.clearTimeout(timeoutId);
  }, [preferredStyles, loading]);

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const sizeError = imageSizeError(file);
    if (sizeError) {
      setErrorMessage(sizeError);
      event.target.value = "";
      return;
    }
    setPhotoName(file.name);
    setPhotoPreview(URL.createObjectURL(file));
    setPhotoSaving(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch(`${apiUrl}/api/users/me/photo/upload`, {
        method: "POST",
        headers: await getAuthHeaders(),
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await parseError(response, "Failed to upload photo"));
      }

      const result = (await response.json()) as { modelImage?: string };

      if (result.modelImage) {
        setPhotoPreview(result.modelImage);
      }

      setStatusMessage("Profile photo uploaded.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to upload photo",
      );
    } finally {
      setPhotoSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Profile"
        subtitle="View your account details and update styling preferences."
      />

      <div className="flex flex-1 flex-col gap-8 overflow-y-auto px-10 py-8">
        {(statusMessage || errorMessage) && (
          <div
            className={
              errorMessage
                ? "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                : "rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
            }
          >
            {errorMessage ?? statusMessage}
          </div>
        )}

        <section className="grid gap-6 xl:grid-cols-[minmax(260px,340px)_minmax(0,840px)] xl:items-start">
          <Card className="p-6">
            <div className="flex flex-col items-center text-center">
              <div className="group relative mx-auto h-24 w-24">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoPreview || "/default-avatar.png"}
                  alt="Profile photo"
                  onError={(event) => {
                    if (!photoPreview) {
                      event.currentTarget.style.opacity = "0";
                    }
                  }}
                  style={{ opacity: photoPreview ? 1 : undefined }}
                  className="h-24 w-24 rounded-full border border-border bg-neutral-100 object-cover"
                />
                {!photoPreview ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full text-4xl"
                  >
                    {avatarEmoji}
                  </span>
                ) : null}
                <label
                  htmlFor="profile-photo"
                  className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <CameraIcon className="h-6 w-6 text-white" />
                  <span className="mt-1 text-xs text-white">Change</span>
                  <input
                    id="profile-photo"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoChange}
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={() => setShowGuidelines(true)}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#58CC02] transition-colors hover:text-[#46A302]"
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
              {(photoSaving || photoName) && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {photoSaving ? "Uploading..." : photoName}
                </p>
              )}

              <h2 className="mt-4 text-xl font-bold text-foreground">
                {loading ? "Loading..." : accountName}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {styleSummary}
              </p>
            </div>

            <div className="mt-6">
              <ProfileField label="Display name">
                <input
                  type="text"
                  maxLength={20}
                  value={accountName}
                  disabled={loading}
                  onChange={(event) => setAccountName(event.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-white px-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:bg-neutral-50"
                />
              </ProfileField>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-3 w-full"
                disabled={accountSaving || loading}
                onClick={handleSaveAccount}
              >
                {accountSaving ? "Saving" : "Save details"}
              </Button>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border bg-neutral-50 p-4">
                <div className="text-2xl font-bold">
                  {wardrobeItems}
                </div>
                <div className="mt-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Wardrobe items
                </div>
              </div>
              <div className="rounded-xl border border-border bg-neutral-50 p-4">
                <div className="text-2xl font-bold">
                  {savedOutfits}
                </div>
                <div className="mt-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Saved outfits
                </div>
              </div>
            </div>
          </Card>

          <div className="flex min-w-0 flex-col gap-6">
            <Card className="p-5 md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Body profile</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    These details help personalise fit and outfit suggestions.
                  </p>
                </div>
                <AutoSaveIndicator
                  state={bodyAutoSaveState}
                  loading={loading}
                  incompleteLabel="Add age and gender"
                />
              </div>

              <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
                <div className="flex flex-col gap-5">
                  <ProfileField label="Age *">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={bodyProfile.age}
                      aria-invalid={Boolean(bodyProfileErrors.age)}
                      onChange={(event) =>
                        updateBodyProfile("age", event.target.value)
                      }
                      className="h-11 w-full rounded-xl border border-border bg-white px-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                    />
                    {bodyProfileErrors.age ? (
                      <p className="mt-2 text-xs font-medium text-red-600">
                        {bodyProfileErrors.age}
                      </p>
                    ) : null}
                  </ProfileField>
                  <ProfileField label="Height (cm) (optional)">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={bodyProfile.height}
                      onChange={(event) =>
                        updateBodyProfile("height", event.target.value)
                      }
                      className="h-11 w-full rounded-xl border border-border bg-white px-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                    />
                  </ProfileField>
                  <ProfileField label="Weight (kg) (optional)">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={bodyProfile.weight}
                      onChange={(event) =>
                        updateBodyProfile("weight", event.target.value)
                      }
                      className="h-11 w-full rounded-xl border border-border bg-white px-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                    />
                  </ProfileField>
                </div>

                <div className="flex flex-col gap-6">
                  <ProfileField label="Body shape (optional)">
                    <div className="flex flex-wrap gap-3">
                      {BODY_SHAPES.map((shape) => (
                        <Chip
                          key={shape}
                          type="button"
                          selected={bodyProfile.bodyShape === shape}
                          onClick={() => updateBodyProfile("bodyShape", shape)}
                        >
                          {shape}
                        </Chip>
                      ))}
                    </div>
                  </ProfileField>

                  <ProfileField label="Gender *">
                    <div className="flex flex-wrap gap-3">
                      {GENDERS.map((gender) => (
                        <Chip
                          key={gender}
                          type="button"
                          selected={bodyProfile.gender === gender}
                          onClick={() => updateBodyProfile("gender", gender)}
                        >
                          {gender}
                        </Chip>
                      ))}
                    </div>
                    {bodyProfileErrors.gender ? (
                      <p className="mt-2 text-xs font-medium text-red-600">
                        {bodyProfileErrors.gender}
                      </p>
                    ) : null}
                  </ProfileField>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Preferred style</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Choose the style directions you want outfits to lean toward.
                  </p>
                </div>
                <AutoSaveIndicator
                  state={stylesAutoSaveState}
                  loading={loading}
                  incompleteLabel="Auto-save on"
                />
              </div>

              <div className="mt-6 flex flex-col gap-3">
                {STYLE_OPTIONS.map((style) => (
                  <Chip
                    key={style}
                    type="button"
                    selected={preferredStyles.includes(style)}
                    onClick={() => toggleStyle(style)}
                    className="h-auto w-full justify-start px-5 py-4 text-left"
                  >
                    {style}
                  </Chip>
                ))}
              </div>
            </Card>
          </div>
        </section>
      </div>

      {showGuidelines ? (
        <UploadGuidelinesModal
          type="profile"
          onClose={() => setShowGuidelines(false)}
        />
      ) : null}
    </>
  );
}

function ProfileField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="block">
      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function AutoSaveIndicator({
  state,
  loading,
  incompleteLabel,
}: {
  state: BodyProfileAutoSaveState;
  loading: boolean;
  incompleteLabel: string;
}) {
  let label = "Auto-save on";
  let toneClasses = "border-border bg-neutral-50 text-muted-foreground";
  let dotClasses = "bg-neutral-400";

  if (loading) {
    label = "Loading";
  } else if (state === "pending") {
    label = "Changes pending";
    toneClasses = "border-amber-200 bg-amber-50 text-amber-700";
    dotClasses = "bg-amber-500";
  } else if (state === "saving") {
    label = "Saving...";
    toneClasses = "border-sky-200 bg-sky-50 text-sky-700";
    dotClasses = "bg-sky-500";
  } else if (state === "saved") {
    label = "Saved";
    toneClasses = "border-emerald-200 bg-emerald-50 text-emerald-700";
    dotClasses = "bg-emerald-500";
  } else if (state === "incomplete") {
    label = incompleteLabel;
    toneClasses = "border-border bg-neutral-50 text-muted-foreground";
    dotClasses = "bg-neutral-400";
  } else if (state === "error") {
    label = "Couldn't save";
    toneClasses = "border-red-200 bg-red-50 text-red-700";
    dotClasses = "bg-red-500";
  }

  return (
    <div
      aria-live="polite"
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${toneClasses}`}
    >
      <span aria-hidden className={`h-2 w-2 rounded-full ${dotClasses}`} />
      {label}
    </div>
  );
}
