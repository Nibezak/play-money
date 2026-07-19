import { z } from 'zod';

export const SettingScalarFieldEnumSchema = z.enum(['id','group','key','value','createdAt','updatedAt']);

export default SettingScalarFieldEnumSchema;
