CREATE TYPE "public"."caption_job_status" AS ENUM('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."caption_status" AS ENUM('PENDING', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."download_status" AS ENUM('PENDING', 'DOWNLOADING', 'PROCESSING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('YOUTUBE', 'SOUNDCLOUD', 'TWITTER', 'TIKTOK', 'INSTAGRAM', 'TWITCH', 'REDDIT', 'DIRECT');--> statement-breakpoint
CREATE TYPE "public"."sort_order" AS ENUM('NEWEST', 'OLDEST', 'TITLE', 'POPULAR');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('PRIVATE', 'PUBLIC', 'UNLISTED');--> statement-breakpoint
CREATE TABLE "caption_jobs" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"media_item_id" varchar(32) NOT NULL,
	"status" "caption_job_status" DEFAULT 'QUEUED' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"error_message" text,
	"processing_started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "caption_segments" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"caption_id" varchar(32) NOT NULL,
	"start_time" double precision NOT NULL,
	"end_time" double precision NOT NULL,
	"text" text NOT NULL,
	"confidence" double precision
);
--> statement-breakpoint
CREATE TABLE "captions" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"media_item_id" varchar(32) NOT NULL,
	"language" varchar(16) DEFAULT 'auto' NOT NULL,
	"is_auto_generated" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_files" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"media_item_id" varchar(32) NOT NULL,
	"filename" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" varchar(127) NOT NULL,
	"size" bigint NOT NULL,
	"is_original" boolean DEFAULT true NOT NULL,
	"format" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_items" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"original_url" text NOT NULL,
	"platform" "platform" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"visibility" "visibility" DEFAULT 'PRIVATE' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"download_status" "download_status" DEFAULT 'COMPLETED' NOT NULL,
	"public_id" varchar(32),
	"caption_status" "caption_status" DEFAULT 'PENDING' NOT NULL,
	"caption_error_message" text,
	"caption_generated_at" timestamp with time zone,
	"duration" integer,
	"size" bigint DEFAULT 0 NOT NULL,
	"format" varchar(32) DEFAULT '' NOT NULL,
	"resolution" varchar(32),
	"thumbnail_url" text,
	"original_author" text,
	"original_title" text,
	"original_description" text,
	"published_at" timestamp with time zone,
	"hashtags" text[] DEFAULT '{}'::text[] NOT NULL,
	"ai_summary" text,
	"ai_keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"ai_generated_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"uid" varchar(64) NOT NULL,
	"email" varchar(255) NOT NULL,
	"display_name" varchar(255),
	"photo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"default_visibility" "visibility" DEFAULT 'PRIVATE' NOT NULL,
	"sort_order" "sort_order" DEFAULT 'NEWEST' NOT NULL,
	"auto_generate_metadata" boolean DEFAULT true NOT NULL,
	"notifications_enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "users_uid_unique" UNIQUE("uid"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "caption_jobs" ADD CONSTRAINT "caption_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caption_jobs" ADD CONSTRAINT "caption_jobs_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caption_segments" ADD CONSTRAINT "caption_segments_caption_id_captions_id_fk" FOREIGN KEY ("caption_id") REFERENCES "public"."captions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "captions" ADD CONSTRAINT "captions_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "caption_jobs_status_idx" ON "caption_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "caption_jobs_user_status_idx" ON "caption_jobs" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "caption_segments_caption_start_idx" ON "caption_segments" USING btree ("caption_id","start_time");--> statement-breakpoint
CREATE INDEX "captions_media_item_idx" ON "captions" USING btree ("media_item_id");--> statement-breakpoint
CREATE INDEX "media_files_media_item_idx" ON "media_files" USING btree ("media_item_id");--> statement-breakpoint
CREATE INDEX "media_items_user_created_idx" ON "media_items" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "media_items_public_id_idx" ON "media_items" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "media_items_caption_status_idx" ON "media_items" USING btree ("caption_status","created_at");