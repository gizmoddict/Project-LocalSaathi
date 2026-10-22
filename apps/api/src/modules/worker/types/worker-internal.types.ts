import { Prisma } from '@prisma/client';

export type WorkerWithFullRelations = Prisma.WorkerProfileGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        phone: true;
        role: true;
        accountStatus: true;
        verificationStatus: true;
        createdAt: true;
      };
    };
    workerSkills: {
      include: {
        skill: true;
      };
    };
    workerLocation: true;
    availabilities: {
      orderBy: {
        date: 'asc';
      };
    };
  };
}>;

export interface ImageStorageUploadResult {
  key: string;
  url: string;
  sizeBytes: number;
  mimeType: string;
}
