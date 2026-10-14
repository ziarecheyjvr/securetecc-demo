"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { updateProfile } from "@/app/(app)/settings/profile/actions";
import { MAX_AVATAR_BYTES } from "@/lib/storage/avatars";

/**
 * Name, photo and birthday.
 *
 * The birthday input is a native date field but only month and day are ever
 * stored -- the year is discarded server-side. A year picker would collect an
 * age nobody needs, and a month/day pair of selects is a worse control than
 * the one every browser already has.
 */
export function ProfileForm({
  name: initialName,
  avatarUrl,
  birthMonth,
  birthDay,
  initials,
}: {
  name: string;
  avatarUrl: string | null;
  birthMonth: number | null;
  birthDay: number | null;
  initials: string;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialName);
  // A placeholder year, only so the native control has a valid value. The
  // server parses the string and keeps month/day.
  const [birthday, setBirthday] = useState(
    birthMonth && birthDay
      ? `2000-${String(birthMonth).padStart(2, "0")}-${String(birthDay).padStart(2, "0")}`
      : "",
  );
  const [preview, setPreview] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [pending, setPending] = useState(false);

  const shownImage = preview ?? (removed ? null : avatarUrl);

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("That image is over 2MB — please use a smaller one.");
      e.target.value = "";
      return;
    }
    // Local preview so the choice is visible before saving; revoked on the
    // next pick to avoid leaking object URLs across a long session.
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
    setRemoved(false);
  }

  function removePhoto() {
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    if (fileInput.current) fileInput.current.value = "";
    setRemoved(true);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    form.set("removePhoto", String(removed));
    setPending(true);
    const result = await updateProfile(form);
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Profile saved");
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    setRemoved(false);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        {shownImage ? (
          <Image
            src={shownImage}
            alt=""
            width={72}
            height={72}
            unoptimized
            className="h-18 w-18 rounded-full object-cover"
            style={{ height: 72, width: 72 }}
          />
        ) : (
          <Avatar className="h-18 w-18" style={{ height: 72, width: 72 }}>
            <AvatarFallback className="bg-accent text-accent-foreground text-lg">
              {initials}
            </AvatarFallback>
          </Avatar>
        )}

        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInput}
            type="file"
            name="photo"
            accept="image/jpeg,image/png,image/webp"
            onChange={pickFile}
            className="hidden"
            id="photo"
          />
          <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
            <Camera className="h-4 w-4" />
            {shownImage ? "Change photo" : "Upload photo"}
          </Button>
          {shownImage && (
            <Button type="button" variant="outline" size="sm" onClick={removePhoto}>
              <Trash2 className="h-4 w-4" />
              Remove
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={120}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="birthday">Birthday</Label>
          <Input
            id="birthday"
            name="birthday"
            type="date"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Only the day and month are stored — never the year. Leave blank to skip.
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending || name.trim().length < 2}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
        {birthday && (
          <Button type="button" variant="outline" onClick={() => setBirthday("")}>
            Clear birthday
          </Button>
        )}
      </div>
    </form>
  );
}
