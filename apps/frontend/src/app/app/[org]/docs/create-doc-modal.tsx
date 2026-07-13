"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DashboardButton,
  DashboardModal,
  FormField,
  ModalActions,
  ModalError,
  ModalHeader,
  fieldClassName,
} from "@/shared/ui/dashboard-primitives";

type CreateDocModalProps = {
  readonly org: string;
  /** Label for the open trigger button. Defaults to "New doc". */
  readonly triggerLabel?: string;
  /** Extra classes for the trigger button. */
  readonly triggerClassName?: string;
  /** Button tone for the trigger. Defaults to primary. */
  readonly triggerTone?: "primary" | "secondary";
};

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 64);
}

export function CreateDocModal({
  org,
  triggerLabel = "New doc",
  triggerClassName = "",
  triggerTone = "primary",
}: CreateDocModalProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [theme, setTheme] = useState("classic");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const resetForm = (): void => {
    setName("");
    setSlug("");
    setSlugTouched(false);
    setVisibility("public");
    setTheme("classic");
    setError(null);
    setLoading(false);
  };

  const handleOpen = (): void => {
    resetForm();
    setIsOpen(true);
  };

  const handleClose = (): void => {
    if (loading) {
      return;
    }
    setIsOpen(false);
  };

  const handleNameChange = (value: string): void => {
    setName(value);
    if (!slugTouched) {
      setSlug(slugify(value));
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch(`/app/${encodeURIComponent(org)}/docs/new`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          name,
          slug,
          visibility,
          theme,
        }).toString(),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        const errVal = typeof data["error"] === "string" ? data["error"] : "Could not create doc";
        setError(errVal);
        setLoading(false);
        return;
      }

      const data = (await response.json()) as Record<string, unknown>;
      if (typeof data["redirectUrl"] === "string") {
        setIsOpen(false);
        router.push(data["redirectUrl"]);
        router.refresh();
        return;
      }

      setError("Invalid response from server");
      setLoading(false);
    } catch {
      setError("Failed to connect to the server");
      setLoading(false);
    }
  };

  return (
    <>
      <DashboardButton className={triggerClassName} onClick={handleOpen} tone={triggerTone} type="button">
        {triggerLabel}
      </DashboardButton>

      {isOpen ? (
        <DashboardModal onClose={handleClose} onSubmit={handleSubmit}>
          <ModalHeader onClose={handleClose}>New doc</ModalHeader>
          {error !== null ? <ModalError>{error}</ModalError> : null}

          <FormField label="Name">
            <input
              autoFocus
              className={fieldClassName}
              name="name"
              onChange={(event) => handleNameChange(event.target.value)}
              placeholder="Payments API"
              required
              type="text"
              value={name}
            />
          </FormField>

          <FormField label="Slug">
            <input
              className={fieldClassName}
              name="slug"
              onChange={(event) => {
                setSlugTouched(true);
                setSlug(event.target.value);
              }}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              placeholder="payments-api"
              required
              type="text"
              value={slug}
            />
          </FormField>

          <FormField label="Visibility">
            <select
              className={fieldClassName}
              name="visibility"
              onChange={(event) => setVisibility(event.target.value === "private" ? "private" : "public")}
              value={visibility}
            >
              <option value="public">public</option>
              <option value="private">private</option>
            </select>
          </FormField>

          <FormField label="Theme">
            <input
              className={fieldClassName}
              name="theme"
              onChange={(event) => setTheme(event.target.value)}
              placeholder="classic"
              required
              type="text"
              value={theme}
            />
          </FormField>

          <ModalActions>
            <DashboardButton disabled={loading} onClick={handleClose} tone="secondary" type="button">
              Cancel
            </DashboardButton>
            <DashboardButton disabled={loading} type="submit">
              {loading ? "Creating..." : "Create doc"}
            </DashboardButton>
          </ModalActions>
        </DashboardModal>
      ) : null}
    </>
  );
}
