import { OpenAPIHono } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { requireAuth, getAuth, type AuthEnv } from '../../auth';
import { db } from '../../db/client';
import { userAvatar } from '../../db/avatar';
import { user } from '../../db/auth-schema';
import { buildStorageKey, isKeyOwnedBy } from '../../storage/keys';
import { createUploadUrl, createViewUrl, objectExists, URL_TTL_SECONDS } from '../../storage/s3';
import {
  createAvatarUploadUrlRoute,
  getAvatarRoute,
  putMyAvatarRoute,
} from './avatar.routes';

const app = new OpenAPIHono<AuthEnv>();
app.use('/avatars/me', requireAuth);
app.use('/avatars/me/upload-url', requireAuth);

export const avatarModule = app
  .openapi(createAvatarUploadUrlRoute, async (c) => {
    const { user: authUser } = getAuth(c);
    const { fileName, mimeType } = c.req.valid('json');
    if (mimeType === 'application/pdf') {
      return c.json({ error: 'Profile photos must be JPG, PNG, or WEBP' }, 400);
    }
    const storageKey = buildStorageKey(authUser.id, fileName);
    const uploadUrl = await createUploadUrl(storageKey);
    return c.json({ uploadUrl, storageKey, expiresInSeconds: URL_TTL_SECONDS }, 200);
  })
  .openapi(putMyAvatarRoute, async (c) => {
    const { user: authUser } = getAuth(c);
    const body = c.req.valid('json');

    if (body.mimeType === 'application/pdf') {
      return c.json({ error: 'Profile photos must be JPG, PNG, or WEBP' }, 400);
    }
    if (!isKeyOwnedBy(body.storageKey, authUser.id)) {
      return c.json({ error: 'Unknown upload' }, 400);
    }
    if (!(await objectExists(body.storageKey))) {
      return c.json({ error: 'The file was not uploaded' }, 400);
    }

    await db
      .insert(userAvatar)
      .values({ userId: authUser.id, storageKey: body.storageKey, mimeType: body.mimeType })
      .onConflictDoUpdate({
        target: userAvatar.userId,
        set: { storageKey: body.storageKey, mimeType: body.mimeType, updatedAt: new Date() },
      });
    await db.update(user).set({ image: body.storageKey, updatedAt: new Date() }).where(eq(user.id, authUser.id));

    const viewUrl = await createViewUrl(body.storageKey, {
      fileName: body.fileName,
      mimeType: body.mimeType,
    });
    return c.json({ viewUrl, expiresInSeconds: URL_TTL_SECONDS }, 200);
  })
  .openapi(getAvatarRoute, async (c) => {
    const { userId } = c.req.valid('param');
    const [row] = await db.select().from(userAvatar).where(eq(userAvatar.userId, userId));
    if (row) {
      const viewUrl = await createViewUrl(row.storageKey, {
        fileName: 'avatar',
        mimeType: row.mimeType,
      });
      return c.json({ viewUrl, expiresInSeconds: URL_TTL_SECONDS }, 200);
    }

    const [account] = await db.select({ image: user.image }).from(user).where(eq(user.id, userId));
    if (account?.image?.startsWith('http://') || account?.image?.startsWith('https://')) {
      return c.json({ viewUrl: account.image, expiresInSeconds: URL_TTL_SECONDS }, 200);
    }
    return c.json({ error: 'No photo on file' }, 404);
  });
