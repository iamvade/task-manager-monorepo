import { z } from 'zod';

/** base64url without padding (as `PushSubscription.toJSON()` gives it), optional `=` padding. */
const base64url = (bytes: number) => {
  const chars = Math.ceil((bytes * 4) / 3);
  const pad = (4 - (chars % 4)) % 4;
  return new RegExp(`^[A-Za-z0-9_-]{${chars}}={0,${pad}}$`);
};

/** A browser's push endpoint: an https URL on its push service (the API checks the host). */
const endpointSchema = z
  .url({ protocol: /^https$/ })
  .max(2048)
  .meta({ description: 'The push service URL from `PushSubscription.endpoint`.' });

/** This browser's subscription, from `PushSubscription.toJSON()`. */
export const pushSubscriptionSchema = z
  .object({
    endpoint: endpointSchema,
    keys: z.object({
      /** The browser's P-256 public key, uncompressed (65 bytes). */
      p256dh: z.string().regex(base64url(65)),
      /** The 16-byte auth secret. */
      auth: z.string().regex(base64url(16)),
    }),
  })
  .meta({ id: 'PushSubscription' });
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const pushUnsubscribeSchema = z
  .object({ endpoint: endpointSchema })
  .meta({ id: 'PushUnsubscribe' });

/** Whether the server can send Web Push, and the VAPID key browsers subscribe with. */
export const pushConfigSchema = z
  .object({
    enabled: z.boolean(),
    /** VAPID public key (base64url), the `applicationServerKey`; null when push is off. */
    publicKey: z.string().nullable(),
  })
  .meta({ id: 'PushConfig' });
export type PushConfig = z.infer<typeof pushConfigSchema>;

/** What the service worker receives (encrypted to the browser) and shows. */
export const pushPayloadSchema = z.object({
  v: z.literal(1),
  /** The notification's id: the popup's tag, so a collapsed one replaces it. */
  id: z.uuid(),
  workspaceId: z.uuid(),
  title: z.string(),
  body: z.string(),
  /** Same-origin path the click opens (`/w/:slug/...`). */
  url: z.string().startsWith('/'),
});
export type PushPayload = z.infer<typeof pushPayloadSchema>;
