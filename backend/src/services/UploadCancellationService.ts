class UploadCancellationService {
  private cancelledJobs: Set<string>;
  private static instance: UploadCancellationService;

  private constructor() {
    this.cancelledJobs = new Set<string>();
  }

  public static getInstance(): UploadCancellationService {
    if (!UploadCancellationService.instance) {
      UploadCancellationService.instance = new UploadCancellationService();
    }
    return UploadCancellationService.instance;
  }

  public cancel(jobId: string): void {
    this.cancelledJobs.add(jobId);
  }

  public isCancelled(jobId: string): boolean {
    return this.cancelledJobs.has(jobId);
  }

  public acknowledge(jobId: string): void {
    this.cancelledJobs.delete(jobId);
  }
}

export const uploadCancellationService = UploadCancellationService.getInstance(); 