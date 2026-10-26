/**
 * src/lib/serverless-data.ts
 * 
 * In-memory fallback and serverless data provider for LocalSaathi on Vercel Free tier.
 * Ensures the entire platform runs 100% out-of-the-box in serverless mode.
 */

export interface DemoUser {
  id: string;
  phone: string;
  role: 'WORKER' | 'EMPLOYER' | 'ADMIN';
  accountStatus: 'ACTIVE';
  verificationStatus: 'VERIFIED';
  createdAt: string;
}

export const DEMO_WORKER: DemoUser = {
  id: 'worker-demo-1',
  phone: '9123456780',
  role: 'WORKER',
  accountStatus: 'ACTIVE',
  verificationStatus: 'VERIFIED',
  createdAt: new Date().toISOString(),
};

export const DEMO_EMPLOYER: DemoUser = {
  id: 'employer-demo-1',
  phone: '9876543210',
  role: 'EMPLOYER',
  accountStatus: 'ACTIVE',
  verificationStatus: 'VERIFIED',
  createdAt: new Date().toISOString(),
};

export const DEMO_ADMIN: DemoUser = {
  id: 'admin-demo-1',
  phone: '9999999999',
  role: 'ADMIN',
  accountStatus: 'ACTIVE',
  verificationStatus: 'VERIFIED',
  createdAt: new Date().toISOString(),
};

export const DEMO_WORKER_PROFILE = {
  userId: 'worker-demo-1',
  displayName: 'Ramesh Kumar',
  gender: 'MALE',
  dateOfBirth: '1992-05-14',
  bio: 'Experienced Master Plumber and certified pipefitter with 8+ years across residential and commercial projects in Lucknow and NCR.',
  experienceYears: 8,
  preferredRadiusKm: 15,
  expectedDailyWage: 850,
  languages: ['hi', 'en'],
  serviceZone: 'Hazratganj, Lucknow',
  primaryCategory: 'Plumbing',
  skills: [
    { skillId: 's-1', name: 'Pipe Fitting & Welding', category: 'Plumbing', experienceYears: 8, isPrimary: true },
    { skillId: 's-2', name: 'Bathroom Valve Repair', category: 'Plumbing', experienceYears: 6, isPrimary: false },
    { skillId: 's-3', name: 'Water Tank Installation', category: 'Plumbing', experienceYears: 5, isPrimary: false },
  ],
  location: {
    locality: 'Hazratganj',
    city: 'Lucknow',
    state: 'Uttar Pradesh',
    pinCode: '226001',
    addressLine: '14/B Ashok Marg',
    latitude: 26.8500,
    longitude: 80.9480,
  },
  availability: [
    { id: 'av-1', dayOfWeek: 'MONDAY', startTime: '08:00', endTime: '18:00', isAvailable: true },
    { id: 'av-2', dayOfWeek: 'TUESDAY', startTime: '08:00', endTime: '18:00', isAvailable: true },
    { id: 'av-3', dayOfWeek: 'WEDNESDAY', startTime: '08:00', endTime: '18:00', isAvailable: true },
    { id: 'av-4', dayOfWeek: 'THURSDAY', startTime: '08:00', endTime: '18:00', isAvailable: true },
    { id: 'av-5', dayOfWeek: 'FRIDAY', startTime: '08:00', endTime: '18:00', isAvailable: true },
    { id: 'av-6', dayOfWeek: 'SATURDAY', startTime: '08:00', endTime: '15:00', isAvailable: true },
  ],
  completion: {
    completionPercentage: 100,
    missingFields: [],
    isComplete: true,
  },
};

export const DEMO_EMPLOYER_PROFILE = {
  userId: 'employer-demo-1',
  businessName: 'Verma Infrastructure & Contracting',
  businessType: 'Contractor / Builder',
  contactPerson: 'Suresh Verma',
  locality: 'Hazratganj',
  city: 'Lucknow',
  state: 'Uttar Pradesh',
  rating: 4.9,
  totalReviews: 38,
  completion: {
    completionPercentage: 100,
    missingFields: [],
    isComplete: true,
  },
};

