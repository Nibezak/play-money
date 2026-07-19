import { z } from 'zod';

export const UserScalarFieldEnumSchema = z.enum(['id','username','displayName','avatarUrl','twitterHandle','discordHandle','website','bio','timezone','primaryAccountId','role','referralCode','referredBy','createdAt','updatedAt','email','emailVerified','address','depositWalletAddress','depositWalletSignature','depositWalletSignedAt','depositWalletStatus','depositWalletTxHash','settings']);

export default UserScalarFieldEnumSchema;
