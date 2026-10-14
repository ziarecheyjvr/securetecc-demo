import { z } from "zod";

export const signatureFormSchema = z.object({
  name: z.string().trim().min(1, "Give the signature a name").max(60),
  // Generated in the browser (the builder measures text with a canvas), so
  // the server stores what it is handed. It is only ever rendered back to its
  // own author and into that author's own Gmail draft.
  html: z.string().min(1, "Nothing to save yet").max(200_000),
  isDefault: z.boolean().default(false),
});

export type SignatureFormValues = z.infer<typeof signatureFormSchema>;
