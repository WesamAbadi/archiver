export interface CaptionSegment {
    id: string;
    startTime: number;
    endTime: number;
    text: string;
    confidence?: number;
}

export interface Caption {
    id:string;
    language: string;
    segments: CaptionSegment[];
}

export interface LyricsContext {
    previous: CaptionSegment | null;
    current: CaptionSegment | null;
    next: CaptionSegment | null;
    activeIndex: number;
    currentIndex: number;
} 