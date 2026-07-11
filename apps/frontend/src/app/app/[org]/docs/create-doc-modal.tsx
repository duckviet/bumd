"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type CreateDocModalProps = {
  readonly org: string;
};

export function CreateDocModal({ org }: CreateDocModalProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [theme, setTheme] = useState("classic");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleOpen = () => {
    setIsOpen(true);
    setName("");
    setSlug("");
    setVisibility("public");
    setTheme("classic");
    setError(null);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch(`/app/${org}/docs/new`, {
        method: "POST",
        headers: {
          "Accept": "application/json",
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
        const errVal = typeof data["error"] === "string" ? data["error"] : "An error occurred";
        setError(errVal);
        setLoading(false);
        return;
      }

      const data = (await response.json()) as Record<string, unknown>;
      if (typeof data["redirectUrl"] === "string") {
        router.push(data["redirectUrl"]);
        setIsOpen(false);
      } else {
        setError("Invalid response from server");
        setLoading(false);
      }
    } catch (err) {
      setError("Failed to connect to the server");
      setLoading(false);
    }
  };

  return (
    <>
      <button className="inline-flex min-h-10 items-center justify-center rounded-full border border-carbon bg-carbon px-5 text-sm font-semibold text-paper hover:bg-graphite" onClick={handleOpen} type="button">
        New doc
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/40 p-4 backdrop-blur-sm" onClick={handleClose}>
          <div className="relative w-full max-w-lg rounded-xl border border-chalk bg-paper p-8 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between border-b border-chalk pb-4">
              <h2>New doc</h2>
              <button className="grid size-8 place-items-center rounded-full bg-transparent text-xl text-slate hover:bg-fog hover:text-carbon" onClick={handleClose} type="button" aria-label="Close">
                &times;
              </button>
            </div>
            {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
            <form onSubmit={handleSubmit}>
              <label>
                Name
                <input
                  type="text"
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                />
              </label>
              <label>
                Slug
                <input
                  type="text"
                  name="slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  required
                />
              </label>
              <label>
                Visibility
                <select
                  name="visibility"
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value)}
                >
                  <option value="public">public</option>
                  <option value="private">private</option>
                </select>
              </label>
              <label>
                Theme
                <input
                  type="text"
                  name="theme"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  required
                />
              </label>
              <div className="mt-6 flex justify-end gap-3">
                <button className="border-carbon bg-transparent text-carbon hover:bg-chalk" type="button" onClick={handleClose} disabled={loading}>
                  Cancel
                </button>
                <button type="submit" disabled={loading}>
                  {loading ? "Creating..." : "Create doc"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
