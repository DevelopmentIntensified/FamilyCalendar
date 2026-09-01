-- 008: Task tags - many-to-many join of lowercase tag names per task.
CREATE TABLE IF NOT EXISTS "taskTags" (
	"taskId" text NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
	"name" text NOT NULL,
	CONSTRAINT "taskTags_taskId_name_pk" PRIMARY KEY ("taskId", "name")
);

CREATE INDEX IF NOT EXISTS "taskTags_name_idx" ON "taskTags" ("name");
