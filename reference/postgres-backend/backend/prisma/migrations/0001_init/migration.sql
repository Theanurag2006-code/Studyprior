-- StudyPrior initial schema (hand-written to match prisma/schema.prisma; see README "Migrations").
CREATE TYPE "account_role" AS ENUM ('STUDENT', 'ADMIN');
CREATE TYPE "academic_level" AS ENUM ('JUNIOR', 'SENIOR');
CREATE TYPE "theme_preference" AS ENUM ('LIGHT', 'DARK', 'SYSTEM');
CREATE TYPE "publication_status" AS ENUM ('PUBLISHED', 'PENDING_REVIEW');
CREATE TYPE "plan_status" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED');
CREATE TYPE "plan_purpose" AS ENUM ('EXAMS', 'HIGHER_STUDIES', 'CONCEPTUAL', 'INTERVIEW', 'REVISION', 'PROJECTS', 'PERSONAL', 'OTHER');
CREATE TYPE "activity_type" AS ENUM ('PLAN_COMPLETED', 'STUDY_SESSION');
CREATE TYPE "draft_status" AS ENUM ('OPEN', 'PUBLISHED');

CREATE TABLE "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(80) NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "password_hash" TEXT NOT NULL,
  "account_role" "account_role" NOT NULL DEFAULT 'STUDENT',
  "department" VARCHAR(120) NOT NULL,
  "branch" VARCHAR(120),
  "college" VARCHAR(160) NOT NULL,
  "enrollment_number" VARCHAR(40),
  "enrollment_year" INTEGER NOT NULL,
  "graduation_year" INTEGER NOT NULL,
  "current_semester" INTEGER NOT NULL,
  "academic_level" "academic_level" NOT NULL,
  "bio" VARCHAR(300) NOT NULL DEFAULT '',
  "profile_photo_url" VARCHAR(500),
  "available_for_questions" BOOLEAN NOT NULL DEFAULT false,
  "public_contributions" BOOLEAN NOT NULL DEFAULT true,
  "theme_preference" "theme_preference" NOT NULL DEFAULT 'SYSTEM',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_users_semester" CHECK ("current_semester" BETWEEN 1 AND 12),
  CONSTRAINT "ck_users_years" CHECK ("enrollment_year" BETWEEN 2000 AND 2100 AND "graduation_year" > "enrollment_year" AND "graduation_year" <= 2110),
  CONSTRAINT "ck_users_email_normalized" CHECK ("email" = lower(btrim("email")))
);
CREATE UNIQUE INDEX "uq_users_email" ON "users"("email");

CREATE TABLE "academic_settings" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "junior_max_semester" INTEGER NOT NULL DEFAULT 4,
  "max_semester" INTEGER NOT NULL DEFAULT 8,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_by_id" UUID,
  CONSTRAINT "academic_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_academic_single_row" CHECK ("id" = 1),
  CONSTRAINT "ck_academic_bounds" CHECK ("junior_max_semester" >= 1 AND "junior_max_semester" < "max_semester" AND "max_semester" <= 12)
);
INSERT INTO "academic_settings" ("id", "junior_max_semester", "max_semester", "updated_at") VALUES (1, 4, 8, CURRENT_TIMESTAMP);

CREATE TABLE "sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "token_hash" VARCHAR(64) NOT NULL,
  "user_id" UUID NOT NULL,
  "csrf_token" VARCHAR(64) NOT NULL,
  "user_agent" VARCHAR(200),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "uq_sessions_token_hash" ON "sessions"("token_hash");
CREATE INDEX "ix_sessions_user" ON "sessions"("user_id");
CREATE INDEX "ix_sessions_expires" ON "sessions"("expires_at");

CREATE TABLE "subjects" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(120) NOT NULL,
  "name_normalized" VARCHAR(120) NOT NULL,
  "description" VARCHAR(500) NOT NULL DEFAULT '',
  "department" VARCHAR(120) NOT NULL,
  "semester" INTEGER NOT NULL,
  "code" VARCHAR(20),
  "created_by_id" UUID,
  "status" "publication_status" NOT NULL DEFAULT 'PUBLISHED',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "subjects_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_subjects_semester" CHECK ("semester" BETWEEN 1 AND 12)
);
CREATE UNIQUE INDEX "uq_subjects_identity" ON "subjects"("name_normalized", "department", "semester");
CREATE INDEX "ix_subjects_dept_sem" ON "subjects"("department", "semester");

CREATE TABLE "units" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "subject_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "name_normalized" VARCHAR(120) NOT NULL,
  "description" VARCHAR(500) NOT NULL DEFAULT '',
  "unit_number" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "units_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_units_number" CHECK ("unit_number" >= 1)
);
CREATE UNIQUE INDEX "uq_units_number" ON "units"("subject_id", "unit_number");
CREATE UNIQUE INDEX "uq_units_name" ON "units"("subject_id", "name_normalized");

CREATE TABLE "topics" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "subject_id" UUID NOT NULL,
  "unit_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "name_normalized" VARCHAR(120) NOT NULL,
  "description" VARCHAR(500) NOT NULL DEFAULT '',
  "estimated_hours" DECIMAL(5,1),
  "created_by_id" UUID,
  "status" "publication_status" NOT NULL DEFAULT 'PUBLISHED',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "topics_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_topics_hours" CHECK ("estimated_hours" IS NULL OR ("estimated_hours" >= 0.5 AND "estimated_hours" <= 200))
);
CREATE UNIQUE INDEX "uq_topics_identity" ON "topics"("subject_id", "name_normalized");
CREATE INDEX "ix_topics_unit" ON "topics"("unit_id");

