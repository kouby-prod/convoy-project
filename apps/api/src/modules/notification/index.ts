import { OpenAPIHono } from '@hono/zod-openapi';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { requireAuth, getAuth, type AuthEnv } from '../../auth';
import { db } from '../../db/client';
import { notification } from '../../db/notification';
import { listNotificationsRoute, markNotificationReadRoute } from './notification.routes';

const app = new OpenAPIHono<AuthEnv>();
app.use('/notifications', requireAuth);

export const notificationModule = app
  .openapi(listNotificationsRoute, async (c) => {
    const { user } = getAuth(c);
    const { page, limit } = c.req.valid('query');
    const offset = (page - 1) * limit;
    const rows = await db
      .select()
      .from(notification)
      .where(eq(notification.userId, user.id))
      .orderBy(asc(notification.createdAt))
      .limit(limit + 1)
      .offset(offset);
    const [unreadRow] = await db
      .select({ unreadCount: sql<number>`count(*)::int` })
      .from(notification)
      .where(and(eq(notification.userId, user.id), isNull(notification.readAt)));
    const unreadCount = unreadRow?.unreadCount ?? 0;
    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      readAt: row.readAt?.toISOString() ?? null,
    }));
    return c.json({ items, page, limit, hasMore, unreadCount }, 200);
  })
  .openapi(markNotificationReadRoute, async (c) => {
    const { user } = getAuth(c);
    const { id } = c.req.valid('param');
    const [row] = await db
      .update(notification)
      .set({ readAt: new Date() })
      .where(and(eq(notification.id, id), eq(notification.userId, user.id)))
      .returning();
    if (!row) return c.json({ error: 'Notification not found' }, 404);
    return c.json(
      {
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        readAt: row.readAt?.toISOString() ?? null,
      },
      200,
    );
  });
