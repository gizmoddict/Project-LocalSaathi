import { PrismaClient, UserRole, WageType, JobStatus, JobUrgency, AvailabilityStatus, ApplicationStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // eslint-disable-next-line no-console
  console.log('Seeding LocalSaathi database with realistic development fixtures...');

  // 1. Seed Skills
  const skillsData = [
    { name: 'Plumbing', normalizedName: 'plumbing', category: 'Plumbing' },
    { name: 'Pipe Fitting', normalizedName: 'pipe_fitting', category: 'Plumbing' },
    { name: 'Electrical Wiring', normalizedName: 'electrical_wiring', category: 'Electrical' },
    { name: 'Appliance Repair', normalizedName: 'appliance_repair', category: 'Electrical' },
    { name: 'Carpentry', normalizedName: 'carpentry', category: 'Carpentry' },
    { name: 'Furniture Assembly', normalizedName: 'furniture_assembly', category: 'Carpentry' },
    { name: 'Masonry', normalizedName: 'masonry', category: 'Construction' },
    { name: 'Tile Laying', normalizedName: 'tile_laying', category: 'Construction' },
    { name: 'House Painting', normalizedName: 'house_painting', category: 'Painting' },
    { name: 'Deep Cleaning', normalizedName: 'deep_cleaning', category: 'Cleaning' },
    { name: 'Commercial Driving', normalizedName: 'commercial_driving', category: 'Logistics' },
    { name: 'General Helper', normalizedName: 'general_helper', category: 'Helper' },
  ];

  const skills: Record<string, string> = {};
  for (const s of skillsData) {
    const record = await prisma.skill.upsert({
      where: { normalizedName: s.normalizedName },
      update: {},
      create: s,
    });
    skills[s.normalizedName] = record.id;
  }
  // eslint-disable-next-line no-console
  console.log(`Seeded ${Object.keys(skills).length} core skills.`);

  // 2. Seed Employers
  const employerUsers = [
    {
      phone: '9876543210',
      email: 'rajesh.sharma@example.com',
      businessName: 'Sharma Home Renovations',
      businessType: 'Contractor',
    },
    {
      phone: '9876543211',
      email: 'sunil.verma@example.com',
      businessName: 'Verma Infrastructure Pvt Ltd',
      businessType: 'Construction',
    },
  ];

  const employerProfileIds: string[] = [];
  for (const emp of employerUsers) {
    const user = await prisma.user.upsert({
      where: { phone: emp.phone },
      update: {},
      create: {
        phone: emp.phone,
        email: emp.email,
        role: UserRole.EMPLOYER,
        employerProfile: {
          create: {
            businessName: emp.businessName,
            businessType: emp.businessType,
            description: 'Premier local contractor providing residential and commercial maintenance.',
            contactPreferences: ['PHONE', 'WHATSAPP'],
            totalJobsPosted: 5,
            totalHires: 12,
          },
        },
      },
      include: { employerProfile: true },
    });
    if (user.employerProfile) {
      employerProfileIds.push(user.employerProfile.id);
    }
  }

  // 3. Seed Workers with Profiles, Skills, Locations & Availability
  // Baseline Reference Coordinates: Lucknow, UP, India (~26.8467° N, 80.9462° E)
  const workersData = [
    {
      phone: '9123456780',
      name: 'Ramesh Kumar',
      skills: ['plumbing', 'pipe_fitting'],
      experienceYears: 7,
      expectedWage: 800,
      wageType: WageType.DAILY,
      lat: 26.8500,
      lng: 80.9480, // ~500m from center (Hazratganj)
      locality: 'Hazratganj',
    },
    {
      phone: '9123456781',
      name: 'Suresh Patel',
      skills: ['electrical_wiring', 'appliance_repair'],
      experienceYears: 5,
      expectedWage: 750,
      wageType: WageType.DAILY,
      lat: 26.8650,
      lng: 80.9350, // ~2.2km away (Aliganj)
      locality: 'Aliganj',
    },
    {
      phone: '9123456782',
      name: 'Manoj Singh',
      skills: ['carpentry', 'furniture_assembly'],
      experienceYears: 9,
      expectedWage: 900,
      wageType: WageType.DAILY,
      lat: 26.8320,
      lng: 80.9120, // ~4.1km away (Gomti Nagar)
      locality: 'Gomti Nagar',
    },
    {
      phone: '9123456783',
      name: 'Dinesh Yadav',
      skills: ['masonry', 'tile_laying'],
      experienceYears: 11,
      expectedWage: 850,
      wageType: WageType.DAILY,
      lat: 26.8120,
      lng: 80.8900, // ~7.3km away (Alambagh)
      locality: 'Alambagh',
    },
  ];

  const workerProfileIds: string[] = [];
  for (const w of workersData) {
    const user = await prisma.user.upsert({
      where: { phone: w.phone },
      update: {},
      create: {
        phone: w.phone,
        role: UserRole.WORKER,
        workerProfile: {
          create: {
            displayName: w.name,
            experienceYears: w.experienceYears,
            expectedWage: w.expectedWage,
            wageType: w.wageType,
            preferredRadiusKm: 15,
            languages: ['hi', 'en'],
            avgRating: 4.8,
            ratingCount: 14,
            reliabilityScore: 98.5,
            workerLocation: {
              create: {
                latitude: w.lat,
                longitude: w.lng,
                accuracyMeters: 10,
                isActive: true,
              },
            },
            workerSkills: {
              create: w.skills.map((skillNorm) => ({
                skillId: skills[skillNorm]!,
                proficiency: 'EXPERT',
                experienceYears: w.experienceYears,
                isVerified: true,
              })),
            },
            availabilities: {
              create: [
                {
                  date: new Date(),
                  startTime: '08:00',
                  endTime: '17:00',
                  status: AvailabilityStatus.AVAILABLE,
                },
              ],
            },
          },
        },
      },
      include: { workerProfile: true },
    });
    if (user.workerProfile) {
      workerProfileIds.push(user.workerProfile.id);
    }
  }
  // eslint-disable-next-line no-console
  console.log(`Seeded ${workerProfileIds.length} workers with profiles, skills, locations, and availability.`);

  // 4. Seed Jobs
  if (employerProfileIds[0]) {
    const job = await prisma.jobPost.create({
      data: {
        employerProfileId: employerProfileIds[0],
        title: 'Emergency Residential Pipe Replacement',
        description: 'Need licensed plumber to replace broken bathroom inlet valve and repair pipe joint leaks.',
        status: JobStatus.PUBLISHED,
        category: 'Plumbing',
        wageType: WageType.DAILY,
        wageAmount: 900,
        workerCount: 1,
        durationDays: 1,
        startDate: new Date(),
        startTime: '09:00',
        urgency: JobUrgency.IMMEDIATE,
        requirements: ['Must carry pipe wrench and sealant', 'Clean working practices'],
        publishedAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        jobLocation: {
          create: {
            latitude: 26.8520,
            longitude: 80.9500, // Hazratganj central
            addressLine: '14/B Ashok Marg',
            locality: 'Hazratganj',
            city: 'Lucknow',
            state: 'Uttar Pradesh',
            pinCode: '226001',
          },
        },
        jobRequiredSkills: {
          create: [
            {
              skillId: skills['plumbing']!,
              isRequired: true,
              minExperienceYears: 3,
            },
          ],
        },
      },
    });

    // 5. Seed Job Application
    if (workerProfileIds[0]) {
      await prisma.jobApplication.upsert({
        where: {
          jobPostId_workerProfileId: {
            jobPostId: job.id,
            workerProfileId: workerProfileIds[0],
          },
        },
        update: {},
        create: {
          jobPostId: job.id,
          workerProfileId: workerProfileIds[0],
          status: ApplicationStatus.APPLIED,
          decisionNotes: 'Highly rated plumber available immediately within 1km radius.',
        },
      });
      // eslint-disable-next-line no-console
      console.log(`Seeded JobPost and JobApplication between employer and worker.`);
    }
  }

  // Update PostGIS points for seeded records
  await prisma.$executeRawUnsafe(`
    UPDATE job_locations 
    SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
    WHERE location IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL;
  `).catch(() => {});

  await prisma.$executeRawUnsafe(`
    UPDATE worker_locations 
    SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
    WHERE location IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL;
  `).catch(() => {});

  // eslint-disable-next-line no-console
  console.log('LocalSaathi database seed completed successfully.');
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
