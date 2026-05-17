// src/activities/activity-type.enum.ts
export enum ActivityType {
    TASK_CREATED = 'task.created',
    TASK_UPDATED = 'task.updated',
    TASK_STATUS_CHANGED = 'task.status_changed',
    TASK_ASSIGNED = 'task.assigned',
    TASK_COMPLETED = 'task.completed',
    TASK_DELETED = 'task.deleted',
    COMMENT_ADDED = 'comment.added',
    MEMBER_ADDED = 'member.added',
    MEMBER_REMOVED = 'member.removed',
    MEMBER_ROLE_CHANGED = 'member.role_changed',
    PROJECT_CREATED = 'project.created',
    PROJECT_UPDATED = 'project.updated',
}

export enum ActivityEntityType {
    TASK = 'task',
    COMMENT = 'comment',
    PROJECT = 'project',
    WORKSPACE_MEMBER = 'workspace_member',
}