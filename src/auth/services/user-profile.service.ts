import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * UserProfileService: User profile management
 * Handles: Profile updates (name, timezone)
 */
@Injectable()
export class UserProfileService {
  constructor(private prisma: PrismaService) {}

  /**
   * Update user profile (name and/or timezone)
   */
  async updateUserProfile(userId: string, updateData: { name?: string; preferred_timezone?: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Build update object (only include fields that are provided)
    const dataToUpdate: any = {};
    if (updateData.name !== undefined) {
      dataToUpdate.name = updateData.name;
    }
    if (updateData.preferred_timezone !== undefined) {
      dataToUpdate.preferred_timezone = updateData.preferred_timezone;
    }

    // Update user profile
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: dataToUpdate,
      select: {
        id: true,
        email: true,
        name: true,
        email_verified: true,
        preferred_timezone: true,
        created_at: true,
      },
    });

    return {
      message: 'Profile updated successfully',
      user: updatedUser,
    };
  }
}
