export interface Review {
  reviewerName: string;
  starRating: number;
  comment: string;
  createTime: string;
  updateTime?: string;
  reviewId: string;
  replyComment?: string;
}

export interface AnalysisResult {
  sentiment: 'positive' | 'neutral' | 'negative';
  summary: string;
  themes: string[];
  suggestions: string[];
}
