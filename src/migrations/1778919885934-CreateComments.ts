import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateComments1778919885934 implements MigrationInterface {
    name = 'CreateComments1778919885934'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "comments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "taskId" uuid NOT NULL, "parentCommentId" uuid, "authorId" uuid NOT NULL, "body" text NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_8bf68bc960f2b69e818bdb90dcb" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_9adf2d3106c6dc87d6262ccadf" ON "comments" ("taskId") `);
        await queryRunner.query(`CREATE INDEX "IDX_4875672591221a61ace66f2d4f" ON "comments" ("parentCommentId") `);
        await queryRunner.query(`CREATE INDEX "IDX_comments_task_created" ON "comments" ("taskId", "createdAt") `);
        await queryRunner.query(`ALTER TABLE "comments" ADD CONSTRAINT "FK_9adf2d3106c6dc87d6262ccadfe" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "comments" ADD CONSTRAINT "FK_4875672591221a61ace66f2d4f9" FOREIGN KEY ("parentCommentId") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "comments" ADD CONSTRAINT "FK_4548cc4a409b8651ec75f70e280" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "comments" DROP CONSTRAINT "FK_4548cc4a409b8651ec75f70e280"`);
        await queryRunner.query(`ALTER TABLE "comments" DROP CONSTRAINT "FK_4875672591221a61ace66f2d4f9"`);
        await queryRunner.query(`ALTER TABLE "comments" DROP CONSTRAINT "FK_9adf2d3106c6dc87d6262ccadfe"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_comments_task_created"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4875672591221a61ace66f2d4f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9adf2d3106c6dc87d6262ccadf"`);
        await queryRunner.query(`DROP TABLE "comments"`);
    }

}
