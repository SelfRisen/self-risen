export interface CategoryInsight {
  categoryId: string;
  categoryName: string;
  score: number;
  isStrongest: boolean;
  isWeakest: boolean;
}

export interface AssessmentBreakdown {
  strongestArea: {
    categoryId: string;
    categoryName: string;
    score: number;
  };
  weakestArea: {
    categoryId: string;
    categoryName: string;
    score: number;
  };
  imbalanceScore: number; // 0-1, where 1 is perfectly balanced
  categoryInsights: CategoryInsight[];
  averageScore: number;
}
