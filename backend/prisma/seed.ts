import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Seed default user (Administrator)
  const adminUsername = 'admin';
  const adminPassword = 'admin123';
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(adminPassword, salt);

  const admin = await prisma.user.upsert({
    where: { username: adminUsername },
    update: {
      fullName: 'Administrator',
      role: 'admin',
      isActive: true,
    },
    create: {
      username: adminUsername,
      passwordHash: passwordHash,
      fullName: 'Administrator',
      role: 'admin',
      isActive: true,
    },
  });
  console.log(`Admin user created/verified: ${admin.username} (password: ${adminPassword})`);

  // Seed a sample leader for testing
  const leaderUsername = 'leader';
  const leaderPassword = 'leader123';
  const leaderHash = await bcrypt.hash(leaderPassword, salt);
  const leader = await prisma.user.upsert({
    where: { username: leaderUsername },
    update: {
      fullName: 'Jan Kowalski (Leader)',
      role: 'leader',
      isActive: true,
    },
    create: {
      username: leaderUsername,
      passwordHash: leaderHash,
      fullName: 'Jan Kowalski (Leader)',
      role: 'leader',
      isActive: true,
    },
  });
  console.log(`Leader user created/verified: ${leader.username} (password: ${leaderPassword})`);

  // 2. Seed established canonical system work time types
  // Only established canonical system types are seeded. Custom/client types (including custom collisions)
  // must never be overwritten, taken over, or normalized by production startup seed.
  const canonicalSystemTypes = [
    { code: 'G', name: 'Standardowe godziny pracy', requiresOrder: true, isAbsence: false, isSystem: true },
    { code: 'NDR', name: 'Nadgodziny', requiresOrder: true, isAbsence: false, isSystem: true },
    { code: 'NS', name: 'Nadgodziny sobota/niedziela', requiresOrder: true, isAbsence: false, isSystem: true },
    { code: 'UW', name: 'Urlop wypoczynkowy', requiresOrder: false, isAbsence: true, isSystem: true },
    { code: 'UOK', name: 'Urlop okolicznościowy', requiresOrder: false, isAbsence: true, isSystem: true },
    { code: 'UŻ', name: 'Urlop na żądanie', requiresOrder: false, isAbsence: true, isSystem: true },
    { code: 'L4', name: 'Zwolnienie chorobowe', requiresOrder: false, isAbsence: true, isSystem: true },
  ];

  for (const type of canonicalSystemTypes) {
    const existing = await prisma.workTimeType.findUnique({
      where: { code: type.code },
    });

    if (!existing) {
      await prisma.workTimeType.create({
        data: type,
      });
    } else if (existing.isSystem) {
      // For existing system types, ensure required system invariant flags without overwriting custom names
      if (
        existing.requiresOrder !== type.requiresOrder ||
        existing.isAbsence !== type.isAbsence
      ) {
        await prisma.workTimeType.update({
          where: { code: type.code },
          data: {
            requiresOrder: type.requiresOrder,
            isAbsence: type.isAbsence,
          },
        });
      }
    }
    // If existing and NOT isSystem: client-owned row, preserved intact without takeover.
  }
  console.log('Work time types seeded.');
  console.log('System seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
