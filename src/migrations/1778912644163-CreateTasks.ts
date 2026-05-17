import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateTasks1778912644163 implements MigrationInterface {
    name = 'CreateTasks1778912644163'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."tasks_status_enum" AS ENUM('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED')`);
        await queryRunner.query(`CREATE TYPE "public"."tasks_priority_enum" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT')`);
        await queryRunner.query(`CREATE TABLE "tasks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "projectId" uuid NOT NULL, "parentTaskId" uuid, "title" character varying(200) NOT NULL, "description" text, "status" "public"."tasks_status_enum" NOT NULL DEFAULT 'TODO', "priority" "public"."tasks_priority_enum" NOT NULL DEFAULT 'MEDIUM', "dueAt" TIMESTAMP WITH TIME ZONE, "assigneeId" uuid, "createdById" uuid NOT NULL, "completedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_8d12ff38fcc62aaba2cab748772" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_e08fca67ca8966e6b9914bf295" ON "tasks" ("projectId") `);
        await queryRunner.query(`CREATE INDEX "IDX_34701b0b8d466af308ba202e4e" ON "tasks" ("parentTaskId") `);
        await queryRunner.query(`CREATE INDEX "IDX_tasks_dueAt" ON "tasks" ("dueAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_tasks_assignee_status" ON "tasks" ("assigneeId", "status") `);
        await queryRunner.query(`CREATE INDEX "IDX_tasks_project_status" ON "tasks" ("projectId", "status") `);
        await queryRunner.query(`ALTER TABLE "tasks" ADD CONSTRAINT "FK_e08fca67ca8966e6b9914bf2956" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tasks" ADD CONSTRAINT "FK_34701b0b8d466af308ba202e4ef" FOREIGN KEY ("parentTaskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tasks" ADD CONSTRAINT "FK_9a16d2c86252529f622fa53f1e3" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tasks" ADD CONSTRAINT "FK_660898d912c6e71107e9ef8f38d" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tasks" DROP CONSTRAINT "FK_660898d912c6e71107e9ef8f38d"`);
        await queryRunner.query(`ALTER TABLE "tasks" DROP CONSTRAINT "FK_9a16d2c86252529f622fa53f1e3"`);
        await queryRunner.query(`ALTER TABLE "tasks" DROP CONSTRAINT "FK_34701b0b8d466af308ba202e4ef"`);
        await queryRunner.query(`ALTER TABLE "tasks" DROP CONSTRAINT "FK_e08fca67ca8966e6b9914bf2956"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_tasks_project_status"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_tasks_assignee_status"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_tasks_dueAt"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_34701b0b8d466af308ba202e4e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e08fca67ca8966e6b9914bf295"`);
        await queryRunner.query(`DROP TABLE "tasks"`);
        await queryRunner.query(`DROP TYPE "public"."tasks_priority_enum"`);
        await queryRunner.query(`DROP TYPE "public"."tasks_status_enum"`);
    }

}
