// src/workspaces/guards/workspace-member.guard.ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WorkspacesService } from '../workspaces.service';

/**
 * Extracts a workspaceId from the request (via :workspaceId path param OR a
 * resolver provided per-route) and verifies the caller is a member.
 *
 * On success, attaches `req.workspaceMembership` so handlers can read the role.
 */
@Injectable()
export class WorkspaceMemberGuard implements CanActivate {
  constructor(private readonly workspacesService: WorkspacesService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const userId: string | undefined = req.user?.id;
    if (!userId) throw new ForbiddenException('Not authenticated');

    const workspaceId = req.params?.workspaceId;
    if (!workspaceId) {
      throw new NotFoundException('No workspaceId in route');
    }

    const membership = await this.workspacesService.getMembership(workspaceId, userId);
    if (!membership) {
      throw new ForbiddenException('Not a member of this workspace');
    }

    req.workspaceMembership = membership;
    return true;
  }
}