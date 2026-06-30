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
      <button className="button-link" onClick={handleOpen} type="button">
        New doc
      </button>

      {isOpen && (
        <div className="modal-backdrop" onClick={handleClose}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>New doc</h2>
              <button className="modal-close" onClick={handleClose} type="button" aria-label="Close">
                &times;
              </button>
            </div>
            {error && <p className="error-msg">{error}</p>}
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
              <div className="modal-actions">
                <button className="button-secondary" type="button" onClick={handleClose} disabled={loading}>
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
