"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Code2, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BACKGROUND_OPTIONS, buildSignatureHTML } from "@/lib/signature/build";
import {
  deleteSignature,
  saveSignature,
  setDefaultSignature,
  type SavedSignature,
} from "@/app/(app)/signature/actions";

/**
 * The signature generator, wrapped in the app's own UI.
 *
 * The markup it produces comes from lib/signature/build.ts unchanged -- see
 * the note there. Everything in this file is chrome.
 *
 * The preview is rendered with dangerouslySetInnerHTML, which is safe and
 * necessary here: the HTML is built by our own code from four form fields,
 * and the whole point of the tool is to show the rendered card rather than
 * escaped source. The fields are interpolated into an HTML template, so a
 * value containing markup would be reflected -- but only into the author's
 * own preview, and only from what they just typed into their own browser.
 *
 * Saving changes where that HTML can end up, but not who controls it: a saved
 * signature is readable only by its owner (RLS, see
 * supabase/migrations/0008_email_signatures.sql) and is attached only to that
 * owner's own outgoing draft. Someone putting markup in their own signature
 * is writing their own email, which they could do in Gmail anyway. There is
 * still no path by which one user's input reaches another's screen.
 */

const PLACEHOLDERS = {
  name: "Jordan Lee",
  position: "IT Support Specialist",
  mobile: "805.000.0000",
  email: "name@securetecc.com",
};

