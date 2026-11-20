import type { PrismaClient } from '@prisma/client';
import { DEFAULT_SETTINGS, type AcademicSettings } from '../domain/academic';

export async function getAcademicSettings(prisma: PrismaClient): Promise<AcademicSettings> {
  const row = await prisma.academicSetting.findUnique({ where: { id: 1 } });
  return row ? { juniorMaxSemester: row.juniorMaxSemester, maxSemester: row.maxSemester } : DEFAULT_SETTINGS;
}
