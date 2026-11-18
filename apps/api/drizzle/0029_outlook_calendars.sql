CREATE TABLE "outlook_calendars" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "outlook_calendars" ADD CONSTRAINT "outlook_calendars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;