export const DEMO_JOBS = [
  {
    id: 'demo-job-1',
    title: 'Emergency Residential Pipe Replacement',
    description: 'Need licensed plumber to replace broken bathroom inlet valve and repair pipe joint leaks. Immediate response needed.',
    category: 'Plumbing',
    status: 'PUBLISHED',
    urgency: 'IMMEDIATE',
    wageType: 'DAILY',
    wageAmount: 900,
    workerCount: 1,
    durationDays: 1,
    startDate: 'Today',
    startTime: '09:00',
    requirements: ['Must carry pipe wrench and sealant', 'Clean working practices'],
    languageRequirements: ['hi', 'en'],
    publishedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    location: {
      locality: 'Hazratganj',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      pinCode: '226001',
      addressLine: '14/B Ashok Marg',
      latitude: 26.8500,
      longitude: 80.9480,
    },
    employer: {
      id: 'emp-1',
      businessName: 'Sharma Real Estate Solutions',
      businessType: 'Property Management',
      rating: 4.8,
      totalReviews: 24,
    },
    requiredSkills: [
      { skillId: 's-1', name: 'Pipe Fitting', category: 'Plumbing', isRequired: true, minExperienceYears: 2 },
      { skillId: 's-2', name: 'Leak Detection', category: 'Plumbing', isRequired: true, minExperienceYears: 1 },
    ],
    distanceKm: 1.2,
    match: {
      score: 96,
      reasons: ['Exact skill match', 'Under 2km from your location', 'High daily wage'],
      breakdown: { skillScore: 40, distanceScore: 35, ratingScore: 21, totalScore: 96 },
    },
  },
  {
    id: 'demo-job-2',
    title: 'Commercial Building Electrical Wiring & MCB Distribution',
    description: 'Looking for a certified electrician to install main distribution boards, test circuit breakers, and run conduit lines.',
    category: 'Electrical',
    status: 'PUBLISHED',
    urgency: 'HIGH',
    wageType: 'DAILY',
    wageAmount: 850,
    workerCount: 2,
    durationDays: 3,
    startDate: 'Tomorrow',
    startTime: '08:30',
    requirements: ['Experience with industrial 3-phase wiring', 'Safety footwear required'],
    languageRequirements: ['hi'],
    publishedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    location: {
      locality: 'Aliganj',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      pinCode: '226024',
      addressLine: 'Sector B, Kapoorthala',
      latitude: 26.8900,
      longitude: 80.9400,
    },
    employer: {
      id: 'emp-2',
      businessName: 'Verma Infrastructure Pvt Ltd',
      businessType: 'Construction',
      rating: 4.9,
      totalReviews: 42,
    },
    requiredSkills: [
      { skillId: 's-3', name: 'Electrical Wiring', category: 'Electrical', isRequired: true, minExperienceYears: 4 },
      { skillId: 's-4', name: 'Appliance Repair', category: 'Electrical', isRequired: false, minExperienceYears: 1 },
    ],
    distanceKm: 2.4,
    match: {
      score: 91,
      reasons: ['Under 3km commute', 'Multi-day project guarantee', 'Top employer rating'],
      breakdown: { skillScore: 38, distanceScore: 33, ratingScore: 20, totalScore: 91 },
    },
  },
  {
    id: 'demo-job-3',
    title: 'Custom Wooden Wardrobe & Kitchen Cabinet Carpentry',
    description: 'Skilled carpenter required to assemble modular plywood cabinets, fit soft-close hinges, and align drawer channels.',
    category: 'Carpentry',
    status: 'PUBLISHED',
    urgency: 'MEDIUM',
    wageType: 'DAILY',
    wageAmount: 950,
    workerCount: 1,
    durationDays: 5,
    startDate: 'Next Monday',
    startTime: '09:00',
    requirements: ['Own basic power tools and measuring tools', 'Plywood laminate experience'],
    languageRequirements: ['hi'],
    publishedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    location: {
      locality: 'Gomti Nagar',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      pinCode: '226010',
      addressLine: 'Vipul Khand 2',
      latitude: 26.8600,
      longitude: 80.9900,
    },
    employer: {
      id: 'emp-3',
      businessName: 'Awadh Woodcraft Studio',
      businessType: 'Interior Contracting',
      rating: 4.7,
      totalReviews: 19,
    },
    requiredSkills: [
      { skillId: 's-5', name: 'Cabinet Assembly', category: 'Carpentry', isRequired: true, minExperienceYears: 3 },
      { skillId: 's-6', name: 'Laminate Finishing', category: 'Carpentry', isRequired: false, minExperienceYears: 2 },
    ],
    distanceKm: 4.8,
    match: {
      score: 87,
      reasons: ['High daily rate (Rs 950/day)', '5-day booking duration'],
      breakdown: { skillScore: 35, distanceScore: 30, ratingScore: 22, totalScore: 87 },
    },
  },
];

export const DEMO_BOOKINGS = [
  {
    id: 'booking-demo-1',
    jobId: 'demo-job-1',
    jobTitle: 'Emergency Residential Pipe Replacement',
    employerId: 'employer-demo-1',
    employerName: 'Verma Infrastructure & Contracting',
    workerId: 'worker-demo-1',
    workerName: 'Ramesh Kumar',
    status: 'CONFIRMED',
    wageType: 'DAILY',
    wageAmount: 900,
    startDate: new Date().toISOString().split('T')[0],
    startTime: '09:00',
    durationDays: 1,
    locality: 'Hazratganj, Lucknow',
    createdAt: new Date().toISOString(),
  },
];

export const DEMO_NOTIFICATIONS = [
  {
    id: 'notif-1',
    type: 'APPLICATION_SHORTLISTED',
    title: 'Application Shortlisted! 🎉',
    body: 'Verma Infrastructure shortlisted your application for Emergency Residential Pipe Replacement.',
    isRead: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'notif-2',
    type: 'BOOKING_CONFIRMED',
    title: 'Booking Confirmed',
    body: 'Your work engagement for tomorrow at Hazratganj, Lucknow has been confirmed.',
    isRead: true,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
];
