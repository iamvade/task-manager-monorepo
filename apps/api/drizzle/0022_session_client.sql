CREATE TYPE "public"."session_client" AS ENUM('web', 'mobile');--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "public_id" uuid;--> statement-breakpoint
-- New rows get a UUIDv7 from the app; existing ones only need to be unique.
UPDATE "sessions" SET "public_id" = gen_random_uuid();--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "public_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "client" "session_client" DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "device_label" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- The expiry was last pushed forward on use, so that is when each session was last seen.
UPDATE "sessions" SET "last_seen_at" = "expires_at" - interval '30 days';--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_public_id_unique" UNIQUE("public_id");
