"use client";

import { useEffect, useRef, useState } from "react";
import grapesjs, { type Editor } from "grapesjs";
import "grapesjs/dist/css/grapes.min.css";
import { saveEditsAction } from "@/lib/actions/site-builder";

// The free, click-to-edit side of the studio. Loaded only when the Edit tab opens (see studio-client).
export default function GrapesEditor({ token, html, css, onSaved }: { token: string; html: string; css: string; onSaved: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<Editor | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    if (!host.current) return;
    const ed = grapesjs.init({
      container: host.current,
      height: "78vh",
      width: "auto",
      fromElement: false,
      storageManager: false,
      components: html,
      style: css,
      deviceManager: {
        devices: [
          { name: "Desktop", width: "" },
          { name: "Tablet", width: "820px", widthMedia: "820px" },
          { name: "Mobile", width: "390px", widthMedia: "480px" },
        ],
      },
    });
    const bm = ed.Blocks;
    bm.add("text", { label: "Text", category: "Basic", content: '<p style="padding:12px 0">Write something here.</p>' });
    bm.add("heading", { label: "Heading", category: "Basic", content: '<h2 style="margin:0 0 12px">A new heading</h2>' });
    bm.add("image", { label: "Image", category: "Basic", content: { type: "image" } });
    bm.add("button", {
      label: "Button",
      category: "Basic",
      content: '<a href="#contact" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#111;color:#fff;text-decoration:none">Button</a>',
    });
    bm.add("section", {
      label: "Section",
      category: "Layout",
      content: '<section style="padding:56px 24px;max-width:1000px;margin:0 auto"><h2>Section title</h2><p>Tell your guests something.</p></section>',
    });
    editor.current = ed;
    return () => {
      ed.destroy();
      editor.current = null;
    };
    // The editor is created once for the HTML/CSS this tab opened with.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    const ed = editor.current;
    if (!ed) return;
    setState("saving");
    const result = await saveEditsAction(token, ed.getHtml(), ed.getCss() ?? "").catch(() => ({ ok: false }));
    setState(result.ok ? "saved" : "error");
    if (result.ok) onSaved();
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button onClick={save} disabled={state === "saving"} className="rounded-full bg-teal-400 px-5 py-2.5 text-sm font-semibold text-[#04201F] hover:bg-teal-300 disabled:opacity-60">
          {state === "saving" ? "Saving…" : "Save my changes"}
        </button>
        <span className="text-sm text-white/50">
          {state === "saved" ? "Saved — your preview is up to date." : state === "error" ? "Couldn't save. Try again." : "Click anything to edit it. Editing by hand is free."}
        </span>
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white text-neutral-900">
        <div ref={host} />
      </div>
    </div>
  );
}
