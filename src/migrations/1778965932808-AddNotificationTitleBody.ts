import { MigrationInterface, QueryRunner } from "typeorm";

export class AddNotificationTitleBody1778965932808 implements MigrationInterface {
    name = 'AddNotificationTitleBody1778965932808'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "notifications" DROP CONSTRAINT "notifications_userId_fkey"`);
        await queryRunner.query(`ALTER TABLE "notifications" ADD "title" character varying(200) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "notifications" ADD "body" text`);
        await queryRunner.query(`DROP INDEX "public"."IDX_notifications_userId_createdAt"`);
        await queryRunner.query(`ALTER TABLE "notifications" ALTER COLUMN "payload" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "createdAt"`);
        await queryRunner.query(`ALTER TABLE "notifications" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`CREATE INDEX "IDX_notifications_userId_createdAt" ON "notifications" ("userId", "createdAt") `);
        await queryRunner.query(`ALTER TABLE "notifications" ADD CONSTRAINT "FK_692a909ee0fa9383e7859f9b406" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "notifications" DROP CONSTRAINT "FK_692a909ee0fa9383e7859f9b406"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_notifications_userId_createdAt"`);
        await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "createdAt"`);
        await queryRunner.query(`ALTER TABLE "notifications" ADD "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "notifications" ALTER COLUMN "payload" SET DEFAULT '{}'`);
        await queryRunner.query(`CREATE INDEX "IDX_notifications_userId_createdAt" ON "notifications" ("userId", "createdAt") `);
        await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "body"`);
        await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "title"`);
        await queryRunner.query(`ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
