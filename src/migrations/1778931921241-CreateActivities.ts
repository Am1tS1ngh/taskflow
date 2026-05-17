import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateActivities1778931921241 implements MigrationInterface {
    name = 'CreateActivities1778931921241'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "activities" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workspaceId" uuid NOT NULL, "actorId" uuid NOT NULL, "type" character varying(64) NOT NULL, "entityType" character varying(32) NOT NULL, "entityId" uuid NOT NULL, "payload" jsonb NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7f4004429f731ffb9c88eb486a8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_activities_entity" ON "activities" ("entityType", "entityId") `);
        await queryRunner.query(`CREATE INDEX "IDX_activities_workspace_created" ON "activities" ("workspaceId", "createdAt") `);
        await queryRunner.query(`ALTER TABLE "activities" ADD CONSTRAINT "FK_01604411bae8cb5e75bf2524ffb" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "activities" ADD CONSTRAINT "FK_6d64140609adc1f8c5e6d2e7b3f" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "activities" DROP CONSTRAINT "FK_6d64140609adc1f8c5e6d2e7b3f"`);
        await queryRunner.query(`ALTER TABLE "activities" DROP CONSTRAINT "FK_01604411bae8cb5e75bf2524ffb"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_activities_workspace_created"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_activities_entity"`);
        await queryRunner.query(`DROP TABLE "activities"`);
    }

}
