// src/activities/activities.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Activity } from './activity.entity';
import { ActivitiesService } from './activities.service';
import { ActivitiesController } from './activities.controller';
import { ProjectsModule } from 'src/projects/projects.module';
import { WorkspacesModule } from 'src/workspaces/workspaces.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Activity]),
    forwardRef(() => WorkspacesModule),
    forwardRef(() => ProjectsModule),
  ],
  controllers: [ActivitiesController],
  providers: [ActivitiesService],
  exports: [ActivitiesService],
})
export class ActivitiesModule { }