import { OpenAPIHono } from '@hono/zod-openapi';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { requireAuth, getAuth, type AuthEnv } from '../../auth';
import { db } from '../../db/client';
import { notification } from '../../db/notification';
import { serializeNotification } from './serialize';
import {
  listNotificationsRoute,
  markNotificationReadRoute,
  markAllNotificationsReadRoute,
  unreadNotificationCountRoute,
} from './notification.routes';

const app = new OpenAPIHono<AuthEnv>();
app.use('/notifications', requireAuth);
app.use('/notifications/unread-count', requireAuth);
app.use('/notifications/read-all', requireAuth);
app.use('/notifications/:id/read', requireAuth);

async function unreadCountFor(userId: string): Promise<number> {
  const [row] = await db
    .select({ unreadCount: sql<number>`count(*)::int` })
    .from(notification)
    .where(and(eq(notification.userId, userId), isNull(notification.readAt)));
  return row?.unreadCount ?? 0;
}

export const notificationModule = app
  .openapi(listNotificationsRoute, async (c) => {
    const { user } = getAuth(c);
    const { page, limit, unreadOnly } = c.req.valid('query');
    const offset = (page - 1) * limit;
    const where =
      unreadOnly === 'true'
        ? and(eq(notification.userId, user.id), isNull(notification.readAt))
        : eq(notification.userId, user.id);
    const rows = await db
      .select()
      .from(notification)
      .where(where)
      .orderBy(desc(notification.createdAt))
      .limit(limit + 1)
      .offset(offset);
    const unreadCount = await unreadCountFor(user.id);
    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map(serializeNotification);
    return c.json({ items, page, limit, hasMore, unreadCount }, 200);
  })
  .openapi(unreadNotificationCountRoute, async (c) => {
    const { user } = getAuth(c);
    const unreadCount = await unreadCountFor(user.id);
    return c.json({ unreadCount }, 200);
  })
  .openapi(markAllNotificationsReadRoute, async (c) => {
    const { user } = getAuth(c);
    const rows = await db
      .update(notification)
      .set({ readAt: new Date() })
      .where(and(eq(notification.userId, user.id), isNull(notification.readAt)))
      .returning({ id: notification.id });
    return c.json({ updated: rows.length }, 200);
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
    return c.json(serializeNotification(row), 200);
  });
