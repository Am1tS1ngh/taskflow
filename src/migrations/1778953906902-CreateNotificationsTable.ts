import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationsTable1778953906902 implements MigrationInterface {
    name = 'CreateNotificationsTable1778953906902'
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId"    uuid        NOT NULL
                                REFERENCES users(id) ON DELETE CASCADE,
        type        varchar(50) NOT NULL,
        payload     jsonb       NOT NULL DEFAULT '{}',
        read        boolean     NOT NULL DEFAULT false,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);

        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_notifications_userId_createdAt"
        ON notifications ("userId", "createdAt" DESC)
    `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_notifications_userId_createdAt"
    `);
        await queryRunner.query(`
      DROP TABLE IF EXISTS notifications
    `);
    }
}