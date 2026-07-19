import { z } from 'zod';

export const UserRoleSchema = z.enum(['USER','EDITOR','MODERATOR','RESOLVER','SUPPORT','FINANCE','ADMIN']);

export type UserRoleType = `${z.infer<typeof UserRoleSchema>}`

export default UserRoleSchema;
