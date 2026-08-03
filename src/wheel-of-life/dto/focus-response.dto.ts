export interface FocusResponse {
  id: string;
  wheelId: string;
  categoryId: string;
  categoryName: string;
  assessmentId?: string;
  isActive: boolean;
  startedAt: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface FocusListResponse {
  focuses: FocusResponse[];
  activeCount: number;
  completedCount: number;
}
