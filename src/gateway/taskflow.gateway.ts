import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
    cors: {
        origin: '*',       // tighten this to your actual frontend origin in production
        credentials: true,
    },
})
export class TaskflowGateway
    implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server!: Server;

    private readonly logger = new Logger(TaskflowGateway.name);

    constructor(
        private readonly jwtService: JwtService,
    ) { }

    /**
     * Called by Socket.IO on every new connection.
     * Clients must supply the JWT in either:
     *   - socket.auth.token   (preferred; set via io({ auth: { token } }))
     *   - Authorization header as "Bearer <token>"
     */
    handleConnection(client: Socket): void {
        const token =
            (client.handshake.auth?.token as string | undefined) ??
            (client.handshake.headers?.authorization as string | undefined)
                ?.replace('Bearer ', '')
                .trim();

        if (!token) {
            this.logger.warn(`Client ${client.id} connected without a token — disconnecting`);
            client.disconnect();
            return;
        }

        try {
            const payload = this.jwtService.verify<{ sub: string }>(token);

            const userId = payload.sub;
            client.data.userId = userId;

            // Each user's personal room. Any server-side call to
            // server.to(`user:${userId}`).emit(...) reaches all
            // of that user's connected clients.
            void client.join(`user:${userId}`);

            this.logger.log(`Client ${client.id} authenticated as user ${userId}`);
        } catch {
            this.logger.warn(
                `Client ${client.id} provided an invalid token — disconnecting`,
            );
            client.disconnect();
        }
    }

    handleDisconnect(client: Socket): void {
        const userId = client.data?.userId ?? 'unauthenticated';
        this.logger.log(`Client ${client.id} (user ${userId}) disconnected`);
    }

    /**
     * Push a real-time event to all connected sessions of the given user.
     * Called by NotificationsProcessor after persisting a notification.
     */
    emitToUser(userId: string, event: string, data: unknown): void {
        this.server.to(`user:${userId}`).emit(event, data);
        this.logger.debug(`Emitted "${event}" to user:${userId}`);
    }
}