export function SignatureGenerator({
  defaultName,
  defaultEmail,
  savedSignatures,
}: {
  savedSignatures: SavedSignature[];
  defaultName: string;
  defaultEmail: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [position, setPosition] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState(defaultEmail);
  const [background, setBackground] = useState(BACKGROUND_OPTIONS[0]);
  const [showCode, setShowCode] = useState(false);
  const [saveName, setSaveName] = useState(defaultName ? `${defaultName} — main` : "");
  const [saving, setSaving] = useState(false);

  /**
   * The builder measures the rendered title with a <canvas> -- that is what
   * lets the underline bar be baked out at the exact width of whatever
   * position is typed. It therefore needs a real DOM, and Next server-renders
   * client components too, so calling it during the first pass throws
   * "document is not defined" on every request.
   *
   * Gating on mount fixes both that and the hydration mismatch that a
   * server-side estimate would cause: the server renders the empty state, the
   * client renders the same empty state, and the signature appears on the
   * effect that follows.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Rebuilt on every keystroke, exactly as the original did. It's string
  // concatenation plus one canvas measurement -- cheap enough that debouncing
  // would cost responsiveness for nothing.
  const html = useMemo(
    () =>
      !mounted
        ? ""
        : buildSignatureHTML(
            name || PLACEHOLDERS.name,
            position || PLACEHOLDERS.position,
            mobile || "Number",
            email || "Email",
            background,
          ),
    [mounted, name, position, mobile, email, background],
  );

  /**
   * Copies the RENDERED signature, not the source.
   *
   * text/html on the clipboard is what lets Gmail and Outlook paste it as a
   * formatted card; a plain-text copy pastes the tags as visible text. The
   * fallback path exists because ClipboardItem isn't universal, and it
   * deliberately says which kind of copy happened rather than claiming
   * success -- pasting source into a signature box and seeing raw HTML is a
   * confusing failure to debug otherwise.
   */
  async function copySignature() {
    if (!html) return;
    try {
      if (navigator.clipboard && "ClipboardItem" in window) {
        await navigator.clipboard.write([
          new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }) }),
        ]);
        toast.success("Signature copied — paste it into your email settings");
        return;
      }
      await navigator.clipboard.writeText(html);
      toast.success("Copied as HTML source — paste into a code/HTML box, not the visual editor");
    } catch {
      toast.error("Couldn't copy — select the code below and copy it manually.");
    }
  }

  /**
   * Saves the RENDERED html, not the fields it came from -- the builder sizes
   * its badges with a canvas measurement, which only a browser can do, so the
   * server could never rebuild this from four strings.
   */
  async function handleSave(makeDefault: boolean) {
    if (!html) return;
    setSaving(true);
    const result = await saveSignature({
      name: saveName.trim(),
      html,
      isDefault: makeDefault || savedSignatures.length === 0,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Saved "${result.data.name}" — pick it when creating a Gmail draft.`);
    router.refresh();
  }

  async function handleSetDefault(id: string) {
    const result = await setDefaultSignature(id);
    if (!result.ok) return toast.error(result.error);
    toast.success("Default signature updated");
    router.refresh();
  }

  async function handleDelete(id: string, label: string) {
    if (!confirm(`Delete the signature "${label}"?`)) return;
    const result = await deleteSignature(id);
    if (!result.ok) return toast.error(result.error);
    toast.success("Signature deleted");
    router.refresh();
  }

  async function copyCode() {
    if (!html) return;
    try {
      await navigator.clipboard.writeText(html);
      toast.success("HTML copied");
    } catch {
      toast.error("Couldn't copy — select the code and copy it manually.");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr] lg:items-start">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Your details</CardTitle>
          <CardDescription>The preview updates as you type.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field id="name" label="Name" value={name} onChange={setName} placeholder={PLACEHOLDERS.name} />
          <Field id="position" label="Position" value={position} onChange={setPosition} placeholder={PLACEHOLDERS.position} />
          <Field id="mobile" label="Mobile number" value={mobile} onChange={setMobile} placeholder={PLACEHOLDERS.mobile} />
          <Field id="email" label="Email" value={email} onChange={setEmail} placeholder={PLACEHOLDERS.email} type="email" />

          <div className="space-y-2 pt-1">
            <Label>Card background</Label>
            <div className="grid grid-cols-4 gap-2">
              {BACKGROUND_OPTIONS.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setBackground(url)}
                  title={`Background ${i + 1}`}
                  aria-pressed={url === background}
                  className={`relative aspect-[2/1] overflow-hidden rounded-md border transition-colors ${
                    url === background
                      ? "border-accent ring-2 ring-accent/30"
                      : "border-border hover:border-accent/60"
                  }`}
                >
                  {/* Plain <img>: these are remote WordPress assets and the
                      point is to show the exact file the signature will
                      reference, un-transcoded. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Click a thumbnail to change the card&apos;s background photo.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="min-w-0 space-y-6">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">Live preview</CardTitle>
              <CardDescription>Exactly what recipients see.</CardDescription>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button size="sm" onClick={copySignature} disabled={!html}>
                <Copy className="h-4 w-4" />
                Copy signature
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowCode((v) => !v)}>
                <Code2 className="h-4 w-4" />
                {showCode ? "Hide code" : "Show code"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* The card is a fixed 700px table. overflow-x here rather than
                letting it stretch the page: a grid item won't shrink below
                its content's min-content width, which would drag the whole
                layout wider than the viewport. */}
            <div className="overflow-x-auto rounded-lg bg-[#0a1119] p-6">
              {html ? (
                <div style={{ minWidth: 700 }} dangerouslySetInnerHTML={{ __html: html }} />
              ) : (
                <div
                  style={{ minWidth: 700, height: 240 }}
                  className="animate-pulse rounded-md bg-white/5"
                />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Saved signatures</CardTitle>
            <CardDescription>
              Save the signature above to sign Gmail drafts with it — the invoice draft button
              lets you pick from this list. Only you can see your own signatures.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[220px] flex-1 space-y-2">
                <Label htmlFor="saveName">Name this signature</Label>
                <Input
                  id="saveName"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Jordan — main"
                />
              </div>
              <Button onClick={() => handleSave(false)} disabled={!html || !saveName.trim() || saving}>
                {saving ? "Saving…" : "Save signature"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Saving under a name that already exists replaces it.
            </p>

            {savedSignatures.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing saved yet.</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {savedSignatures.map((sig) => (
                  <li key={sig.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm">{sig.name}</span>
                      {sig.isDefault && (
                        <span className="shrink-0 rounded border px-1.5 py-0.5 text-xs text-muted-foreground">
                          Default
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 gap-1">
                      {!sig.isDefault && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleSetDefault(sig.id)}
                          aria-label={`Make ${sig.name} the default`}
                        >
                          <Star className="h-4 w-4" />
                          Make default
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(sig.id, sig.name)}
                        aria-label={`Delete ${sig.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {showCode && (
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 pb-3">
              <CardTitle className="text-base">Generated HTML</CardTitle>
              <Button size="sm" variant="outline" onClick={copyCode}>
                <Copy className="h-4 w-4" />
                Copy code
              </Button>
            </CardHeader>
            <CardContent>
              <textarea
                readOnly
                spellCheck={false}
                value={html}
                className="h-64 w-full rounded-md border bg-background p-3 font-mono text-[11px] leading-relaxed"
              />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">How to install it</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="web">
              <TabsList>
                <TabsTrigger value="web">Web / New Outlook</TabsTrigger>
                <TabsTrigger value="classic">Outlook Classic</TabsTrigger>
                <TabsTrigger value="gmail">Gmail</TabsTrigger>
              </TabsList>

              <TabsContent value="web" className="pt-4">
                <Steps
                  items={[
                    "Click Copy signature above — it copies the rendered card, not the code.",
                    "Open Settings → Mail → Compose and reply → Signatures.",
                    "Click into the signature box and paste (Ctrl/Cmd+V).",
                    "Set it as the default for new messages and replies, then Save.",
                  ]}
                />
              </TabsContent>

              <TabsContent value="classic" className="pt-4">
                <Steps
                  items={[
                    "Click Copy signature — Outlook Classic pastes a rich copy far better than raw code.",
                    "File → Options → Mail → Signatures, then New.",
                    "Click inside the edit box and paste.",
                    "Outlook Classic often refuses to load the background photo. The card sets a solid #0a1119 behind it, so it falls back to a dark rectangle with the text still readable rather than white-on-white.",
                  ]}
                />
              </TabsContent>

              <TabsContent value="gmail" className="pt-4">
                <Steps
                  items={[
                    "Click Copy signature, then open Settings → See all settings → General → Signature.",
                    "Create a signature and paste into the box.",
                    "Scroll down and Save Changes — Gmail does not save automatically.",
                    "Images must not be blocked; Gmail loads them by default.",
                  ]}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
    </div>
  );
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="space-y-2.5">
      {items.map((item, i) => (
        <li key={item} className="flex gap-3 text-sm text-muted-foreground">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-medium text-accent">
            {i + 1}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}
