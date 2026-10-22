import { evaluateWorkerJobMatch, MatchingWorkerData, MatchingJobData } from '../matching.engine';

describe('LocalSaathi Deterministic Matching Engine (Unit Tests)', () => {
  const baseWorker: MatchingWorkerData = {
    experienceYears: 5,
    expectedWage: 800,
    wageType: 'DAILY',
    preferredRadiusKm: 20,
    isAvailable: true,
    skills: [
      { skillId: 'skill-elec', proficiency: 'EXPERT', experienceYears: 5 },
      { skillId: 'skill-plumb', proficiency: 'INTERMEDIATE', experienceYears: 3 },
    ],
    availabilities: [
      { date: '2026-10-10', status: 'AVAILABLE' },
      { date: '2026-10-11', status: 'UNAVAILABLE' },
    ],
  };

  const baseJob: MatchingJobData = {
    id: 'job-1',
    startDate: '2026-10-10',
    startTime: '09:00',
    durationDays: 1,
    wageAmount: 1000,
    wageType: 'DAILY',
    requiredSkills: [
      {
        skillId: 'skill-elec',
        name: 'Electrical Wiring',
        category: 'Electrical',
        isRequired: true,
        minExperienceYears: 3,
      },
    ],
  };

  it('1. Determinism - same inputs always yield identical scores and reasons', () => {
    const res1 = evaluateWorkerJobMatch(baseWorker, baseJob, 5, 20);
    const res2 = evaluateWorkerJobMatch(baseWorker, baseJob, 5, 20);

    expect(res1.match.score).toBe(res2.match.score);
    expect(res1.match.eligible).toBe(res2.match.eligible);
    expect(res1.match.reasons).toEqual(res2.match.reasons);
    expect(res1.match.breakdown).toEqual(res2.match.breakdown);
  });

  it('2. Distance Decay - score decreases as distance approaches service radius boundary', () => {
    const closeRes = evaluateWorkerJobMatch(baseWorker, baseJob, 1, 20);
    const midRes = evaluateWorkerJobMatch(baseWorker, baseJob, 10, 20);
    const farRes = evaluateWorkerJobMatch(baseWorker, baseJob, 19.5, 20);
    const outsideRes = evaluateWorkerJobMatch(baseWorker, baseJob, 25, 20);

    expect(closeRes.match.breakdown.distanceScore).toBeGreaterThan(midRes.match.breakdown.distanceScore);
    expect(midRes.match.breakdown.distanceScore).toBeGreaterThan(farRes.match.breakdown.distanceScore);
    expect(outsideRes.match.breakdown.distanceScore).toBe(0);
    expect(outsideRes.match.eligible).toBe(false);
    expect(outsideRes.match.reasons.some((r) => r.includes('Outside your'))).toBe(true);
  });

  it('3. Skill Matching - handles full match, partial match, and zero match with precision', () => {
    const multiSkillJob: MatchingJobData = {
      ...baseJob,
      requiredSkills: [
        { skillId: 'skill-elec', name: 'Electrical Wiring', category: 'Electrical', isRequired: true, minExperienceYears: 2 },
        { skillId: 'skill-plumb', name: 'Pipe Repair', category: 'Plumbing', isRequired: true, minExperienceYears: 2 },
        { skillId: 'skill-carp', name: 'Carpentry', category: 'Woodwork', isRequired: true, minExperienceYears: 2 },
      ],
    };

    // Worker has 2 of 3 required skills (skill-elec, skill-plumb)
    const res = evaluateWorkerJobMatch(baseWorker, multiSkillJob, 5, 20);

    expect(res.match.breakdown.matchedSkillsCount).toBe(2);
    expect(res.match.breakdown.totalRequiredSkillsCount).toBe(3);
    expect(res.match.breakdown.skillCoveragePercentage).toBe(66.7);
    expect(res.match.breakdown.skillScore).toBe(67);
    expect(res.match.reasons.some((r) => r.includes('2 of 3 skill(s) matched'))).toBe(true);
    expect(res.match.reasons.some((r) => r.includes('missing: Carpentry'))).toBe(true);
  });

  it('4. Experience Compatibility - flags experience deficits accurately', () => {
    const highExpJob: MatchingJobData = {
      ...baseJob,
      requiredSkills: [
        {
          skillId: 'skill-elec',
          name: 'Industrial High Voltage',
          category: 'Electrical',
          isRequired: true,
          minExperienceYears: 10, // Worker only has 5 years
        },
      ],
    };

    const res = evaluateWorkerJobMatch(baseWorker, highExpJob, 5, 20);

    expect(res.match.breakdown.experienceMet).toBe(false);
    expect(res.match.breakdown.experienceScore).toBe(0);
    expect(res.skillDetails[0]?.experienceMet).toBe(false);
    expect(res.match.reasons.some((r) => r.includes('Some required skills need higher experience'))).toBe(true);
  });

  it('5. Availability Compatibility - handles explicit available, conflicting booked/unavailable, and general fallback', () => {
    // 5.1 Explicitly available date
    const availJob: MatchingJobData = { ...baseJob, startDate: '2026-10-10' };
    const availRes = evaluateWorkerJobMatch(baseWorker, availJob, 5, 20);
    expect(availRes.match.breakdown.availabilityCompatible).toBe(true);
    expect(availRes.match.breakdown.availabilityScore).toBe(100);

    // 5.2 Explicitly unavailable conflict date
    const unavailJob: MatchingJobData = { ...baseJob, startDate: '2026-10-11' };
    const unavailRes = evaluateWorkerJobMatch(baseWorker, unavailJob, 5, 20);
    expect(unavailRes.match.breakdown.availabilityCompatible).toBe(false);
    expect(unavailRes.match.breakdown.availabilityScore).toBe(0);
    expect(unavailRes.match.eligible).toBe(false);
    expect(unavailRes.match.reasons.some((r) => r.includes('unavailable'))).toBe(true);

    // 5.3 Unstated date with isAvailable=true
    const unstatedJob: MatchingJobData = { ...baseJob, startDate: '2026-10-15' };
    const unstatedRes = evaluateWorkerJobMatch(baseWorker, unstatedJob, 5, 20);
    expect(unstatedRes.match.breakdown.availabilityCompatible).toBe(true);
    expect(unstatedRes.match.breakdown.availabilityScore).toBe(80);
  });

  it('6. Wage Compatibility - differentiates surplus, deficit, unstated wage, and mismatched wage types', () => {
    // 6.1 Offered >= Expected (surplus)
    const wageJob1: MatchingJobData = { ...baseJob, wageAmount: 1200, wageType: 'DAILY' };
    const res1 = evaluateWorkerJobMatch(baseWorker, wageJob1, 5, 20);
    expect(res1.match.breakdown.wageCompatible).toBe(true);
    expect(res1.match.breakdown.wageScore).toBe(100);
    expect(res1.match.reasons.some((r) => r.includes('meets or exceeds'))).toBe(true);

    // 6.2 Offered < Expected (deficit)
    const wageJob2: MatchingJobData = { ...baseJob, wageAmount: 600, wageType: 'DAILY' }; // 600 / 800 = 75%
    const res2 = evaluateWorkerJobMatch(baseWorker, wageJob2, 5, 20);
    expect(res2.match.breakdown.wageCompatible).toBe(false);
    expect(res2.match.breakdown.wageScore).toBe(75);
    expect(res2.match.reasons.some((r) => r.includes('below your expected'))).toBe(true);

    // 6.3 Worker expected wage not set
    const noWageWorker: MatchingWorkerData = { ...baseWorker, expectedWage: null };
    const res3 = evaluateWorkerJobMatch(noWageWorker, baseJob, 5, 20);
    expect(res3.match.breakdown.wageCompatible).toBeNull();
    expect(res3.match.breakdown.wageScore).toBe(80);

    // 6.4 Mismatched wage types (e.g. HOURLY offered vs DAILY expected)
    const hourlyJob: MatchingJobData = { ...baseJob, wageAmount: 150, wageType: 'HOURLY' };
    const res4 = evaluateWorkerJobMatch(baseWorker, hourlyJob, 5, 20);
    expect(res4.match.breakdown.wageCompatible).toBeNull();
    expect(res4.match.breakdown.wageScore).toBe(75);
    expect(res4.match.reasons.some((r) => r.includes('Different wage types'))).toBe(true);
  });
});
