import type { User } from '@prisma/client';

/** The only shape in which a user leaves the server. Allow-list: new columns are private until added here. */
export function toUserDto(u: User) {
  return { id: u.id, name: u.name, email: u.email, accountRole: u.accountRole, academicLevel: u.academicLevel, department: u.department, branch: u.branch, college: u.college,
    enrollmentNumber: u.enrollmentNumber, enrollmentYear: u.enrollmentYear, graduationYear: u.graduationYear, currentSemester: u.currentSemester, bio: u.bio, profilePhotoUrl: u.profilePhotoUrl,
    availableForQuestions: u.availableForQuestions, publicContributions: u.publicContributions, themePreference: u.themePreference, createdAt: u.createdAt };
}
export type UserDto = ReturnType<typeof toUserDto>;
