"use client";

import { useRef, useState } from "react";
import StudioEditor from "@grapesjs/studio-sdk/react";
import "@grapesjs/studio-sdk/style";
import { saveEditsAction } from "@/lib/actions/site-builder";

// Only what we use from the editor — structural, because the SDK bundles its own GrapesJS copy.
interface Editor {
  getHtml(): string;
  getCss(): string | undefined;
  store(): unknown;
}

// The free, click-to-edit side of the studio, built on GrapesJS Studio SDK. Loaded only when the Edit tab opens
// (see studio-client). The licence key is a front-end key tied to our domains (not a secret); it is read on the
// server from the GRAPESJS_STUDIO_LICENSE_KEY environment variable and passed in, never committed.
export default function GrapesEditor({ token, html, css, licenseKey, onSaved }: { token: string; html: string; css: string; licenseKey: string; onSaved: () => void }) {
  const editorRef = useRef<Editor | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // The editor's own save (also its autosave) writes the page back through our sanitising server action.
  async function persist(editor: Editor) {
    setState("saving");
    const result = await saveEditsAction(token, editor.getHtml(), editor.getCss() ?? "").catch(() => ({ ok: false }));
    setState(result.ok ? "saved" : "error");
    if (result.ok) onSaved();
    else throw new Error("save failed");
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button
          onClick={() => editorRef.current?.store()}
          disabled={state === "saving"}
          className="rounded-full bg-teal-400 px-5 py-2.5 text-sm font-semibold text-[#04201F] hover:bg-teal-300 disabled:opacity-60"
        >
          {state === "saving" ? "Saving…" : "Save my changes"}
        </button>
        <span className="text-sm text-white/50">
          {state === "saved" ? "Saved — your preview is up to date." : state === "error" ? "Couldn't save. Try again." : "Click anything to edit it. Editing by hand is free, and changes save as you go."}
        </span>
      </div>
      <div className="h-[80vh] overflow-hidden rounded-2xl border border-white/10">
        <StudioEditor
          onEditor={(editor) => {
            editorRef.current = editor;
          }}
          options={{
            licenseKey,
            theme: "light",
            project: {
              type: "web",
              default: { pages: [{ name: "Home", component: `${html}<style>${css}</style>` }] },
            },
            pages: false,
            storage: {
              type: "self",
              // The project handed in above is what loads; nothing is read back from the browser.
              project: { pages: [{ name: "Home", component: `${html}<style>${css}</style>` }] },
              autosaveChanges: 5,
              onSave: async ({ editor }) => persist(editor),
            },
          }}
        />
      </div>
    </div>
  );
}
