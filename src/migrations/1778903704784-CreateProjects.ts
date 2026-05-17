import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateProjects1778903704784 implements MigrationInterface {
    name = 'CreateProjects1778903704784'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "projects" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workspaceId" uuid NOT NULL, "name" character varying(100) NOT NULL, "description" text, "createdById" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6271df0a7aed1d6c0691ce6ac50" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_108ff8a2d40c2b294511c92a7c" ON "projects" ("workspaceId") `);
        await queryRunner.query(`CREATE INDEX "IDX_f55144dc92df43cd1dad5d29b9" ON "projects" ("createdById") `);
        await queryRunner.query(`ALTER TABLE "projects" ADD CONSTRAINT "FK_108ff8a2d40c2b294511c92a7c8" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "projects" ADD CONSTRAINT "FK_f55144dc92df43cd1dad5d29b90" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "projects" DROP CONSTRAINT "FK_f55144dc92df43cd1dad5d29b90"`);
        await queryRunner.query(`ALTER TABLE "projects" DROP CONSTRAINT "FK_108ff8a2d40c2b294511c92a7c8"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f55144dc92df43cd1dad5d29b9"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_108ff8a2d40c2b294511c92a7c"`);
        await queryRunner.query(`DROP TABLE "projects"`);
    }

}
