-- Administrators are not students: they must not have a Junior/Senior status, semester or enrollment years.
-- Safe and additive: no table is dropped, no student row is modified.

-- 1) Allow NULL in the four student-only columns (existing values are kept).
ALTER TABLE "users" ALTER COLUMN "academic_level" DROP NOT NULL;
ALTER TABLE "users" ALTER COLUMN "current_semester" DROP NOT NULL;
ALTER TABLE "users" ALTER COLUMN "enrollment_year" DROP NOT NULL;
ALTER TABLE "users" ALTER COLUMN "graduation_year" DROP NOT NULL;

-- 2) Clean up admin rows created by the first version of the admin CLI (it stored placeholder SENIOR / semester 8 values).
--    Only rows with account_role = 'ADMIN' are touched.
UPDATE "users" SET "academic_level" = NULL, "current_semester" = NULL, "enrollment_year" = NULL, "graduation_year" = NULL WHERE "account_role" = 'ADMIN';

-- 3) Enforce the rule in the database so no code path can break it.
--    The existing ck_users_semester / ck_users_years checks keep working: a CHECK passes when its inputs are NULL.
ALTER TABLE "users" ADD CONSTRAINT "ck_users_role_academic" CHECK (
  ("account_role" = 'STUDENT' AND "academic_level" IS NOT NULL AND "current_semester" IS NOT NULL AND "enrollment_year" IS NOT NULL AND "graduation_year" IS NOT NULL)
  OR
  ("account_role" = 'ADMIN' AND "academic_level" IS NULL AND "current_semester" IS NULL AND "enrollment_year" IS NULL AND "graduation_year" IS NULL)
);
