CREATE TYPE "public"."transcription_provider" AS ENUM('GROQ', 'GOOGLE');--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"transcription_provider" "transcription_provider" DEFAULT 'GROQ' NOT NULL,
	"transcription_model" varchar(64) DEFAULT 'whisper-large-v3-turbo' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
