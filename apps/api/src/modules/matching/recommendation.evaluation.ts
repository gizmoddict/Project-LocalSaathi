
export interface EvaluatedRecommendation {
  jobId: string;
  score: number;
  rank: number;
  isEligible: boolean;
  hardConstraintsPassed: boolean;
}

export interface GroundTruthItem {
  jobId: string;
  relevanceGrade: number; // e.g., 0 = not relevant, 1 = relevant, 2 = highly relevant / hired
  isEligible: boolean;
}

export interface RecommendationEvaluationOptions {
  /**
   * When true, items appearing in recommendations that are missing from ground truth
   * are treated as non-relevant (grade 0).
   * When false (default), missing items are treated as unrated and excluded from
   * relevant count, with unratedCount explicitly reported in metrics.
   */
  unknownAsNegative?: boolean;
}

export interface RecommendationEvaluationMetrics {
  precisionAtK: number;
  recallAtK: number;
  ndcgAtK: number;
  meanReciprocalRank: number;
  eligibilityViolationRate: number;
  duplicateRecommendationRate: number;
  recommendationCoverage: number;
  evaluatedCount: number;
  unratedCount: number;
  k: number;
}

/**
 * Pure, deterministic evaluation library for Recommendation Systems.
 * Computes Precision@K, Recall@K, NDCG@K, MRR, eligibility violation rate,
 * duplicate rate, and catalog coverage.
 */
export class RecommendationEvaluator {
  /**
   * Evaluates top-K recommendations for a single user query against ground-truth labels.
   */
  static evaluateQuery(
    recommendedJobIds: string[],
    groundTruth: GroundTruthItem[],
    totalCatalogSize: number,
    k: number = 10,
    options: RecommendationEvaluationOptions = {}
  ): RecommendationEvaluationMetrics {
    const unknownAsNegative = options.unknownAsNegative ?? false;
    const topK = k > 0 ? recommendedJobIds.slice(0, k) : [];
    const evaluatedCount = topK.length;

    if (evaluatedCount === 0 || k <= 0) {
      return {
        precisionAtK: 0,
        recallAtK: 0,
        ndcgAtK: 0,
        meanReciprocalRank: 0,
        eligibilityViolationRate: 0,
        duplicateRecommendationRate: 0,
        recommendationCoverage: 0,
        evaluatedCount: 0,
        unratedCount: 0,
        k,
      };
    }

    const groundTruthMap = new Map<string, GroundTruthItem>(
      groundTruth.map((item) => [item.jobId, item])
    );

    // Relevant jobs defined as ground-truth grade > 0
    const relevantJobIds = new Set(
      groundTruth.filter((item) => item.relevanceGrade > 0).map((item) => item.jobId)
    );

    let relevantInTopKCount = 0;
    let firstRelevantRank: number | null = null;
    let eligibilityViolations = 0;
    let unratedCount = 0;

    const seenJobIds = new Set<string>();
    let duplicateCount = 0;

    for (let i = 0; i < topK.length; i++) {
      const jobId = topK[i]!;

      // Duplicate check
      if (seenJobIds.has(jobId)) {
        duplicateCount++;
      }
      seenJobIds.add(jobId);

      const gtItem = groundTruthMap.get(jobId);
      if (!gtItem) {
        unratedCount++;
      }

      // Relevance check
      if (relevantJobIds.has(jobId)) {
        relevantInTopKCount++;
        if (firstRelevantRank === null) {
          firstRelevantRank = i + 1;
        }
      }

      // Eligibility violation check (if ground-truth explicitly marked as ineligible)
      if (gtItem && !gtItem.isEligible) {
        eligibilityViolations++;
      }
    }

    // 1. Precision@K = (Number of relevant items in top-K) / K
    const precisionAtK = relevantInTopKCount / k;

    // 2. Recall@K = (Number of relevant items in top-K) / (Total relevant items)
    const totalRelevantCount = relevantJobIds.size;
    const recallAtK = totalRelevantCount > 0 ? relevantInTopKCount / totalRelevantCount : 0;

    // 3. Mean Reciprocal Rank (MRR) = 1 / rank of first relevant item
    const meanReciprocalRank = firstRelevantRank !== null ? 1 / firstRelevantRank : 0;

    // 4. NDCG@K
    // DCG@K = sum((2^grade - 1) / log2(rank + 1))
    let dcg = 0;
    for (let i = 0; i < topK.length; i++) {
      const jobId = topK[i]!;
      const gtItem = groundTruthMap.get(jobId);
      const grade = gtItem ? gtItem.relevanceGrade : (unknownAsNegative ? 0 : 0);
      if (grade > 0) {
        dcg += (Math.pow(2, grade) - 1) / Math.log2(i + 2); // i=0 -> rank 1 -> log2(2) = 1
      }
    }

    // IDCG@K: Sort all ground truth items by grade descending and compute DCG for top-K
    const idealGrades = groundTruth
      .map((item) => item.relevanceGrade)
      .filter((grade) => grade > 0)
      .sort((a, b) => b - a)
      .slice(0, k);

    let idcg = 0;
    for (let i = 0; i < idealGrades.length; i++) {
      const grade = idealGrades[i]!;
      idcg += (Math.pow(2, grade) - 1) / Math.log2(i + 2);
    }

    const ndcgAtK = idcg > 0 ? dcg / idcg : 0;

    // 5. Eligibility violation rate = violations / topK.length
    const eligibilityViolationRate = eligibilityViolations / evaluatedCount;

    // 6. Duplicate recommendation rate = duplicates / topK.length
    const duplicateRecommendationRate = duplicateCount / evaluatedCount;

    // 7. Catalog coverage = distinct recommended items / totalCatalogSize
    const recommendationCoverage =
      totalCatalogSize > 0 ? Math.min(1, seenJobIds.size / totalCatalogSize) : 0;

    return {
      precisionAtK: Number(precisionAtK.toFixed(4)),
      recallAtK: Number(recallAtK.toFixed(4)),
      ndcgAtK: Number(ndcgAtK.toFixed(4)),
      meanReciprocalRank: Number(meanReciprocalRank.toFixed(4)),
      eligibilityViolationRate: Number(eligibilityViolationRate.toFixed(4)),
      duplicateRecommendationRate: Number(duplicateRecommendationRate.toFixed(4)),
      recommendationCoverage: Number(recommendationCoverage.toFixed(4)),
      evaluatedCount,
      unratedCount,
      k,
    };
  }
}
