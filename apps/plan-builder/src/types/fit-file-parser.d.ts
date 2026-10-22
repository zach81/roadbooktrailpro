declare module 'fit-file-parser' {
  export interface FitRecord {
    position_lat?: number;
    position_long?: number;
    altitude?: number;
    timestamp?: Date | string | number;
    heart_rate?: number;
    distance?: number;
    speed?: number;
    cadence?: number;
    power?: number;
    temperature?: number;
    [key: string]: any;
  }

  export interface FitParsedData {
    records?: FitRecord[];
    sessions?: any[];
    laps?: any[];
    activity?: any;
    [key: string]: any;
  }

  export default class FitParser {
    constructor(options?: {
      force?: boolean;
      speedUnit?: string;
      lengthUnit?: string;
      temperatureUnit?: string;
      elapsedRecordField?: boolean;
      mode?: 'cascade' | 'list' | 'both';
    });
    parse(
      buffer: ArrayBuffer | Buffer,
      callback: (error: string | null, data: FitParsedData) => void
    ): void;
  }
}
