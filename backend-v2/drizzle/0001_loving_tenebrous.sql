CREATE TABLE "admin_sessions" (
	"token_hash" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "media_items_public_id_idx";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_sessions_expires_idx" ON "admin_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "admin_sessions_user_idx" ON "admin_sessions" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "media_items" DROP COLUMN "visibility";--> statement-breakpoint
ALTER TABLE "media_items" DROP COLUMN "public_id";--> statement-breakpoint
ALTER TABLE "media_items" DROP COLUMN "view_count";--> statement-breakpoint
ALTER TABLE "media_items" DROP COLUMN "like_count";--> statement-breakpoint
ALTER TABLE "media_items" DROP COLUMN "comment_count";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "photo_url";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "default_visibility";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "auto_generate_metadata";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "notifications_enabled";--> statement-breakpoint
DROP TYPE "public"."visibility";