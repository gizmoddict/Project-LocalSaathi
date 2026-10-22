import {
  RecommendationEvaluator,
  GroundTruthItem,
} from '../recommendation.evaluation';

describe('Recommendation Evaluation Metrics (Unit Tests)', () => {
  // Hand-checkable benchmark dataset
  // Ground truth with 5 items:
  // job-1: Highly relevant (grade 2, eligible)
  // job-2: Relevant (grade 1, eligible)
  // job-3: Irrelevant (grade 0, eligible)
  // job-4: Relevant (grade 1, eligible)
  // job-5: Ineligible violation (grade 1, isEligible = false)
  const mockGroundTruth: GroundTruthItem[] = [
    { jobId: 'job-1', relevanceGrade: 2, isEligible: true },
    { jobId: 'job-2', relevanceGrade: 1, isEligible: true },
    { jobId: 'job-3', relevanceGrade: 0, isEligible: true },
    { jobId: 'job-4', relevanceGrade: 1, isEligible: true },
    { jobId: 'job-5', relevanceGrade: 1, isEligible: false },
    { jobId: 'job-6', relevanceGrade: 0, isEligible: true },
  ];

  const totalCatalog = 100;

  it('1. Precision@K and Recall@K - hand-checkable calculation', () => {
    // Model recommends: [job-1, job-3, job-2, job-6] -> top 4
    // Relevant items in top 4: job-1, job-2 (2 items)
    // Total relevant items in ground-truth: job-1, job-2, job-4, job-5 (4 items)
    // Precision@4 = 2 / 4 = 0.50
    // Recall@4 = 2 / 4 = 0.50
    const recs = ['job-1', 'job-3', 'job-2', 'job-6'];
    const metrics = RecommendationEvaluator.evaluateQuery(recs, mockGroundTruth, totalCatalog, 4);

    expect(metrics.precisionAtK).toBe(0.5);
    expect(metrics.recallAtK).toBe(0.5);
    expect(metrics.evaluatedCount).toBe(4);
    expect(metrics.k).toBe(4);
  });

  it('2. Mean Reciprocal Rank (MRR) - first relevant item at rank 2 yields 0.5', () => {
    // Rank 1: job-3 (irrelevant), Rank 2: job-1 (relevant)
    const recs = ['job-3', 'job-1', 'job-6'];
    const metrics = RecommendationEvaluator.evaluateQuery(recs, mockGroundTruth, totalCatalog, 3);

    expect(metrics.meanReciprocalRank).toBe(0.5); // 1 / 2
  });

  it('3. NDCG@K - computes discounted cumulative gain against ideal ranking', () => {
    // Perfect ranking: [job-1, job-2, job-4] -> NDCG = 1.0
    const perfectRecs = ['job-1', 'job-2', 'job-4'];
    const perfectMetrics = RecommendationEvaluator.evaluateQuery(
      perfectRecs,
      mockGroundTruth,
      totalCatalog,
      3
    );
    expect(perfectMetrics.ndcgAtK).toBe(1.0);

    // Sub-optimal ranking: [job-2, job-1, job-4] -> NDCG = 3.0 / 3.653 = 0.8213
    const subRecs = ['job-2', 'job-1', 'job-4'];
    const subMetrics = RecommendationEvaluator.evaluateQuery(
      subRecs,
      mockGroundTruth,
      totalCatalog,
      3
    );
    expect(subMetrics.ndcgAtK).toBeLessThan(1.0);
    expect(subMetrics.ndcgAtK).toBeCloseTo(0.8213, 3);
  });

  it('4. Eligibility Violation Rate - correctly detects when recommended items violate hard constraints', () => {
    // Recommends: [job-1, job-5] -> job-5 is ineligible in ground truth
    // 1 violation out of 2 evaluated items = 0.50 violation rate
    const recs = ['job-1', 'job-5'];
    const metrics = RecommendationEvaluator.evaluateQuery(recs, mockGroundTruth, totalCatalog, 2);

    expect(metrics.eligibilityViolationRate).toBe(0.5);
  });

  it('5. Duplicate Recommendation Rate - correctly measures duplicate items in recommended set', () => {
    // Recommends: [job-1, job-1, job-2] (1 duplicate out of 3 items = 0.3333)
    const recs = ['job-1', 'job-1', 'job-2'];
    const metrics = RecommendationEvaluator.evaluateQuery(recs, mockGroundTruth, totalCatalog, 3);

    expect(metrics.duplicateRecommendationRate).toBeCloseTo(0.3333, 3);
  });

  it('6. Recommendation Coverage - calculates catalog coverage correctly', () => {
    // 2 unique items out of catalog of 100 = 0.02
    const recs = ['job-1', 'job-2'];
    const metrics = RecommendationEvaluator.evaluateQuery(recs, mockGroundTruth, 100, 2);

    expect(metrics.recommendationCoverage).toBe(0.02);
  });

  it('7. Edge Cases - handles empty recommendations and zero K without dividing by zero', () => {
    const emptyMetrics = RecommendationEvaluator.evaluateQuery([], mockGroundTruth, 100, 10);

    expect(emptyMetrics.precisionAtK).toBe(0);
    expect(emptyMetrics.recallAtK).toBe(0);
    expect(emptyMetrics.ndcgAtK).toBe(0);
    expect(emptyMetrics.meanReciprocalRank).toBe(0);
    expect(emptyMetrics.eligibilityViolationRate).toBe(0);
    expect(emptyMetrics.duplicateRecommendationRate).toBe(0);
  });

  it('8. Missing Labels - handles candidate IDs not present in ground-truth with unratedCount tracking', () => {
    const recs = ['unseen-job-999', 'job-1'];
    const metrics = RecommendationEvaluator.evaluateQuery(recs, mockGroundTruth, 100, 2);

    expect(metrics.precisionAtK).toBe(0.5); // 1 relevant out of 2
    expect(metrics.unratedCount).toBe(1);
    expect(metrics.eligibilityViolationRate).toBe(0); // unseen is not explicitly marked ineligible
  });

  it('9. Missing Labels - unknownAsNegative option treats unrated items strictly as grade 0', () => {
    const recs = ['unseen-job-999', 'job-1'];
    const strictMetrics = RecommendationEvaluator.evaluateQuery(recs, mockGroundTruth, 100, 2, {
      unknownAsNegative: true,
    });

    expect(strictMetrics.precisionAtK).toBe(0.5);
    expect(strictMetrics.unratedCount).toBe(1);
    expect(strictMetrics.ndcgAtK).toBeGreaterThan(0);
  });

  it('10. Edge Case - K <= 0 returns all zero metrics safely', () => {
    const metricsZero = RecommendationEvaluator.evaluateQuery(['job-1'], mockGroundTruth, 100, 0);
    expect(metricsZero.precisionAtK).toBe(0);
    expect(metricsZero.evaluatedCount).toBe(0);

    const metricsNeg = RecommendationEvaluator.evaluateQuery(['job-1'], mockGroundTruth, 100, -5);
    expect(metricsNeg.precisionAtK).toBe(0);
    expect(metricsNeg.evaluatedCount).toBe(0);
  });

  it('11. Edge Case - Empty ground truth produces 0 without division by zero', () => {
    const metrics = RecommendationEvaluator.evaluateQuery(['job-1', 'job-2'], [], 100, 2);
    expect(metrics.precisionAtK).toBe(0);
    expect(metrics.recallAtK).toBe(0);
    expect(metrics.ndcgAtK).toBe(0);
    expect(metrics.meanReciprocalRank).toBe(0);
    expect(metrics.eligibilityViolationRate).toBe(0);
    expect(metrics.unratedCount).toBe(2);
  });
});