CREATE TABLE "user_subjects" (
  "user_id" UUID NOT NULL,
  "subject_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_subjects_pkey" PRIMARY KEY ("user_id", "subject_id")
);
CREATE INDEX "ix_user_subjects_subject" ON "user_subjects"("subject_id");

CREATE TABLE "ratings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "topic_id" UUID NOT NULL,
  "importance" INTEGER NOT NULL,
  "difficulty" INTEGER NOT NULL,
  "exam_relevance" INTEGER NOT NULL,
  "interview_relevance" INTEGER NOT NULL,
  "advice" VARCHAR(1000) NOT NULL DEFAULT '',
  "common_mistake" VARCHAR(1000) NOT NULL DEFAULT '',
  "academic_level_at_submission" "academic_level" NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ratings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_ratings_importance" CHECK ("importance" BETWEEN 1 AND 5),
  CONSTRAINT "ck_ratings_difficulty" CHECK ("difficulty" BETWEEN 1 AND 5),
  CONSTRAINT "ck_ratings_exam" CHECK ("exam_relevance" BETWEEN 1 AND 5),
  CONSTRAINT "ck_ratings_interview" CHECK ("interview_relevance" BETWEEN 1 AND 5)
);
CREATE UNIQUE INDEX "uq_ratings_user_topic" ON "ratings"("user_id", "topic_id");
CREATE INDEX "ix_ratings_topic_level" ON "ratings"("topic_id", "academic_level_at_submission");

CREATE TABLE "saved_topics" (
  "user_id" UUID NOT NULL,
  "topic_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "saved_topics_pkey" PRIMARY KEY ("user_id", "topic_id")
);
CREATE INDEX "ix_saved_topics_topic" ON "saved_topics"("topic_id");

CREATE TABLE "study_plans" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "topic_id" UUID NOT NULL,
  "target_date" DATE NOT NULL,
  "status" "plan_status" NOT NULL DEFAULT 'PLANNED',
  "estimated_minutes" INTEGER NOT NULL DEFAULT 60,
  "purpose" "plan_purpose",
  "custom_purpose" VARCHAR(60),
  "completed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "study_plans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_plans_minutes" CHECK ("estimated_minutes" BETWEEN 5 AND 600),
  CONSTRAINT "ck_plans_custom_purpose" CHECK (("purpose" = 'OTHER' AND "custom_purpose" IS NOT NULL AND btrim("custom_purpose") <> '') OR ("purpose" IS DISTINCT FROM 'OTHER' AND "custom_purpose" IS NULL))
);
CREATE INDEX "ix_plans_user_status" ON "study_plans"("user_id", "status");
CREATE INDEX "ix_plans_user_date" ON "study_plans"("user_id", "target_date");

CREATE TABLE "study_activity" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "topic_id" UUID,
  "study_plan_id" UUID,
  "activity_type" "activity_type" NOT NULL,
  "minutes" INTEGER NOT NULL,
  "occurred_on" DATE NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "study_activity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_activity_minutes" CHECK ("minutes" BETWEEN 1 AND 1440)
);
CREATE UNIQUE INDEX "uq_activity_plan_event" ON "study_activity"("study_plan_id", "activity_type");
CREATE INDEX "ix_activity_user_day" ON "study_activity"("user_id", "occurred_on");

CREATE TABLE "notes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "title" VARCHAR(80) NOT NULL,
  "body" VARCHAR(2000) NOT NULL,
  "subject_id" UUID,
  "topic_id" UUID,
  "study_plan_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ix_notes_user_updated" ON "notes"("user_id", "updated_at");

CREATE TABLE "subject_drafts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL DEFAULT '',
  "department" VARCHAR(120) NOT NULL DEFAULT '',
  "semester" INTEGER,
  "description" VARCHAR(500) NOT NULL DEFAULT '',
  "topics" JSONB NOT NULL DEFAULT '[]',
  "status" "draft_status" NOT NULL DEFAULT 'OPEN',
  "published_subject_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "subject_drafts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ix_drafts_user_status" ON "subject_drafts"("user_id", "status");

-- Foreign keys (names follow Prisma's <table>_<column>_fkey convention)
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "units" ADD CONSTRAINT "units_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "topics" ADD CONSTRAINT "topics_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "topics" ADD CONSTRAINT "topics_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "topics" ADD CONSTRAINT "topics_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_subjects" ADD CONSTRAINT "user_subjects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_subjects" ADD CONSTRAINT "user_subjects_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "saved_topics" ADD CONSTRAINT "saved_topics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "saved_topics" ADD CONSTRAINT "saved_topics_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "study_activity" ADD CONSTRAINT "study_activity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "study_activity" ADD CONSTRAINT "study_activity_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "study_activity" ADD CONSTRAINT "study_activity_study_plan_id_fkey" FOREIGN KEY ("study_plan_id") REFERENCES "study_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notes" ADD CONSTRAINT "notes_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notes" ADD CONSTRAINT "notes_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notes" ADD CONSTRAINT "notes_study_plan_id_fkey" FOREIGN KEY ("study_plan_id") REFERENCES "study_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subject_drafts" ADD CONSTRAINT "subject_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
